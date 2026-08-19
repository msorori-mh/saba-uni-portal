import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ACT_ON_B1_ATOMIC_ARG_KEYS,
  B1_FORM_DATA_ALLOWLISTS,
  B1_SPECIALIZED_ACTIONS_FORBIDDEN_ON_ACT_ON,
  CREATE_ATTACHMENT_INTENT_ARG_KEYS,
  RECORD_EXTERNAL_PAYMENT_ARG_KEYS,
  RECORD_EXTERNAL_PAYMENT_FORBIDDEN_CLIENT_KEYS,
  SUBMIT_B1_ATOMIC_ARG_KEYS,
  buildRecordExternalPaymentRpcArgs,
  rpcActOnB1StudentRequestStepAtomic,
  rpcAuthorizeStudentRequestAttachmentDownload,
  rpcCompleteStudentRequestAttachmentUpload,
  rpcCreateStudentRequestAttachmentUploadIntent,
  rpcListMyStudentRequestAttachments,
  rpcRecordExternalUniversityPaymentConfirmation,
  rpcRejectStudentRequestAttachment,
  rpcSubmitB1StudentRequestAtomic,
  type B1RpcClient,
} from "@/lib/student-requests/b1-ui/b1-rpc";
import {
  LIVE_B1_UI_UNSUPPORTED_METHODS,
  createLiveB1UiAdapter,
} from "@/lib/student-requests/b1-ui/adapter.live";
import { B1AdapterError } from "@/lib/student-requests/b1-ui/adapter.types";
import {
  mapBackendRowsToB1Availability,
  resolveB1RuntimeAvailable,
} from "@/lib/student-requests/b1-ui/availability";
import { createAuthorizedB1AttachmentDownload } from "@/lib/student-requests/b1-ui/b1-ui.functions";
import { SECURE_ATTACHMENT_SIGNED_URL_SECONDS } from "@/lib/student-requests/secure-attachments-contract";
import { B1_CANONICAL_CODES } from "@/lib/student-requests/request-service-adapter";

