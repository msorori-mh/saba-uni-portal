/**
 * Derive the in-app destination for a notification without adding a new
 * link column to the `notifications` table. The mapping is keyed on
 * (notification_type, reference_type, reference_id).
 *
 * Currently only `student_request_completed` + `student_request` routes
 * to the student request detail page. Other notifications fall back to
 * the caller-provided default (e.g. the notifications list).
 */
export type NotificationLinkInput = {
  notification_type: string;
  reference_type: string | null;
  reference_id: string | null;
};

export function getNotificationLink(n: NotificationLinkInput): string | null {
  if (
    n.notification_type === "student_request_completed" &&
    n.reference_type === "student_request" &&
    n.reference_id
  ) {
    return `/student/requests/${n.reference_id}`;
  }
  return null;
}
