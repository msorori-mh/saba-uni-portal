import {
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  GraduationProjectsRpcClient,
  GraduationProjectsRpcError,
  isGraduationProjectsRpcUnavailable,
} from "./rpc";

/**
 * Runtime capability probe for graduation-projects RPCs.
 * Never hard-codes availability=true. Production stays fail-closed until the
 * DRAFT SQL surface exists in the connected schema.
 */

export type GraduationProjectsRuntimeProbe = {
  available: boolean;
  message: string | null;
  probedRpc: "list_my_graduation_projects";
};

type RpcClient = ConstructorParameters<typeof GraduationProjectsRpcClient>[0];

/** Explicit opt-in mock for local development only — never Production. */
export function isGraduationProjectsPortalMockEnabled(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.GRADUATION_PROJECTS_PORTAL_MOCK === "1";
}

export async function probeGraduationProjectsRuntime(
  client: RpcClient,
): Promise<GraduationProjectsRuntimeProbe> {
  if (isGraduationProjectsPortalMockEnabled()) {
    return {
      available: true,
      message: null,
      probedRpc: "list_my_graduation_projects",
    };
  }

  const { error } = await client.rpc("list_my_graduation_projects", {});
  if (!error) {
    return {
      available: true,
      message: null,
      probedRpc: "list_my_graduation_projects",
    };
  }
  if (isGraduationProjectsRpcUnavailable(error)) {
    return {
      available: false,
      message: GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
      probedRpc: "list_my_graduation_projects",
    };
  }
  // Auth/permission failures mean the RPC exists — surface as available so
  // subsequent calls can return the precise Arabic error.
  return {
    available: true,
    message: null,
    probedRpc: "list_my_graduation_projects",
  };
}

export function assertGraduationProjectsAvailable(probe: GraduationProjectsRuntimeProbe): void {
  if (!probe.available) {
    throw new GraduationProjectsRpcError(
      probe.message ?? GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
      "GP_RUNTIME_UNAVAILABLE",
      true,
    );
  }
}