describe("B1 UI ↔ Backend integration bridge — RPC signatures", () => {
  it("submit_b1_student_request_atomic uses exact freeze arg keys", async () => {
    const local: { name?: string; args?: Record<string, unknown> } = {};
    const c: B1RpcClient = {
      async rpc(fn, args) {
        local.name = fn;
        local.args = args;
        return { data: { success: true, request_id: "r1", workflow: {} }, error: null };
      },
    };
    await rpcSubmitB1StudentRequestAtomic(c, {
      requestId: "11111111-1111-4111-8111-111111111111",
      canonicalCode: "enrollment_suspension",
      formData: { target_academic_year: "y1" },
      expectedUpdatedAt: "2026-07-25T00:00:00.000Z",
      attachmentIds: [],
    });
    expect(local.name).toBe("submit_b1_student_request_atomic");
    expect(Object.keys(local.args ?? {}).sort()).toEqual([...SUBMIT_B1_ATOMIC_ARG_KEYS].sort());
    expect(local.args).toEqual({
      p_request_id: "11111111-1111-4111-8111-111111111111",
      p_canonical_code: "enrollment_suspension",
      p_form_data: { target_academic_year: "y1" },
      p_expected_updated_at: "2026-07-25T00:00:00.000Z",
      p_attachment_ids: [],
    });
  });

  it("act_on_b1_student_request_step_atomic sends empty payload only", async () => {
    const local: { name?: string; args?: Record<string, unknown> } = {};
    const c: B1RpcClient = {
      async rpc(fn, args) {
        local.name = fn;
        local.args = args;
        return {
          data: {
            success: true,
            step_id: "s1",
            action_result: "approved",
            next_step_id: null,
            transition_applied: true,
          },
          error: null,
        };
      },
    };
    await rpcActOnB1StudentRequestStepAtomic(c, {
      stepId: "22222222-2222-4222-8222-222222222222",
      action: "approve",
      comment: "ok",
    });
    expect(local.name).toBe("act_on_b1_student_request_step_atomic");
    expect(Object.keys(local.args ?? {}).sort()).toEqual([...ACT_ON_B1_ATOMIC_ARG_KEYS].sort());
    expect(local.args?.p_payload).toEqual({});
    expect(local.args).toEqual({
      p_step_id: "22222222-2222-4222-8222-222222222222",
      p_action: "approve",
      p_comment: "ok",
      p_payload: {},
    });
  });

  it("rejects specialized actions on act_on wrapper before RPC", async () => {
    const c: B1RpcClient = {
      async rpc() {
        throw new Error("RPC must not be called");
      },
    };
    for (const action of B1_SPECIALIZED_ACTIONS_FORBIDDEN_ON_ACT_ON) {
      await expect(
        rpcActOnB1StudentRequestStepAtomic(c, {
          stepId: "22222222-2222-4222-8222-222222222222",
          action: action as never,
        }),
      ).rejects.toThrow("B1_SPECIALIZED_ACTION_RPC_REQUIRED");
    }
  });

  it("confirm_payment payload allowlist is stepId + optional note only", () => {
    const args = buildRecordExternalPaymentRpcArgs({
      stepId: "33333333-3333-4333-8333-333333333333",
      note: "received externally",
    });
    expect(Object.keys(args).sort()).toEqual([...RECORD_EXTERNAL_PAYMENT_ARG_KEYS].sort());
    expect(args).toEqual({
      p_step_id: "33333333-3333-4333-8333-333333333333",
      p_note: "received externally",
    });
    for (const forbidden of RECORD_EXTERNAL_PAYMENT_FORBIDDEN_CLIENT_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(args, forbidden)).toBe(false);
    }
  });

  it("record_external_university_payment_confirmation RPC uses binary signature", async () => {
    const local: { name?: string; args?: Record<string, unknown> } = {};
    const c: B1RpcClient = {
      async rpc(fn, args) {
        local.name = fn;
        local.args = args;
        return {
          data: {
            success: true,
            status: "payment_confirmed",
            request_id: "r1",
            step_id: "s1",
            next_step_id: "n1",
            transition_applied: true,
          },
          error: null,
        };
      },
    };
    await rpcRecordExternalUniversityPaymentConfirmation(c, {
      stepId: "33333333-3333-4333-8333-333333333333",
      note: null,
    });
    expect(local.name).toBe("record_external_university_payment_confirmation");
    expect(local.args).toEqual({
      p_step_id: "33333333-3333-4333-8333-333333333333",
      p_note: null,
    });
    expect(JSON.stringify(local.args)).not.toMatch(
      /amount|currency|invoice|confirmed_by|confirmed_at|"status"/i,
    );
  });

  it("attachment intent/complete/list/reject/download use freeze arg keys", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const c: B1RpcClient = {
      async rpc(fn, args) {
        calls.push({ name: fn, args: args ?? {} });
        if (fn === "create_student_request_attachment_upload_intent") {
          return { data: { attachment_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, error: null };
        }
        if (fn === "authorize_student_request_attachment_download") {
          return {
            data: {
              storage_bucket: "student-request-secure-attachments",
              storage_object_path: "student-requests/x/y/z/content.pdf",
            },
            error: null,
          };
        }
        if (fn === "list_my_student_request_attachments") {
          return { data: [], error: null };
        }
        if (fn === "reject_student_request_attachment") {
          return { data: true, error: null };
        }
        return { data: { status: "attached" }, error: null };
      },
    };

    await rpcCreateStudentRequestAttachmentUploadIntent(c, {
      studentRequestId: "11111111-1111-4111-8111-111111111111",
      fieldKey: "excuse_documents",
      originalFileName: "excuse.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    await rpcCompleteStudentRequestAttachmentUpload(c, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await rpcListMyStudentRequestAttachments(c, "11111111-1111-4111-8111-111111111111");
    await rpcRejectStudentRequestAttachment(
      c,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "REMOVED_BY_STUDENT",
    );
    await rpcAuthorizeStudentRequestAttachmentDownload(c, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    const intent = calls.find((x) => x.name === "create_student_request_attachment_upload_intent");
    expect(Object.keys(intent?.args ?? {}).sort()).toEqual(
      [...CREATE_ATTACHMENT_INTENT_ARG_KEYS].sort(),
    );
    expect(calls.map((x) => x.name)).toEqual([
      "create_student_request_attachment_upload_intent",
      "complete_student_request_attachment_upload",
      "list_my_student_request_attachments",
      "reject_student_request_attachment",
      "authorize_student_request_attachment_download",
    ]);
  });
});

describe("B1 UI secure attachment download boundary", () => {
  const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("authorizes before signing and returns only a short-lived public DTO", async () => {
    const order: string[] = [];
    const client = {
      async rpc(fn: string, args?: Record<string, unknown>) {
        order.push(`rpc:${fn}`);
        expect(args).toEqual({ p_attachment_id: attachmentId });
        return {
          data: {
            storage_bucket: "student-request-secure-attachments",
            storage_object_path: "student-requests/owner/request/attachment/content.pdf",
          },
          error: null,
        };
      },
      from() {
        throw new Error("not used");
      },
      storage: {
        from(bucketName: string) {
          order.push(`storage:${bucketName}`);
          return {
            async createSignedUrl(objectName: string, expiresIn: number) {
              order.push(`sign:${objectName}:${expiresIn}`);
              return {
                data: { signedUrl: "https://signed.example.test/download-token" },
                error: null,
              };
            },
          };
        },
      },
    };

    const result = await createAuthorizedB1AttachmentDownload(client, attachmentId);
    expect(order[0]).toBe("rpc:authorize_student_request_attachment_download");
    expect(order[1]).toBe("storage:student-request-secure-attachments");
    expect(order[2]).toBe(
      `sign:student-requests/owner/request/attachment/content.pdf:${SECURE_ATTACHMENT_SIGNED_URL_SECONDS}`,
    );
    expect(SECURE_ATTACHMENT_SIGNED_URL_SECONDS).toBeLessThanOrEqual(300);
    expect(result).toEqual({
      url: "https://signed.example.test/download-token",
      expiresInSeconds: SECURE_ATTACHMENT_SIGNED_URL_SECONDS,
    });
    expect(Object.keys(result).sort()).toEqual(["expiresInSeconds", "url"]);
  });

  it("never signs or leaks backend details when authorization is denied", async () => {
    let signCalled = false;
    const client = {
      async rpc() {
        return {
          data: null,
          error: { message: "private SQL and storage details", code: "42501" },
        };
      },
      from() {
        throw new Error("not used");
      },
      storage: {
        from() {
          signCalled = true;
          return {
            async createSignedUrl() {
              signCalled = true;
              return { data: null, error: null };
            },
          };
        },
      },
    };

    await expect(createAuthorizedB1AttachmentDownload(client, attachmentId)).rejects.toThrow(
      "ATTACHMENT_ACCESS_DENIED",
    );
    expect(signCalled).toBe(false);
  });

  it("keeps storage internals out of public DTOs and client wrappers", () => {
    const publicSources = [
      readFileSync(
        join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "adapter.types.ts"),
        "utf8",
      ),
      readFileSync(
        join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "adapter.live.ts"),
        "utf8",
      ),
    ].join("\n");
    for (const forbidden of ["storage_bucket", "storage_object_path", "objectPath", "object_key"]) {
      expect(publicSources).not.toContain(forbidden);
    }
    expect(publicSources).not.toContain("getPublicUrl");
  });

  it("keeps signing server-side with fixed expiry and no public URL API", () => {
    const serverSource = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "b1-ui.functions.ts"),
      "utf8",
    );
    const downloadBlock = serverSource.slice(
      serverSource.indexOf("export async function createAuthorizedB1AttachmentDownload"),
      serverSource.indexOf("export const authorizeB1UiAttachmentDownloadFn"),
    );
    expect(downloadBlock.indexOf("rpcAuthorizeStudentRequestAttachmentDownload")).toBeLessThan(
      downloadBlock.indexOf(".createSignedUrl("),
    );
    expect(downloadBlock).toContain("SECURE_ATTACHMENT_SIGNED_URL_SECONDS");
    expect(downloadBlock).not.toContain("getPublicUrl");
    expect(downloadBlock).not.toMatch(/console\.|localStorage|expiresIn.*data\./);
  });

  it("keeps React components free of Supabase Storage imports", () => {
    const root = join(process.cwd(), "src", "components", "student-requests", "b1");
    for (const path of walkFiles(root).filter((entry) => /\.(tsx|ts)$/.test(entry))) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(
        /supabase.*storage|storage.*supabase|createSignedUrl|getPublicUrl/i,
      );
    }
  });
});

