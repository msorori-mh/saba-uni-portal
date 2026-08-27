/**
 * Derive the in-app destination for a notification without adding a new
 * link column to the `notifications` table. The mapping is keyed on
 * (notification_type, reference_type, reference_id).
 *
 * Currently only `student_request_completed` + `student_request` routes
 * to the student request detail page. Other notifications fall back to
 * the caller-provided default (e.g. the notifications list).
 *
 * `reference_id` is only accepted when it is a full canonical UUID. Any
 * other string (relative paths, scheme-relative or absolute URLs,
 * percent-encoded payloads, extra path segments, ...) yields `null` so a
 * crafted value can never steer navigation outside the request detail
 * route.
 */
export type NotificationLinkInput = {
  notification_type: string;
  reference_type: string | null;
  reference_id: string | null;
};

// Full canonical UUID only (8-4-4-4-12 hex groups, anchored). No library
// needed; a partial UUID, trailing text, or any extra characters fail.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getNotificationLink(n: NotificationLinkInput): string | null {
  if (
    n.notification_type === "student_request_completed" &&
    n.reference_type === "student_request" &&
    n.reference_id &&
    UUID_RE.test(n.reference_id)
  ) {
    return `/student/requests/${n.reference_id}`;
  }
  return null;
}
