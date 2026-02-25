use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::timeout;

use crate::backend::events::{AppServerEvent, EventSink};
use crate::codex::args::parse_codex_args;
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::types::WorkspaceEntry;

#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn extract_thread_id(value: &Value) -> Option<String> {
    fn extract_from_container(container: Option<&Value>) -> Option<String> {
        let container = container?;
        container
            .get("threadId")
            .or_else(|| container.get("thread_id"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                container
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string())
            })
    }

    extract_from_container(value.get("params"))
        .or_else(|| extract_from_container(value.get("result")))
}

fn extract_thread_spawn_parent_thread_id(value: &Value) -> Option<String> {
    fn extract_from_source(source: Option<&Value>) -> Option<String> {
        let source = source?;
        let thread_spawn = source.get("thread_spawn").or_else(|| source.get("threadSpawn"))?;
        thread_spawn
            .get("parent_thread_id")
            .or_else(|| thread_spawn.get("parentThreadId"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
    }

    extract_from_source(value.get("params").and_then(|params| params.get("thread")).and_then(
        |thread| thread.get("source"),
    ))
    .or_else(|| {
        extract_from_source(
            value
                .get("result")
                .and_then(|result| result.get("thread"))
                .and_then(|thread| thread.get("source")),
        )
    })
}

fn resolve_spawned_thread_workspace(
    child_thread_id: &str,
    value: &Value,
    thread_workspace: &HashMap<String, String>,
) -> Option<String> {
    if child_thread_id.is_empty() {
        return None;
    }
    let parent_thread_id = extract_thread_spawn_parent_thread_id(value)?;
    thread_workspace.get(&parent_thread_id).cloned()
}

fn extract_thread_cwd(value: &Value) -> Option<String> {
    fn extract_from_container(container: Option<&Value>) -> Option<String> {
        container
            .and_then(|container| container.get("thread"))
            .and_then(|thread| thread.get("cwd"))
            .or_else(|| container.and_then(|container| container.get("cwd")))
            .and_then(|cwd| cwd.as_str())
            .map(|cwd| cwd.to_string())
    }

    extract_from_container(value.get("params"))
        .or_else(|| extract_from_container(value.get("result")))
}

fn resolve_started_thread_workspace(
    child_thread_id: &str,
    value: &Value,
    thread_workspace: &HashMap<String, String>,
    workspace_roots: &HashMap<String, String>,
) -> Option<String> {
    resolve_spawned_thread_workspace(child_thread_id, value, thread_workspace).or_else(|| {
        extract_thread_cwd(value)
            .as_deref()
            .and_then(|cwd| resolve_workspace_for_cwd(cwd, workspace_roots))
    })
}

fn extract_turn_id(value: &Value) -> Option<String> {
    fn extract_from_container(container: Option<&Value>) -> Option<String> {
        let container = container?;
        container
            .get("turnId")
            .or_else(|| container.get("turn_id"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                container
                    .get("turn")
                    .and_then(|turn| turn.get("id"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string())
            })
    }

    extract_from_container(value.get("params"))
        .or_else(|| extract_from_container(value.get("result")))
}

fn extract_turn_start_response_turn_id(value: &Value) -> Option<String> {
    value
        .get("result")
        .and_then(|result| {
            result
                .get("turn")
                .and_then(|turn| turn.get("id"))
                .or_else(|| result.get("turnId"))
                .or_else(|| result.get("turn_id"))
        })
        .and_then(|turn_id| turn_id.as_str())
        .map(|turn_id| turn_id.to_string())
}

fn extract_turn_start_request_thread_id(params: &Value) -> Option<String> {
    params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .and_then(|thread_id| thread_id.as_str())
        .map(|thread_id| thread_id.to_string())
}

#[derive(Debug, Clone)]
pub(crate) struct TurnStartRetryContext {
    workspace_id: String,
    thread_id: String,
    params: Value,
    attempts: u8,
}

#[derive(Debug, Clone)]
struct TurnErrorDetails {
    code: Option<String>,
    message: Option<String>,
    will_retry: bool,
}

fn normalize_turn_error_code(code: Option<&str>) -> Option<String> {
    code.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_ascii_lowercase())
        }
    })
}

