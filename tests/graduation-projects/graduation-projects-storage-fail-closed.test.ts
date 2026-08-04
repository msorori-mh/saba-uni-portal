import { describe, expect, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MilestonesPanel } from "../../src/components/graduation-projects/MilestonesPanel";
import {
  GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG,
  enforceGraduationProjectFileRegistrationUnavailable,
} from "../../src/lib/graduation-projects/portal.functions";
import * as lifecycle from "../../src/lib/graduation-projects/lifecycle";
import {
  GraduationProjectsRpcClient,
  GraduationProjectsRpcError,
} from "../../src/lib/graduation-projects/rpc";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function extractRegisterHandlerSource(): string {
  const src = read("src/lib/graduation-projects/portal.functions.ts");
  const start = src.indexOf("export const registerGraduationProjectFile");
  const end = src.indexOf("export const listMyGraduationProjectNotifications");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

function extractEnforceSource(): string {
  const src = read("src/lib/graduation-projects/portal.functions.ts");
  const start = src.indexOf(
    "export async function enforceGraduationProjectFileRegistrationUnavailable",
  );
  const end = src.indexOf("function mapThrown");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

type RpcCall = { name: string; args: unknown };
type DbCall = { table: string; method: string };

function createFakeSupabase() {
  const rpcCalls: RpcCall[] = [];
  const dbCalls: DbCall[] = [];
  const storageCalls: string[] = [];

  const supabase = {
    rpc: async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args: args ?? {} });
      if (name === "list_my_graduation_projects") {
        return { data: [], error: null };
      }
      return {
        data: null,
        error: { message: `unexpected rpc in storage fail-closed test: ${name}` },
      };
    },
    from: (table: string) => {
      dbCalls.push({ table, method: "from" });
      throw new Error(`unexpected database access: ${table}`);
    },
    storage: {
      from: (bucket: string) => {
        storageCalls.push(bucket);
        throw new Error(`unexpected storage access: ${bucket}`);
      },
    },
  };

  return { supabase, rpcCalls, dbCalls, storageCalls };
}

describe("GP storage fail-closed — UI gate", () => {
  test("MilestonesPanel shows Storage-pending notice and no metadata-registration action", () => {
    const html = renderToStaticMarkup(
      createElement(MilestonesPanel, {
        actions: [
          "set_milestone",
          "submit_deliverable",
          "review_submission",
          "add_note",
          "resolve_note",
          "register_file",
        ],
        milestones: [
          {
            id: "m1",
            title: "مرحلة 1",
            milestone_kind: "progress",
            sequence_no: 1,
            weight: 50,
            status: "in_progress",
            due_at: null,
            completion_percent: 10,
          },
        ],
        submissions: [],
        notes: [],
        files: [],
        onSetMilestone: () => {},
        onSubmitDeliverable: () => {},
        onReviewSubmission: () => {},
        onAddNote: () => {},
        onResolveNote: () => {},
      }),
    );

    expect(html).toContain("تجهيز التخزين الخاص بالملفات ما يزال معلقًا");
    expect(html).toContain("رفع الملفات الثنائية غير متاح حاليًا");
    expect(html).toContain("تسجيل البيانات الوصفية للملفات غير متاح حاليًا");
    expect(html).toContain("بقية إجراءات مشروع التخرج تظل متاحة وفق الصلاحيات");
    expect(html).not.toContain("تسجيل ملف (بيانات وصفية)");
    expect(html).not.toContain('placeholder="اسم الملف الأصلي"');
    expect(html).not.toContain("بصمة SHA-256");
    expect(html).toContain("تحديد المرحلة");
  });

  test("MilestonesPanel source has no onRegisterFile action surface", () => {
    const src = read("src/components/graduation-projects/MilestonesPanel.tsx");
    expect(src).not.toContain("onRegisterFile");
    expect(src).not.toContain("تسجيل ملف (بيانات وصفية)");
    expect(src).not.toContain("RegisterFileFormInput");
    expect(src).toContain("تجهيز التخزين الخاص بالملفات ما يزال معلقًا");
  });
});

