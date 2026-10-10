import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchStaffInbox } from "@/lib/student-requests/staff-inbox.functions";

/** The actor-scoped inbox includes every student service, including certificates. */
export const STAFF_ASSIGNED_REQUESTS_QUERY_KEY = ["staff-inbox", "assigned-all"] as const;

export function useAssignedStudentRequests() {
  const inboxFn = useServerFn(fetchStaffInbox);
  return useQuery({
    queryKey: STAFF_ASSIGNED_REQUESTS_QUERY_KEY,
    queryFn: () => inboxFn({ data: { statusFilter: "all" } }),
  });
}