fn extract_turn_error_details(value: &Value) -> Option<TurnErrorDetails> {
    let params = value.get("params")?.as_object()?;
    let will_retry = params
        .get("willRetry")
        .or_else(|| params.get("will_retry"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let error = params.get("error").and_then(Value::as_object);
    let mut code = normalize_turn_error_code(error.and_then(|err| {
        err.get("code")
            .or_else(|| err.get("errorCode"))
            .or_else(|| err.get("error_code"))
            .and_then(Value::as_str)
    }));

    let mut message = error
        .and_then(|err| err.get("message"))
        .and_then(Value::as_str)
        .map(|message| message.trim().to_string())
        .filter(|message| !message.is_empty())
        .or_else(|| {
            params
                .get("message")
                .and_then(Value::as_str)
                .map(|message| message.trim().to_string())
                .filter(|message| !message.is_empty())
        });

    if let Some(raw_message) = message.clone() {
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw_message) {
            let nested = parsed.get("error").unwrap_or(&parsed);
            if code.is_none() {
                code = normalize_turn_error_code(
                    nested
                        .get("code")
                        .or_else(|| nested.get("errorCode"))
                        .or_else(|| nested.get("error_code"))
                        .and_then(Value::as_str),
                );
            }
            if let Some(nested_message) = nested
                .get("message")
                .and_then(Value::as_str)
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
            {
                message = Some(nested_message.to_string());
            }
        }
    }

    Some(TurnErrorDetails {
        code,
        message,
        will_retry,
    })
}

fn is_retry_safe_turn_start_error(details: &TurnErrorDetails) -> bool {
    if let Some(code) = details.code.as_deref() {
        if code.starts_with("websocket_") {
            return true;
        }
    }
    details.message.as_deref().is_some_and(|message| {
        let normalized = message.to_ascii_lowercase();
        normalized.contains("websocket")
            && normalized.contains("create a new websocket connection")
    })
}

fn can_retry_turn_start_error(details: &TurnErrorDetails, has_context: bool, attempts: u8) -> bool {
    has_context
        && !details.will_retry
        && attempts < MAX_TURN_START_RETRY_ATTEMPTS
        && is_retry_safe_turn_start_error(details)
}

fn set_turn_error_will_retry(value: &mut Value, will_retry: bool) {
    if let Some(params) = value.get_mut("params").and_then(Value::as_object_mut) {
        params.insert("willRetry".to_string(), Value::Bool(will_retry));
    }
}

fn extract_response_error_message(value: &Value) -> Option<String> {
    let error = value.get("error")?;
    if let Some(message) = error.as_str() {
        let trimmed = message.trim();
        return if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    if let Some(message) = error
        .as_object()
        .and_then(|obj| obj.get("message"))
        .and_then(Value::as_str)
    {
        let trimmed = message.trim();
        return if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        };
    }
    None
}

fn normalize_root_path(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    let normalized = normalized.trim_end_matches('/');
    if normalized.is_empty() {
        return String::new();
    }
    let lower = normalized.to_ascii_lowercase();
    let normalized = if lower.starts_with("//?/unc/") {
        format!("//{}", &normalized[8..])
    } else if lower.starts_with("//?/") || lower.starts_with("//./") {
        normalized[4..].to_string()
    } else {
        normalized.to_string()
    };
    if normalized.is_empty() {
        return String::new();
    }

    let bytes = normalized.as_bytes();
    let is_drive_path = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && bytes[2] == b'/';
    if is_drive_path || normalized.starts_with("//") {
        normalized.to_ascii_lowercase()
    } else {
        normalized.to_string()
    }
}

fn normalize_path_for_matching(value: &str) -> String {
    let normalized = normalize_root_path(value);
    if normalized.is_empty() {
        return normalized;
    }

    let canonicalized = std::fs::canonicalize(Path::new(value))
        .ok()
        .and_then(|path| path.to_str().map(|value| normalize_root_path(value)));
    match canonicalized {
        Some(canonicalized) if !canonicalized.is_empty() => canonicalized,
        _ => normalized,
    }
}

#[derive(Debug, Clone)]
struct ThreadListEntry {
    thread_id: String,
    cwd: Option<String>,
}

fn extract_thread_entries_from_thread_list_result(value: &Value) -> Vec<ThreadListEntry> {
    fn collect_entries(input: &Value, out: &mut Vec<ThreadListEntry>) {
        if let Some(values) = input.as_array() {
            for value in values {
                collect_entries(value, out);
            }
            return;
        }
        let Some(object) = input.as_object() else {
            return;
        };

        let cwd = object
            .get("cwd")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .or_else(|| {
                object
                    .get("thread")
                    .and_then(|thread| thread.get("cwd"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            });

        let thread_id = object
            .get("threadId")
            .or_else(|| object.get("thread_id"))
            .or_else(|| object.get("id"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .or_else(|| {
                object
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            });
        if let Some(thread_id) = thread_id {
            out.push(ThreadListEntry { thread_id, cwd });
        }

        for key in ["threads", "items", "results", "data"] {
            if let Some(values) = object.get(key).and_then(|value| value.as_array()) {
                for value in values {
                    collect_entries(value, out);
                }
            }
        }
    }

    let mut out = Vec::new();
    if let Some(result) = value.get("result") {
        collect_entries(result, &mut out);
    }
    out
}

fn resolve_workspace_for_cwd(
    cwd: &str,
    workspace_roots: &HashMap<String, String>,
) -> Option<String> {
    let normalized_cwd = normalize_path_for_matching(cwd);
    if normalized_cwd.is_empty() {
        return None;
    }
    workspace_roots
        .iter()
        .filter_map(|(workspace_id, root)| {
            if root.is_empty() {
                return None;
            }
            let is_exact_match = root == &normalized_cwd;
            let is_nested_match = normalized_cwd.len() > root.len()
                && normalized_cwd.starts_with(root)
                && normalized_cwd.as_bytes().get(root.len()) == Some(&b'/');
            if is_exact_match || is_nested_match {
                Some((workspace_id, root.len()))
            } else {
                None
            }
        })
        .max_by_key(|(_, root_len)| *root_len)
        .map(|(workspace_id, _)| workspace_id.clone())
}

fn is_global_workspace_notification(method: &str) -> bool {
    matches!(
        method,
        "account/updated" | "account/rateLimits/updated" | "account/login/completed"
    )
}

fn should_broadcast_global_workspace_notification(
    method_name: Option<&str>,
    thread_id: Option<&String>,
    request_workspace: Option<&str>,
) -> bool {
    method_name.is_some_and(is_global_workspace_notification)
        && thread_id.is_none()
        && request_workspace.is_none()
}

fn resolve_routed_workspace_id(
    thread_id: Option<&str>,
    mapped_thread_workspace: Option<&str>,
    request_workspace: Option<&str>,
    fallback_workspace_id: &str,
    registered_workspace_count: usize,
) -> Option<String> {
    if thread_id.is_some() {
        if let Some(workspace_id) = mapped_thread_workspace {
            return Some(workspace_id.to_string());
        }
        if let Some(workspace_id) = request_workspace {
            return Some(workspace_id.to_string());
        }
        if registered_workspace_count <= 1 {
            return Some(fallback_workspace_id.to_string());
        }
        return None;
    }

    Some(
        request_workspace
            .unwrap_or(fallback_workspace_id)
            .to_string(),
    )
}

#[derive(Clone)]
pub(crate) struct RequestContext {
    workspace_id: String,
    method: String,
}

fn build_initialize_params(client_version: &str) -> Value {
    json!({
        "clientInfo": {
            "name": "codex_monitor",
            "title": "Codex Monitor",
            "version": client_version
        },
        "capabilities": {
            "experimentalApi": true
        }
    })
}

const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_TURN_START_RETRY_ATTEMPTS: u8 = 1;

pub(crate) struct WorkspaceSession {
    pub(crate) codex_args: Option<String>,
    pub(crate) child: Mutex<Child>,
    pub(crate) stdin: Mutex<ChildStdin>,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    pub(crate) request_context: Mutex<HashMap<u64, RequestContext>>,
    pub(crate) thread_workspace: Mutex<HashMap<String, String>>,
    pub(crate) next_id: AtomicU64,
    /// Callbacks for background threads - events for these threadIds are sent through the channel
    pub(crate) background_thread_callbacks: Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>,
    pub(crate) owner_workspace_id: String,
    pub(crate) workspace_ids: Mutex<HashSet<String>>,
    pub(crate) workspace_roots: Mutex<HashMap<String, String>>,
    pub(crate) turn_start_retry_context: Mutex<HashMap<String, TurnStartRetryContext>>,
}

impl WorkspaceSession {
    pub(crate) async fn register_workspace(&self, workspace_id: &str) {
        self.register_workspace_with_path(workspace_id, None).await;
    }

    pub(crate) async fn register_workspace_with_path(
        &self,
        workspace_id: &str,
        workspace_path: Option<&str>,
    ) {
        self.workspace_ids
            .lock()
            .await
            .insert(workspace_id.to_string());
        if let Some(path) = workspace_path {
            let normalized = normalize_path_for_matching(path);
            if !normalized.is_empty() {
                self.workspace_roots
                    .lock()
                    .await
                    .insert(workspace_id.to_string(), normalized);
            }
        }
    }

    pub(crate) async fn unregister_workspace(&self, workspace_id: &str) {
        self.workspace_ids.lock().await.remove(workspace_id);
        self.workspace_roots.lock().await.remove(workspace_id);
    }

    pub(crate) async fn workspace_ids_snapshot(&self) -> Vec<String> {
        self.workspace_ids.lock().await.iter().cloned().collect()
    }

    async fn register_turn_start_retry_context(
        &self,
        workspace_id: &str,
        params: &Value,
        response: &Value,
    ) {
        let Some(turn_id) = extract_turn_start_response_turn_id(response) else {
            return;
        };
        let Some(thread_id) = extract_turn_start_request_thread_id(params) else {
            return;
        };
        let mut contexts = self.turn_start_retry_context.lock().await;
        contexts.retain(|_, ctx| ctx.thread_id != thread_id);
        contexts.insert(
            turn_id,
            TurnStartRetryContext {
                workspace_id: workspace_id.to_string(),
                thread_id,
                params: params.clone(),
                attempts: 0,
            },
        );
    }

    async fn get_turn_start_retry_context(
        &self,
        turn_id: &str,
    ) -> Option<TurnStartRetryContext> {
        self.turn_start_retry_context.lock().await.get(turn_id).cloned()
    }

    async fn reserve_turn_start_retry(
        &self,
        turn_id: &str,
    ) -> Option<TurnStartRetryContext> {
        let mut contexts = self.turn_start_retry_context.lock().await;
        let context = contexts.get_mut(turn_id)?;
        if context.attempts >= MAX_TURN_START_RETRY_ATTEMPTS {
            return None;
        }
        context.attempts += 1;
        Some(context.clone())
    }

    async fn clear_turn_start_retry_context(&self, turn_id: &str) {
        self.turn_start_retry_context.lock().await.remove(turn_id);
    }

    async fn clear_turn_start_retry_contexts_for_thread(&self, thread_id: &str) {
        self.turn_start_retry_context
            .lock()
            .await
            .retain(|_, ctx| ctx.thread_id != thread_id);
    }

    async fn write_message(&self, value: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())
    }

    pub(crate) async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.send_request_for_workspace(self.owner_workspace_id.as_str(), method, params)
            .await
    }

    pub(crate) async fn send_request_for_workspace(
        &self,
        workspace_id: &str,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.register_workspace(workspace_id).await;
        self.pending.lock().await.insert(id, tx);
        self.request_context.lock().await.insert(
            id,
            RequestContext {
                workspace_id: workspace_id.to_string(),
                method: method.to_string(),
            },
        );
        if let Some(thread_id) = extract_thread_id(&json!({ "params": params.clone() })) {
            self.thread_workspace
                .lock()
                .await
                .insert(thread_id, workspace_id.to_string());
        }
        if let Err(error) = self
            .write_message(json!({ "id": id, "method": method, "params": params.clone() }))
            .await
        {
            self.pending.lock().await.remove(&id);
            self.request_context.lock().await.remove(&id);
            return Err(error);
        }
        match timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(value)) => {
                if method == "turn/start" {
                    self.register_turn_start_retry_context(workspace_id, &params, &value)
                        .await;
                }
                Ok(value)
            }
            Ok(Err(_)) => Err("request canceled".to_string()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                self.request_context.lock().await.remove(&id);
                Err(format!(
                    "request timed out after {} seconds",
                    REQUEST_TIMEOUT.as_secs()
                ))
            }
        }
    }

    pub(crate) async fn send_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        let value = if let Some(params) = params {
            json!({ "method": method, "params": params })
        } else {
            json!({ "method": method })
        };
        self.write_message(value).await
    }

    pub(crate) async fn send_response(&self, id: Value, result: Value) -> Result<(), String> {
        self.write_message(json!({ "id": id, "result": result }))
            .await
    }
}

