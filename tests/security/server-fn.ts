import type { SecurityTestConfig } from "./config";

const SERVER_FN_BASE = "/_serverFn/";

export interface ServerFnCallResult {
  status: number;
  body: string;
  ok: boolean;
}

/** Minimal TanStack Start server-fn HTTP call (read-only / auth probes). */
export async function callServerFn(
  config: SecurityTestConfig,
  fnId: string | undefined,
  options: {
    method?: "GET" | "POST";
    token?: string;
    payload?: unknown;
  } = {},
): Promise<ServerFnCallResult | null> {
  if (!fnId) return null;
  const method = options.method ?? "POST";
  const url = `${config.targetUrl}${SERVER_FN_BASE}${fnId}`;
  const headers: Record<string, string> = {
    "x-tsr-serverFn": "true",
    Accept: "*/*",
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  let requestUrl = url;
  let body: string | undefined;
  if (method === "GET" && options.payload !== undefined) {
    const payload = encodeURIComponent(JSON.stringify({ data: options.payload }));
    requestUrl = `${url}?payload=${payload}`;
  } else if (method === "POST") {
    body = JSON.stringify(options.payload ?? {});
  }

  const res = await fetch(requestUrl, { method, headers, body });
  const text = await res.text();
  return { status: res.status, body: text, ok: res.ok };
}

export function fnIdOrSkip(
  config: SecurityTestConfig,
  key: keyof SecurityTestConfig["serverFnIds"],
): string | undefined {
  return config.serverFnIds[key];
}
