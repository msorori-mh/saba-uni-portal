import { describe, expect, test } from "bun:test";
import { changeMobilePassword } from "../../src/lib/mobile/change-password";

function fixture(options: { userError?: boolean; noEmail?: boolean; wrong?: boolean; otherUser?: boolean; updateError?: boolean; network?: boolean } = {}) {
  const calls: string[] = [];
  const user = { id: "student-id", email: options.noEmail ? undefined : "student@example.test" };
  let updated: unknown;
  const auth = {
    getUser: async () => { calls.push("getUser"); return { data: { user }, error: options.userError ? new Error("expired") : null }; },
    signInWithPassword: async (credentials: unknown) => {
      calls.push("verify");
      expect(credentials).toEqual({ email: user.email, password: "old password" });
      if (options.network) throw new Error("offline");
      return { data: { user: options.otherUser ? { ...user, id: "different-id" } : user }, error: options.wrong ? new Error("wrong password") : null };
    },
    updateUser: async (input: unknown) => { calls.push("update"); updated = input; return { data: { user }, error: options.updateError ? new Error("update rejected") : null }; },
  } as unknown as Parameters<typeof changeMobilePassword>[0];
  return { auth, calls, updated: () => updated };
}

describe("mobile password change requires the current password", () => {
  test.each([
    ["", "new password", "new password"],
    ["old password", "short", "short"],
    ["old password", "new password", "different"],
  ])("invalid input never contacts Auth (%s)", async (current, next, confirmation) => {
    const f = fixture();
    await expect(changeMobilePassword(f.auth, current, next, confirmation)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  test.each([
    { userError: true }, { noEmail: true }, { wrong: true }, { otherUser: true }, { network: true },
  ])("failed identity verification never updates the password (%j)", async (options) => {
    const f = fixture(options);
    await expect(changeMobilePassword(f.auth, "old password", "new password", "new password")).rejects.toThrow();
    expect(f.calls).not.toContain("update");
  });
  test("correct password is verified before changing the same account", async () => {
    const f = fixture();
    await changeMobilePassword(f.auth, "old password", "new password", "new password");
    expect(f.calls).toEqual(["getUser", "verify", "update"]);
    expect(f.updated()).toEqual({ password: "new password", current_password: "old password" });
  });
  test("Auth rejection is surfaced without reporting success", async () => {
    const f = fixture({ updateError: true });
    await expect(changeMobilePassword(f.auth, "old password", "new password", "new password")).rejects.toThrow("update rejected");
  });
});
