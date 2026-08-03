import { describe, expect, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MilestonesPanel } from "../../src/components/graduation-projects/MilestonesPanel";
import { GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG } from "../../src/lib/graduation-projects/portal.functions";
import * as availability from "../../src/lib/graduation-projects/availability";
import { GraduationProjectsRpcClient } from "../../src/lib/graduation-projects/rpc";

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

/** Mirrors the registerGraduationProjectFile fail-closed call chain for spy proofs. */
async function runRegisterFailClosedChain(supabase: object): Promise<never> {
  await availability.probeGraduationProjectsRuntime(supabase as never);
  availability.assertGraduationProjectsAvailable({
    available: true,
    message: null,
    probedRpc: "list_my_graduation_projects",
  });
  throw new Error(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG);
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
  test("handler fails closed before UUID, object-key, registerFile, or RPC", () => {
    const handler = extractRegisterHandlerSource();
    expect(handler).toContain("requireSupabaseAuth");
    expect(handler).toContain("ensureAvailable");
    expect(handler).toContain("GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG");

    const ensureIdx = handler.indexOf("ensureAvailable");
    const throwIdx = handler.indexOf("GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG");
    expect(ensureIdx).toBeGreaterThanOrEqual(0);
    expect(throwIdx).toBeGreaterThan(ensureIdx);

    expect(handler).not.toContain("randomUUID");
    expect(handler).not.toContain("buildPrivateObjectKey");
    expect(handler).not.toContain("registerFile(");
    expect(handler).not.toContain("clientOf(");
    expect(handler).not.toContain("register_graduation_project_file");
    expect(handler).not.toContain(".storage");
    expect(handler).not.toContain("getPublicUrl");
    expect(handler).not.toContain("createSignedUrl");
  });

  test("safe Arabic message exposes no infrastructure identifiers", () => {
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).toContain("التخزين الخاص");
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).toContain("غير متاحين");
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).not.toMatch(/bucket|supabase|STORAGE_|env/i);
    expect(GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG).not.toContain("graduation-projects/");
  });

  test("fail-closed chain never reaches registerFile or UUID generation", async () => {
    const probeSpy = spyOn(availability, "probeGraduationProjectsRuntime").mockResolvedValue({
      available: true,
      message: null,
      probedRpc: "list_my_graduation_projects",
    });
    const cryptoSpy = spyOn(crypto, "randomUUID");
    const registerSpy = spyOn(GraduationProjectsRpcClient.prototype, "registerFile");

    await expect(runRegisterFailClosedChain({})).rejects.toMatchObject({
      message: GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG,
    });

    expect(probeSpy).toHaveBeenCalledTimes(1);
    expect(cryptoSpy).not.toHaveBeenCalled();
    expect(registerSpy).not.toHaveBeenCalled();

    // Source chain must match the mirrored order (auth/availability then throw).
    const src = extractRegisterHandlerSource();
    expect(src.indexOf("ensureAvailable")).toBeLessThan(
      src.indexOf("GRADUATION_PROJECTS_STORAGE_UNAVAILABLE_MSG"),
    );
    expect(src).not.toContain("registerFile(");
    expect(src).not.toContain("randomUUID");
    expect(src).not.toContain("buildPrivateObjectKey");

    probeSpy.mockRestore();
    cryptoSpy.mockRestore();
    registerSpy.mockRestore();
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
    expect(handler).toContain("ensureAvailable");
    const portalFns = read("src/lib/graduation-projects/portal.functions.ts");
    expect(portalFns).toContain("applyPortalPrivacy");
    expect(portalFns).toContain("Never accept actor ids from the client");
  });
});
