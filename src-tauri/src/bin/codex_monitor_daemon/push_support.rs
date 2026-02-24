use reqwest::Client;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::{
    PersistedPushState, PushBrokerState, PushEvent, DEDUPE_WINDOW_MS, HEARTBEAT_STALE_MS,
    MAX_PREVIEW_CHARS,
};

const RETRY_DELAYS_MS: [u64; 3] = [250, 1_000, 3_000];

pub(super) struct RelayDispatch {
    pub(super) relay_url: String,
    pub(super) relay_auth_token: Option<String>,
    pub(super) payload: Value,
}

pub(super) async fn deliver_to_relay(client: Client, dispatch: RelayDispatch) {
    let mut last_error: Option<String> = None;
    for (attempt, delay_ms) in RETRY_DELAYS_MS.iter().enumerate() {
        let request = client
            .post(dispatch.relay_url.clone())
            .json(&dispatch.payload);
        let request = if let Some(token) = dispatch.relay_auth_token.as_deref() {
            request.bearer_auth(token)
        } else {
            request
        };
        match request.send().await {
            Ok(response) if response.status().is_success() => return,
            Ok(response) => {
                last_error = Some(format!("relay status {}", response.status().as_u16()));
            }
            Err(err) => {
                last_error = Some(err.to_string());
            }
        }
        if attempt + 1 < RETRY_DELAYS_MS.len() {
            tokio::time::sleep(Duration::from_millis(*delay_ms)).await;
        }
    }
    if let Some(last_error) = last_error {
        eprintln!("daemon push relay failed: {last_error}");
    }
}

pub(super) fn read_state_file(path: &PathBuf) -> Result<PersistedPushState, String> {
    if !path.exists() {
        return Ok(PersistedPushState::default());
    }
    let data = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str::<PersistedPushState>(&data).map_err(|err| err.to_string())
}

pub(super) fn prune_stale_entries(state: &mut PushBrokerState, now_ms: i64) {
    state
        .presence_by_client
        .retain(|_, entry| now_ms - entry.last_seen_at_ms <= HEARTBEAT_STALE_MS);
    state
        .dedupe_sent_at
        .retain(|_, sent_at_ms| now_ms - *sent_at_ms <= DEDUPE_WINDOW_MS);
}

pub(super) fn has_non_afk_desktop_for_workspace(
    state: &PushBrokerState,
    workspace_id: &str,
) -> bool {
    state.presence_by_client.values().any(|entry| {
        entry.client_kind == "desktop"
            && entry.is_supported
            && !entry.is_afk
            && (entry.active_workspace_ids.is_empty()
                || entry
                    .active_workspace_ids
                    .iter()
                    .any(|candidate| candidate == workspace_id))
    })
}

pub(super) fn parse_thread_id(params: &Map<String, Value>) -> Option<String> {
    let direct = params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if direct.is_some() {
        return direct;
    }
    params
        .get("turn")
        .and_then(Value::as_object)
        .and_then(|turn| {
            turn.get("threadId")
                .or_else(|| turn.get("thread_id"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(super) fn parse_turn_id(params: &Map<String, Value>) -> Option<String> {
    let direct = params
        .get("turnId")
        .or_else(|| params.get("turn_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if direct.is_some() {
        return direct;
    }
    params
        .get("turn")
        .and_then(Value::as_object)
        .and_then(|turn| turn.get("id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(super) fn make_thread_key(workspace_id: &str, thread_id: &str) -> String {
    format!("{workspace_id}:{thread_id}")
}

pub(super) fn make_dedupe_key(event: &PushEvent) -> String {
    format!(
        "{}:{}:{}:{}",
        event.kind,
        event.workspace_id,
        event.thread_id,
        event.turn_id.clone().unwrap_or_else(|| "-".to_string())
    )
}

pub(super) fn config_snapshot_value(state: &PushBrokerState) -> Value {
    json!({
        "relayUrl": state.relay_url,
        "hasRelayAuthToken": state
            .relay_auth_token
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
        "registeredDeviceCount": state.devices.len(),
    })
}

pub(super) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub(super) fn clamp_preview(text: String) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut chars = trimmed.chars();
    let limited = chars.by_ref().take(MAX_PREVIEW_CHARS).collect::<String>();
    if chars.next().is_some() {
        format!("{limited}…")
    } else {
        limited
    }
}

pub(super) fn redact_token_preview(token: &str) -> String {
    let trimmed = token.trim();
    if trimmed.len() <= 8 {
        return "***".to_string();
    }
    let prefix = &trimmed[..4];
    let suffix = &trimmed[trimmed.len() - 4..];
    format!("{prefix}…{suffix}")
}

pub(super) fn normalize_optional_non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn normalize_client_kind(value: String) -> String {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized == "mobile" {
        "mobile".to_string()
    } else {
        "desktop".to_string()
    }
}

pub(super) fn normalize_platform(value: String) -> Result<String, String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("missing `platform`".to_string());
    }
    if normalized != "android" && normalized != "ios" {
        return Err("`platform` must be `android` or `ios`".to_string());
    }
    Ok(normalized)
}

pub(super) fn default_client_kind() -> String {
    "desktop".to_string()
}

pub(super) fn default_true() -> bool {
    true
}
