/**
 * Public surface for report scope helpers.
 */

export * from "./types";
export * from "./beneficiary-roles";
export * from "./authz-errors";
export * from "./org-identity";
export {
  levelsGrantedByRoles,
  buildActorScope,
  enforceDepartmentFilter,
  beneficiaryMayAccessLevel,
  type ActorScopeFacts,
} from "./resolve-scope";
