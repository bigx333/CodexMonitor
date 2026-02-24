use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine as _;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::backend::app_server::WorkspaceSession;

const TRANSCRIBE_URL: &str = "https://chatgpt.com/backend-api/transcribe";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DictationAuthStatus {
    pub(crate) authenticated: bool,
    pub(crate) auth_method: Option<String>,
    pub(crate) account_id: Option<String>,
    pub(crate) message: Option<String>,
}

#[derive(Debug, Clone)]
struct TranscriptionAuth {
    auth_token: String,
    account_id: String,
    auth_method: String,
}

enum TranscriptionRequestError {
    Unauthorized(String),
    Other(String),
}

pub(crate) async fn dictation_auth_status_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: Option<String>,
) -> DictationAuthStatus {
    let Some(workspace_id) = workspace_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return DictationAuthStatus {
            authenticated: false,
            auth_method: None,
            account_id: None,
            message: Some("Select an active workspace to use ChatGPT dictation.".to_string()),
        };
    };

    let session = {
        let sessions = sessions.lock().await;
        sessions.get(&workspace_id).cloned()
    };

    let Some(session) = session else {
        return DictationAuthStatus {
            authenticated: false,
            auth_method: None,
            account_id: None,
            message: Some("Workspace is not connected to Codex.".to_string()),
        };
    };

    match fetch_transcription_auth(&session, &workspace_id, false).await {
        Ok(auth) => DictationAuthStatus {
            authenticated: true,
            auth_method: Some(auth.auth_method),
            account_id: Some(auth.account_id),
            message: None,
        },
        Err(message) => DictationAuthStatus {
            authenticated: false,
            auth_method: None,
            account_id: None,
            message: Some(message),
        },
    }
}

pub(crate) async fn dictation_transcribe_chatgpt_core(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    audio: Vec<u8>,
    mime_type: String,
    language: Option<String>,
) -> Result<String, String> {
    let workspace_id = workspace_id.trim().to_string();
    if workspace_id.is_empty() {
        return Err("workspaceId is required for ChatGPT dictation.".to_string());
    }

    let session = {
        let sessions = sessions.lock().await;
        sessions.get(&workspace_id).cloned()
    }
    .ok_or_else(|| "Workspace is not connected to Codex.".to_string())?;

    let auth = fetch_transcription_auth(&session, &workspace_id, false).await?;

    match request_transcription(
        &audio,
        &mime_type,
        language.as_deref(),
        &auth.auth_token,
        &auth.account_id,
    )
    .await
    {
        Ok(text) => Ok(text),
        Err(TranscriptionRequestError::Unauthorized(_)) => {
            let refreshed = fetch_transcription_auth(&session, &workspace_id, true).await?;
            request_transcription(
                &audio,
                &mime_type,
                language.as_deref(),
                &refreshed.auth_token,
                &refreshed.account_id,
            )
            .await
            .map_err(|err| match err {
                TranscriptionRequestError::Unauthorized(detail) => {
                    format_http_error(StatusCode::UNAUTHORIZED, detail)
                }
                TranscriptionRequestError::Other(message) => message,
            })
        }
        Err(TranscriptionRequestError::Other(message)) => Err(message),
    }
}

async fn fetch_transcription_auth(
    session: &WorkspaceSession,
    workspace_id: &str,
    refresh_token: bool,
) -> Result<TranscriptionAuth, String> {
    let response = session
        .send_request_for_workspace(
            workspace_id,
            "getAuthStatus",
            json!({
                "includeToken": true,
                "refreshToken": refresh_token,
            }),
        )
        .await?;

    let root = response.get("result").unwrap_or(&response);
    let auth_method = read_string(root, &["authMethod", "auth_method"]).unwrap_or_default();
    if !auth_method.eq_ignore_ascii_case("chatgpt") {
        return Err("ChatGPT authentication is required. Sign in with ChatGPT in Codex first.".to_string());
    }

    let auth_token = read_string(root, &["authToken", "auth_token"])
        .ok_or_else(|| "Missing ChatGPT auth token from Codex app-server.".to_string())?;

    let account_id = decode_jwt_account_id(&auth_token)
        .or_else(|| {
            read_string(
                root,
                &[
                    "chatgptAccountId",
                    "chatgpt_account_id",
                    "accountId",
                    "account_id",
                ],
            )
        })
        .ok_or_else(|| "Unable to resolve ChatGPT account id from auth token.".to_string())?;

    Ok(TranscriptionAuth {
        auth_token,
        account_id,
        auth_method,
    })
}

async fn request_transcription(
    audio: &[u8],
    mime_type: &str,
    language: Option<&str>,
    auth_token: &str,
    account_id: &str,
) -> Result<String, TranscriptionRequestError> {
    let extension = mime_to_extension(mime_type);
    let filename = format!("codex.{extension}");

    let part = reqwest::multipart::Part::bytes(audio.to_vec())
        .file_name(filename)
        .mime_str(mime_type)
        .map_err(|error| {
            TranscriptionRequestError::Other(format!("Invalid audio mime type for transcription: {error}"))
        })?;

    let mut form = reqwest::multipart::Form::new().part("file", part);
    if let Some(language) = language
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
    {
        form = form.text("language", language);
    }

    let response = reqwest::Client::new()
        .post(TRANSCRIBE_URL)
        .header("Authorization", format!("Bearer {auth_token}"))
        .header("ChatGPT-Account-Id", account_id)
        .header("originator", "Codex Monitor")
        .multipart(form)
        .send()
        .await
        .map_err(|error| {
            TranscriptionRequestError::Other(format!(
                "Failed to reach ChatGPT transcription endpoint: {error}"
            ))
        })?;

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        if status == StatusCode::UNAUTHORIZED {
            return Err(TranscriptionRequestError::Unauthorized(detail));
        }
        return Err(TranscriptionRequestError::Other(format_http_error(status, detail)));
    }

    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| {
            TranscriptionRequestError::Other(format!(
                "Invalid ChatGPT transcription response: {error}"
            ))
        })?;

    Ok(payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string())
}

fn format_http_error(status: StatusCode, detail: String) -> String {
    let trimmed = detail.trim();
    if trimmed.is_empty() {
        format!("Transcription API returned {}.", status.as_u16())
    } else {
        format!("Transcription API returned {}: {}", status.as_u16(), trimmed)
    }
}

fn read_string(root: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        root.get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
    })
}

fn decode_jwt_account_id(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD
        .decode(payload.as_bytes())
        .or_else(|_| URL_SAFE.decode(payload.as_bytes()))
        .ok()?;
    let value: Value = serde_json::from_slice(&decoded).ok()?;
    value
        .get("https://api.openai.com/auth")
        .and_then(|claim| claim.get("chatgpt_account_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn mime_to_extension(mime_type: &str) -> &'static str {
    let normalized = mime_type.to_ascii_lowercase();
    if normalized.contains("webm") {
        return "webm";
    }
    if normalized.contains("ogg") {
        return "ogg";
    }
    if normalized.contains("mp4") || normalized.contains("m4a") {
        return "m4a";
    }
    if normalized.contains("wav") {
        return "wav";
    }
    "webm"
}
