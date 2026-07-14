/**
 * Minimal Cloudflare Worker entry that exercises the Arabic PDF spike
 * without Node fs/path or network. Font + logo are Data modules.
 *
 * Paths are relative to this file (tools/arabic-pdf-worker-spike/src/).
 */
import { generateEnrollmentCertificateSpikePdf } from "../../../src/lib/documents/arabic-pdf-worker-spike";
import fontBytes from "../../../src/assets/fonts/cairo/Cairo-Variable.ttf";
import logoBytes from "../../../src/assets/college-logo.jpg";

function asUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

export default {
  async fetch(): Promise<Response> {
    try {
      const result = await generateEnrollmentCertificateSpikePdf({
        fontBytes: asUint8Array(fontBytes as ArrayBuffer),
        logoBytes: asUint8Array(logoBytes as ArrayBuffer),
      });
      return new Response(result.pdfBytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "x-spike-pages": String(result.pageCount),
          "x-spike-bytes": String(result.byteLength),
          "x-spike-header-ok": String(result.startsWithPdfHeader),
          "x-spike-shaping": result.shaping,
          "x-spike-engine": result.engine,
          "cache-control": "no-store",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
