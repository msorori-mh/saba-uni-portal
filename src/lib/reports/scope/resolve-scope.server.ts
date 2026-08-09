/**
 * Server-side actor scope resolution for beneficiary reports.
 * Fail-closed: missing scope ⇒ denied.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { userRoles } from "@/lib/authz.server";
import { buildActorScope, type ActorScopeFacts } from "./resolve-scope";
import type { ReportActorScope } from "./types";

export async function loadActorScopeFacts(userId: string): Promise<ActorScopeFacts> {
  const roles = await userRoles(userId);

  const [facultyRes, studentRes] = await Promise.all([
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
  ]);

  return {
    userId,
    roles,
    departmentId: (facultyRes.data as { department_id?: string | null } | null)?.department_id ?? null,
    facultyProfileId: (facultyRes.data as { id?: string } | null)?.id ?? null,
    studentProfileId: (studentRes.data as { id?: string } | null)?.id ?? null,
    operationalUnitCode: null,
  };
}

/** Resolve the caller's report scope (denied when ambiguous/missing). */
export async function resolveReportActorScope(userId: string): Promise<ReportActorScope> {
  const facts = await loadActorScopeFacts(userId);
  return buildActorScope(facts);
}

export function assertScopeAllowed(scope: ReportActorScope): void {
  if (scope.denied) {
    throw new Error(scope.denyReasonAr ?? "غير مصرح — النطاق غير محدد");
  }
}
