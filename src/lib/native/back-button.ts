import { isNativeRootRoute } from "./platform";

export type BackAction = "navigate_back" | "exit_app" | "confirm_exit";

/**
 * Pure resolver for Android hardware/system back.
 *
 * - nested page            -> go back one app page
 * - root, first press      -> ask for confirmation (toast), do not exit
 * - root, second press     -> exit the app
 *
 * Never redirects to login and never opens an external page, so no loops.
 */
export function resolveBackAction(input: {
  pathname: string;
  canGoBack: boolean;
  lastRootBackAtMs: number | null;
  nowMs: number;
  confirmWindowMs?: number;
}): BackAction {
  const atRoot = isNativeRootRoute(input.pathname) || !input.canGoBack;
  if (!atRoot) return "navigate_back";
  const windowMs = input.confirmWindowMs ?? 2000;
  if (input.lastRootBackAtMs !== null && input.nowMs - input.lastRootBackAtMs <= windowMs) {
    return "exit_app";
  }
  return "confirm_exit";
}
