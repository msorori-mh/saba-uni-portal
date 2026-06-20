import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Megaphone, Inbox, BarChart3, History, Archive, Power, PowerOff, Edit, X } from "lucide-react";
import {
  listAnnouncementsAdmin, createAnnouncement, updateAnnouncement,
  setAnnouncementActive, archiveAnnouncement, getAnnouncementStats,
  listMessages, sendMessage, searchMessageRecipients,
  getCommunicationsTargetLookups, listCommunicationAuditLogs,
} from "@/lib/communications.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/communications")({
  component: CommunicationsPage,
  head: () => ({ meta: [{ title: "مركز الاتصالات الداخلية — لوحة الإدارة" }] }),
});

type Tab = "announcements" | "messages" | "log" | "stats";

function CommunicationsPage() {
  const [tab, setTab] = useState<Tab>("announcements");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold text-primary">مركز الاتصالات الداخلية</h1>
        <p className="mt-1 text-sm text-muted-foreground">إعلانات داخلية ورسائل موجهة بين الإدارة والطلاب وهيئة التدريس والموظفين.</p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {([
          ["announcements", "الإعلانات", Megaphone],
          ["messages", "الرسائل الموجهة", Inbox],
          ["log", "سجل الإرسال", History],
          ["stats", "الإحصائيات", BarChart3],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as Tab)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors",
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-primary",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "messages" && <MessagesAdminTab />}
      {tab === "log" && <SendLogTab />}
      {tab === "stats" && <StatsTab />}
    </div>
  );
}

// ===================================================
// ANNOUNCEMENTS TAB
// ===================================================
function AnnouncementsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAnnouncementsAdmin);
  const setActiveFn = useServerFn(setAnnouncementActive);
  const archiveFn = useServerFn(archiveAnnouncement);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all"|"active"|"inactive"|"archived"|"scheduled"|"expired">("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["adm-announcements", { page, search, status }],
    queryFn: () => listFn({ data: { page, pageSize: 20, search: search || undefined, status } }),
  });

  const setActive = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => setActiveFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-announcements"] }),
  });
  const doArchive = useMutation({
    mutationFn: (id: string) => archiveFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-announcements"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="بحث في العنوان والمحتوى"
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">معطّل</option>
          <option value="scheduled">مجدول</option>
          <option value="expired">منتهي</option>
          <option value="archived">مؤرشف</option>
        </select>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> إعلان جديد
        </button>
      </div>

      {isLoading ? (
        <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.rows.length ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">لا توجد إعلانات.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-primary text-xs">
              <tr>
                <th className="px-3 py-2 text-right">العنوان</th>
                <th className="px-3 py-2 text-right">النوع</th>
                <th className="px-3 py-2 text-right">الجمهور</th>
                <th className="px-3 py-2 text-right">النشر</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a: any) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold text-primary">{a.title_ar}</td>
                  <td className="px-3 py-2"><TypeBadge t={a.announcement_type} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{AUDIENCE_LABELS[a.target_audience] ?? a.target_audience}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(a.publish_at).toLocaleString("ar-EG")}</td>
                  <td className="px-3 py-2">
                    {a.is_archived ? <span className="text-xs text-muted-foreground">مؤرشف</span>
                      : a.is_active ? <span className="text-xs text-emerald-600 font-bold">نشط</span>
                      : <span className="text-xs text-amber-600 font-bold">معطّل</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(a)} className="rounded p-1.5 hover:bg-secondary" title="تعديل"><Edit className="h-3.5 w-3.5" /></button>
                      <button
                        onClick={() => setActive.mutate({ id: a.id, is_active: !a.is_active })}
                        className="rounded p-1.5 hover:bg-secondary"
                        title={a.is_active ? "تعطيل" : "تفعيل"}
                      >
                        {a.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </button>
                      {!a.is_archived && (
                        <button
                          onClick={() => { if (confirm("أرشفة هذا الإعلان؟")) doArchive.mutate(a.id); }}
                          className="rounded p-1.5 hover:bg-secondary"
                          title="أرشفة"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center p-3 text-xs text-muted-foreground">
            <span>إجمالي: {data.total}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-50">السابق</button>
              <button disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-50">التالي</button>
            </div>
          </div>
        </div>
      )}

      {(creating || editing) && (
        <AnnouncementDialog
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); qc.invalidateQueries({ queryKey: ["adm-announcements"] }); }}
        />
      )}
    </div>
  );
}

