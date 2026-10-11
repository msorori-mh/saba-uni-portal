import type { SupabaseClient } from "@supabase/supabase-js";

type PasswordAuth = Pick<SupabaseClient["auth"], "getUser" | "signInWithPassword" | "updateUser">;

/** Verify the current password even when project-wide Auth enforcement is not yet enabled. */
export async function changeMobilePassword(
  auth: PasswordAuth,
  currentPassword: string,
  password: string,
  confirmation: string,
): Promise<void> {
  if (!currentPassword) throw new Error("أدخل كلمة المرور الحالية");
  if (password.length < 8) throw new Error("يجب أن لا تقل كلمة المرور عن 8 أحرف");
  if (password !== confirmation) throw new Error("كلمتا المرور غير متطابقتين");
  const { data, error } = await auth.getUser();
  if (error || !data.user?.email) throw new Error("تعذّر تأكيد الحساب. سجّل الدخول مجددًا.");
  const verified = await auth.signInWithPassword({
    email: data.user.email,
    password: currentPassword,
  });
  if (verified.error || verified.data.user?.id !== data.user.id) {
    throw new Error("تعذّر التحقق من كلمة المرور الحالية. تحقق منها وحاول مجددًا.");
  }
  const result = await auth.updateUser({ password, current_password: currentPassword });
  if (result.error) throw result.error;
}
