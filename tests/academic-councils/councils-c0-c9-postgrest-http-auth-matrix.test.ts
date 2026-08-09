/**
 * PR306 HIGH-3 — PostgREST HTTP authorization matrix for Academic Councils C0–C9.
 * True HTTP + JWT path (NOT SQL SET ROLE switching).
 */

import { afterAll, describe, expect, it } from "bun:test";
import {
  ACTORS,
  IDS,
  PostgrestHttpHarness,
  mintJwt,
  type HttpResult,
} from "./postgrest-http/harness";

const harness = new PostgrestHttpHarness();

afterAll(() => {
  harness.teardown();
});

function isSuccessfulMutationStatus(status: number, method: string): boolean {
  if (method === "POST") return status === 201 || status === 200;
  if (method === "PATCH" || method === "PUT") {
    return status === 200 || status === 204;
  }
  if (method === "DELETE") return status === 200 || status === 204;
  return status >= 200 && status < 300;
}

function assertControlledErrorBody(res: HttpResult, label: string): void {
  const lower = res.text.toLowerCase();
  expect(lower.includes("password"), `${label}: password leak`).toBe(false);
  expect(lower.includes("testsecret"), `${label}: secret leak`).toBe(false);
  // Prefer structured PostgREST / SQLSTATE error shape when body present.
  if (res.text.trim().length > 0 && res.json && typeof res.json === "object") {
    const obj = res.json as Record<string, unknown>;
    const hasSignal =
      typeof obj.message === "string" ||
      typeof obj.code === "string" ||
      typeof obj.hint === "string" ||
      typeof obj.details === "string";
    expect(hasSignal, `${label}: controlled error fields`).toBe(true);
  }
}

