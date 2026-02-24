use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn send_presence_heartbeat(
    client_id: String,
    client_kind: String,
    platform: Option<String>,
    is_supported: bool,
    is_focused: bool,
    is_afk: bool,
    active_workspace_ids: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if !remote_backend::is_remote_mode(&*state).await {
        return Ok(json!({ "ok": true, "skipped": "local_mode" }));
    }
    remote_backend::call_remote(
        &*state,
        app,
        "presence_heartbeat",
        json!({
            "clientId": client_id,
            "clientKind": client_kind,
            "platform": platform,
            "isSupported": is_supported,
            "isFocused": is_focused,
            "isAfk": is_afk,
            "activeWorkspaceIds": active_workspace_ids,
        }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn push_register_device(
    device_id: String,
    platform: String,
    token: String,
    label: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if !remote_backend::is_remote_mode(&*state).await {
        return Ok(json!({ "ok": true, "skipped": "local_mode" }));
    }
    remote_backend::call_remote(
        &*state,
        app,
        "push_register_device",
        json!({
            "deviceId": device_id,
            "platform": platform,
            "token": token,
            "label": label,
        }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn push_unregister_device(
    device_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if !remote_backend::is_remote_mode(&*state).await {
        return Ok(json!({ "ok": true, "skipped": "local_mode" }));
    }
    remote_backend::call_remote(
        &*state,
        app,
        "push_unregister_device",
        json!({ "deviceId": device_id }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn push_notification_config_get(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if !remote_backend::is_remote_mode(&*state).await {
        return Ok(json!({
            "relayUrl": null,
            "hasRelayAuthToken": false,
            "registeredDeviceCount": 0
        }));
    }
    remote_backend::call_remote(&*state, app, "push_notification_config_get", json!({})).await
}

#[tauri::command]
pub(crate) async fn push_notification_config_patch(
    relay_url: Option<String>,
    relay_auth_token: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if !remote_backend::is_remote_mode(&*state).await {
        return Ok(json!({ "ok": true, "skipped": "local_mode" }));
    }
    remote_backend::call_remote(
        &*state,
        app,
        "push_notification_config_patch",
        json!({
            "relayUrl": relay_url,
            "relayAuthToken": relay_auth_token,
        }),
    )
    .await
}

#[tauri::command]
pub(crate) async fn push_notification_state(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if !remote_backend::is_remote_mode(&*state).await {
        return Ok(json!({
            "config": {
                "relayUrl": null,
                "hasRelayAuthToken": false,
                "registeredDeviceCount": 0,
            },
            "devices": [],
            "presence": [],
        }));
    }
    remote_backend::call_remote(&*state, app, "push_notification_state", json!({})).await
}

#[tauri::command]
pub(crate) async fn get_system_idle_seconds() -> Result<Option<f64>, String> {
    Ok(system_idle_seconds())
}

#[cfg(target_os = "windows")]
fn system_idle_seconds() -> Option<f64> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut input_info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `GetLastInputInfo` writes to an initialized struct pointer.
    let ok = unsafe { GetLastInputInfo(&mut input_info as *mut LASTINPUTINFO) };
    if ok == 0 {
        return None;
    }
    // SAFETY: `GetTickCount` has no preconditions and returns process uptime ticks.
    let now_ms = unsafe { GetTickCount() };
    let idle_ms = now_ms.wrapping_sub(input_info.dwTime);
    Some((idle_ms as f64) / 1_000.0)
}

#[cfg(target_os = "macos")]
fn system_idle_seconds() -> Option<f64> {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: u32, event_type: u32) -> f64;
    }

    const KCG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE: u32 = 0;
    const KCG_ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;
    // SAFETY: CoreGraphics function is pure and has no side effects for these constants.
    let seconds = unsafe {
        CGEventSourceSecondsSinceLastEventType(
            KCG_EVENT_SOURCE_STATE_COMBINED_SESSION_STATE,
            KCG_ANY_INPUT_EVENT_TYPE,
        )
    };
    if seconds.is_nan() || seconds.is_sign_negative() {
        None
    } else {
        Some(seconds)
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn system_idle_seconds() -> Option<f64> {
    None
}
