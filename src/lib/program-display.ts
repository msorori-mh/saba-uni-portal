/**
 * Display helpers for public program pages.
 */

type ProgramLike = {
  code: string;
  name_ar: string;
  description_ar?: string | null;
  degree_type?: string | null;
  years?: number | null;
};

const DEGREE_YEARS: Record<string, number> = { "بكالوريوس": 4, "ماجستير": 2, "دكتوراه": 3 };

/** Degree label: stored value first, then inferred from the program code. */
export function programDegree(p: ProgramLike): string {
  const stored = p.degree_type?.trim();
  if (stored) return stored;
  return /^M[A-Z]/.test(p.code) ? "ماجستير" : "بكالوريوس";
}

export function programYears(p: ProgramLike): number {
  if (typeof p.years === "number" && p.years > 0) return p.years;
  return DEGREE_YEARS[programDegree(p)] ?? 4;
}

/** Arabic "N سنوات/سنتان/سنة" with correct agreement. */
export function arabicYears(n: number): string {
  if (n === 1) return "سنة واحدة";
  if (n === 2) return "سنتان";
  if (n >= 3 && n <= 10) return `${n} سنوات`;
  return `${n} سنة`;
}

/** Never return an empty description: page body and meta tags both use this. */
export function programDescription(p: ProgramLike): string {
  const stored = p.description_ar?.trim();
  if (stored) return stored;
  return `برنامج ${programDegree(p)} «${p.name_ar}» في كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ.`;
}
