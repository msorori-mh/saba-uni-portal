/**
 * TEST_ONLY_ASSURANCE_02 — the single HTTP chokepoint.
 *
 * Every actual network request made by any Supabase client in this phase goes
 * through `createAssuranceFetch`, installed as the client's `global.fetch`.
 * That means SDK sign-in, PostgREST reads, any internal retry, and sign-out are
 * each counted exactly once — there are no separate manual budget calls.
 *
 * Guarantees:
 *  - origin/HTTPS/userinfo/port validation on every request URL
 *  - `redirect: "error"` — an external redirect can never be followed
 *  - bounded timeout per request
 *  - <=N requests total, >=1s apart, concurrency 1 (serialised by a chain)
 *  - abort on 429 / 5xx / HTML challenge / two transport failures, and the
 *    abort LATCHES permanently: catching the error upstream cannot re-enable
 *    the network
 */

import { RequestBudget, type HttpEvidence } from "./strict-evidence";
import { DEFAULT_TIMEOUT_MS, MAX_BODY_BYTES, assertRequestUrl, bufferBoundedBody } from "./target-guard";

export interface AssuranceFetch {
  fetch: typeof fetch;
  /** Non-PII evidence of the most recent HTTP exchange. */
  last(): HttpEvidence | null;
  budget: RequestBudget;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function createAssuranceFetch(
  allowedOrigin: string,
  budget: RequestBudget = new RequestBudget(),
  baseFetch: typeof fetch = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  maxBodyBytes: number = MAX_BODY_BYTES,
): AssuranceFetch {
  let lastEvidence: HttpEvidence | null = null;
  // Concurrency 1: every call waits for the previous one to settle.
  let chain: Promise<unknown> = Promise.resolve();

  const run = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (budget.aborted) throw new Error(`ASSURANCE_02_ABORT: ${budget.aborted}`);
    const url = assertRequestUrl(urlOf(input), allowedOrigin);
    await budget.take();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let response: Response;
    let buffered: Response;
    try {
      response = await baseFetch(url, { ...init, redirect: "error", signal: controller.signal });
      // The deadline stays armed through body reception; a stalled or oversized
      // body is a transport failure, not a silent success.
      buffered = await bufferBoundedBody(response, controller, maxBodyBytes);
    } catch (error) {
      lastEvidence = { status: 0, transportError: true, durationMs: Date.now() - startedAt };
      budget.transportFailure(); // latches on the second failure
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const contentType = buffered.headers.get("content-type") ?? "";
    const evidence: HttpEvidence = {
      status: buffered.status,
      html: contentType.includes("text/html"),
      durationMs: Date.now() - startedAt,
    };
    lastEvidence = evidence;
    // Latches on 429 / 5xx / HTML challenge before the body reaches the SDK.
    budget.checkAbort(evidence);
    return buffered;
  };


  const serialised: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const next = chain.then(
      () => run(input, init),
      () => run(input, init),
    );
    chain = next.catch(() => undefined);
    return next;
  }) as unknown as typeof fetch;

  return { fetch: serialised, last: () => lastEvidence, budget };
}
