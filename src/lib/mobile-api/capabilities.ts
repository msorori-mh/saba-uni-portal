/**
 * Mobile public API v1 capability registry (source of truth for docs + /capabilities).
 */

export const MOBILE_API_VERSION = "v1" as const;

export type MobileCapabilityStatus =
  | "READY_PUBLIC_API"
  | "SOURCE_READY"
  | "HOLD";

export type MobileCapabilityTransport =
  | "http_authenticated"
  | "postgres_rpc"
  | "hold";

export type MobileCapability = {
  name: string;
  status: MobileCapabilityStatus;
  transport: MobileCapabilityTransport;
  operation: string | null;
  auth: "bearer_supabase_jwt";
  holdReason?: string;
};

export const MOBILE_CAPABILITIES: Record<string, MobileCapability> = {
  official_document_download: {
    name: "official_document_download",
    status: "READY_PUBLIC_API",
    transport: "http_authenticated",
    operation: "POST /api/mobile/v1/official-documents/download",
    auth: "bearer_supabase_jwt",
  },
  certificate_pdf_generation: {
    name: "certificate_pdf_generation",
    status: "HOLD",
    transport: "hold",
    operation: null,
    auth: "bearer_supabase_jwt",
    holdReason:
      "PDF generation is staff-only via document_issuance (issue_document). Students must download issued/archived documents only. Exposing generation to Flutter would change the lifecycle authorization contract.",
  },
  academic_progress: {
    name: "academic_progress",
    status: "READY_PUBLIC_API",
    transport: "http_authenticated",
    operation: "GET|POST /api/mobile/v1/academic-progress",
    auth: "bearer_supabase_jwt",
  },
  unofficial_transcript: {
    name: "unofficial_transcript",
    status: "READY_PUBLIC_API",
    transport: "http_authenticated",
    operation: "GET|POST /api/mobile/v1/unofficial-transcript",
    auth: "bearer_supabase_jwt",
  },
  course_materials: {
    name: "course_materials",
    status: "READY_PUBLIC_API",
    transport: "http_authenticated",
    operation:
      "GET /api/mobile/v1/course-materials ; POST /api/mobile/v1/course-materials/download",
    auth: "bearer_supabase_jwt",
  },
  push_token_registration: {
    name: "push_token_registration",
    status: "SOURCE_READY",
    transport: "postgres_rpc",
    operation:
      "register_mobile_push_token | revoke_mobile_push_token | touch_mobile_push_token",
    auth: "bearer_supabase_jwt",
  },
};

export function listMobileCapabilities() {
  return {
    version: MOBILE_API_VERSION,
    capabilities: Object.values(MOBILE_CAPABILITIES),
  };
}
