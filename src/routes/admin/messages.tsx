import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Trash2, Loader2, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Msg = {
  id: string;
  full_name: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export const Route = createFileRoute("/admin/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const [items, setItems] = useState<Msg[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error("تعذر تحميل الرسائل"); return; }
    setItems((data ?? []) as Msg[]);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    const { error } = await supabase.from("contact_messages").update({ is_read: true }).eq("id", id);
    if (error) { toast.error("فشل التحديث"); return; }
    setItems((prev) => prev?.map((m) => m.id === id ? { ...m, is_read: true } : m) ?? null);
  };

  const remove = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الرسالة؟")) return;
    const { error } = await supabase.from("contact_messages").delete().eq("id", id);
    if (error) { toast.error("فشل الحذف"); return; }
    setItems((prev) => prev?.filter((m) => m.id !== id) ?? null);
    toast.success("تم حذف الرسالة");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">رسائل التواصل</h1>
        <p className="mt-1 text-sm text-muted-foreground">الرسائل الواردة من نموذج التواصل في الموقع.</p>
      </div>

      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        {items === null ? (
          <div className="p-12 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">لا توجد رسائل.</div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((m) => {
              const open = openId === m.id;
              return (
                <li key={m.id} className={!m.is_read ? "bg-gold/[0.04]" : ""}>
                  <button
                    onClick={() => { setOpenId(open ? null : m.id); if (!m.is_read) markRead(m.id); }}
                    className="w-full text-right px-6 py-4 hover:bg-secondary/40 transition-colors flex items-start gap-4"
                  >
                    <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${m.is_read ? "bg-muted" : "bg-gold"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="font-bold text-primary">{m.full_name}</div>
                        <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("ar-EG")}</div>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5" dir="ltr">{m.email}</div>
                      <div className="mt-1 text-sm font-semibold text-primary/80">{m.subject}</div>
                      {open && (
                        <div className="mt-3 rounded-md bg-secondary/50 p-4 text-sm leading-7 whitespace-pre-wrap">
                          {m.message}
                        </div>
                      )}
                    </div>
                  </button>
                  {open && (
                    <div className="px-6 pb-4 flex items-center justify-end gap-2">
                      <a
                        href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject)}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary"
                      >
                        <Mail className="h-3.5 w-3.5" /> رد
                      </a>
                      {!m.is_read && (
                        <button
                          onClick={() => markRead(m.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary"
                        >
                          <CheckCheck className="h-3.5 w-3.5" /> تمت القراءة
                        </button>
                      )}
                      <button
                        onClick={() => remove(m.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