describe("B1 UI ↔ Backend integration bridge — allowlists & availability", () => {
  it("pins per-service form_data allowlists from the freeze", () => {
    expect(B1_FORM_DATA_ALLOWLISTS.enrollment_suspension).toContain("terms_acknowledgment");
    expect(B1_FORM_DATA_ALLOWLISTS.excused_absence).toContain("excuse_documents");
    expect(B1_FORM_DATA_ALLOWLISTS.department_transfer).toContain("secondary_certificate_file");
    expect(B1_FORM_DATA_ALLOWLISTS.final_chance).toEqual([
      "target_academic_year",
      "target_semester",
      "reason",
      "chance_type",
    ]);
    expect(B1_FORM_DATA_ALLOWLISTS.file_withdrawal).toContain("impact_acknowledgment");
  });

  it("never hardcodes runtimeAvailable true and derives studentVisible from backend rows only", () => {
    for (const code of B1_CANONICAL_CODES) {
      expect(resolveB1RuntimeAvailable(code, null)).toBe(false);
      expect(
        resolveB1RuntimeAvailable(code, {
          available: false,
          services: [],
          reads: [],
          writesAvailable: [],
          writesFailClosed: [],
          draftMutationsContract: null,
        }),
      ).toBe(false);
    }
    const hidden = mapBackendRowsToB1Availability([]);
    expect(hidden.every((row) => row.studentVisible === false)).toBe(true);
    expect(hidden.every((row) => row.runtimeAvailable === false)).toBe(true);

    expect(
      resolveB1RuntimeAvailable("enrollment_suspension", {
        available: true,
        services: ["enrollment_suspension"],
        reads: ["draft"],
        writesAvailable: [],
        writesFailClosed: ["create_draft", "save_draft"],
        draftMutationsContract: null,
      }),
    ).toBe(false);
    expect(
      resolveB1RuntimeAvailable("enrollment_suspension", {
        available: true,
        services: ["enrollment_suspension"],
        reads: ["draft"],
        writesAvailable: ["create_draft", "save_draft"],
        writesFailClosed: [],
        draftMutationsContract: "B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01",
      }),
    ).toBe(true);

    const visible = mapBackendRowsToB1Availability([
      { code: "enrollment_suspension", name_ar: "وقف قيد" },
      { code: "absence_excuse", name_ar: "عذر غياب" },
    ]);
    const byCode = Object.fromEntries(visible.map((row) => [row.code, row]));
    expect(byCode.enrollment_suspension?.studentVisible).toBe(true);
    expect(byCode.excused_absence?.studentVisible).toBe(true);
    expect(byCode.department_transfer?.studentVisible).toBe(false);
    expect(visible.every((row) => row.runtimeAvailable === false)).toBe(true);


    const levelOneRestricted = mapBackendRowsToB1Availability([
      {
        code: "enrollment_suspension",
        name_ar: "وقف القيد",
        is_eligible: false,
        is_disabled: true,
        disabled_reason: "وقف القيد غير متاح لطلاب المستوى الأول.",
      },
      {
        code: "department_transfer",
        name_ar: "تحويل من قسم إلى قسم",
        is_eligible: false,
        is_disabled: true,
        disabled_reason: "التحويل بين الأقسام غير متاح لطلاب المستوى الأول.",
      },
      {
        code: "final_chance",
        name_ar: "فرصة أخيرة",
        is_eligible: true,
        is_disabled: false,
        disabled_reason: null,
      },
    ]);
    const restrictedByCode = Object.fromEntries(
      levelOneRestricted.map((row) => [row.code, row]),
    );
    expect(restrictedByCode.enrollment_suspension?.studentVisible).toBe(false);
    expect(restrictedByCode.department_transfer?.studentVisible).toBe(false);
    expect(restrictedByCode.final_chance?.studentVisible).toBe(true);
  });
});

