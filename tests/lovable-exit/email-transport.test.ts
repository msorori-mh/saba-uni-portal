import { describe, expect, test } from "bun:test";

import { resolveEmailTransport } from "../../src/lib/email-transport";

describe("LOVABLE-EXIT-01 — email transport", () => {
  test("no Resend key: email is not configured", () => {
    expect(resolveEmailTransport({})).toBeNull();
    expect(resolveEmailTransport({ LOVABLE_API_KEY: "lov" })).toBeNull();
  });

  test("inside Lovable: keeps the connector gateway", () => {
    const t = resolveEmailTransport({ LOVABLE_API_KEY: "lov", RESEND_API_KEY: "re_x" });
    expect(t?.url).toBe("https://connector-gateway.lovable.dev/resend/emails");
    expect(t?.headers).toEqual({ Authorization: "Bearer lov", "X-Connection-Api-Key": "re_x" });
  });

  test("outside Lovable: calls the Resend API directly", () => {
    const t = resolveEmailTransport({ RESEND_API_KEY: "re_x" });
    expect(t?.url).toBe("https://api.resend.com/emails");
    expect(t?.headers).toEqual({ Authorization: "Bearer re_x" });
  });

  test("email.functions uses the shared transport", async () => {
    const src = await Bun.file(new URL("../../src/lib/email.functions.ts", import.meta.url)).text();
    expect(src).toContain('from "./email-transport"');
    expect(src).toContain("fetch(transport.url");
    expect(src).not.toContain("GATEWAY_URL");
  });
});
