import { supabase } from "@/integrations/supabase/client";
import type { LookupMaps } from "./types";
import { getImportDb } from "./import-db";

export async function loadLookups(): Promise<LookupMaps> {
  const sb = getImportDb();
  const [deps, progs, lvls, crs, ays, sems] = await Promise.all([
    sb.from("departments").select("id, name_ar, name_en"),
    sb.from("programs").select("id, code, department_id"),
    sb.from("academic_levels").select("id, name, level_number"),
    sb.from("courses").select("id, code, department_id"),
    sb.from("academic_years").select("id, name"),
    // academic_year_id is required: semesters.code is unique per year, not globally
    // (UNIQUE (academic_year_id, code) — migration 20260531230139).
    sb.from("semesters").select("id, name, code, academic_year_id"),
  ]);

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  const departmentsByName = new Map<string, string>();
  (deps.data ?? []).forEach((d: { id: string; name_ar: string; name_en: string | null }) => {
    if (d.name_ar) departmentsByName.set(norm(d.name_ar), d.id);
    if (d.name_en) departmentsByName.set(norm(d.name_en), d.id);
  });

  const programsByCode = new Map<string, { id: string; department_id: string | null }>();
  (progs.data ?? []).forEach((p: { id: string; code: string; department_id: string | null }) => {
    if (p.code) programsByCode.set(norm(p.code), { id: p.id, department_id: p.department_id });
  });

  const levelsByName = new Map<string, string>();
  const levelsByNumber = new Map<string, string>();
  (lvls.data ?? []).forEach((l: { id: string; name: string; level_number: number }) => {
    if (l.name) levelsByName.set(norm(l.name), l.id);
    if (l.level_number != null) levelsByNumber.set(String(l.level_number), l.id);
  });

  const coursesByCode = new Map<string, { id: string; department_id: string | null }>();
  (crs.data ?? []).forEach((c: { id: string; code: string; department_id: string | null }) => {
    if (c.code) coursesByCode.set(norm(c.code), { id: c.id, department_id: c.department_id });
  });

  const academicYearsByName = new Map<string, string>();
  (ays.data ?? []).forEach((a: { id: string; name: string }) => {
    if (a.name) academicYearsByName.set(norm(a.name), a.id);
  });

  const semestersByCode = new Map<string, string>();
  const semestersByName = new Map<string, string>();
  // G-02: year-scoped map. The global maps above collide across academic years
  // ('first' exists once per year; Map.set keeps only the last row).
  const semestersByYearKey = new Map<string, string>();
  (sems.data ?? []).forEach(
    (s: { id: string; name: string; code: string; academic_year_id: string | null }) => {
      if (s.code) semestersByCode.set(norm(s.code), s.id);
      if (s.name) semestersByName.set(norm(s.name), s.id);
      if (s.academic_year_id) {
        if (s.code) semestersByYearKey.set(`${s.academic_year_id}|${norm(s.code)}`, s.id);
        if (s.name) semestersByYearKey.set(`${s.academic_year_id}|${norm(s.name)}`, s.id);
      }
    },
  );

  return {
    departmentsByName,
    programsByCode,
    levelsByName,
    levelsByNumber,
    coursesByCode,
    academicYearsByName,
    semestersByCode,
    semestersByName,
    semestersByYearKey,
  };
}

export const normKey = (s: string | null | undefined) =>
  (s ?? "").toString().trim().toLowerCase();