pub(crate) fn build_codex_path_env(codex_bin: Option<&str>) -> Option<String> {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    let mut extras: Vec<PathBuf> = Vec::new();

    #[cfg(not(target_os = "windows"))]
    {
        extras.extend(
            [
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/usr/bin",
                "/bin",
                "/usr/sbin",
                "/sbin",
            ]
            .into_iter()
            .map(PathBuf::from),
        );

        if let Ok(home) = env::var("HOME") {
            let home_path = Path::new(&home);
            extras.push(home_path.join(".local/bin"));
            extras.push(home_path.join(".local/share/mise/shims"));
            extras.push(home_path.join(".cargo/bin"));
            extras.push(home_path.join(".bun/bin"));
            let nvm_root = home_path.join(".nvm/versions/node");
            if let Ok(entries) = std::fs::read_dir(nvm_root) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("bin");
                    if bin_path.is_dir() {
                        extras.push(bin_path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = env::var("APPDATA") {
            extras.push(Path::new(&appdata).join("npm"));
        }
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            extras.push(
                Path::new(&local_app_data)
                    .join("Microsoft")
                    .join("WindowsApps"),
            );
        }
        if let Ok(home) = env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
            let home_path = Path::new(&home);
            extras.push(home_path.join(".cargo").join("bin"));
            extras.push(home_path.join("scoop").join("shims"));
        }
        if let Ok(program_data) = env::var("PROGRAMDATA") {
            extras.push(Path::new(&program_data).join("chocolatey").join("bin"));
        }
    }

    if let Some(bin_path) = codex_bin.filter(|value| !value.trim().is_empty()) {
        if let Some(parent) = Path::new(bin_path).parent() {
            extras.push(parent.to_path_buf());
        }
    }

    for extra in extras {
        if !paths.iter().any(|path| path == &extra) {
            paths.push(extra);
        }
    }

    if paths.is_empty() {
        return None;
    }

    env::join_paths(paths)
        .ok()
        .map(|joined| joined.to_string_lossy().to_string())
}

pub(crate) fn build_codex_command_with_bin(
    codex_bin: Option<String>,
    codex_args: Option<&str>,
    args: Vec<String>,
) -> Result<Command, String> {
    let bin = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "codex".into());

    let path_env = build_codex_path_env(codex_bin.as_deref());
    let mut command_args = parse_codex_args(codex_args)?;
    command_args.extend(args);

    #[cfg(target_os = "windows")]
    let mut command = {
        let bin_trimmed = bin.trim();
        let resolved = resolve_windows_executable(bin_trimmed, path_env.as_deref());
        let resolved_path = resolved
            .as_deref()
            .unwrap_or_else(|| Path::new(bin_trimmed));
        let ext = resolved_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());

        if matches!(ext.as_deref(), Some("cmd") | Some("bat")) {
            let mut command = tokio_command("cmd");
            let command_line = build_cmd_c_command(resolved_path, &command_args)?;
            command.arg("/D");
            command.arg("/S");
            command.arg("/C");
            command.raw_arg(command_line);
            command
        } else {
            let mut command = tokio_command(resolved_path);
            command.args(command_args);
            command
        }
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut command = tokio_command(bin.trim());
        command.args(command_args);
        command
    };

    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    Ok(command)
}

