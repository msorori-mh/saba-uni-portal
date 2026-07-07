/**
 * @deprecated Import from `@/lib/staff-functional-roles` for new code.
 * Thin compatibility layer — all role data lives in staff-functional-roles.ts.
 */
import type { Database } from "@/integrations/supabase/types";
import {
  ALLOWED_STAFF_ROLE_TYPES_CREATE,
  ALLOWED_STAFF_ROLE_TYPES_UPDATE,
  staffFunctionalRoleLabel,
  staffFunctionalRoleToAppRole,
  staffRoleFilterOptions,
  staffRoleFormOptionsForCreate,
  staffRoleFormOptionsForEdit,
  type StaffRoleFormOption,
} from "@/lib/staff-functional-roles";

type AppRole = Database["public"]["Enums"]["app_role"];

export type StaffRoleTypeOption = StaffRoleFormOption;

export const STAFF_ROLE_TYPES = staffRoleFormOptionsForCreate();

export const ALLOWED_STAFF_ROLE_TYPES = ALLOWED_STAFF_ROLE_TYPES_CREATE;

export const ALLOWED_STAFF_ROLE_TYPES_UPDATE = ALLOWED_STAFF_ROLE_TYPES_UPDATE;

export function staffRoleTypeLabel(roleType: string): string {
  return staffFunctionalRoleLabel(roleType);
}

export function staffRoleToAppRole(roleType: string): AppRole {
  const mapped = staffFunctionalRoleToAppRole(roleType);
  if (mapped) return mapped;
  throw new Error(`لا يوجد app_role آمن للدور الوظيفي: ${roleType}`);
}

export function staffRoleOptionsForForm(currentRoleType?: string): StaffRoleTypeOption[] {
  return staffRoleFormOptionsForEdit(currentRoleType);
}

export const STAFF_ROLE_FILTER_OPTIONS: readonly StaffRoleTypeOption[] = staffRoleFilterOptions();
