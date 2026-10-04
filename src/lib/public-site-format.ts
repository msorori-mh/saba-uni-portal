// Shared formatting helpers for the public website (no data access).

/** Arabic count phrase with correct noun agreement. */
export function arabicCount(
  n: number,
  forms: { one: string; two: string; few: string; many: string },
): string {
  if (n === 1) return `${forms.one} واحد`;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

export const memberCount = (n: number) =>
  arabicCount(n, { one: "عضو", two: "عضوان", few: "أعضاء", many: "عضوًا" });

export function programCountLabel(n: number): string {
  if (n === 1) return "برنامج واحد";
  if (n === 2) return "برنامجان";
  if (n >= 3 && n <= 10) return `${n} برامج`;
  return `${n} برنامجًا`;
}

export function programDescription(p: {
  name_ar: string;
  description_ar?: string | null;
}): string {
  const d = (p.description_ar ?? "").trim();
  if (d) return d;
  return `برنامج ${p.name_ar} في كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ.`;
}

export type RankKey = "professor" | "associate" | "assistant" | "lecturer" | "lecturer_assistant" | "teaching";

const RANK_MAP: Record<string, RankKey> = {
  professor: "professor",
  "full professor": "professor",
  "أستاذ": "professor",
  "أستاذ دكتور": "professor",
  "associate professor": "associate",
  "أستاذ مشارك": "associate",
  "assistant professor": "assistant",
  "أستاذ مساعد": "assistant",
  lecturer: "lecturer",
  "محاضر": "lecturer",
  "مدرس": "lecturer",
  "مدرّس": "lecturer",
  "lecturer assistant": "lecturer_assistant",
  "محاضر مساعد": "lecturer_assistant",
  "teaching assistant": "teaching",
  "معيد": "teaching",
};

export function normalizeRank(rank: string | null | undefined): RankKey | null {
  if (!rank) return null;
  const k = rank.trim().replace(/\s+/g, " ").toLowerCase();
  return RANK_MAP[k] ?? null;
}

export const RANK_LABEL_AR: Record<RankKey, string> = {
  professor: "أستاذ",
  associate: "أستاذ مشارك",
  assistant: "أستاذ مساعد",
  lecturer: "محاضر",
  lecturer_assistant: "محاضر مساعد",
  teaching: "معيد",
};

type ProgramDegreeLike = { code: string; degree_type?: string | null; years?: number | null };

const DEGREE_DEFAULT_YEARS: Record<string, number> = { "بكالوريوس": 4, "ماجستير": 2, "دكتوراه": 3 };

/** Degree label: stored value first, then inferred from the program code (M… = master). */
export function programDegree(p: ProgramDegreeLike): string {
  const stored = p.degree_type?.trim();
  if (stored) return stored;
  return /^M[A-Z]/.test(p.code) ? "ماجستير" : "بكالوريوس";
}

export function programYears(p: ProgramDegreeLike): number {
  if (typeof p.years === "number" && p.years > 0) return p.years;
  return DEGREE_DEFAULT_YEARS[programDegree(p)] ?? 4;
}

/** Arabic duration with correct agreement: سنة واحدة، سنتان، 4 سنوات. */
export function arabicYears(n: number): string {
  if (n === 1) return "سنة واحدة";
  if (n === 2) return "سنتان";
  if (n >= 3 && n <= 10) return `${n} سنوات`;
  return `${n} سنة`;
}
