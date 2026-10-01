/**
 * Graduation-project private file download — server-side signing.
 *
 * The `graduation-projects` bucket intentionally has NO client SELECT policy
 * (see docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql),
 * so `createSignedUrl` with the caller's own client always fails. Flow:
 *   1. authorize + audit with the CALLER's session via the frozen RPC
 *      `create_graduation_project_signed_download` (assignment checks live there);
 *   2. only then sign the exact returned object path with the service role.
 * The service role never decides access — it only signs what the RPC approved.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GP_PRIVATE_BUCKET } from "./domain";
import { GraduationProjectsRpcClient, type RpcClient } from "./rpc";

const MIN_SIGNED_SECONDS = 30;
const MAX_SIGNED_SECONDS = 300;

const DOWNLOAD_DENIED = "تعذر إنشاء رابط التحميل الموقّع";

export const signGraduationProjectDownloadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fileId: z.string().uuid(),
        projectId: z.string().uuid().optional(),
        correlationId: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Step 1: authorization as the caller (throws Arabic-mapped errors).
    const rpc = new GraduationProjectsRpcClient(context.supabase as unknown as RpcClient);
    const auth = await rpc.createSignedDownload({
      fileId: data.fileId,
      projectId: data.projectId,
      correlationId: data.correlationId,
    });

    const path = auth.storage_object_path ?? "";
    if (
      auth.storage_bucket !== GP_PRIVATE_BUCKET
      || !path.startsWith(`${GP_PRIVATE_BUCKET}/`)
      || path.includes("..")
    ) {
      throw new Error("حاوية التخزين غير مطابقة للعقد");
    }

    const expiresIn = Math.min(
      MAX_SIGNED_SECONDS,
      Math.max(MIN_SIGNED_SECONDS, Number(auth.expires_in_seconds) || MAX_SIGNED_SECONDS),
    );

    // Step 2: sign exactly the approved object.
    const { data: signed, error } = await supabaseAdmin.storage
      .from(GP_PRIVATE_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error || !signed?.signedUrl) throw new Error(DOWNLOAD_DENIED);

    return {
      url: signed.signedUrl,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  });
