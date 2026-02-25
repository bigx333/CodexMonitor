use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::transcription_chatgpt_core::{self, DictationAuthStatus};
use crate::state::AppState;

const DEFAULT_MODEL_ID: &str = "base";
const UNSUPPORTED_MESSAGE: &str = "Dictation is not available on mobile builds.";
const LOCAL_PROVIDER_MESSAGE: &str =
    "Local Whisper dictation is unavailable on mobile builds. Switch to ChatGPT.";

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DictationModelState {
    Missing,
    Downloading,
    Ready,
    Error,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct DictationDownloadProgress {
    #[serde(rename = "downloadedBytes")]
    pub(crate) downloaded_bytes: u64,
    #[serde(rename = "totalBytes")]
    pub(crate) total_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct DictationModelStatus {
    pub(crate) state: DictationModelState,
    #[serde(rename = "modelId")]
    pub(crate) model_id: String,
    pub(crate) progress: Option<DictationDownloadProgress>,
    pub(crate) error: Option<String>,
    pub(crate) path: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DictationSessionState {
    Idle,
    Listening,
    Processing,
}

pub(crate) struct DictationState {
    pub(crate) model_status: DictationModelStatus,
    pub(crate) session_state: DictationSessionState,
}

impl Default for DictationState {
    fn default() -> Self {
        Self {
            model_status: DictationModelStatus {
                state: DictationModelState::Missing,
                model_id: DEFAULT_MODEL_ID.to_string(),
                progress: None,
                error: Some(UNSUPPORTED_MESSAGE.to_string()),
                path: None,
            },
            session_state: DictationSessionState::Idle,
        }
    }
}

async fn chatgpt_provider_selected(state: &State<'_, AppState>) -> bool {
    let settings = state.app_settings.lock().await;
    settings.dictation_provider.eq_ignore_ascii_case("chatgpt")
}

#[tauri::command]
pub(crate) async fn dictation_model_status(
    _app: AppHandle,
    _state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    Ok(DictationModelStatus {
        state: DictationModelState::Missing,
        model_id: model_id.unwrap_or_else(|| DEFAULT_MODEL_ID.to_string()),
        progress: None,
        error: Some(UNSUPPORTED_MESSAGE.to_string()),
        path: None,
    })
}

#[tauri::command]
pub(crate) async fn dictation_download_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    dictation_model_status(app, state, model_id).await
}

#[tauri::command]
pub(crate) async fn dictation_cancel_download(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    dictation_model_status(app, state, model_id).await
}

#[tauri::command]
pub(crate) async fn dictation_remove_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<DictationModelStatus, String> {
    dictation_model_status(app, state, model_id).await
}

#[tauri::command]
pub(crate) async fn dictation_auth_status(
    workspace_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DictationAuthStatus, String> {
    if !chatgpt_provider_selected(&state).await {
        return Ok(DictationAuthStatus {
            authenticated: false,
            auth_method: Some("local".to_string()),
            account_id: None,
            message: Some(LOCAL_PROVIDER_MESSAGE.to_string()),
        });
    }

    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "dictation_auth_status",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|error| error.to_string());
    }

    Ok(transcription_chatgpt_core::dictation_auth_status_core(&state.sessions, workspace_id).await)
}

#[tauri::command]
pub(crate) async fn dictation_transcribe_audio(
    workspace_id: Option<String>,
    audio: String,
    mime_type: Option<String>,
    language: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if !chatgpt_provider_selected(&state).await {
        return Err("ChatGPT dictation provider is required.".to_string());
    }

    let workspace_id = workspace_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "An active workspace is required for ChatGPT dictation.".to_string())?;
    let audio = STANDARD
        .decode(audio.trim())
        .map_err(|error| format!("Invalid dictation audio payload: {error}"))?;
    let mime_type = mime_type
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "audio/webm".to_string());

    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "dictation_transcribe",
            json!({
                "workspaceId": workspace_id,
                "audio": STANDARD.encode(audio),
                "mimeType": mime_type,
                "language": language,
            }),
        )
        .await?;
        return response
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "Invalid dictation transcription response.".to_string());
    }

    transcription_chatgpt_core::dictation_transcribe_chatgpt_core(
        &state.sessions,
        workspace_id,
        audio,
        mime_type,
        language,
    )
    .await
}

#[tauri::command]
pub(crate) async fn dictation_start(
    _preferred_language: Option<String>,
    _workspace_id: Option<String>,
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}

#[tauri::command]
pub(crate) async fn dictation_request_permission(_app: AppHandle) -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub(crate) async fn dictation_stop(
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}

#[tauri::command]
pub(crate) async fn dictation_cancel(
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<DictationSessionState, String> {
    Err(UNSUPPORTED_MESSAGE.to_string())
}
