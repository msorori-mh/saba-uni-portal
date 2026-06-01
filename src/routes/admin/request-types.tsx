import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ListChecks, Power, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

export const Route = createFileRoute("/admin/request-types")({
  component: AdminRequestTypesPage,
});

type RT = {
  id: string; code: string; name_ar: string; description_ar: string | null;
  is_active: boolean; requires_attachment: boolean; sort_order: number;
};

function AdminRequestTypesPage() {
  const qc = useQueryClient();
  const { data: types = [], isLoading } = useQuery({
    queryKey: ["admin-request-types"],
    queryFn: async (): Promise<RT[]> => {
      const { data, error } = await sb.from("request_types")
        .select("id, code, name_ar, description_ar, is_active, requires_attachment, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RT[];
    },
  });

  const toggle = async (id: string, current: boolean) => {
    const { error } = await sb.from("request_types").update({ is_active: !current }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(!current ? "تم التفعيل" : "تم التعطيل");
    qc.invalidateQueries({ queryKey: ["admin-request-types"] });
  };

  return (
    <div dir="rtl" className="p-4 lg:p-8 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-gold" />
        <h1 className="font-display text-xl font-extrabold text-primary">أنواع الطلبات الطلابية</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        يمكن تفعيل أو تعطيل أي نوع من أنواع الطلبات. الأنواع المعطلة لا تظهر للطلاب كخدمة قابلة للاستخدام.
      </p>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {types.map((t) => (
            <div key={t.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-sm text-primary">{t.name_ar}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{t.code}</span>
                  {t.requires_attachment && (
                    <span className="text-[10px] inline-flex items-center gap-0.5 bg-muted px-1.5 py-0.5 rounded">
                      <Paperclip className="h-2.5 w-2.5" /> يتطلب مرفق
                    </span>
                  )}
                </div>
                {t.description_ar && <div className="text-xs text-muted-foreground mt-0.5">{t.description_ar}</div>}
              </div>
              <button
                onClick={() => toggle(t.id, t.is_active)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold ${
                  t.is_active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                <Power className="h-3 w-3" /> {t.is_active ? "مفعل" : "معطل"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
