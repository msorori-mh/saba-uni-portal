/**
 * Pure app-lock state machine (no React, no Capacitor) — unit testable.
 *
 * States:
 *  - "unlocked": student content may render.
 *  - "covered":  app is backgrounded; content MUST be hidden (Recent Apps).
 *  - "locked":   app is foreground but requires a successful biometric unlock.
 */

export type AppLockState = "unlocked" | "covered" | "locked";

export type AppLockEvent =
  | { type: "BACKGROUND" }
  | { type: "FOREGROUND" }
  | { type: "UNLOCK_SUCCESS" }
  | { type: "UNLOCK_FAILURE" }
  | { type: "FEATURE_DISABLED" }
  | { type: "FEATURE_ENABLED" }
  | { type: "TRUST_REVOKED" };

export const APP_LOCK_STORAGE_KEY = "usrp.mobile.appLock.enabled.v1";
export const APP_LOCK_DEVICE_STORAGE_KEY = "usrp.mobile.appLock.deviceId.v1";

/** Content is renderable only in the "unlocked" state. */
export function isContentVisible(state: AppLockState): boolean {
  return state === "unlocked";
}

/** FLAG_SECURE is applied while the app is covered or locked, then released. */
export function shouldApplySecureScreen(state: AppLockState): boolean {
  return state !== "unlocked";
}

export function nextAppLockState(
  state: AppLockState,
  event: AppLockEvent,
  enabled: boolean,
): AppLockState {
  switch (event.type) {
    case "FEATURE_DISABLED":
      return "unlocked";
    case "FEATURE_ENABLED":
      return state;
    case "BACKGROUND":
      return enabled ? "covered" : "unlocked";
    case "FOREGROUND":
      if (!enabled) return "unlocked";
      // Returning from background always requires a fresh biometric check.
      return state === "unlocked" ? "unlocked" : "locked";
    case "UNLOCK_SUCCESS":
      return enabled ? "unlocked" : "unlocked";
    case "UNLOCK_FAILURE":
      return enabled ? "locked" : "unlocked";
    case "TRUST_REVOKED":
      // Local trust is destroyed: the feature turns itself off and the student
      // must re-enroll the device (with fresh account re-authentication).
      return "unlocked";
    default:
      return state;
  }
}
