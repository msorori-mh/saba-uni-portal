/**
 * Browser-side wiring for step-up (keeps Supabase out of components).
 */

import { supabase } from "@/integrations/supabase/client";
import type { StepUpRpcClient } from "./step-up-client";

export const stepUpRpcClient: StepUpRpcClient = {
  rpc: (fn, args) =>
    (
      supabase.rpc as unknown as (
        name: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>
    )(fn, args),
};

export async function getCurrentUserIdForStepUp(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
