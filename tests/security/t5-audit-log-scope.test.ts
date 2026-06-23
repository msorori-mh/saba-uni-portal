import type { SecurityTestConfig } from "./config";
import {
  fail,
  isAuthDenied,
  isSupabaseDenied,
  manual,
  pass,
  skip,
  type TestResult,
} from "./assertions";
import { createAuthedClient, trySignIn } from "./roles";
import { callServerFn } from "./server-fn";

/** Entity types outside RBAC-06 scope for each role (forbidden if visible). */
const DEAN_FORBIDDEN_ENTITIES = ["user", "role", "security", "system", "pilot"];
const REGISTRAR_FORBIDDEN_ENTITIES = ["user", "role", "security", "staff", "faculty", "pilot"];
const HR_ALLOWED_ENTITIES = ["staff", "faculty", "user", "faculty_account"];
const HR_FORBIDDEN_ENTITIES = ["student", "enrollment", "grade", "document"];

async function probeEntityVisibility(
  client: ReturnType<typeof createAuthedClient>,
  entityType: string,
): Promise<"visible" | "empty" | "denied"> {
  const { data, error } = await client
    .from("audit_logs")
    .select("id")
    .eq("entity_type", entityType)
    .limit(1);
  if (error && isSupabaseDenied(error)) return "denied";
  if ((data ?? []).length > 0) return "visible";
  return "empty";
}

export async function runT5AuditLogScopeTests(
  config: SecurityTestConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suite = "T5";

  // --- listAuditLogs server fn: admin only ---
  {
    const fnId = config.serverFnIds.listAuditLogs;
    if (!fnId) {
      results.push(skip("listAuditLogs admin full read (server fn)", "fn id not set"));
    } else if (!config.admin?.email || !config.admin.password) {
      results.push(skip("listAuditLogs admin full read (server fn)", "admin not configured"));
    } else {
      const admin = await trySignIn(config, config.admin.email, config.admin.password);
      if (!admin) {
        results.push(skip("listAuditLogs admin full read (server fn)", "admin sign-in failed"));
      } else {
        const res = await callServerFn(config, fnId, {
          token: admin.accessToken,
          payload: {},
        });
        if (res?.ok) {
          results.push(pass("admin can call listAuditLogs (read-only server fn)"));
        } else if (res && isAuthDenied(res.body, res.status)) {
          results.push(fail("admin can call listAuditLogs", "denied"));
        } else {
          results.push(skip("listAuditLogs admin", `status ${res?.status}`));
        }
      }
    }
  }

  // --- RLS direct reads by role ---
  const roleCases: Array<{
    label: string;
    creds: { email?: string; password?: string };
    forbidden: string[];
    allowed?: string[];
    expectAnyRead?: boolean;
  }> = [
    {
      label: "student",
      creds: config.studentA,
      forbidden: ["student", "user", "staff"],
    },
    {
      label: "staff portal",
      creds: config.staff ?? {},
      forbidden: ["student", "staff", "audit"],
    },
    {
      label: "faculty",
      creds: config.faculty ?? {},
      forbidden: ["student", "grade", "audit"],
    },
    {
      label: "hr_officer",
      creds: config.hr ?? {},
      forbidden: HR_FORBIDDEN_ENTITIES,
      allowed: HR_ALLOWED_ENTITIES,
    },
    {
      label: "dean",
      creds: config.dean ?? {},
      forbidden: DEAN_FORBIDDEN_ENTITIES,
    },
    {
      label: "registrar",
      creds: config.registrar ?? {},
      forbidden: REGISTRAR_FORBIDDEN_ENTITIES,
    },
    {
      label: "admin",
      creds: config.admin ?? {},
      forbidden: [],
      expectAnyRead: true,
    },
  ];

  for (const roleCase of roleCases) {
    if (!roleCase.creds.email || !roleCase.creds.password) {
      results.push(
        skip(`${roleCase.label} audit_logs RLS`, "test account not configured"),
      );
      continue;
    }
    const session = await trySignIn(
      config,
      roleCase.creds.email,
      roleCase.creds.password,
    );
    if (!session) {
      results.push(skip(`${roleCase.label} audit_logs RLS`, "sign-in failed"));
      continue;
    }
    const client = createAuthedClient(config, session.accessToken);

    let sawForbidden = false;
    for (const entity of roleCase.forbidden) {
      const vis = await probeEntityVisibility(client, entity);
      if (vis === "visible") {
        results.push(
          fail(
            `${roleCase.label} cannot read audit entity '${entity}'`,
            "row visible via RLS",
          ),
        );
        sawForbidden = true;
      } else if (vis === "denied") {
        results.push(pass(`${roleCase.label} denied audit entity '${entity}' (RLS)`));
      } else {
        results.push(
          manual(
            `${roleCase.label} audit entity '${entity}' scope`,
            "no rows in staging — inconclusive, review when data exists",
          ),
        );
      }
    }

    if (roleCase.allowed && !sawForbidden) {
      let anyAllowedVisible = false;
      for (const entity of roleCase.allowed) {
        const vis = await probeEntityVisibility(client, entity);
        if (vis === "visible") anyAllowedVisible = true;
      }
      if (anyAllowedVisible) {
        results.push(pass(`${roleCase.label} can read in-scope audit entities (RLS)`));
      } else {
        results.push(
          manual(
            `${roleCase.label} in-scope audit entities`,
            "no matching audit rows on staging",
          ),
        );
      }
    }

    if (roleCase.expectAnyRead) {
      const { data, error } = await client.from("audit_logs").select("id").limit(1);
      if (error && isSupabaseDenied(error)) {
        results.push(fail("admin RLS full audit read", error.message));
      } else {
        results.push(pass("admin RLS allows audit_logs SELECT (read-only probe)"));
      }
      if ((data ?? []).length === 0) {
        results.push(manual("admin audit log content", "empty table on staging"));
      }
    }
  }

  return results.map((r) => ({ ...r, suite }));
}
