import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BACKUP_CHECK_KINDS,
  BACKUP_RESULTS,
  listBackupVerifications,
  recordBackupVerification,
  type BackupCheckKind,
  type BackupResult,
} from "@/lib/admin-backup-status.functions";
import {
  CHECKLIST_ITEMS,
  checkKindLabel,
  formatDateTime,
  resultLabel,
  resultTone,
} from "./backup-format";

export function BackupVerificationLog() {
  const listFn = useServerFn(listBackupVerifications);
  const recordFn = useServerFn(recordBackupVerification);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filterResult, setFilterResult] = useState<string>("");

  const [checkKind, setCheckKind] = useState<BackupCheckKind>("backup_snapshot");
  const [result, setResult] = useState<BackupResult>("pass");
  const [rto, setRto] = useState("");
  const [rpo, setRpo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<string[]>([]);

  const logQ = useQuery({
    queryKey: ["backup-verifications"],
    queryFn: () => listFn({ data: { limit: 100 } }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      recordFn({
        data: {
          checkKind,
          result,
          observedRtoMinutes: rto === "" ? null : Number(rto),
          observedRpoMinutes: rpo === "" ? null : Number(rpo),
          checklistItems: items,
          notes,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setNotes("");
      setRto("");
      setRpo("");
      setItems([]);
      queryClient.invalidateQueries({ queryKey: ["backup-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["backup-overview"] });
    },
  });

  const rows = useMemo(
    () => (logQ.data ?? []).filter((r) => !filterResult || r.result === filterResult),
    [logQ.data, filterResult],
  );

  const lastByItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of [...(logQ.data ?? [])].reverse()) {
      for (const item of row.checklistItems) map.set(item, row.verifiedAt);
    }
    return map;
  }, [logQ.data]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-4">قائمة فحص الاسترجاع</h2>
        <ol className="space-y-3 text-sm">
          {CHECKLIST_ITEMS.map((item, index) => {
            const at = lastByItem.get(item.id);
            return (
              <li key={item.id} className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-extrabold">
                  {index + 1}
                </span>
                <div className="flex-1 leading-7">
                  <span>{item.label}</span>
                  <span className="mr-2 text-xs text-muted-foreground">
                    {at ? `آخر تحقق: ${formatDateTime(at)}` : "لم يُسجَّل بعد"}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-primary">سجل التحقق اليدوي</h2>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              aria-label="تصفية حسب النتيجة"
            >
              <option value="">كل النتائج</option>
              {BACKUP_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {resultLabel(r)}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setOpen((v) => !v)}>
              <Plus className="h-4 w-4 ml-1" /> تسجيل تحقق
            </Button>
          </div>
        </div>

        {open && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>نوع الفحص</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={checkKind}
                  onChange={(e) => setCheckKind(e.target.value as BackupCheckKind)}
                >
                  {BACKUP_CHECK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {checkKindLabel(k)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>النتيجة</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={result}
                  onChange={(e) => setResult(e.target.value as BackupResult)}
                >
                  {BACKUP_RESULTS.map((r) => (
                    <option key={r} value={r}>
                      {resultLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>زمن الاستعادة المرصود RTO (دقيقة)</Label>
                <Input
                  type="number"
                  min={0}
                  value={rto}
                  onChange={(e) => setRto(e.target.value)}
                  placeholder="مثال: 45"
                />
              </div>
              <div className="space-y-1.5">
                <Label>حد فقد البيانات المرصود RPO (دقيقة)</Label>
                <Input
                  type="number"
                  min={0}
                  value={rpo}
                  onChange={(e) => setRpo(e.target.value)}
                  placeholder="مثال: 15"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>بنود قائمة الفحص المنجزة</Label>
              <div className="grid gap-2 md:grid-cols-2">
                {CHECKLIST_ITEMS.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={items.includes(item.id)}
                      onChange={(e) =>
                        setItems((prev) =>
                          e.target.checked ? [...prev, item.id] : prev.filter((i) => i !== item.id),
                        )
                      }
                    />
                    <span className="leading-6">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="تفاصيل ما تم التحقق منه، ومصدر التأكيد."
              />
            </div>

            {mutation.isError && (
              <p className="text-sm text-destructive">
                {(mutation.error as Error)?.message ?? "تعذّر حفظ السجل"}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                حفظ السجل
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              السجل تراكمي ولا يمكن تعديله أو حذفه بعد الحفظ.
            </p>
          </div>
        )}

        {logQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد عمليات تحقق مسجّلة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 font-medium">التاريخ</th>
                  <th className="py-2 font-medium">نوع الفحص</th>
                  <th className="py-2 font-medium">النتيجة</th>
                  <th className="py-2 font-medium">RTO</th>
                  <th className="py-2 font-medium">RPO</th>
                  <th className="py-2 font-medium">المسؤول</th>
                  <th className="py-2 font-medium">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2 whitespace-nowrap">{formatDateTime(row.verifiedAt)}</td>
                    <td className="py-2">{checkKindLabel(row.checkKind)}</td>
                    <td className="py-2">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs ${resultTone(row.result)}`}
                      >
                        {resultLabel(row.result)}
                      </span>
                    </td>
                    <td className="py-2">
                      {row.observedRtoMinutes === null ? "—" : `${row.observedRtoMinutes} د`}
                    </td>
                    <td className="py-2">
                      {row.observedRpoMinutes === null ? "—" : `${row.observedRpoMinutes} د`}
                    </td>
                    <td className="py-2">{row.performedByName ?? "—"}</td>
                    <td className="py-2 max-w-[24rem] text-muted-foreground">{row.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
