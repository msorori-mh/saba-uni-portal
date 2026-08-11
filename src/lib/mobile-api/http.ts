import { MobileApiError, mapUnknownToMobileError } from "./errors";

const NO_STORE = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export function jsonOk<T>(data: T, init?: { status?: number }): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: init?.status ?? 200,
    headers: NO_STORE,
  });
}

export function jsonMobileError(err: MobileApiError): Response {
  return new Response(JSON.stringify(err.toBody()), {
    status: err.httpStatus,
    headers: NO_STORE,
  });
}

export async function withMobileApiHandler(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...NO_STORE,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }
    return await handler(request);
  } catch (err) {
    const mapped = mapUnknownToMobileError(err);
    // Log full error server-side only
    if (!(err instanceof MobileApiError)) {
      console.error("[mobile-api]", err);
    }
    return jsonMobileError(mapped);
  }
}

export async function readJsonBody<T>(
  request: Request,
  parse: (raw: unknown) => T,
): Promise<T> {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new MobileApiError(
        "VALIDATION_ERROR",
        "INVALID_JSON",
        "Request body must be valid JSON",
        "جسم الطلب يجب أن يكون JSON صالحاً",
      );
    }
  }
  try {
    return parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    throw new MobileApiError(
      "VALIDATION_ERROR",
      "VALIDATION_ERROR",
      msg.slice(0, 200),
      "بيانات غير صالحة",
    );
  }
}

/** Simple per-user sliding window for signed-URL mint endpoints. */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function assertMobileRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): void {
  const now = Date.now();
  const existing = rateBuckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  if (existing.count >= opts.limit) {
    throw new MobileApiError(
      "RATE_LIMITED",
      "RATE_LIMITED",
      "Too many requests; try again shortly",
      "طلبات كثيرة جداً؛ حاول لاحقاً",
    );
  }
  existing.count += 1;
}
