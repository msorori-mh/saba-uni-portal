/**
 * Server-side actor scope resolution for beneficiary reports.
 * Fail-closed: missing scope ⇒ denied.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { userRoles } from "@/lib/authz.server";
import { buildActorScope, type ActorScopeFacts } from "./resolve-scope";
import { loadExplicitOrgBindings } from "./org-identity.server";
import { emptyOrgBindings } from "./org-identity";
import type { ReportActorScope } from "./types";
import { ReportAuthorizationError, REPORT_SCOPE_ERROR_CODE } from "./authz-errors";

export async function loadActorScopeFacts(userId: string): Promise<ActorScopeFacts> {
  const roles = await userRoles(userId);

  const [facultyRes, studentRes, bindings] = await Promise.all([
    supabaseAdmin
      .from("faculty_profiles")
      .select("id, department_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("student_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
    loadExplicitOrgBindings(userId, roles),
  ]);

  const operationalUnitCode = bindings.operationalUnitCodes[0] ?? null;

  return {
    userId,
    roles,
    departmentId:
      (facultyRes.data as { department_id?: string | null } | null)?.department_id ??
      null,
    facultyProfileId: (facultyRes.data as { id?: string } | null)?.id ?? null,
    studentProfileId: (studentRes.data as { id?: string } | null)?.id ?? null,
    operationalUnitCode,
    bindings: bindings ?? emptyOrgBindings(),
  };
}

/**
 * Resolve the student self-report scope with the caller's authenticated
 * Supabase client. This keeps student-only reads protected by RLS and avoids
 * requiring a service-role secret in an external portal runtime.
 */
export async function resolveStudentSelfReportActorScope(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<ReportActorScope> {
  const [legacyRes, assignRes, studentRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("user_role_assignments")
      .select("role_code, roles_catalog(app_role_mapping)")
      .eq("user_id", userId),
    supabase
      .from("student_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (legacyRes.error) throw new Error(legacyRes.error.message);
  if (assignRes.error) throw new Error(assignRes.error.message);
  if (studentRes.error) throw new Error(studentRes.error.message);

  const roles = new Set<string>();
  for (const row of legacyRes.data ?? []) roles.add(row.role as string);
  for (const row of assignRes.data ?? []) {
    roles.add(row.role_code as string);
    const catalog = Array.isArray(row.roles_catalog)
      ? row.roles_catalog[0]
      : row.roles_catalog;
    const mapping = (catalog as { app_role_mapping?: string | null } | null)
      ?.app_role_mapping;
    if (mapping) roles.add(mapping);
  }

  return buildActorScope({
    userId,
    roles: [...roles],
    departmentId: null,
    facultyProfileId: null,
    studentProfileId: studentRes.data?.id ?? null,
    operationalUnitCode: null,
    bindings: emptyOrgBindings(),
  });
}

/** Resolve the caller's report scope (denied when ambiguous/missing). */
export async function resolveReportActorScope(
  userId: string,
): Promise<ReportActorScope> {
  const facts = await loadActorScopeFacts(userId);
  return buildActorScope(facts);
}

export function assertScopeAllowed(scope: ReportActorScope): void {
  if (scope.denied) {
    throw new ReportAuthorizationError(
      scope.denyReasonAr ?? "غير مصرح — النطاق غير محدد",
      REPORT_SCOPE_ERROR_CODE,
    );
  }
}
