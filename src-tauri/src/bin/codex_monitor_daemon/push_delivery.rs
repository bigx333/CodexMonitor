use serde_json::json;

use super::push_support::RelayDispatch;
use super::{PushDeviceRegistration, PushEvent};

pub(super) struct PreparedDelivery {
    pub(super) relay_url: Option<String>,
    pub(super) relay_auth_token: Option<String>,
    pub(super) event: PushEvent,
    pub(super) title: String,
    pub(super) body: String,
    pub(super) devices: Vec<PushDeviceRegistration>,
    pub(super) timestamp_ms: i64,
}

impl PreparedDelivery {
    pub(super) fn into_relay_dispatch(self) -> Option<RelayDispatch> {
        let relay_url = self.relay_url?;
        let payload = json!({
            "kind": self.event.kind,
            "workspaceId": self.event.workspace_id,
            "threadId": self.event.thread_id,
            "turnId": self.event.turn_id,
            "title": self.title,
            "body": self.body,
            "preview": self.event.preview,
            "timestampMs": self.timestamp_ms,
            "devices": self.devices.into_iter().map(|device| {
                json!({
                    "deviceId": device.device_id,
                    "platform": device.platform,
                    "token": device.token,
                    "label": device.label,
                })
            }).collect::<Vec<_>>()
        });
        Some(RelayDispatch {
            relay_url,
            relay_auth_token: self.relay_auth_token,
            payload,
        })
    }
}
