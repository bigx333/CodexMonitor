use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.codexmonitorpush";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobilePushRegistrationInfo {
    pub(crate) platform: String,
    pub(crate) device_id: String,
    pub(crate) token: String,
    #[serde(default)]
    pub(crate) label: Option<String>,
}

pub(crate) struct MobilePush<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> MobilePush<R> {
    #[cfg(target_os = "android")]
    pub(crate) fn registration_info(&self) -> Result<MobilePushRegistrationInfo, String> {
        self.mobile_plugin_handle
            .run_mobile_plugin("registrationInfo", ())
            .map_err(|err| err.to_string())
    }
}

#[cfg(target_os = "android")]
pub(crate) trait MobilePushExt<R: Runtime> {
    fn mobile_push(&self) -> &MobilePush<R>;
}

#[cfg(target_os = "android")]
impl<R: Runtime, T: Manager<R>> MobilePushExt<R> for T {
    fn mobile_push(&self) -> &MobilePush<R> {
        self.state::<MobilePush<R>>().inner()
    }
}

pub(crate) fn init<R: Runtime>() -> TauriPlugin<R, ()> {
    Builder::<R, ()>::new("mobile-push")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let mobile_push = MobilePush {
                mobile_plugin_handle: _api
                    .register_android_plugin(PLUGIN_IDENTIFIER, "CodexMonitorPushPlugin")?,
            };

            #[cfg(not(target_os = "android"))]
            let mobile_push: MobilePush<R> = MobilePush {
                _marker: std::marker::PhantomData,
            };

            app.manage(mobile_push);
            Ok(())
        })
        .build()
}
