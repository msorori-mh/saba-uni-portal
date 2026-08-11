import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Auth admin listUsers fails with a 500 ("Database error finding users") when
 * the requested page size is large (perPage >= ~500 on this project). Always
 * page through in small chunks and surface errors instead of silently
 * returning an empty list.
 */
const PAGE_SIZE = 200;
const MAX_PAGES = 40;

export type AuthUserLite = { id: string; email: string | null; created_at: string | null };

export async function listAuthUsersPaged(): Promise<AuthUserLite[]> {
  const out: AuthUserLite[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) {
      throw new Error(
        `تعذّر تحميل حسابات الدخول (الصفحة ${page}): ${error.message}`,
      );
    }
    const users = data?.users ?? [];
    for (const u of users) {
      out.push({ id: u.id, email: u.email ?? null, created_at: u.created_at ?? null });
    }
    if (users.length < PAGE_SIZE) break;
  }
  return out;
}

export type DirectoryUser = {
  user_id: string;
  email: string | null;
  name: string;
  kind: "student" | "faculty" | "staff" | "user";
  identifier: string | null;
};

/**
 * Auth accounts enriched with the display name of the linked profile
 * (student / faculty / staff). Throws on any underlying failure.
 */
export async function buildUserDirectory(): Promise<DirectoryUser[]> {
  const [authUsers, students, faculty, staff] = await Promise.all([
    listAuthUsersPaged(),
    supabaseAdmin.from("student_profiles").select("user_id, full_name_ar, academic_number").not("user_id", "is", null),
    supabaseAdmin.from("faculty_profiles").select("user_id, full_name_ar, employee_number").not("user_id", "is", null),
    supabaseAdmin.from("staff_profiles").select("user_id, full_name_ar, employee_number, job_title").not("user_id", "is", null),
  ]);

  if (students.error) throw new Error(`تعذّر تحميل ملفات الطلاب: ${students.error.message}`);
  if (faculty.error) throw new Error(`تعذّر تحميل ملفات أعضاء هيئة التدريس: ${faculty.error.message}`);
  if (staff.error) throw new Error(`تعذّر تحميل ملفات الموظفين: ${staff.error.message}`);

  const map = new Map<string, DirectoryUser>();
  for (const u of authUsers) {
    map.set(u.id, {
      user_id: u.id,
      email: u.email,
      name: u.email ?? u.id.slice(0, 8),
      kind: "user",
      identifier: null,
    });
  }
  const apply = (
    rows: any[] | null,
    kind: DirectoryUser["kind"],
    idField: string,
  ) => {
    for (const r of rows ?? []) {
      const entry = map.get(r.user_id);
      if (!entry) continue;
      entry.name = r.full_name_ar || entry.name;
      entry.kind = kind;
      entry.identifier = r[idField] ?? null;
    }
  };
  apply(students.data as any[], "student", "academic_number");
  apply(faculty.data as any[], "faculty", "employee_number");
  apply(staff.data as any[], "staff", "employee_number");

  return Array.from(map.values());
}
