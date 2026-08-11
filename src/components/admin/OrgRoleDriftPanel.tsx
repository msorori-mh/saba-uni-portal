import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { auditOrgRoleDrift, syncAllPositionRoles } from "@/lib/org-structure.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function OrgRoleDriftPanel() {
  const qc = useQueryClient();
  const auditFn = useServerFn(auditOrgRoleDrift);
  const syncFn = useServerFn(syncAllPositionRoles);

  const q = useQuery({ queryKey: ["org-role-drift"], queryFn: () => auditFn({ data: {} as any }) });

  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: {} as any }),
    onSuccess: (r: any) => {
      toast.success(`تمت المزامنة — أدوار ممنوحة: ${r?.granted ?? 0}`);
      qc.invalidateQueries({ queryKey: ["org-role-drift"] });
      qc.invalidateQueries({ queryKey: ["org-structure"] });
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّرت المزامنة"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">فحص تطابق المناصب مع الصلاحيات</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 ml-1 ${q.isFetching ? "animate-spin" : ""}`} /> إعادة الفحص
          </Button>
          <Button size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تصحيح تلقائي"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {q.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ الفحص…</div>}
        {q.error && (
          <div className="text-destructive">تعذّر الفحص: {(q.error as Error).message}</div>
        )}
        {q.data && (
          <>
            {q.data.missing.length === 0 && q.data.orphaned.length === 0 && (
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> لا توجد فروقات: كل شاغل منصب يملك أدوار منصبه.
              </div>
            )}
            {q.data.missing.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium text-amber-600">
                  <AlertTriangle className="h-4 w-4" /> شاغلون بلا الدور المطلوب ({q.data.missing.length})
                </div>
                {q.data.missing.map((m, i) => (
                  <div key={i} className="rounded border p-2">
                    {m.user_name} — {m.position_name} — ينقصه الدور <span className="font-mono">{m.role_code}</span>
                  </div>
                ))}
              </div>
            )}
            {q.data.orphaned.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> أدوار مشتقة بلا تعيين نشط ({q.data.orphaned.length})
                </div>
                {q.data.orphaned.map((m, i) => (
                  <div key={i} className="rounded border p-2">
                    {m.user_name} — <span className="font-mono">{m.role_code}</span>
                  </div>
                ))}
              </div>
            )}
            {q.data.vacantMapped.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <span className="text-muted-foreground">مناصب لها أدوار وبلا شاغل:</span>
                {q.data.vacantMapped.map((p) => (
                  <Badge key={p.position_id} variant="outline">{p.position_name}</Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