const AUDIENCE_LABELS: Record<string, string> = {
  all: "الجميع", students: "الطلاب", faculty: "هيئة التدريس", staff: "الموظفون", admins: "الإدارة",
};
const TYPE_LABELS: Record<string, string> = {
  general: "عام", academic: "أكاديمي", finance: "مالي", urgent: "عاجل",
};

function TypeBadge({ t }: { t: string }) {
  const cls = t === "urgent" ? "bg-red-100 text-red-700 border-red-200"
    : t === "academic" ? "bg-blue-100 text-blue-700 border-blue-200"
    : t === "finance" ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-secondary text-primary border-border";
  return <span className={cn("inline-block rounded border px-2 py-0.5 text-[11px] font-bold", cls)}>{TYPE_LABELS[t] ?? t}</span>;
}

function AnnouncementDialog({ initial, onClose, onSaved }: { initial: any | null; onClose: () => void; onSaved: () => void }) {
  const createFn = useServerFn(createAnnouncement);
  const updateFn = useServerFn(updateAnnouncement);
  const lookupsFn = useServerFn(getCommunicationsTargetLookups);
  const [form, setForm] = useState({
    title_ar: initial?.title_ar ?? "",
    content_ar: initial?.content_ar ?? "",
    announcement_type: initial?.announcement_type ?? "general",
    target_audience: initial?.target_audience ?? "all",
    publish_at: initial?.publish_at ? new Date(initial.publish_at).toISOString().slice(0, 16) : "",
    expires_at: initial?.expires_at ? new Date(initial.expires_at).toISOString().slice(0, 16) : "",
    is_active: initial?.is_active ?? true,
    target_program_ids: (initial?.target_program_ids ?? []) as string[],
    target_department_ids: (initial?.target_department_ids ?? []) as string[],
    target_level_ids: (initial?.target_level_ids ?? []) as string[],
  });

  const { data: lookups } = useQuery({
    queryKey: ["comm-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title_ar: form.title_ar,
        content_ar: form.content_ar,
        announcement_type: form.announcement_type as any,
        target_audience: form.target_audience as any,
        target_program_ids: form.target_program_ids,
        target_department_ids: form.target_department_ids,
        target_level_ids: form.target_level_ids,
        publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : new Date().toISOString(),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      };
      if (initial) return updateFn({ data: { id: initial.id, patch: payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => onSaved(),
    onError: (e: any) => alert(e?.message ?? "تعذر الحفظ"),
  });

  const toggleArr = (k: "target_program_ids"|"target_department_ids"|"target_level_ids", id: string) => {
    setForm((f) => ({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] }));
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="font-display text-xl font-bold text-primary">{initial ? "تعديل إعلان" : "إعلان جديد"}</h2>
          <button onClick={onClose} className="p-2 rounded hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <input
          value={form.title_ar}
          onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
          placeholder="العنوان"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <textarea
          value={form.content_ar}
          onChange={(e) => setForm({ ...form, content_ar: e.target.value })}
          placeholder="المحتوى"
          rows={5}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span className="font-bold text-primary">النوع</span>
            <select value={form.announcement_type} onChange={(e) => setForm({ ...form, announcement_type: e.target.value })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="font-bold text-primary">الجمهور</span>
            <select value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
              {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="font-bold text-primary">تاريخ النشر</span>
            <input type="datetime-local" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-bold text-primary">تاريخ الانتهاء (اختياري)</span>
            <input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
          </label>
        </div>

        {form.target_audience !== "admins" && form.target_audience !== "staff" && (
          <details className="rounded-lg border border-border p-3">
            <summary className="text-xs font-bold text-primary cursor-pointer">استهداف دقيق (اختياري)</summary>
            <div className="mt-3 space-y-3">
              <ArrPicker title="الأقسام" items={(lookups?.departments ?? []) as any} selected={form.target_department_ids}
                onToggle={(id) => toggleArr("target_department_ids", id)} />
              <ArrPicker title="البرامج" items={(lookups?.programs ?? []) as any} selected={form.target_program_ids}
                onToggle={(id) => toggleArr("target_program_ids", id)} />
              <ArrPicker title="المستويات" items={(lookups?.levels ?? []).map((l: any) => ({ id: l.id, name_ar: l.name }))} selected={form.target_level_ids}
                onToggle={(id) => toggleArr("target_level_ids", id)} />
            </div>
          </details>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          نشط
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">إلغاء</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !form.title_ar.trim() || !form.content_ar.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArrPicker({ title, items, selected, onToggle }:
  { title: string; items: { id: string; name_ar: string }[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div>
      <div className="text-xs font-bold text-primary mb-1">{title}</div>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
        {items.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px]",
              selected.includes(it.id) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {it.name_ar}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===================================================
// MESSAGES TAB (admin compose)
// ===================================================
function MessagesAdminTab() {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendMessage);
  const searchFn = useServerFn(searchMessageRecipients);
  const listFn = useServerFn(listMessages);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [box, setBox] = useState<"inbox"|"sent">("sent");

  const { data, isLoading } = useQuery({
    queryKey: ["adm-msg", box, search],
    queryFn: () => listFn({ data: { box, search: search || undefined, page: 1, pageSize: 30 } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["sent","inbox"] as const).map((b) => (
            <button key={b} onClick={() => setBox(b)}
              className={cn("px-3 py-2 text-xs font-bold", box === b ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
              {b === "sent" ? "المرسلة" : "الواردة"}
            </button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث"
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm flex-1 min-w-[200px]" />
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> رسالة جديدة
        </button>
      </div>

      {isLoading ? (
        <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.rows.length ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">لا توجد رسائل.</div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {data.rows.map((m: any) => (
            <div key={m.id} className="p-3">
              <div className="flex justify-between items-start gap-2 text-xs text-muted-foreground">
                <span>{box === "sent" ? `إلى: ${m.recipient_name}` : `من: ${m.sender_name}`}</span>
                <span>{new Date(m.sent_at).toLocaleString("ar-EG")}</span>
              </div>
              <div className="font-bold text-primary mt-1">{m.subject}</div>
              <div className="text-sm text-foreground whitespace-pre-wrap mt-1">{m.message_body}</div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ComposeDialog
          onClose={() => setOpen(false)}
          onSent={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["adm-msg"] }); }}
          sendFn={sendFn}
          searchFn={searchFn}
        />
      )}
    </div>
  );
}

export function ComposeDialog({
  onClose, onSent, sendFn, searchFn,
}: {
  onClose: () => void; onSent: () => void;
  sendFn: ReturnType<typeof useServerFn<typeof sendMessage>>;
  searchFn: ReturnType<typeof useServerFn<typeof searchMessageRecipients>>;
}) {
  const [q, setQ] = useState("");
  const [recipient, setRecipient] = useState<{ user_id: string; label: string } | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data: candidates } = useQuery({
    queryKey: ["recipient-search", q],
    queryFn: () => searchFn({ data: { query: q, limit: 20 } }),
  });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { recipient_user_id: recipient!.user_id, subject, message_body: body } }),
    onSuccess: () => onSent(),
    onError: (e: any) => alert(e?.message ?? "تعذر الإرسال"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-auto" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="font-display text-xl font-bold text-primary">رسالة جديدة</h2>
          <button onClick={onClose} className="p-2 rounded hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div>
          <label className="text-xs font-bold text-primary">المستلم</label>
          {recipient ? (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 mt-1">
              <span className="text-sm">{recipient.label}</span>
              <button onClick={() => setRecipient(null)} className="text-xs text-destructive">تغيير</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم"
                className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm" />
              <div className="mt-2 max-h-40 overflow-auto rounded border border-border divide-y divide-border">
                {(candidates ?? []).map((c) => (
                  <button key={c.user_id} onClick={() => setRecipient(c)}
                    className="w-full text-right px-3 py-1.5 text-sm hover:bg-secondary flex justify-between">
                    <span>{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.group}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="الموضوع"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="نص الرسالة" rows={6}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">إلغاء</button>
          <button onClick={() => send.mutate()}
            disabled={send.isPending || !recipient || !subject.trim() || !body.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {send.isPending ? "جارٍ الإرسال…" : "إرسال"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================
// SEND LOG TAB
// ===================================================
function SendLogTab() {
  const listAuditFn = useServerFn(listCommunicationAuditLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["comm-audit"],
    queryFn: () => listAuditFn({ data: {} }),
  });

  if (isLoading) return <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data?.length) return <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">لا توجد أحداث.</div>;

  const ACTION_LABELS: Record<string, string> = {
    announcement_created: "إنشاء إعلان",
    announcement_updated: "تعديل إعلان",
    announcement_published: "نشر إعلان",
    announcement_archived: "أرشفة إعلان",
    message_sent: "إرسال رسالة",
    message_read: "قراءة رسالة",
  };

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border text-sm">
      {data.map((row: any) => (
        <div key={row.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-primary">{ACTION_LABELS[row.action_type] ?? row.action_type}</div>
            <div className="text-xs text-muted-foreground">{row.actor_role ?? "—"} • {new Date(row.created_at).toLocaleString("ar-EG")}</div>
            {row.new_values?.subject && <div className="text-xs text-muted-foreground mt-1">الموضوع: {row.new_values.subject}</div>}
            {row.new_values?.title_ar && <div className="text-xs text-muted-foreground mt-1">العنوان: {row.new_values.title_ar}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===================================================
// STATS TAB
// ===================================================
function StatsTab() {
  const listFn = useServerFn(listAnnouncementsAdmin);
  const statsFn = useServerFn(getAnnouncementStats);
  const { data } = useQuery({
    queryKey: ["stats-anns"],
    queryFn: () => listFn({ data: { page: 1, pageSize: 20, status: "active" } }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">قراءات الإعلانات النشطة (آخر 20):</p>
      <div className="grid gap-3 md:grid-cols-2">
        {(data?.rows ?? []).map((a: any) => <StatCard key={a.id} ann={a} fn={statsFn} />)}
        {data && data.rows.length === 0 && <div className="text-sm text-muted-foreground">لا توجد إعلانات نشطة.</div>}
      </div>
    </div>
  );
}

function StatCard({ ann, fn }: { ann: any; fn: ReturnType<typeof useServerFn<typeof getAnnouncementStats>> }) {
  const { data: s } = useQuery({
    queryKey: ["ann-stats", ann.id],
    queryFn: () => fn({ data: { id: ann.id } }),
  });
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="font-bold text-primary truncate">{ann.title_ar}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{AUDIENCE_LABELS[ann.target_audience]}</div>
      {!s ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" />
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Stat label="المستقبِلون" value={s.total_recipients} />
          <Stat label="قراءة" value={s.viewed} color="text-emerald-600" />
          <Stat label="غير مقروء" value={s.unread} color="text-amber-600" />
          <Stat label="النسبة" value={`${s.percentage}%`} color="text-primary" />
        </div>
      )}
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 p-2">
      <div className={cn("font-display text-xl font-extrabold", color ?? "text-primary")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