describe("GP storage fail-closed — server gate", () => {
  test("handler delegates to the production enforce helper", () => {
    const handler = extractRegisterHandlerSource();
    expect(handler).toContain("requireSupabaseAuth");
    expect(handler).toContain("enforceGraduationProjectFileRegistrationUnavailable");
    expect(handler).not.toContain("randomUUID");
    expect(handler).not.toContain("buildPrivateObjectKey");
    expect(handler).not.toContain("registerFile(");
    expect(handler).not.toContain("clientOf(");
    expect(handler).not.toContain("register_graduation_project_file");
    expect(handler).not.toContain(".storage");
    expect(handler).not.toContain("getPublicUrl");
    expect(handler).not.toContain("createSignedUrl");

    const enforce = extractEnforceSource();
    expect(enforce).toContain("ensureAvailable");
    expect(enforce).toContain("GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG");
    const ensureIdx = enforce.indexOf("ensureAvailable");
    const throwIdx = enforce.indexOf("GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG");
    expect(ensureIdx).toBeGreaterThanOrEqual(0);
    expect(throwIdx).toBeGreaterThan(ensureIdx);
  });

  test("safe Arabic message exposes no infrastructure identifiers", () => {
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).toContain("التخزين الخاص");
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).toContain("غير متاحين");
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).not.toMatch(/bucket|supabase|STORAGE_|env/i);
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).not.toContain("graduation-projects/");
  });

  test("production enforce path fails closed before registration/Storage side effects", async () => {
    const { supabase, rpcCalls, dbCalls, storageCalls } = createFakeSupabase();
    const cryptoSpy = spyOn(crypto, "randomUUID");
    const objectKeySpy = spyOn(lifecycle, "buildPrivateObjectKey");
    const registerSpy = spyOn(GraduationProjectsRpcClient.prototype, "registerFile");

    let thrown: unknown;
    try {
      await enforceGraduationProjectFileRegistrationUnavailable(supabase);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GraduationProjectsRpcError);
    expect((thrown as GraduationProjectsRpcError).message).toBe(
      GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG,
    );

    // Read-only availability probe is expected; mutating registration RPC is not.
    expect(rpcCalls.map((call) => call.name)).toEqual(["list_my_graduation_projects"]);
    expect(rpcCalls.some((call) => call.name === "register_graduation_project_file")).toBe(false);

    expect(cryptoSpy).not.toHaveBeenCalled();
    expect(objectKeySpy).not.toHaveBeenCalled();
    expect(registerSpy).not.toHaveBeenCalled();
    expect(dbCalls).toEqual([]);
    expect(storageCalls).toEqual([]);

    cryptoSpy.mockRestore();
    objectKeySpy.mockRestore();
    registerSpy.mockRestore();
  });

  test("tested production function remains the one invoked by the server handler", () => {
    const portal = read("src/lib/graduation-projects/portal.functions.ts");
    const handler = extractRegisterHandlerSource();
    expect(portal).toContain(
      "export async function enforceGraduationProjectFileRegistrationUnavailable",
    );
    expect(handler).toContain(
      "await enforceGraduationProjectFileRegistrationUnavailable(context.supabase)",
    );
    // No duplicated fail-closed sequence outside the production helper.
    expect(portal).not.toContain("runRegisterFailClosedChain");
    const throwCount = (
      portal.match(/throw new GraduationProjectsRpcError\(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG\)/g) ??
      []
    ).length;
    expect(throwCount).toBe(1);
  });
});

describe("GP storage fail-closed — alternate entry points", () => {
  const searchRoots = [
    "src/components/graduation-projects",
    "src/lib/graduation-projects",
    "src/routes/admin",
    "src/routes/faculty-portal",
    "src/routes/student-portal",
  ];

  test("no actionable UI wiring remains for metadata registration", () => {
    const panel = read("src/components/graduation-projects/MilestonesPanel.tsx");
    const workspace = read("src/components/graduation-projects/GraduationProjectWorkspace.tsx");
    const portalWorkspace = read(
      "src/components/graduation-projects/GraduationProjectPortalWorkspace.tsx",
    );

    expect(panel).not.toContain("onRegisterFile");
    expect(workspace).not.toContain("onRegisterFile");
    expect(portalWorkspace).not.toContain("onRegisterFile");
    expect(portalWorkspace).not.toContain("registerGraduationProjectFile");
    expect(portalWorkspace).not.toContain("registerFileFn");
  });

  test("scoped search finds no alternate actionable registration path", () => {
    const actionableHits: string[] = [];
    for (const rel of searchRoots) {
      const dir = join(root, rel);
      let files: string[] = [];
      try {
        files = walk(dir);
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
        const src = readFileSync(file, "utf8");
        const relFile = file.replace(/\\/g, "/").replace(root.replace(/\\/g, "/") + "/", "");
        if (relFile.endsWith("portal.functions.ts")) {
          expect(src).toContain("GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG");
          expect(src).toContain("enforceGraduationProjectFileRegistrationUnavailable");
          continue;
        }
        if (relFile.endsWith("rpc.ts") || relFile.endsWith("lifecycle.ts")) {
          continue;
        }
        if (
          src.includes("onRegisterFile") ||
          src.includes("تسجيل ملف (بيانات وصفية)") ||
          (src.includes("registerGraduationProjectFile") && src.includes("useServerFn"))
        ) {
          actionableHits.push(relFile);
        }
      }
    }
    expect(actionableHits).toEqual([]);
  });

  test("no public/signed/upload URL or Storage write introduced in GP surfaces", () => {
    for (const rel of ["src/components/graduation-projects", "src/lib/graduation-projects"]) {
      for (const file of walk(join(root, rel))) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
        const src = readFileSync(file, "utf8");
        expect(src, file).not.toMatch(/getPublicUrl|createSignedUrl|createUploadUrl/);
        expect(src, file).not.toMatch(/\.storage\.from\(/);
        expect(src, file).not.toMatch(/https?:\/\/.*storage/i);
      }
    }
  });

  test("auth and privacy guards remain on the register server function", () => {
    const handler = extractRegisterHandlerSource();
    expect(handler).toContain("requireSupabaseAuth");
    expect(handler).toContain("enforceGraduationProjectFileRegistrationUnavailable");
    const enforce = extractEnforceSource();
    expect(enforce).toContain("ensureAvailable");
    const portalFns = read("src/lib/graduation-projects/portal.functions.ts");
    expect(portalFns).toContain("applyPortalPrivacy");
    expect(portalFns).toContain("Never accept actor ids from the client");
  });
});
