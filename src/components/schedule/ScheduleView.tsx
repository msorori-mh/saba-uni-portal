import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DAYS, dayLabel, TYPE_LABELS, type ScheduleRow } from "@/lib/schedule-export";

export const FALLBACK_UNIVERSITY_AR = "جامعة إقليم سبأ";
export const FALLBACK_COLLEGE_AR = "كلية تكنولوجيا المعلومات وعلوم الحاسوب";

export function useSiteIdentity() {
  const { data } = useQuery({
    queryKey: ["site-identity"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["university_name_ar", "site_name_ar", "college_name_ar"]);
      const map = new Map<string, string | null>((data ?? []).map((r: any) => [r.setting_key, r.setting_value]));
      return {
        university: (map.get("university_name_ar") || "").trim() || FALLBACK_UNIVERSITY_AR,
        college: (map.get("college_name_ar") || map.get("site_name_ar") || "").trim() || FALLBACK_COLLEGE_AR,
      };
    },
  });
  return data ?? { university: FALLBACK_UNIVERSITY_AR, college: FALLBACK_COLLEGE_AR };
}

export const PRINT_CSS = `
@media print {
  body { background: white !important; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .print-page { padding: 16px !important; }
  table { page-break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
.print-only { display: none; }
`;

export function PrintHeader({ title, lines }: { title: string; lines: Array<[string, string]> }) {
  const { university, college } = useSiteIdentity();
  return (
    <div className="print-only border-b pb-3 mb-4">
      <div className="text-center mb-2">
        <div className="font-display text-lg font-extrabold">{university}</div>
        <div className="text-sm">{college}</div>
        <div className="text-base font-bold mt-1">{title}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
        {lines.map(([k, v]) => (
          <div key={k} className="flex gap-2"><span className="font-bold">{k}:</span><span>{v}</span></div>
        ))}
      </div>
    </div>
  );
}

/** Compact weekly grid table used by both portal & admin print views. */
export function WeeklyGrid({ rows, showFaculty = false }: { rows: ScheduleRow[]; showFaculty?: boolean }) {
  // Collect unique slots (start-end) across all days
  const slotKeys = Array.from(new Set(rows.map((r) => `${r.start_time}|${r.end_time}`)))
    .sort((a, b) => a.localeCompare(b));
  const cell = (day: string, key: string) => {
    const [st, et] = key.split("|");
    return rows.find((r) => r.day_of_week === day && r.start_time === st && r.end_time === et);
  };
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-2 py-2 text-right">الفترة</th>
            {DAYS.filter((d) => rows.some((r) => r.day_of_week === d.code)).map((d) => (
              <th key={d.code} className="px-2 py-2 text-center">{d.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slotKeys.map((k) => {
            const [st, et] = k.split("|");
            return (
              <tr key={k} className="border-t">
                <td className="px-2 py-2 font-mono text-[10px] whitespace-nowrap">{st.slice(0, 5)}<br />{et.slice(0, 5)}</td>
                {DAYS.filter((d) => rows.some((r) => r.day_of_week === d.code)).map((d) => {
                  const c = cell(d.code, k);
                  return (
                    <td key={d.code} className="px-2 py-2 text-center align-top">
                      {c ? (
                        <div className="space-y-0.5">
                          <div className="font-bold">{c.course_code}</div>
                          <div className="text-[10px] truncate">{c.course_name}</div>
                          <div className="text-[10px] text-muted-foreground">شعبة {c.section_code}</div>
                          {c.room && <div className="text-[10px]">{c.room}</div>}
                          {showFaculty && c.faculty && <div className="text-[10px]">{c.faculty}</div>}
                          <div className="text-[9px]">{TYPE_LABELS[c.schedule_type] ?? c.schedule_type}</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile-friendly grouped-by-day list. */
export function DayList({ rows, showFaculty = false }: { rows: ScheduleRow[]; showFaculty?: boolean }) {
  const grouped = new Map<string, ScheduleRow[]>();
  for (const d of DAYS) grouped.set(d.code, []);
  for (const r of rows) grouped.get(r.day_of_week)?.push(r);
  for (const k of grouped.keys()) grouped.get(k)!.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return (
    <div className="space-y-3">
      {DAYS.map((d) => {
        const items = grouped.get(d.code) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={d.code} className="rounded-lg border bg-card overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-sm font-bold text-primary border-b">{dayLabel(d.code)}</div>
            <div className="divide-y">
              {items.map((r, i) => (
                <div key={r.id ?? i} className="p-3 flex flex-wrap items-center gap-3 text-sm">
                  <div className="font-mono text-xs bg-muted px-2 py-1 rounded shrink-0">
                    {r.start_time.slice(0, 5)} - {r.end_time.slice(0, 5)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">
                      <span className="font-mono">{r.course_code}</span> — {r.course_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      شعبة {r.section_code}
                      {showFaculty && r.faculty && <> • {r.faculty}</>}
                      {r.room && <> • {r.room}</>}
                    </div>
                  </div>
                  <span className="text-[10px] bg-card border px-2 py-0.5 rounded font-bold">
                    {TYPE_LABELS[r.schedule_type] ?? r.schedule_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
