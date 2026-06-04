import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Search, FileText, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UnofficialTranscript } from "@/components/portal/UnofficialTranscript";

export const Route = createLazyFileRoute("/admin/transcripts")({
  component: AdminTranscriptsPage,
});

type StudentResult = {
  id: string;
  academic_number: string;
  full_name_ar: string;
  program: { name_ar: string } | null;
  department: { name_ar: string } | null;
};

function AdminTranscriptsPage() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string>("");
  const [selected, setSelected] = useState<StudentResult | null>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["admin-transcript-search", active],
    enabled: active.length >= 2,
    queryFn: async () => {
      const term = `%${active}%`;
      const { data, error } = await supabase
        .from("student_profiles")
        .select("id, academic_number, full_name_ar, program:programs(name_ar), department:departments(name_ar)")
        .or(`academic_number.ilike.${term},full_name_ar.ilike.${term}`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as StudentResult[];
    },
  });

  return (
    <div dir="rtl" className="p-4 lg:p-8 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-gold" />
        <h1 className="font-display text-xl font-extrabold text-primary">السجلات الأكاديمية غير الرسمية</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        ابحث عن الطالب بالرقم الأكاديمي أو الاسم لعرض سجله غير الرسمي. لا يوجد إصدار رسمي أو ختم أو رقم وثيقة في هذه المرحلة.
      </p>

      {!selected ? (
        <>
          <form
            onSubmit={(e) => { e.preventDefault(); setActive(search.trim()); }}
            className="flex gap-2"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="رقم أكاديمي أو اسم..."
              className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
            />
            <button className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
              <Search className="h-4 w-4" /> بحث
            </button>
          </form>

          {active.length >= 2 && (
            <div className="rounded-lg border bg-card divide-y">
              {isFetching ? (
                <div className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-primary" /></div>
              ) : results.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">لا توجد نتائج.</div>
              ) : (
                results.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="w-full text-right p-3 hover:bg-muted/40 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-primary">{s.academic_number}</div>
                      <div className="font-semibold text-sm truncate">{s.full_name_ar}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {s.program?.name_ar ?? "—"} • {s.department?.name_ar ?? "—"}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <button
            onClick={() => setSelected(null)}
            className="text-xs font-bold text-primary hover:underline"
          >
            ← العودة إلى البحث
          </button>
          <UnofficialTranscript studentProfileId={selected.id} />
        </div>
      )}
    </div>
  );
}
