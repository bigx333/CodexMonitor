use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

#[path = "push_delivery.rs"]
mod push_delivery;
#[path = "push_fcm.rs"]
mod push_fcm;
#[path = "push_support.rs"]
mod push_support;

use push_delivery::PreparedDelivery;
use push_fcm::DirectFcmSender;
use push_support::{
    clamp_preview, config_snapshot_value, default_client_kind, default_true, deliver_to_relay,
    has_non_afk_desktop_for_workspace, make_dedupe_key, make_thread_key, normalize_client_kind,
    normalize_optional_non_empty, normalize_platform, now_ms, parse_thread_id, parse_turn_id,
    prune_stale_entries, read_state_file, redact_token_preview,
};

const PUSH_STATE_FILE: &str = "push_notifications.json";
pub(super) const HEARTBEAT_STALE_MS: i64 = 45_000;
pub(super) const DEDUPE_WINDOW_MS: i64 = 5_000;
pub(super) const MAX_PREVIEW_CHARS: usize = 200;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PresenceHeartbeatInput {
    pub(crate) client_id: String,
    #[serde(default = "default_client_kind")]
    pub(crate) client_kind: String,
    #[serde(default)]
    pub(crate) platform: Option<String>,
    #[serde(default = "default_true")]
    pub(crate) is_supported: bool,
    #[serde(default)]
    pub(crate) is_focused: bool,
    #[serde(default)]
    pub(crate) is_afk: bool,
    #[serde(default)]
    pub(crate) active_workspace_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PushDeviceRegistrationInput {
    pub(crate) device_id: String,
    pub(crate) platform: String,
    pub(crate) token: String,
    #[serde(default)]
    pub(crate) label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PushNotificationConfigPatch {
    #[serde(default)]
    pub(crate) relay_url: Option<Option<String>>,
    #[serde(default)]
    pub(crate) relay_auth_token: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PushDeviceRegistration {
    pub(crate) device_id: String,
    pub(crate) platform: String,
    pub(crate) token: String,
    #[serde(default)]
    pub(crate) label: Option<String>,
    #[serde(default = "default_true")]
    pub(crate) enabled: bool,
    #[serde(default)]
    pub(crate) last_seen_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(super) struct PersistedPushState {
    #[serde(default)]
    relay_url: Option<String>,
    #[serde(default)]
    relay_auth_token: Option<String>,
    #[serde(default)]
    devices: Vec<PushDeviceRegistration>,
}

#[derive(Debug, Clone)]
struct PresenceRecord {
    client_id: String,
    client_kind: String,
    platform: Option<String>,
    is_supported: bool,
    is_focused: bool,
    is_afk: bool,
    active_workspace_ids: Vec<String>,
    last_seen_at_ms: i64,
}

#[derive(Debug, Clone)]
pub(super) struct PushEvent {
    kind: &'static str,
    workspace_id: String,
    workspace_name: Option<String>,
    thread_id: String,
    turn_id: Option<String>,
    preview: String,
}

pub(super) struct PushBrokerState {
    relay_url: Option<String>,
    relay_auth_token: Option<String>,
    devices: HashMap<String, PushDeviceRegistration>,
    presence_by_client: HashMap<String, PresenceRecord>,
    last_message_by_thread: HashMap<String, String>,
    dedupe_sent_at: HashMap<String, i64>,
}

pub(crate) struct PushBroker {
    state_path: PathBuf,
    http_client: Client,
    direct_fcm: Arc<DirectFcmSender>,
    state: Mutex<PushBrokerState>,
}

impl PushBroker {
    pub(crate) fn load(data_dir: &PathBuf) -> Self {
        let state_path = data_dir.join(PUSH_STATE_FILE);
        let persisted = read_state_file(&state_path).unwrap_or_default();
        let devices = persisted
            .devices
            .into_iter()
            .map(|device| (device.device_id.clone(), device))
            .collect::<HashMap<_, _>>();
        let http_client = Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            state_path,
            direct_fcm: Arc::new(DirectFcmSender::new(data_dir.clone(), http_client.clone())),
            http_client,
            state: Mutex::new(PushBrokerState {
                relay_url: normalize_optional_non_empty(persisted.relay_url),
                relay_auth_token: normalize_optional_non_empty(persisted.relay_auth_token),
                devices,
                presence_by_client: HashMap::new(),
                last_message_by_thread: HashMap::new(),
                dedupe_sent_at: HashMap::new(),
            }),
        }
    }

    pub(crate) async fn record_presence(
        &self,
        input: PresenceHeartbeatInput,
    ) -> Result<(), String> {
        let client_id = input.client_id.trim().to_string();
        if client_id.is_empty() {
            return Err("missing `clientId`".to_string());
        }
        let now_ms = now_ms();
        let mut state = self.state.lock().await;
        prune_stale_entries(&mut state, now_ms);
        state.presence_by_client.insert(
            client_id.clone(),
            PresenceRecord {
                client_id,
                client_kind: normalize_client_kind(input.client_kind),
                platform: normalize_optional_non_empty(input.platform),
                is_supported: input.is_supported,
                is_focused: input.is_focused,
                is_afk: input.is_afk,
                active_workspace_ids: input
                    .active_workspace_ids
                    .into_iter()
                    .map(|workspace_id| workspace_id.trim().to_string())
                    .filter(|workspace_id| !workspace_id.is_empty())
                    .collect(),
                last_seen_at_ms: now_ms,
            },
        );
        Ok(())
    }

    pub(crate) async fn register_device(
        &self,
        input: PushDeviceRegistrationInput,
    ) -> Result<PushDeviceRegistration, String> {
        let device_id = input.device_id.trim().to_string();
        if device_id.is_empty() {
            return Err("missing `deviceId`".to_string());
        }
        let token = input.token.trim().to_string();
        if token.is_empty() {
            return Err("missing `token`".to_string());
        }
        let platform = normalize_platform(input.platform)?;
        let now_ms = now_ms();
        let mut state = self.state.lock().await;
        let device = PushDeviceRegistration {
            device_id: device_id.clone(),
            platform,
            token,
            label: normalize_optional_non_empty(input.label),
            enabled: true,
            last_seen_at_ms: Some(now_ms),
        };
        state.devices.insert(device_id, device.clone());
        self.persist_state(&state)?;
        Ok(device)
    }

    pub(crate) async fn unregister_device(&self, device_id: String) -> Result<(), String> {
        let device_id = device_id.trim().to_string();
        if device_id.is_empty() {
            return Err("missing `deviceId`".to_string());
        }
        let mut state = self.state.lock().await;
        state.devices.remove(&device_id);
        self.persist_state(&state)?;
        Ok(())
    }

    pub(crate) async fn patch_config(
        &self,
        patch: PushNotificationConfigPatch,
    ) -> Result<Value, String> {
        let mut state = self.state.lock().await;
        if let Some(next_relay_url) = patch.relay_url {
            state.relay_url = normalize_optional_non_empty(next_relay_url);
        }
        if let Some(next_relay_auth_token) = patch.relay_auth_token {
            state.relay_auth_token = normalize_optional_non_empty(next_relay_auth_token);
        }
        self.persist_state(&state)?;
        Ok(config_snapshot_value(&state))
    }

    pub(crate) async fn config_snapshot(&self) -> Value {
        let state = self.state.lock().await;
        config_snapshot_value(&state)
    }

    pub(crate) async fn state_snapshot(&self) -> Value {
        let now_ms = now_ms();
        let mut state = self.state.lock().await;
        prune_stale_entries(&mut state, now_ms);
        let devices = state
            .devices
            .values()
            .map(|device| {
                json!({
                    "deviceId": device.device_id,
                    "platform": device.platform,
                    "label": device.label,
                    "enabled": device.enabled,
                    "lastSeenAtMs": device.last_seen_at_ms,
                    "tokenPreview": redact_token_preview(&device.token),
                })
            })
            .collect::<Vec<_>>();
        let presence = state
            .presence_by_client
            .values()
            .map(|entry| {
                json!({
                    "clientId": entry.client_id,
                    "clientKind": entry.client_kind,
                    "platform": entry.platform,
                    "isSupported": entry.is_supported,
                    "isFocused": entry.is_focused,
                    "isAfk": entry.is_afk,
                    "activeWorkspaceIds": entry.active_workspace_ids,
                    "lastSeenAtMs": entry.last_seen_at_ms,
                })
            })
            .collect::<Vec<_>>();
        json!({
            "config": config_snapshot_value(&state),
            "devices": devices,
            "presence": presence,
        })
    }

    pub(crate) async fn handle_app_server_event(
        &self,
        workspace_id: &str,
        workspace_name: Option<String>,
        message: &Value,
    ) {
        let Some(message_obj) = message.as_object() else {
            return;
        };
        let Some(method) = message_obj.get("method").and_then(Value::as_str) else {
            return;
        };
        let params = message_obj
            .get("params")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();

        if method == "item/completed" {
            self.capture_last_agent_message(workspace_id, &params).await;
            return;
        }

        let candidate = match method {
            "turn/completed" => {
                self.build_turn_completed_event(workspace_id, workspace_name, &params)
                    .await
            }
            "error" => {
                self.build_turn_error_event(workspace_id, workspace_name, &params)
                    .await
            }
            _ => None,
        };

        let Some(candidate) = candidate else {
            return;
        };

        if let Some(delivery) = self.prepare_delivery(candidate).await {
            if delivery.relay_url.is_some() {
                let client = self.http_client.clone();
                tokio::spawn(async move {
                    if let Some(dispatch) = delivery.into_relay_dispatch() {
                        deliver_to_relay(client, dispatch).await;
                    }
                });
            } else {
                let direct_fcm = Arc::clone(&self.direct_fcm);
                tokio::spawn(async move {
                    direct_fcm.deliver(delivery).await;
                });
            }
        }
    }

    async fn capture_last_agent_message(&self, workspace_id: &str, params: &Map<String, Value>) {
        let thread_id = parse_thread_id(params);
        let Some(thread_id) = thread_id else {
            return;
        };
        let item = params.get("item").and_then(Value::as_object);
        let Some(item) = item else {
            return;
        };
        if item.get("type").and_then(Value::as_str) != Some("agentMessage") {
            return;
        }
        let text = item
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(text) = text else {
            return;
        };
        let thread_key = make_thread_key(workspace_id, &thread_id);
        let mut state = self.state.lock().await;
        state
            .last_message_by_thread
            .insert(thread_key, clamp_preview(text.to_string()));
    }

    async fn build_turn_completed_event(
        &self,
        workspace_id: &str,
        workspace_name: Option<String>,
        params: &Map<String, Value>,
    ) -> Option<PushEvent> {
        let thread_id = parse_thread_id(params)?;
        let turn_id = parse_turn_id(params);
        let thread_key = make_thread_key(workspace_id, &thread_id);
        let mut state = self.state.lock().await;
        let preview = state
            .last_message_by_thread
            .remove(&thread_key)
            .unwrap_or_else(|| "Your agent finished a task.".to_string());
        Some(PushEvent {
            kind: "turn.completed",
            workspace_id: workspace_id.to_string(),
            workspace_name,
            thread_id,
            turn_id,
            preview: clamp_preview(preview),
        })
    }

    async fn build_turn_error_event(
        &self,
        workspace_id: &str,
        workspace_name: Option<String>,
        params: &Map<String, Value>,
    ) -> Option<PushEvent> {
        if params
            .get("willRetry")
            .and_then(Value::as_bool)
            .or_else(|| params.get("will_retry").and_then(Value::as_bool))
            .unwrap_or(false)
        {
            return None;
        }
        let thread_id = parse_thread_id(params)?;
        let turn_id = parse_turn_id(params);
        let message = params
            .get("error")
            .and_then(Value::as_object)
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Agent run failed.");
        Some(PushEvent {
            kind: "turn.error",
            workspace_id: workspace_id.to_string(),
            workspace_name,
            thread_id,
            turn_id,
            preview: clamp_preview(message.to_string()),
        })
    }

    async fn prepare_delivery(&self, event: PushEvent) -> Option<PreparedDelivery> {
        let now_ms = now_ms();
        let mut state = self.state.lock().await;
        prune_stale_entries(&mut state, now_ms);
        if has_non_afk_desktop_for_workspace(&state, &event.workspace_id) {
            return None;
        }
        let devices = state
            .devices
            .values()
            .filter(|device| device.enabled)
            .cloned()
            .collect::<Vec<_>>();
        if devices.is_empty() {
            return None;
        }
        let dedupe_key = make_dedupe_key(&event);
        let previous_sent_at = state.dedupe_sent_at.get(&dedupe_key).copied().unwrap_or(0);
        if now_ms - previous_sent_at < DEDUPE_WINDOW_MS {
            return None;
        }
        state.dedupe_sent_at.insert(dedupe_key, now_ms);
        let title = match event.kind {
            "turn.error" => event
                .workspace_name
                .as_ref()
                .map(|name| format!("Agent Error — {name}"))
                .unwrap_or_else(|| "Agent Error".to_string()),
            _ => event
                .workspace_name
                .as_ref()
                .map(|name| format!("Agent Complete — {name}"))
                .unwrap_or_else(|| "Agent Complete".to_string()),
        };
        Some(PreparedDelivery {
            relay_url: state.relay_url.clone(),
            relay_auth_token: state.relay_auth_token.clone(),
            body: event.preview.clone(),
            event,
            title,
            devices,
            timestamp_ms: now_ms,
        })
    }

    fn persist_state(&self, state: &PushBrokerState) -> Result<(), String> {
        let persisted = PersistedPushState {
            relay_url: state.relay_url.clone(),
            relay_auth_token: state.relay_auth_token.clone(),
            devices: state.devices.values().cloned().collect(),
        };
        if let Some(parent) = self.state_path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let rendered =
            serde_json::to_string_pretty(&persisted).map_err(|err| format!("serialize: {err}"))?;
        std::fs::write(&self.state_path, rendered).map_err(|err| format!("write: {err}"))
    }
}
