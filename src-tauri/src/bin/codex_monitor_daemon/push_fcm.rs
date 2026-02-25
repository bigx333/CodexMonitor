use gcp_auth::{provider as gcp_provider, CustomServiceAccount, TokenProvider};
use reqwest::Client;
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

use super::PreparedDelivery;

const FCM_SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_SERVICE_ACCOUNT_FILE: &str = "firebase-service-account.json";

struct DirectFcmState {
    provider: Arc<dyn TokenProvider>,
    project_id: String,
}

pub(super) struct DirectFcmSender {
    data_dir: PathBuf,
    http_client: Client,
    state: Mutex<Option<Arc<DirectFcmState>>>,
    warned_unavailable: AtomicBool,
}

impl DirectFcmSender {
    pub(super) fn new(data_dir: PathBuf, http_client: Client) -> Self {
        Self {
            data_dir,
            http_client,
            state: Mutex::new(None),
            warned_unavailable: AtomicBool::new(false),
        }
    }

    pub(super) async fn deliver(&self, delivery: PreparedDelivery) {
        let state = match self.ensure_state().await {
            Ok(state) => state,
            Err(err) => {
                if !self.warned_unavailable.swap(true, Ordering::Relaxed) {
                    eprintln!("daemon direct FCM unavailable: {err}");
                }
                return;
            }
        };

        let token = match state.provider.token(&[FCM_SCOPE]).await {
            Ok(token) => token,
            Err(err) => {
                eprintln!("daemon direct FCM auth token failed: {err}");
                return;
            }
        };

        let endpoint = format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            state.project_id
        );
        let access_token = token.as_str().to_string();

        for device in delivery
            .devices
            .iter()
            .filter(|device| matches!(device.platform.as_str(), "android" | "ios"))
        {
            let mut data = serde_json::Map::new();
            data.insert("kind".to_string(), json!(delivery.event.kind));
            data.insert("workspaceId".to_string(), json!(delivery.event.workspace_id));
            data.insert("threadId".to_string(), json!(delivery.event.thread_id));
            data.insert("timestampMs".to_string(), json!(delivery.timestamp_ms.to_string()));
            if let Some(turn_id) = delivery.event.turn_id.as_ref() {
                data.insert("turnId".to_string(), json!(turn_id));
            }

            let payload = json!({
                "message": {
                    "token": device.token,
                    "notification": {
                        "title": delivery.title,
                        "body": delivery.body,
                    },
                    "data": data,
                    "android": {
                        "priority": "HIGH"
                    },
                }
            });

            match self
                .http_client
                .post(endpoint.clone())
                .bearer_auth(access_token.as_str())
                .json(&payload)
                .send()
                .await
            {
                Ok(response) if response.status().is_success() => {}
                Ok(response) => {
                    let status = response.status().as_u16();
                    let body = response.text().await.unwrap_or_default();
                    eprintln!("daemon direct FCM send failed: status {status}, body {body}");
                }
                Err(err) => {
                    eprintln!("daemon direct FCM request failed: {err}");
                }
            }
        }
    }

    async fn ensure_state(&self) -> Result<Arc<DirectFcmState>, String> {
        if let Some(state) = self.state.lock().await.as_ref().cloned() {
            return Ok(state);
        }

        let initialized = Arc::new(self.init_state().await?);
        let mut guard = self.state.lock().await;
        if let Some(state) = guard.as_ref().cloned() {
            return Ok(state);
        }
        *guard = Some(Arc::clone(&initialized));
        Ok(initialized)
    }

    async fn init_state(&self) -> Result<DirectFcmState, String> {
        let provider: Arc<dyn TokenProvider> =
            if std::env::var("GOOGLE_APPLICATION_CREDENTIALS").is_ok() {
                gcp_provider().await.map_err(|err| err.to_string())?
            } else {
                let local_service_account = self.data_dir.join(DEFAULT_SERVICE_ACCOUNT_FILE);
                if local_service_account.exists() {
                    Arc::new(
                        CustomServiceAccount::from_file(local_service_account)
                            .map_err(|err| err.to_string())?,
                    )
                } else {
                    gcp_provider().await.map_err(|err| err.to_string())?
                }
            };

        let project_id = provider
            .project_id()
            .await
            .map_err(|err| err.to_string())?
            .to_string();

        if project_id.trim().is_empty() {
            return Err("gcp_auth returned empty project id".to_string());
        }

        Ok(DirectFcmState {
            provider,
            project_id,
        })
    }
}
