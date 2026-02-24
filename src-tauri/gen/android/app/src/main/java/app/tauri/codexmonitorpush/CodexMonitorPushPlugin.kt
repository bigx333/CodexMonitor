package app.tauri.codexmonitorpush

import android.app.Activity
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

@TauriPlugin
class CodexMonitorPushPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun registrationInfo(invoke: Invoke) {
    val androidId = Settings.Secure.getString(
      activity.contentResolver,
      Settings.Secure.ANDROID_ID
    )
    if (androidId.isNullOrBlank()) {
      invoke.reject("Missing Android device id")
      return
    }

    try {
      if (FirebaseApp.getApps(activity).isEmpty()) {
        val initialized = FirebaseApp.initializeApp(activity)
        if (initialized == null) {
          invoke.reject("Firebase not configured. Add google-services.json for Android push.")
          return
        }
      }
    } catch (error: Throwable) {
      invoke.reject(error.message ?: "Failed to initialize Firebase")
      return
    }

    FirebaseMessaging.getInstance().token.addOnCompleteListener(activity) { task ->
      if (!task.isSuccessful) {
        invoke.reject(task.exception?.message ?: "Failed to fetch FCM token")
        return@addOnCompleteListener
      }
      val token = task.result
      if (token.isNullOrBlank()) {
        invoke.reject("Empty FCM token")
        return@addOnCompleteListener
      }

      val payload = JSObject()
      payload.put("platform", "android")
      payload.put("deviceId", "android-${androidId.lowercase()}")
      payload.put("token", token)
      payload.put(
        "label",
        "${Build.MANUFACTURER.orEmpty()} ${Build.MODEL.orEmpty()}".trim()
      )
      invoke.resolve(payload)
    }
  }
}
