/**
 * B1 UI adapter entry point.
 *
 * Selection rule: the in-memory mock is returned only for dev sessions that
 * explicitly opt in via `VITE_B1_UI_MOCK=1`; everything else gets the live
 * (backend-pending) adapter. One memoized instance per kind.
 */

import type { B1UiAdapter } from "./adapter.types";
import { createMockB1UiAdapter } from "./adapter.mock";
import { createLiveB1UiAdapter } from "./adapter.live";

/** Pure decision logic — kept flag-based so it is testable without import.meta.env. */
export function isB1UiMockEnabledForFlags(dev: boolean, mockFlag: string | undefined): boolean {
  return dev && mockFlag === "1";
}

/** True when the UI should run on the mock adapter (dev + VITE_B1_UI_MOCK=1). */
export function isB1UiMockEnabled(): boolean {
  return isB1UiMockEnabledForFlags(
    Boolean(import.meta.env?.DEV),
    import.meta.env?.VITE_B1_UI_MOCK as string | undefined,
  );
}

let mockInstance: B1UiAdapter | null = null;
let liveInstance: B1UiAdapter | null = null;

export function getB1UiAdapter(): B1UiAdapter {
  if (isB1UiMockEnabled()) {
    mockInstance ??= createMockB1UiAdapter();
    return mockInstance;
  }
  liveInstance ??= createLiveB1UiAdapter();
  return liveInstance;
}

export * from "./adapter.types";
export * from "./service-config";
export * from "./validation";
export { LIVE_B1_UI_UNSUPPORTED_METHODS } from "./adapter.live";
export {
  B1_FORM_DATA_ALLOWLISTS,
  RECORD_EXTERNAL_PAYMENT_ARG_KEYS,
  SUBMIT_B1_ATOMIC_ARG_KEYS,
} from "./b1-rpc";
