import type { FetchStaffInboxResult } from "@/lib/student-requests/staff-inbox.functions";

export function assignedStudentRequestCount(result: FetchStaffInboxResult | undefined): number | null {
  if (!result) return null;
  // An employee without any processing assignment has no assigned steps.
  if (result.reason === "unauthorized") return 0;
  // The admin-only legacy overview and failed RPCs must never become a false count.
  if (!result.available || result.reason || result.dataSource !== "actor_inbox_rpc") return null;
  return result.items.length;
}