pub(crate) async fn check_codex_installation(
    codex_bin: Option<String>,
) -> Result<Option<String>, String> {
    let mut command = build_codex_command_with_bin(codex_bin, None, vec!["--version".to_string()])?;
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "Codex CLI not found. Install Codex and ensure `codex` is on your PATH.".to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(
                "Timed out while checking Codex CLI. Make sure `codex --version` runs in Terminal."
                    .to_string(),
            );
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err(
                "Codex CLI failed to start. Try running `codex --version` in Terminal.".to_string(),
            );
        }
        return Err(format!(
            "Codex CLI failed to start: {detail}. Try running `codex --version` in Terminal."
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() {
        None
    } else {
        Some(version)
    })
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let codex_bin = default_codex_bin;
    let _ = check_codex_installation(codex_bin.clone()).await?;

    let mut command = build_codex_command_with_bin(
        codex_bin,
        codex_args.as_deref(),
        vec!["app-server".to_string()],
    )?;
    command.current_dir(&entry.path);
    if let Some(codex_home) = codex_home {
        command.env("CODEX_HOME", codex_home);
    }
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let session = Arc::new(WorkspaceSession {
        codex_args,
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        request_context: Mutex::new(HashMap::new()),
        thread_workspace: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
        owner_workspace_id: entry.id.clone(),
        workspace_ids: Mutex::new(HashSet::from([entry.id.clone()])),
        workspace_roots: Mutex::new(HashMap::from([(
            entry.id.clone(),
            normalize_path_for_matching(&entry.path),
        )])),
        turn_start_retry_context: Mutex::new(HashMap::new()),
    });

    let session_clone = Arc::clone(&session);
    let fallback_workspace_id = entry.id.clone();
    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let mut value: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(err) => {
                    let payload = AppServerEvent {
                        workspace_id: fallback_workspace_id.clone(),
                        message: json!({
                            "method": "codex/parseError",
                            "params": { "error": err.to_string(), "raw": line },
                        }),
                    };
                    event_sink_clone.emit_app_server_event(payload);
                    continue;
                }
            };

            let maybe_id = value.get("id").and_then(|id| id.as_u64());
            let has_method = value.get("method").is_some();
            let has_result_or_error = value.get("result").is_some() || value.get("error").is_some();
            let method_name = value
                .get("method")
                .and_then(|method| method.as_str())
                .map(|method| method.to_string());

            // Check if this event is for a background thread
            let thread_id = extract_thread_id(&value);
            let turn_id = extract_turn_id(&value);
            let mut request_workspace: Option<String> = None;
            let mut request_method: Option<String> = None;
            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(context) = session_clone.request_context.lock().await.remove(&id) {
                        request_workspace = Some(context.workspace_id);
                        request_method = Some(context.method);
                    }
                }
            }

            if let Some(ref workspace_id) = request_workspace {
                if let Some(ref tid) = thread_id {
                    session_clone
                        .thread_workspace
                        .lock()
                        .await
                        .insert(tid.clone(), workspace_id.clone());
                }
            }
            if matches!(request_method.as_deref(), Some("thread/list")) {
                let thread_entries = extract_thread_entries_from_thread_list_result(&value);
                if !thread_entries.is_empty() {
                    let workspace_roots = session_clone.workspace_roots.lock().await.clone();
                    let mut thread_workspace = session_clone.thread_workspace.lock().await;
                    for entry in thread_entries {
                        let mapped_workspace = entry
                            .cwd
                            .as_deref()
                            .and_then(|cwd| resolve_workspace_for_cwd(cwd, &workspace_roots));
                        if let Some(workspace_id) = mapped_workspace {
                            thread_workspace.insert(entry.thread_id, workspace_id);
                        }
                    }
                }
            }
            if method_name.as_deref() == Some("thread/started") {
                if let Some(ref child_thread_id) = thread_id {
                    let thread_workspace = session_clone.thread_workspace.lock().await.clone();
                    let workspace_roots = session_clone.workspace_roots.lock().await.clone();
                    let resolved_workspace_id = {
                        resolve_started_thread_workspace(
                            child_thread_id,
                            &value,
                            &thread_workspace,
                            &workspace_roots,
                        )
                    };
                    if let Some(parent_workspace_id) = resolved_workspace_id {
                        session_clone
                            .thread_workspace
                            .lock()
                            .await
                            .insert(child_thread_id.clone(), parent_workspace_id);
                    }
                }
            }

            let mapped_thread_workspace = if let Some(ref tid) = thread_id {
                session_clone
                    .thread_workspace
                    .lock()
                    .await
                    .get(tid)
                    .cloned()
            } else {
                None
            };
            let registered_workspace_count = session_clone.workspace_ids.lock().await.len();
            let Some(routed_workspace_id) = resolve_routed_workspace_id(
                thread_id.as_deref(),
                mapped_thread_workspace.as_deref(),
                request_workspace.as_deref(),
                &fallback_workspace_id,
                registered_workspace_count,
            ) else {
                continue;
            };

            if method_name.as_deref() == Some("thread/archived") {
                if let Some(ref tid) = thread_id {
                    session_clone.thread_workspace.lock().await.remove(tid);
                    session_clone
                        .clear_turn_start_retry_contexts_for_thread(tid)
                        .await;
                }
            }
            if method_name.as_deref() == Some("turn/completed") {
                if let Some(ref current_turn_id) = turn_id {
                    session_clone
                        .clear_turn_start_retry_context(current_turn_id)
                        .await;
                }
            }
            if method_name.as_deref() == Some("error") {
                if let Some(ref current_turn_id) = turn_id {
                    if let Some(details) = extract_turn_error_details(&value) {
                        let retry_context = session_clone
                            .get_turn_start_retry_context(current_turn_id)
                            .await;
                        let retry_attempts = retry_context.as_ref().map(|ctx| ctx.attempts).unwrap_or(0);
                        if can_retry_turn_start_error(
                            &details,
                            retry_context.is_some(),
                            retry_attempts,
                        ) {
                            if let Some(retry_context) = session_clone
                                .reserve_turn_start_retry(current_turn_id)
                                .await
                            {
                                set_turn_error_will_retry(&mut value, true);
                                let retry_turn_id = current_turn_id.clone();
                                let session_for_retry = Arc::clone(&session_clone);
                                let event_sink_for_retry = event_sink_clone.clone();
                                tokio::spawn(async move {
                                    let retry_result = session_for_retry
                                        .send_request_for_workspace(
                                            &retry_context.workspace_id,
                                            "turn/start",
                                            retry_context.params.clone(),
                                        )
                                        .await;
                                    let retry_error = match retry_result {
                                        Ok(response) => extract_response_error_message(&response),
                                        Err(error) => Some(error),
                                    };
                                    if let Some(error_message) = retry_error {
                                        session_for_retry
                                            .clear_turn_start_retry_context(&retry_turn_id)
                                            .await;
                                        event_sink_for_retry.emit_app_server_event(AppServerEvent {
                                            workspace_id: retry_context.workspace_id.clone(),
                                            message: json!({
                                                "method": "error",
                                                "params": {
                                                    "threadId": retry_context.thread_id,
                                                    "turnId": retry_turn_id,
                                                    "error": { "message": format!("Automatic retry failed: {error_message}") },
                                                    "willRetry": false
                                                }
                                            }),
                                        });
                                    }
                                });
                            } else {
                                session_clone
                                    .clear_turn_start_retry_context(current_turn_id)
                                    .await;
                            }
                        } else if !details.will_retry {
                            session_clone
                                .clear_turn_start_retry_context(current_turn_id)
                                .await;
                        }
                    }
                }
            }

            if let Some(id) = maybe_id {
                if has_result_or_error {
                    if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                        let _ = tx.send(value);
                    }
                } else if has_method {
                    // Check for background thread callback
                    let mut sent_to_background = false;
                    if let Some(ref tid) = thread_id {
                        let callbacks = session_clone.background_thread_callbacks.lock().await;
                        if let Some(tx) = callbacks.get(tid) {
                            let _ = tx.send(value.clone());
                            sent_to_background = true;
                        }
                    }
                    // Don't emit to frontend if this is a background thread event
                    if !sent_to_background {
                        if should_broadcast_global_workspace_notification(
                            method_name.as_deref(),
                            thread_id.as_ref(),
                            request_workspace.as_deref(),
                        ) {
                            let workspace_ids = session_clone.workspace_ids_snapshot().await;
                            if workspace_ids.is_empty() {
                                let payload = AppServerEvent {
                                    workspace_id: routed_workspace_id.clone(),
                                    message: value,
                                };
                                event_sink_clone.emit_app_server_event(payload);
                            } else {
                                for workspace_id in workspace_ids {
                                    let payload = AppServerEvent {
                                        workspace_id,
                                        message: value.clone(),
                                    };
                                    event_sink_clone.emit_app_server_event(payload);
                                }
                            }
                        } else {
                            let payload = AppServerEvent {
                                workspace_id: routed_workspace_id.clone(),
                                message: value,
                            };
                            event_sink_clone.emit_app_server_event(payload);
                        }
                    }
                } else if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                    let _ = tx.send(value);
                }
            } else if has_method {
                // Check for background thread callback
                let mut sent_to_background = false;
                if let Some(ref tid) = thread_id {
                    let callbacks = session_clone.background_thread_callbacks.lock().await;
                    if let Some(tx) = callbacks.get(tid) {
                        let _ = tx.send(value.clone());
                        sent_to_background = true;
                    }
                }
                // Don't emit to frontend if this is a background thread event
                if !sent_to_background {
                    if should_broadcast_global_workspace_notification(
                        method_name.as_deref(),
                        thread_id.as_ref(),
                        request_workspace.as_deref(),
                    ) {
                        let workspace_ids = session_clone.workspace_ids_snapshot().await;
                        if workspace_ids.is_empty() {
                            let payload = AppServerEvent {
                                workspace_id: routed_workspace_id,
                                message: value,
                            };
                            event_sink_clone.emit_app_server_event(payload);
                        } else {
                            for workspace_id in workspace_ids {
                                let payload = AppServerEvent {
                                    workspace_id,
                                    message: value.clone(),
                                };
                                event_sink_clone.emit_app_server_event(payload);
                            }
                        }
                    } else {
                        let payload = AppServerEvent {
                            workspace_id: routed_workspace_id,
                            message: value,
                        };
                        event_sink_clone.emit_app_server_event(payload);
                    }
                }
            }
        }

        // Ensure pending foreground requests cannot accumulate after process output ends.
        session_clone.pending.lock().await.clear();
        session_clone.request_context.lock().await.clear();
        session_clone.turn_start_retry_context.lock().await.clear();
    });

    let workspace_id = entry.id.clone();
    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let payload = AppServerEvent {
                workspace_id: workspace_id.clone(),
                message: json!({
                    "method": "codex/stderr",
                    "params": { "message": line },
                }),
            };
            event_sink_clone.emit_app_server_event(payload);
        }
    });

    let init_params = build_initialize_params(&client_version);
    let init_result = timeout(
        Duration::from_secs(15),
        session.send_request("initialize", init_params),
    )
    .await;
    let init_response = match init_result {
        Ok(response) => response,
        Err(_) => {
            let mut child = session.child.lock().await;
            kill_child_process_tree(&mut child).await;
            return Err(
                "Codex app-server did not respond to initialize. Check that `codex app-server` works in Terminal."
                    .to_string(),
            );
        }
    };
    init_response?;
    session.send_notification("initialized", None).await?;

    let payload = AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": entry.id.clone() }
        }),
    };
    event_sink.emit_app_server_event(payload);

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::{
        build_initialize_params, can_retry_turn_start_error, extract_response_error_message,
        extract_thread_cwd, extract_thread_entries_from_thread_list_result, extract_thread_id,
        extract_thread_spawn_parent_thread_id, extract_turn_error_details, extract_turn_id,
        normalize_path_for_matching, normalize_root_path, resolve_routed_workspace_id,
        resolve_spawned_thread_workspace, resolve_started_thread_workspace,
        resolve_workspace_for_cwd, set_turn_error_will_retry, TurnErrorDetails,
    };
    use std::collections::HashMap;
    use serde_json::json;

    #[test]
    fn extract_thread_id_reads_camel_case() {
        let value = json!({ "params": { "threadId": "thread-123" } });
        assert_eq!(extract_thread_id(&value), Some("thread-123".to_string()));
    }

    #[test]
    fn extract_thread_id_reads_snake_case() {
        let value = json!({ "params": { "thread_id": "thread-456" } });
        assert_eq!(extract_thread_id(&value), Some("thread-456".to_string()));
    }

    #[test]
    fn extract_thread_id_returns_none_when_missing() {
        let value = json!({ "params": {} });
        assert_eq!(extract_thread_id(&value), None);
    }

    #[test]
    fn extract_thread_spawn_parent_thread_id_reads_snake_case_source() {
        let value = json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": "thread-child",
                    "source": {
                        "thread_spawn": {
                            "parent_thread_id": "thread-parent"
                        }
                    }
                }
            }
        });
        assert_eq!(
            extract_thread_spawn_parent_thread_id(&value),
            Some("thread-parent".to_string())
        );
    }

    #[test]
    fn extract_thread_spawn_parent_thread_id_reads_camel_case_source() {
        let value = json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": "thread-child",
                    "source": {
                        "threadSpawn": {
                            "parentThreadId": "thread-parent"
                        }
                    }
                }
            }
        });
        assert_eq!(
            extract_thread_spawn_parent_thread_id(&value),
            Some("thread-parent".to_string())
        );
    }

    #[test]
    fn resolve_spawned_thread_workspace_uses_parent_thread_mapping() {
        let value = json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": "thread-child",
                    "source": {
                        "thread_spawn": {
                            "parent_thread_id": "thread-parent"
                        }
                    }
                }
            }
        });
        let mut thread_workspace = HashMap::new();
        thread_workspace.insert("thread-parent".to_string(), "ws-2".to_string());
        assert_eq!(
            resolve_spawned_thread_workspace("thread-child", &value, &thread_workspace),
            Some("ws-2".to_string())
        );
    }

    #[test]
    fn extract_thread_cwd_reads_thread_started_payload() {
        let value = json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": "thread-child",
                    "cwd": "/tmp/project-b"
                }
            }
        });
        assert_eq!(extract_thread_cwd(&value), Some("/tmp/project-b".to_string()));
    }

    #[test]
    fn resolve_started_thread_workspace_falls_back_to_cwd_when_parent_missing() {
        let value = json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": "thread-child",
                    "cwd": "/tmp/project-b/subdir",
                    "source": {
                        "thread_spawn": {
                            "parent_thread_id": "missing-parent"
                        }
                    }
                }
            }
        });
        let thread_workspace = HashMap::new();
        let mut workspace_roots = HashMap::new();
        workspace_roots.insert("ws-a".to_string(), normalize_root_path("/tmp/project-a"));
        workspace_roots.insert("ws-b".to_string(), normalize_root_path("/tmp/project-b"));
        assert_eq!(
            resolve_started_thread_workspace("thread-child", &value, &thread_workspace, &workspace_roots),
            Some("ws-b".to_string())
        );
    }

    #[test]
    fn resolve_started_thread_workspace_prefers_parent_mapping_over_cwd() {
        let value = json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": "thread-child",
                    "cwd": "/tmp/project-b/subdir",
                    "source": {
                        "thread_spawn": {
                            "parent_thread_id": "thread-parent"
                        }
                    }
                }
            }
        });
        let mut thread_workspace = HashMap::new();
        thread_workspace.insert("thread-parent".to_string(), "ws-a".to_string());
        let mut workspace_roots = HashMap::new();
        workspace_roots.insert("ws-a".to_string(), normalize_root_path("/tmp/project-a"));
        workspace_roots.insert("ws-b".to_string(), normalize_root_path("/tmp/project-b"));
        assert_eq!(
            resolve_started_thread_workspace("thread-child", &value, &thread_workspace, &workspace_roots),
            Some("ws-a".to_string())
        );
    }

    #[test]
    fn resolve_started_thread_workspace_returns_none_when_unmapped() {
        let value = json!({
            "method": "thread/started",
            "params": {
                "thread": {
                    "id": "thread-child",
                    "cwd": "/tmp/unknown-project"
                }
            }
        });
        let thread_workspace = HashMap::new();
        let mut workspace_roots = HashMap::new();
        workspace_roots.insert("ws-a".to_string(), normalize_root_path("/tmp/project-a"));
        workspace_roots.insert("ws-b".to_string(), normalize_root_path("/tmp/project-b"));
        assert_eq!(
            resolve_started_thread_workspace("thread-child", &value, &thread_workspace, &workspace_roots),
            None
        );
    }

    #[test]
    fn resolve_routed_workspace_id_prefers_mapped_thread_workspace() {
        assert_eq!(
            resolve_routed_workspace_id(
                Some("thread-1"),
                Some("ws-b"),
                Some("ws-a"),
                "ws-owner",
                2,
            ),
            Some("ws-b".to_string())
        );
    }

    #[test]
    fn resolve_routed_workspace_id_uses_request_workspace_when_thread_unmapped() {
        assert_eq!(
            resolve_routed_workspace_id(
                Some("thread-1"),
                None,
                Some("ws-a"),
                "ws-owner",
                2,
            ),
            Some("ws-a".to_string())
        );
    }

    #[test]
    fn resolve_routed_workspace_id_drops_ambiguous_thread_events_for_multi_workspace_sessions() {
        assert_eq!(
            resolve_routed_workspace_id(Some("thread-1"), None, None, "ws-owner", 2),
            None
        );
    }

    #[test]
    fn resolve_routed_workspace_id_keeps_single_workspace_fallback_behavior() {
        assert_eq!(
            resolve_routed_workspace_id(Some("thread-1"), None, None, "ws-owner", 1),
            Some("ws-owner".to_string())
        );
        assert_eq!(
            resolve_routed_workspace_id(None, None, None, "ws-owner", 3),
            Some("ws-owner".to_string())
        );
    }

    #[test]
    fn extract_turn_id_reads_turn_object_id() {
        let value = json!({ "params": { "turn": { "id": "turn-123" } } });
        assert_eq!(extract_turn_id(&value), Some("turn-123".to_string()));
    }

    #[test]
    fn extract_turn_id_reads_turn_id_field() {
        let value = json!({ "params": { "turn_id": "turn-456" } });
        assert_eq!(extract_turn_id(&value), Some("turn-456".to_string()));
    }

    #[test]
    fn build_initialize_params_enables_experimental_api() {
        let params = build_initialize_params("1.2.3");
        assert_eq!(
            params
                .get("capabilities")
                .and_then(|caps| caps.get("experimentalApi"))
                .and_then(|value| value.as_bool()),
            Some(true)
        );
    }

    #[test]
    fn extract_thread_entries_reads_result_data_items() {
        let value = json!({
            "result": {
                "data": [
                    { "id": "thread-a", "cwd": "/tmp/a" },
                    { "threadId": "thread-b", "cwd": "/tmp/b" }
                ]
            }
        });
        let entries = extract_thread_entries_from_thread_list_result(&value);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].thread_id, "thread-a");
        assert_eq!(entries[0].cwd.as_deref(), Some("/tmp/a"));
        assert_eq!(entries[1].thread_id, "thread-b");
        assert_eq!(entries[1].cwd.as_deref(), Some("/tmp/b"));
    }

    #[test]
    fn resolve_workspace_for_cwd_normalizes_windows_paths() {
        let mut roots = HashMap::new();
        roots.insert("ws-1".to_string(), normalize_root_path("C:\\Dev\\Codex"));
        assert_eq!(
            resolve_workspace_for_cwd("c:/dev/codex", &roots),
            Some("ws-1".to_string())
        );
    }

    #[test]
    fn resolve_workspace_for_cwd_normalizes_windows_namespace_paths() {
        let mut roots = HashMap::new();
        roots.insert("ws-1".to_string(), normalize_root_path("C:\\Dev\\Codex"));
        assert_eq!(
            resolve_workspace_for_cwd("\\\\?\\C:\\Dev\\Codex", &roots),
            Some("ws-1".to_string())
        );
    }

    #[test]
    fn normalize_root_path_normalizes_windows_namespace_unc_paths() {
        assert_eq!(
            normalize_root_path("\\\\?\\UNC\\SERVER\\Share\\Repo\\"),
            "//server/share/repo"
        );
    }

    #[test]
    fn resolve_workspace_for_cwd_matches_nested_paths() {
        let mut roots = HashMap::new();
        roots.insert("ws-1".to_string(), normalize_root_path("/tmp/codex"));
        assert_eq!(
            resolve_workspace_for_cwd("/tmp/codex/subdir/project", &roots),
            Some("ws-1".to_string())
        );
    }

    #[test]
    fn resolve_workspace_for_cwd_prefers_longest_matching_root() {
        let mut roots = HashMap::new();
        roots.insert("ws-parent".to_string(), normalize_root_path("/tmp/codex"));
        roots.insert(
            "ws-child".to_string(),
            normalize_root_path("/tmp/codex/subdir"),
        );
        assert_eq!(
            resolve_workspace_for_cwd("/tmp/codex/subdir/project", &roots),
            Some("ws-child".to_string())
        );
    }

    #[test]
    fn resolve_workspace_for_cwd_matches_canonicalized_paths() {
        let unique = format!(
            "codex-monitor-route-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let project = root.join("project");
        let nested = project.join("subdir");
        std::fs::create_dir_all(&nested).expect("create dirs");

        let workspace_input = project.join(".");
        let cwd_input = nested.join("..").join("subdir");

        let mut roots = HashMap::new();
        roots.insert(
            "ws-1".to_string(),
            normalize_path_for_matching(&workspace_input.to_string_lossy()),
        );
        assert_eq!(
            resolve_workspace_for_cwd(&cwd_input.to_string_lossy(), &roots),
            Some("ws-1".to_string())
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn extract_turn_error_details_reads_nested_json_error_payload() {
        let value = json!({
            "method": "error",
            "params": {
                "turnId": "turn-1",
                "error": {
                    "message": "{\"error\":{\"type\":\"invalid_request_error\",\"code\":\"websocket_connection_limit_reached\",\"message\":\"Responses websocket connection limit reached (60 minutes). Create a new websocket connection to continue.\"}}"
                }
            }
        });
        let details = extract_turn_error_details(&value).expect("details");
        assert_eq!(
            details.code.as_deref(),
            Some("websocket_connection_limit_reached")
        );
        assert_eq!(
            details.message.as_deref(),
            Some(
                "Responses websocket connection limit reached (60 minutes). Create a new websocket connection to continue."
            )
        );
        assert!(!details.will_retry);
    }

    #[test]
    fn can_retry_turn_start_error_retries_only_retry_safe_cases() {
        let safe = TurnErrorDetails {
            code: Some("websocket_connection_limit_reached".to_string()),
            message: Some(
                "Responses websocket connection limit reached (60 minutes). Create a new websocket connection to continue."
                    .to_string(),
            ),
            will_retry: false,
        };
        assert!(can_retry_turn_start_error(&safe, true, 0));
        assert!(!can_retry_turn_start_error(&safe, false, 0));
        assert!(!can_retry_turn_start_error(&safe, true, 1));

        let not_safe = TurnErrorDetails {
            code: Some("invalid_request_error".to_string()),
            message: Some("Request failed.".to_string()),
            will_retry: false,
        };
        assert!(!can_retry_turn_start_error(&not_safe, true, 0));

        let already_retrying = TurnErrorDetails {
            code: Some("websocket_connection_limit_reached".to_string()),
            message: Some("Websocket issue.".to_string()),
            will_retry: true,
        };
        assert!(!can_retry_turn_start_error(&already_retrying, true, 0));
    }

    #[test]
    fn set_turn_error_will_retry_sets_params_field() {
        let mut value = json!({
            "method": "error",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "error": { "message": "boom" }
            }
        });
        set_turn_error_will_retry(&mut value, true);
        assert_eq!(
            value
                .get("params")
                .and_then(|params| params.get("willRetry"))
                .and_then(|will_retry| will_retry.as_bool()),
            Some(true)
        );
    }

    #[test]
    fn extract_response_error_message_reads_string_and_object_messages() {
        let string_error = json!({ "error": "boom" });
        assert_eq!(
            extract_response_error_message(&string_error).as_deref(),
            Some("boom")
        );

        let object_error = json!({ "error": { "message": "nope" } });
        assert_eq!(
            extract_response_error_message(&object_error).as_deref(),
            Some("nope")
        );
    }
}