describe("B1 UI ↔ Backend integration bridge — live adapter behavior", () => {
  it("has no remaining unsupported live adapter methods after final contract wiring", async () => {
    expect(LIVE_B1_UI_UNSUPPORTED_METHODS).toEqual([]);
    const adapter = createLiveB1UiAdapter({
      async getCapability() {
        return {
          available: false,
          services: [],
          reads: [],
          writesAvailable: [],
          writesFailClosed: ["create_draft", "save_draft"],
          draftMutationsContract: null,
        };
      },
      async getFormOptions() {
        return {
          serviceCode: "enrollment_suspension",
          academicYears: [],
          semestersByYear: {},
          currentEnrollments: [],
          availableDepartments: [],
          programsByDepartment: {},
          excuseReasonTypes: [],
        };
      },
      async createDraft() {
        return {
          requestId: "11111111-1111-4111-8111-111111111111",
          serviceCode: "enrollment_suspension",
          formData: {},
          attachments: [],
          status: "draft",
          updatedAt: "2026-07-25T00:00:00.000Z",
        };
      },
      async getDraft() {
        return null;
      },
      async saveDraft(_id, formData, expectedUpdatedAt) {
        expect(expectedUpdatedAt).toBeTruthy();
        return {
          requestId: "11111111-1111-4111-8111-111111111111",
          serviceCode: "enrollment_suspension",
          formData,
          attachments: [],
          status: "draft",
          updatedAt: "2026-07-25T00:00:01.000Z",
        };
      },
      async listStudentRequests() {
        return [];
      },
      async getStudentDetails() {
        throw new Error("unused");
      },
      async getAssignedInbox() {
        return [];
      },
      async getAssignedDetails() {
        throw new Error("unused");
      },
      async getAvailableRows() {
        return [];
      },
      async submitB1Request() {
        throw new Error("unused");
      },
      async actOnB1RequestStep() {
        throw new Error("unused");
      },
      async confirmB1RevenueReceipt() {
        throw new Error("unused");
      },
      async uploadB1RequestAttachment() {
        throw new Error("unused");
      },
      async removeB1RequestAttachment() {
        throw new Error("unused");
      },
      async downloadAttachment() {
        return { url: "https://example.test/x", expiresInSeconds: 60 };
      },
    });
    const draft = await adapter.createB1RequestDraft("enrollment_suspension");
    const saved = await adapter.saveB1RequestDraft(
      draft.requestId,
      { suspension_reason: "x" },
      draft.updatedAt,
    );
    expect(saved.updatedAt).toBe("2026-07-25T00:00:01.000Z");
    const options = await adapter.getB1RequestFormOptions("enrollment_suspension");
    expect(options.serviceCode).toBe("enrollment_suspension");
  });

  it("routes confirm_payment away from actOn to specialized revenue RPC", async () => {
    let actCalled = false;
    let confirmArgs: { stepId: string; note?: string } | null = null;
    const adapter = createLiveB1UiAdapter({
      async actOnB1RequestStep() {
        actCalled = true;
        return {
          accepted: true,
          stepId: "s",
          requestId: "r",
          action: "review",
        };
      },
      async confirmB1RevenueReceipt(stepId, optionalNote) {
        confirmArgs = { stepId, note: optionalNote };
        return {
          accepted: true,
          stepId,
          requestId: "r1",
          action: "confirm_payment",
        };
      },
    });

    await expect(
      adapter.actOnB1RequestStep("33333333-3333-4333-8333-333333333333", "confirm_payment", "nope"),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: expect.stringContaining("confirmB1RevenueReceipt"),
    });
    expect(actCalled).toBe(false);

    await adapter.confirmB1RevenueReceipt(
      "33333333-3333-4333-8333-333333333333",
      "received externally",
    );
    expect(confirmArgs).toEqual({
      stepId: "33333333-3333-4333-8333-333333333333",
      note: "received externally",
    });
  });

  it("uses only injected backend visibility rows and keeps missing draft capability hidden", async () => {
    let visibilityReads = 0;
    const adapter = createLiveB1UiAdapter({
      async getCapability() {
        return {
          available: true,
          services: ["enrollment_suspension"],
          reads: ["form_options", "draft"],
          writesAvailable: [],
          writesFailClosed: ["create_draft", "save_draft"],
          draftMutationsContract: null,
        };
      },
      async getAvailableRows() {
        visibilityReads += 1;
        return [{ code: "enrollment_suspension" }];
      },
    });

    const availability = await adapter.getAvailableB1RequestTypes();
    const suspension = availability.find((row) => row.code === "enrollment_suspension");
    expect(visibilityReads).toBe(1);
    expect(suspension).toMatchObject({
      studentVisible: true,
      runtimeAvailable: false,
    });
  });

  it("submit / act / confirm deps receive only allowlisted payloads", async () => {
    const seen: Record<string, unknown> = {};
    const adapter = createLiveB1UiAdapter({
      async submitB1Request(requestId, expectedUpdatedAt) {
        seen.submit = { requestId, expectedUpdatedAt };
        return {
          requestId,
          requestNumber: "B1-1",
          submittedAt: expectedUpdatedAt,
          updatedAt: expectedUpdatedAt,
        };
      },
      async actOnB1RequestStep(stepId, action, comment) {
        seen.act = { stepId, action, comment };
        return { accepted: true, stepId, requestId: "r", action };
      },
      async confirmB1RevenueReceipt(stepId, optionalNote) {
        seen.confirm = { stepId, optionalNote };
        return { accepted: true, stepId, requestId: "r", action: "confirm_payment" };
      },
    });

    await adapter.submitB1Request(
      "11111111-1111-4111-8111-111111111111",
      "2026-07-25T00:00:00.000Z",
    );
    await adapter.actOnB1RequestStep(
      "22222222-2222-4222-8222-222222222222",
      "review",
      "looks good",
    );
    await adapter.confirmB1RevenueReceipt("33333333-3333-4333-8333-333333333333");

    expect(seen.submit).toEqual({
      requestId: "11111111-1111-4111-8111-111111111111",
      expectedUpdatedAt: "2026-07-25T00:00:00.000Z",
    });
    expect(seen.act).toEqual({
      stepId: "22222222-2222-4222-8222-222222222222",
      action: "review",
      comment: "looks good",
    });
    expect(seen.confirm).toEqual({
      stepId: "33333333-3333-4333-8333-333333333333",
      optionalNote: undefined,
    });
    expect(JSON.stringify(seen.confirm)).not.toMatch(/amount|currency|invoice|confirmed_by/i);
  });

  it("returns acknowledgments without local timestamps or optimistic workflow state", () => {
    const functionsSource = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "b1-ui.functions.ts"),
      "utf8",
    );
    const mutationBlock = functionsSource.slice(
      functionsSource.indexOf("export const actOnB1UiRequestStepFn"),
      functionsSource.indexOf("const uploadIntentSchema"),
    );
    expect(mutationBlock).not.toMatch(/new Date\(|Date\.now\(|toISOString\(/);
    expect(mutationBlock).not.toMatch(
      /\b(status|currentStep|completedAt|confirmedAt|confirmed_by|confirmed_at|actorUserId)\s*:/,
    );
    expect(mutationBlock).toContain("accepted: true");
    expect(mutationBlock).toContain('action: "confirm_payment"');
  });

  it("requires an authoritative post-submit reread and never fabricates submit timestamps", () => {
    const functionsSource = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "b1-ui.functions.ts"),
      "utf8",
    );
    const submitBlock = functionsSource.slice(
      functionsSource.indexOf("export const submitB1UiRequestFn"),
      functionsSource.indexOf("const actSchema"),
    );
    expect(submitBlock).toContain("B1_SUBMIT_AUTHORITATIVE_REFRESH_REQUIRED");
    expect(submitBlock).not.toMatch(/new Date\(|Date\.now\(|toISOString\(/);
    expect(submitBlock).not.toMatch(
      /submittedAt:\s*data\.|updatedAt:\s*data\.|submittedAt:\s*expected|updatedAt:\s*expected/,
    );
  });
});

describe("B1 UI ↔ Backend integration bridge — component & enrollment guards", () => {
  it("B1 React components do not import Supabase", () => {
    const root = join(process.cwd(), "src", "components", "student-requests", "b1");
    for (const path of walkFiles(root).filter((p) => /\.(tsx|ts)$/.test(p))) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(source).not.toMatch(/from\s+["']@supabase\//);
      expect(source).not.toMatch(/createClient\(/);
      expect(source).not.toMatch(/\.from\(["']student_requests["']\)/);
    }
  });

  it("does not mutate enrollment_certificate paths in this bridge", () => {
    const live = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "adapter.live.ts"),
      "utf8",
    );
    const rpc = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "b1-rpc.ts"),
      "utf8",
    );
    const fns = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "b1-ui.functions.ts"),
      "utf8",
    );
    for (const source of [live, rpc, fns]) {
      expect(source).not.toMatch(/enrollment_certificate/);
      expect(source).not.toMatch(/student_visible\s*[:=]/);
    }
  });

  it("server functions call freeze RPC names with documented payloads", () => {
    const fns = readFileSync(
      join(process.cwd(), "src", "lib", "student-requests", "b1-ui", "b1-ui.functions.ts"),
      "utf8",
    );
    expect(fns).toContain("rpcSubmitB1StudentRequestAtomic");
    expect(fns).toContain("rpcActOnB1StudentRequestStepAtomic");
    expect(fns).toContain("rpcRecordExternalUniversityPaymentConfirmation");
    expect(fns).toContain("rpcCreateStudentRequestAttachmentUploadIntent");
    expect(fns).toContain("const confirmSchema = z");
    expect(fns).toContain("stepId: z.string().uuid()");
    expect(fns).toContain("note: z.string().trim().max(2000).optional().nullable()");
    const confirmBlock = fns.slice(
      fns.indexOf("const confirmSchema"),
      fns.indexOf("export const confirmB1UiRevenueReceiptFn"),
    );
    expect(confirmBlock).not.toMatch(/amount|currency|invoice|confirmed_by|confirmed_at|p_status/);
    expect(confirmBlock).toContain(".strict()");
  });
});

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}
