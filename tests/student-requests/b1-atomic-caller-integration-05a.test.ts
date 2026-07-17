import { describe,expect,it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const source=readFileSync(join(process.cwd(),"src","lib","student-affairs.functions.ts"),"utf8");

describe("B1 atomic caller integration 05A",()=>{
  it("routes B1 adapters only through the atomic RPC with optimistic version and opaque attachment ids",()=>{
    expect(source).toContain("if (b1Adapter) {");
    expect(source).toContain("submitB1RequestAtomically");
    expect(source).toContain('rpc("submit_b1_student_request_atomic"');
    for(const arg of ["p_request_id","p_canonical_code","p_form_data","p_expected_updated_at","p_attachment_ids"])
      expect(source).toContain(arg);
    expect(source).toContain("extractB1SecureAttachmentIds");
    expect(source).toContain('.select("updated_at")');
    expect(source).toContain('.eq("updated_at", existing.updated_at)');
    expect(source).toContain('if (!updated?.updated_at) throw new Error("B1_STALE_REQUEST_VERSION")');
    expect(source).toContain("expectedUpdatedAt: b1ExpectedUpdatedAt");
  });
  it("creates B1 drafts without the admin fallback",()=>{
    expect(source).toContain("createB1DraftFailClosed");
    expect(source).toContain("if (result.rpcUnavailable) throw new Error(STUDENT_REQUEST_SERVICE_UPDATING_MSG)");
    expect(source).toMatch(/requestId = b1Adapter[\s\S]*?createB1DraftFailClosed[\s\S]*?: await createDraftViaRpcOrFallback/);
  });
  it("does not fall back when the B1 atomic RPC is unavailable or rejects",()=>{
    const helper=source.slice(source.indexOf("async function submitB1RequestAtomically"),source.indexOf("async function loadCreatedRequestMeta"));
    expect(helper).not.toContain("rpcUnavailable");
    expect(helper).not.toContain("fallbackSubmitStudentRequest");
    expect(helper).toContain("if (error) throw new Error");
  });
  it("preserves the generic submit path for non-B1 services such as enrollment_certificate",()=>{
    expect(source).toMatch(/if \(b1Adapter\) \{[\s\S]*?\} else \{[\s\S]*?submitViaRpcOrFallback/);
    expect(source).not.toMatch(/getRequestServiceAdapter\("enrollment_certificate"\)/);
    expect(source).toMatch(/if \(b1Adapter\) \{[\s\S]*?supabaseAdmin[\s\S]*?\} else \{[\s\S]*?input\.sessionClient/);
  });
  it("closes the standalone B1 draft endpoint fallback",()=>{
    const endpoint=source.slice(source.indexOf("export const createStudentServiceRequest"),source.indexOf("export const saveStudentServiceRequestDraft"));
    expect(endpoint).toContain("getRequestServiceAdapter(requestType)");
    expect(endpoint).toContain("validateB1ServiceActivation");
    expect(endpoint).toContain("createB1DraftFailClosed");
    expect(endpoint).toContain("getStoredWriteCodeForRequestType(requestType)");
    expect(endpoint).toMatch(/adapter[\s\S]*?createB1DraftFailClosed[\s\S]*?: await createDraftViaRpcOrFallback/);
  });
  it("does not change visibility, payment policy, migrations or protected records",()=>{
    expect(source).not.toMatch(/student_visible\s*[:=]|fee_type|93807768-a281-42de-bfb4-0c0c03786b20|SR-20260713-2DE64041/);
  });
});
