/**
 * UI-only mirror of the roles admitted by public.cdp_delivery_monitoring().
 * Hides the «متابعة التنفيذ» tab; the page and RPC remain authoritative.
 */
export const DELIVERY_MONITORING_ROLES = [
  "department_head", "dean", "registrar", "student_affairs", "admin", "system_admin",
] as const;

export function canSeeDeliveryMonitoring(roles: readonly string[]): boolean {
  return roles.some((r) => (DELIVERY_MONITORING_ROLES as readonly string[]).includes(r));
}