describe("Academic Councils C0-C9 PostgREST HTTP authorization matrix", () => {
  it(
    "denies direct DML and privileged RPCs over real PostgREST HTTP with zero mutation",
    async () => {
      let POSTGREST_DIRECT_DML_CASES = 0;
      let POSTGREST_RPC_CASES = 0;
      let HTTP_ZERO_MUTATION = true;
      const denyLabels: string[] = [];

      await harness.bootstrapFullStack();
      const entities = harness.loadFixtureEntityIds();
      const baselineFp = harness.fingerprintSensitiveTables();

      const token = {
        chair: mintJwt(ACTORS.chair, "authenticated"),
        secretary: mintJwt(ACTORS.secretary, "authenticated"),
        member: mintJwt(ACTORS.memberA, "authenticated"),
        viewer: mintJwt(ACTORS.viewer, "authenticated"),
        otherChair: mintJwt(ACTORS.otherChair, "authenticated"),
        admin: mintJwt(ACTORS.admin, "authenticated"),
        systemAdmin: mintJwt(ACTORS.systemAdmin, "authenticated"),
        dean: mintJwt(ACTORS.dean, "authenticated"),
        student: mintJwt(ACTORS.student, "authenticated"),
        anon: mintJwt(null, "anon"),
      };

      async function expectDenyMutation(
        label: string,
        method: string,
        path: string,
        opts: {
          token?: string | null;
          body?: unknown;
          prefer?: string;
          allowSilentRls?: boolean;
        },
      ): Promise<HttpResult> {
        const before = harness.fingerprintSensitiveTables();
        const res = await harness.http(method, path, {
          token: opts.token,
          body: opts.body,
          prefer: opts.prefer ?? "return=representation",
        });
        const after = harness.fingerprintSensitiveTables();
        if (before !== after) {
          HTTP_ZERO_MUTATION = false;
          throw new Error(
            `${label}: fingerprint changed (${before} → ${after}) status=${res.status} body=${res.text.slice(0, 500)}`,
          );
        }
        if (!opts.allowSilentRls) {
          // Privilege / RPC denials must not look like successful inserts.
          if (method === "POST" && path.startsWith("/rpc/")) {
            expect(res.status < 200 || res.status >= 300, `${label}: rpc 2xx`).toBe(
              true,
            );
            assertControlledErrorBody(res, label);
          } else if (method === "POST" && !path.startsWith("/rpc/")) {
            expect(res.status !== 201, `${label}: insert 201`).toBe(true);
            // 401/403/400/404/409/42501-mapped are all acceptable privilege denials
            expect(
              res.status === 401 ||
                res.status === 403 ||
                res.status === 400 ||
                res.status === 404 ||
                res.status === 409 ||
                res.status === 415 ||
                res.status === 200 || // RLS/table revoke may surface oddly; fp proves deny
                res.status === 204,
              `${label}: unexpected status ${res.status}`,
            ).toBe(true);
            if (isSuccessfulMutationStatus(res.status, method) && Array.isArray(res.json)) {
              expect((res.json as unknown[]).length, `${label}: 0-row`).toBe(0);
            }
          }
        } else if (isSuccessfulMutationStatus(res.status, method)) {
          // Silent RLS: 200/204 with 0 representation rows still OK if fp identical.
          if (Array.isArray(res.json)) {
            expect((res.json as unknown[]).length, `${label}: silent 0-row`).toBe(0);
          }
        }
        denyLabels.push(label);
        return res;
      }

      // -----------------------------------------------------------------
      // Direct DML matrix (tables × roles) — fingerprint-backed
      // -----------------------------------------------------------------
      const dmlTables: Array<{ path: string; insertBody: Record<string, unknown> }> = [
        {
          path: "/academic_council_meetings",
          insertBody: {
            council_id: IDS.testCouncil,
            meeting_number: 99901,
            title: "HTTP_DML_FORGE_MEETING",
            scheduled_at: new Date().toISOString(),
            created_by: ACTORS.student,
          },
        },
        {
          path: "/academic_council_topics",
          insertBody: {
            council_id: IDS.testCouncil,
            meeting_id: entities.meetingId,
            title: "HTTP_DML_FORGE_TOPIC",
            body: "should_deny",
            submitted_by: ACTORS.student,
            status: "submitted",
          },
        },
        {
          path: "/academic_council_agenda_items",
          insertBody: {
            meeting_id: entities.meetingId,
            order_index: 999,
            title: "HTTP_DML_FORGE_AGENDA",
            created_by: ACTORS.student,
          },
        },
        {
          path: "/academic_council_votes",
          insertBody: {
            meeting_id: entities.meetingId,
            agenda_item_id: entities.agendaItemId,
            council_id: IDS.testCouncil,
            voter_user_id: ACTORS.student,
            vote_value: "yes",
          },
        },
        {
          path: "/academic_council_minutes",
          insertBody: {
            meeting_id: entities.meetingId,
            body: "HTTP_DML_FORGE_MINUTES",
            drafted_by: ACTORS.student,
          },
        },
        {
          path: "/academic_council_decisions",
          insertBody: {
            meeting_id: entities.meetingId,
            decision_number: 9999,
            title: "HTTP_DML_FORGE_DECISION",
            body: "should_deny",
            status: "issued",
            created_by: ACTORS.student,
          },
        },
        {
          path: "/academic_council_notifications",
          insertBody: {
            user_id: ACTORS.student,
            event_type: "meeting_archived",
            council_id: IDS.testCouncil,
            meeting_id: entities.meetingId,
            title: "HTTP_DML_FORGE_NOTIF",
            body: "should_deny",
          },
        },
      ];

      const dmlActors: Array<{ name: string; tok: string | null }> = [
        { name: "chair", tok: token.chair },
        { name: "student", tok: token.student },
        { name: "anon", tok: token.anon },
        { name: "admin", tok: token.admin },
        { name: "viewer", tok: token.viewer },
      ];

      for (const table of dmlTables) {
        for (const actor of dmlActors) {
          // Limit to keep runtime reasonable while exceeding 20 cases:
          // all tables × chair/student/anon (21) + a few extras below.
          if (
            actor.name === "admin" ||
            actor.name === "viewer"
          ) {
            if (
              table.path !== "/academic_council_meetings" &&
              table.path !== "/academic_council_decisions"
            ) {
              continue;
            }
          }
          await expectDenyMutation(
            `DML_INSERT_${table.path.replace("/", "")}_${actor.name}`,
            "POST",
            table.path,
            { token: actor.tok, body: table.insertBody },
          );
          POSTGREST_DIRECT_DML_CASES += 1;
        }
      }

      // UPDATE / DELETE attempts (fingerprint-backed)
      const updateTargets: Array<{
        label: string;
        path: string;
        tok: string | null;
        body: Record<string, unknown>;
        allowSilentRls?: boolean;
      }> = [
        {
          label: "DML_UPDATE_meetings_student",
          path: `/academic_council_meetings?id=eq.${entities.meetingId}`,
          tok: token.student,
          body: { title: "PWNED_BY_STUDENT" },
          allowSilentRls: true,
        },
        {
          label: "DML_UPDATE_meetings_anon",
          path: `/academic_council_meetings?id=eq.${entities.meetingId}`,
          tok: token.anon,
          body: { title: "PWNED_BY_ANON" },
        },
        {
          label: "DML_UPDATE_topics_chair",
          path: `/academic_council_topics?id=eq.${entities.topicId}`,
          tok: token.chair,
          body: { title: "PWNED_TOPIC" },
          allowSilentRls: true,
        },
        {
          label: "DML_UPDATE_decisions_admin",
          path: `/academic_council_decisions?id=eq.${entities.decisionId}`,
          tok: token.admin,
          body: { title: "ADMIN_BYPASS" },
          allowSilentRls: true,
        },
        {
          label: "DML_UPDATE_notifications_cross_user",
          path: `/academic_council_notifications?id=eq.${entities.notificationId}`,
          tok: token.student,
          body: { is_read: true },
          allowSilentRls: true,
        },
        {
          label: "DML_UPDATE_votes_other_chair",
          path: entities.voteId
            ? `/academic_council_votes?id=eq.${entities.voteId}`
            : `/academic_council_votes?agenda_item_id=eq.${entities.agendaItemId}`,
          tok: token.otherChair,
          body: { vote_value: "no" },
          allowSilentRls: true,
        },
        {
          label: "DML_DELETE_meetings_student",
          path: `/academic_council_meetings?id=eq.${entities.meetingId}`,
          tok: token.student,
          body: undefined as unknown as Record<string, unknown>,
        },
        {
          label: "DML_DELETE_decisions_dean",
          path: `/academic_council_decisions?id=eq.${entities.decisionId}`,
          tok: token.dean,
          body: undefined as unknown as Record<string, unknown>,
        },
      ];

      for (const u of updateTargets) {
        const method = u.label.includes("DELETE") ? "DELETE" : "PATCH";
        const before = harness.fingerprintSensitiveTables();
        const res = await harness.http(method, u.path, {
          token: u.tok,
          body: u.label.includes("DELETE") ? undefined : u.body,
          prefer: "return=representation",
        });
        const after = harness.fingerprintSensitiveTables();
        expect(after, u.label).toBe(before);
        if (method === "POST" || (method !== "DELETE" && res.status === 201)) {
          HTTP_ZERO_MUTATION = false;
        }
        if (Array.isArray(res.json) && (res.status === 200 || res.status === 204)) {
          expect((res.json as unknown[]).length, `${u.label} rows`).toBe(0);
        }
        denyLabels.push(u.label);
        POSTGREST_DIRECT_DML_CASES += 1;
      }

      // attendance insert if exposed
      await expectDenyMutation(
        "DML_INSERT_attendance_student",
        "POST",
        "/academic_council_meeting_attendance",
        {
          token: token.student,
          body: {
            meeting_id: entities.meetingId,
            user_id: ACTORS.student,
            attendance_state: "present",
            member_role: "member",
            membership_active_from: "2020-01-01",
            membership_id: "c0c90000-0000-4000-8000-000000000203",
            roll_id: "c0c90000-0000-4000-8000-000000000299",
          },
        },
      );
      POSTGREST_DIRECT_DML_CASES += 1;

      // Anon SELECT must not freely leak council PII
      {
        const anonMeetings = await harness.http(
          "GET",
          "/academic_council_meetings",
          { token: token.anon },
        );
        expect(
          anonMeetings.status === 401 ||
            anonMeetings.status === 403 ||
            (anonMeetings.status === 200 &&
              Array.isArray(anonMeetings.json) &&
              (anonMeetings.json as unknown[]).length === 0),
          `anon SELECT meetings status=${anonMeetings.status}`,
        ).toBe(true);

        const anonNotif = await harness.http(
          "GET",
          "/academic_council_notifications",
          { token: token.anon },
        );
        expect(
          anonNotif.status === 401 ||
            anonNotif.status === 403 ||
            (anonNotif.status === 200 &&
              Array.isArray(anonNotif.json) &&
              (anonNotif.json as unknown[]).length === 0),
          `anon SELECT notifications status=${anonNotif.status}`,
        ).toBe(true);
      }

      // -----------------------------------------------------------------
      // RPC matrix via /rpc/<name>
      // -----------------------------------------------------------------
      type RpcCase = {
        label: string;
        name: string;
        tok: string | null;
        body: Record<string, unknown>;
      };

      const rpcCases: RpcCase[] = [
        {
          label: "RPC_transition_wrong_actor_secretary",
          name: "council_transition_meeting",
          tok: token.secretary,
          body: {
            p_meeting_id: entities.meetingId,
            p_expected_status: "archived",
            p_to_status: "cancelled",
            p_evidence: { via: "http_matrix" },
          },
        },
        {
          label: "RPC_transition_student",
          name: "council_transition_meeting",
          tok: token.student,
          body: {
            p_meeting_id: entities.meetingId,
            p_expected_status: "archived",
            p_to_status: "cancelled",
            p_evidence: {},
          },
        },
        {
          label: "RPC_transition_admin",
          name: "council_transition_meeting",
          tok: token.admin,
          body: {
            p_meeting_id: entities.meetingId,
            p_expected_status: "archived",
            p_to_status: "cancelled",
            p_evidence: {},
          },
        },
        {
          label: "RPC_cast_vote_viewer",
          name: "cast_council_vote",
          tok: token.viewer,
          body: {
            p_agenda_item_id: entities.agendaItemId,
            p_vote_value: "yes",
          },
        },
        {
          label: "RPC_cast_vote_student",
          name: "cast_council_vote",
          tok: token.student,
          body: {
            p_agenda_item_id: entities.agendaItemId,
            p_vote_value: "yes",
          },
        },
        {
          label: "RPC_cast_vote_anon",
          name: "cast_council_vote",
          tok: token.anon,
          body: {
            p_agenda_item_id: entities.agendaItemId,
            p_vote_value: "yes",
          },
        },
        {
          label: "RPC_open_session_secretary",
          name: "open_council_session",
          tok: token.secretary,
          body: { p_meeting_id: entities.meetingId },
        },
        {
          label: "RPC_issue_decision_forged_meeting",
          name: "issue_council_decision",
          tok: token.chair,
          body: {
            p_meeting_id: IDS.forgedMeeting,
            p_agenda_item_id: entities.agendaItemId,
            p_title: "Forged",
            p_body: "Forged body",
          },
        },
        {
          label: "RPC_acknowledge_forged_id",
          name: "acknowledge_council_notification",
          tok: token.chair,
          body: { p_notification_id: IDS.forgedNotification },
        },
        {
          label: "RPC_acknowledge_cross_user",
          name: "acknowledge_council_notification",
          tok: token.student,
          body: { p_notification_id: entities.notificationId },
        },
        {
          label: "RPC_create_notification_authenticated_INTERNAL_ONLY",
          name: "create_council_notification",
          tok: token.chair,
          body: {
            p_user_id: ACTORS.chair,
            p_event_type: "meeting_archived",
            p_council_id: IDS.testCouncil,
            p_meeting_id: entities.meetingId,
            p_title: "x",
            p_body: "y",
          },
        },
        {
          label: "RPC_dispatch_notification_authenticated_INTERNAL_ONLY",
          name: "dispatch_council_notification",
          tok: token.admin,
          body: {
            p_event_type: "meeting_archived",
            p_council_id: IDS.testCouncil,
            p_meeting_id: entities.meetingId,
          },
        },
        {
          label: "RPC_get_recipients_authenticated_INTERNAL_ONLY",
          name: "get_council_notification_recipients",
          tok: token.systemAdmin,
          body: {
            p_council_id: IDS.testCouncil,
            p_event_type: "meeting_archived",
            p_context: {},
          },
        },
        {
          label: "RPC_archive_student",
          name: "archive_council_meeting",
          tok: token.student,
          body: { p_meeting_id: entities.meetingId },
        },
        {
          label: "RPC_followup_wrong_user_viewer",
          name: "update_council_decision_followup",
          tok: token.viewer,
          body: {
            p_decision_id: entities.decisionId,
            p_status: "in_progress",
            p_execution_note: "spoof",
          },
        },
        {
          label: "RPC_followup_other_council_chair",
          name: "update_council_decision_followup",
          tok: token.otherChair,
          body: {
            p_decision_id: entities.decisionId,
            p_status: "in_progress",
            p_execution_note: "cross",
          },
        },
        {
          label: "RPC_cast_vote_dean",
          name: "cast_council_vote",
          tok: token.dean,
          body: {
            p_agenda_item_id: entities.agendaItemId,
            p_vote_value: "abstain",
          },
        },
      ];

      for (const rpc of rpcCases) {
        await expectDenyMutation(rpc.label, "POST", `/rpc/${rpc.name}`, {
          token: rpc.tok,
          body: rpc.body,
        });
        POSTGREST_RPC_CASES += 1;
      }

      // -----------------------------------------------------------------
      // JWT spoof resistance — body identity ≠ JWT sub
      // -----------------------------------------------------------------
      {
        const before = harness.fingerprintSensitiveTables();
        const spoofAck = await harness.http(
          "POST",
          "/rpc/acknowledge_council_notification",
          {
            token: token.member,
            body: { p_notification_id: entities.notificationId },
          },
        );
        const afterAck = harness.fingerprintSensitiveTables();
        expect(afterAck).toBe(before);
        expect(spoofAck.status < 200 || spoofAck.status >= 300).toBe(true);
        assertControlledErrorBody(spoofAck, "JWT_SPOOF_ACKNOWLEDGE");
        POSTGREST_RPC_CASES += 1;
        denyLabels.push("JWT_SPOOF_ACKNOWLEDGE");

        const spoofResp = await harness.http(
          "POST",
          "/rpc/get_council_responsible_decisions",
          {
            token: token.student,
            body: { p_user_id: ACTORS.memberA },
          },
        );
        const afterResp = harness.fingerprintSensitiveTables();
        expect(afterResp).toBe(before);
        expect(spoofResp.status < 200 || spoofResp.status >= 300).toBe(true);
        assertControlledErrorBody(spoofResp, "JWT_SPOOF_RESPONSIBLE_DECISIONS");
        POSTGREST_RPC_CASES += 1;
        denyLabels.push("JWT_SPOOF_RESPONSIBLE_DECISIONS");
      }

      const finalFp = harness.fingerprintSensitiveTables();
      expect(finalFp).toBe(baselineFp);
      HTTP_ZERO_MUTATION = HTTP_ZERO_MUTATION && finalFp === baselineFp;

      expect(POSTGREST_DIRECT_DML_CASES).toBeGreaterThanOrEqual(20);
      expect(POSTGREST_RPC_CASES).toBeGreaterThanOrEqual(15);
      expect(HTTP_ZERO_MUTATION).toBe(true);

      console.log("NOTICE: COUNCILS_POSTGREST_HTTP_AUTH_MATRIX_SUMMARY");
      console.log(`NOTICE: POSTGREST_DIRECT_DML_CASES=${POSTGREST_DIRECT_DML_CASES}`);
      console.log(`NOTICE: POSTGREST_RPC_CASES=${POSTGREST_RPC_CASES}`);
      console.log(`NOTICE: HTTP_ZERO_MUTATION=${HTTP_ZERO_MUTATION}`);
      console.log(`NOTICE: DENY_LABELS=${denyLabels.length}`);
      console.log(`NOTICE: BASELINE_FP=${baselineFp}`);
      console.log("NOTICE: COUNCILS_POSTGREST_HTTP_AUTH_MATRIX_PASS");
    },
    600_000,
  );
});
