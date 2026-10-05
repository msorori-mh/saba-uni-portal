// Server-only helpers for STUDENT-SERVICES-GLOBAL-SWITCH-01.
// Use from *.functions.ts handlers only (never import into client code).
import {
  STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR,
  STUDENT_SERVICES_STATUS_NOT_INSTALLED,
  STUDENT_SERVICES_STATUS_UNAVAILABLE_MESSAGE_AR,
  isResubmissionAllowedWhilePaused,
  isStudentServicesSwitchNotInstalled,
  parseStudentServicesStatus,
  type StudentServicesStatus,
} from "@/lib/student-requests/student-services-switch";

type RpcErrorLike = { message?: string; code?: string };

/** Minimal shape of the caller's session client (auth.uid() = the caller). */
export type StudentServicesRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcErrorLike | null }>;
};

/**
 * Reads the switch through `get_student_services_status()`.
 *  - RPC not deployed yet  -> "not installed" (nothing is paused).
 *  - any other RPC failure -> throws; callers decide (submit paths fail closed).
 */
export async function readStudentServicesStatus(
  client: StudentServicesRpcClient,
): Promise<StudentServicesStatus> {
  const { data, error } = await client.rpc("get_student_services_status");
  if (error) {
    if (isStudentServicesSwitchNotInstalled(error)) return STUDENT_SERVICES_STATUS_NOT_INSTALLED;
    throw new Error(error.message || "STUDENT_SERVICES_STATUS_UNAVAILABLE");
  }
  return parseStudentServicesStatus(data);
}

/**
 * Server-side gate for every student "start" / "submit" server function.
 *
 * The database trigger is the authoritative guard for writes made with the
 * student's own session. This gate additionally covers the two service-role
 * fallback writes in student-affairs.functions.ts (auth.uid() is NULL there,
 * so the trigger deliberately treats them as system writes), and gives the
 * student a clean Arabic error before any work is done.
 *
 * FAIL CLOSED: when the state cannot be read the request is NOT submitted.
 * `existingStatus` of a request staff returned is exempt — resubmitting it is
 * not a new service.
 */
export async function assertStudentServicesOpenForNewRequest(
  client: StudentServicesRpcClient,
  options?: { existingStatus?: string | null },
): Promise<void> {
  if (isResubmissionAllowedWhilePaused(options?.existingStatus)) return;

  let status: StudentServicesStatus;
  try {
    status = await readStudentServicesStatus(client);
  } catch {
    throw new Error(STUDENT_SERVICES_STATUS_UNAVAILABLE_MESSAGE_AR);
  }
  if (!status.enabled) throw new Error(STUDENT_SERVICES_DISABLED_SUBMIT_MESSAGE_AR);
}
