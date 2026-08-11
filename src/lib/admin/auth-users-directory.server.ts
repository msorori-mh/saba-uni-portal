import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DirectoryUser = {
  user_id: string;
  email: string | null;
  name: string;
  kind: "student" | "faculty" | "staff" | "user";
  identifier: string | null;
};

export async function buildProfileDirectory(): Promise<DirectoryUser[]> {
  const [students, faculty, staff, catalogRoles, operationalRoles] = await Promise.all([
    supabaseAdmin.from("student_profiles").select("user_id, full_name_ar, academic_number, email").not("user_id", "is", null),
    supabaseAdmin.from("faculty_profiles").select("user_id, full_name_ar, employee_number, faculty:faculty_id(email)").not("user_id", "is", null),
    supabaseAdmin.from("staff_profiles").select("user_id, full_name_ar, employee_number, email").not("user_id", "is", null),
    supabaseAdmin.from("user_role_assignments").select("user_id"),
    supabaseAdmin.from("user_roles").select("user_id"),
  ]);
  if (students.error) throw new Error(`تعذّر تحميل ملفات الطلاب: ${students.error.message}`);
  if (faculty.error) throw new Error(`تعذّر تحميل ملفات أعضاء هيئة التدريس: ${faculty.error.message}`);
  if (staff.error) throw new Error(`تعذّر تحميل ملفات الموظفين: ${staff.error.message}`);
  if (catalogRoles.error) throw new Error(`تعذّر تحميل مستخدمي الأدوار: ${catalogRoles.error.message}`);
  if (operationalRoles.error) throw new Error(`تعذّر تحميل مستخدمي الصلاحيات: ${operationalRoles.error.message}`);

  const map = new Map<string, DirectoryUser>();
  const apply = (rows: any[] | null, kind: DirectoryUser["kind"], idField: string) => {
    for (const r of rows ?? []) {
      const email = kind === "faculty" ? r.faculty?.email ?? null : r.email ?? null;
      map.set(r.user_id, {
        user_id: r.user_id,
        email,
        name: r.full_name_ar || email || r.user_id.slice(0, 8),
        kind,
        identifier: r[idField] ?? null,
      });
    }
  };
  apply(students.data as any[], "student", "academic_number");
  apply(faculty.data as any[], "faculty", "employee_number");
  apply(staff.data as any[], "staff", "employee_number");

  for (const row of [...(catalogRoles.data ?? []), ...(operationalRoles.data ?? [])]) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, {
        user_id: row.user_id,
        email: null,
        name: row.user_id.slice(0, 8),
        kind: "user",
        identifier: null,
      });
    }
  }

  return Array.from(map.values());
}

export async function getProfileDirectoryUsers(userIds: string[]): Promise<Map<string, DirectoryUser>> {
  if (userIds.length === 0) return new Map();
  const wanted = new Set(userIds);
  const directory = await buildProfileDirectory();
  return new Map(directory.filter((user) => wanted.has(user.user_id)).map((user) => [user.user_id, user]));
}

export async function listProfileDirectory(input: {
  search?: string;
  kinds?: DirectoryUser["kind"][];
  onlyWithRoles?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const [directory, catalogRoles, operationalRoles] = await Promise.all([
    buildProfileDirectory(),
    input.onlyWithRoles ? supabaseAdmin.from("user_role_assignments").select("user_id") : Promise.resolve({ data: [], error: null }),
    input.onlyWithRoles ? supabaseAdmin.from("user_roles").select("user_id") : Promise.resolve({ data: [], error: null }),
  ]);
  if (catalogRoles.error) throw new Error(`تعذّر تحميل مستخدمي الأدوار: ${catalogRoles.error.message}`);
  if (operationalRoles.error) throw new Error(`تعذّر تحميل مستخدمي الصلاحيات: ${operationalRoles.error.message}`);

  const roleUsers = new Set([
    ...(catalogRoles.data ?? []).map((row) => row.user_id),
    ...(operationalRoles.data ?? []).map((row) => row.user_id),
  ]);
  const kinds = input.kinds?.length ? new Set(input.kinds) : null;
  const search = input.search?.trim().toLocaleLowerCase("ar") ?? "";
  const filtered = directory.filter((user) => {
    if (kinds && !kinds.has(user.kind)) return false;
    if (input.onlyWithRoles && !roleUsers.has(user.user_id)) return false;
    if (!search) return true;
    return [user.name, user.email ?? "", user.identifier ?? ""]
      .some((value) => value.toLocaleLowerCase("ar").includes(search));
  });
  filtered.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, input.page ?? 1));
  const start = (page - 1) * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total, page, pageSize, totalPages };
}
