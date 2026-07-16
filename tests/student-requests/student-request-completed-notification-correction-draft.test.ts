/**
 * Client-side routing tests for student-request completion notifications.
 *
 * The applied migration contract is covered by
 * student-request-completed-notification.test.ts; this file intentionally
 * avoids duplicating SQL assertions against the superseded draft.
 */
import { describe, expect, it } from "bun:test";
import { getNotificationLink } from "@/lib/notifications/notification-link";

describe("client: getNotificationLink", () => {
  it("routes student_request_completed + student_request to the request detail page", () => {
    expect(
      getNotificationLink({
        notification_type: "student_request_completed",
        reference_type: "student_request",
        reference_id: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBe("/student/requests/11111111-1111-1111-1111-111111111111");
  });

  it("returns null when reference_id is missing", () => {
    expect(
      getNotificationLink({
        notification_type: "student_request_completed",
        reference_type: "student_request",
        reference_id: null,
      }),
    ).toBeNull();
  });

  it("returns null for unrelated notification types", () => {
    expect(
      getNotificationLink({
        notification_type: "payment_receipt",
        reference_type: "student_request",
        reference_id: "abc",
      }),
    ).toBeNull();
    expect(
      getNotificationLink({
        notification_type: "student_request_completed",
        reference_type: "official_document",
        reference_id: "abc",
      }),
    ).toBeNull();
  });
});
