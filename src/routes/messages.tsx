import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Inbox, Send, MailOpen, Plus, ArrowRight, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMessages, sendMessage, searchMessageRecipients, markMessageRead } from "@/lib/communications.functions";
import { ComposeDialog } from "@/routes/admin/communications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/messages")({
  head: () => ({ meta: [{ title: "صندوق الرسائل — البوابة" }, { name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/portal-login" });
  },
  component: MessagesCenter,
});

function MessagesCenter() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const searchFn = useServerFn(searchMessageRecipients);
  const markFn = useServerFn(markMessageRead);

  const [box, setBox] = useState<"inbox"|"sent"|"unread">("inbox");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["messages", box, search, page],
    queryFn: () => listFn({ data: { box, search: search || undefined, page, pageSize: 20 } }),
  });

  // Check if current user can compose
  const { data: canCompose } = useQuery({
    queryKey: ["can-compose"],
    queryFn: async () => {
      const res = await searchFn({ data: { query: "", limit: 1 } });
      return res.length > 0;
    },
  });

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });

  const selected = data?.rows.find((m: any) => m.id === selectedId) ?? null;

  return (
    <div dir="rtl" className="min-h-screen bg-surface">
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xs text-muted-foreground inline-flex items-center gap-1"><ArrowRight className="h-3.5 w-3.5" /> الرئيسية</Link>
          <h1 className="font-display text-xl font-extrabold text-primary">صندوق الرسائل</h1>
        </div>
        {canCompose && (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> رسالة جديدة
          </button>
        )}
      </header>

      <div className="max-w-6xl mx-auto p-4 grid lg:grid-cols-[260px_1fr] gap-4">
        <aside className="space-y-2">
          <BoxButton active={box === "inbox"} onClick={() => { setBox("inbox"); setPage(1); }} icon={Inbox} label="الواردة" />
          <BoxButton active={box === "unread"} onClick={() => { setBox("unread"); setPage(1); }} icon={MailOpen} label="غير مقروءة" />
          <BoxButton active={box === "sent"} onClick={() => { setBox("sent"); setPage(1); }} icon={Send} label="المرسلة" />
          <div className="mt-4 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-bold text-primary mb-1"><Megaphone className="h-3.5 w-3.5" /> ملاحظة</div>
            الرسائل داخلية فقط ولا تُرسل عبر البريد.
          </div>
        </aside>

        <main className="space-y-3 min-w-0">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="بحث في الموضوع والنص"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />

          {isLoading ? (
            <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !data?.rows.length ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">لا توجد رسائل.</div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_1fr] gap-3">
              <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-[70vh] overflow-auto">
                {data.rows.map((m: any) => (
                  <button key={m.id}
                    onClick={() => { setSelectedId(m.id); if (box !== "sent" && !m.is_read) mark.mutate(m.id); }}
                    className={cn("w-full text-right p-3 hover:bg-secondary/40", selectedId === m.id && "bg-secondary/60")}>
                    <div className="flex justify-between gap-2 items-center text-xs text-muted-foreground">
                      <span className="truncate">{box === "sent" ? `إلى: ${m.recipient_name}` : `من: ${m.sender_name}`}</span>
                      {box !== "sent" && !m.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    <div className="font-bold text-primary text-sm truncate mt-1">{m.subject}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{m.message_body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.sent_at).toLocaleString("ar-EG")}</div>
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-card p-4 max-h-[70vh] overflow-auto">
                {!selected ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">اختر رسالة لعرضها</div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      {box === "sent" ? `إلى: ${(selected as any).recipient_name}` : `من: ${(selected as any).sender_name}`}
                      {" • "}
                      {new Date((selected as any).sent_at).toLocaleString("ar-EG")}
                    </div>
                    <h2 className="font-display text-lg font-extrabold text-primary">{(selected as any).subject}</h2>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{(selected as any).message_body}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>الإجمالي: {data?.total ?? 0}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-50">السابق</button>
              <button disabled={!data || page * 20 >= data.total} onClick={() => setPage(p => p + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-50">التالي</button>
            </div>
          </div>
        </main>
      </div>

      {open && (
        <ComposeDialog
          onClose={() => setOpen(false)}
          onSent={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["messages"] }); }}
          sendFn={sendFn}
          searchFn={searchFn}
        />
      )}
    </div>
  );
}

function BoxButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick}
      className={cn("w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-primary hover:bg-secondary",
      )}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
