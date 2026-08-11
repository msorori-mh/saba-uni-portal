import { Database, HardDrive, History, Layers, ShieldCheck } from "lucide-react";
import type { BackupOverview } from "@/lib/admin-backup-status.functions";
import { bucketLabel, formatBytes, formatDateTime, formatNumber } from "./backup-format";

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-lg font-extrabold text-primary">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function BackupMetricsPanel({ overview }: { overview: BackupOverview }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Database}
          label="حجم قاعدة البيانات"
          value={formatBytes(overview.databaseBytes)}
          hint={`${formatNumber(overview.publicTableCount)} جدولاً`}
        />
        <Metric
          icon={HardDrive}
          label="ملفات التخزين"
          value={formatBytes(overview.storageTotalBytes)}
          hint={`${formatNumber(overview.storageObjectCount)} ملفاً في ${formatNumber(overview.buckets.length)} حاويات`}
        />
        <Metric
          icon={Layers}
          label="آخر تحديث بنيوي مطبّق"
          value={overview.latestMigrationVersion ?? "—"}
          hint="رقم آخر migration في قاعدة الإنتاج"
        />
        <Metric
          icon={History}
          label="آخر نشاط مسجّل"
          value={formatDateTime(overview.lastAuditEventAt)}
          hint={`${formatNumber(overview.auditEventCount)} حدثاً في سجل التدقيق`}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> تغطية حاويات التخزين
        </h2>
        {overview.buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد ملفات مخزّنة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 font-medium">الحاوية</th>
                  <th className="py-2 font-medium">عدد الملفات</th>
                  <th className="py-2 font-medium">الحجم</th>
                  <th className="py-2 font-medium">آخر ملف مرفوع</th>
                </tr>
              </thead>
              <tbody>
                {overview.buckets.map((b) => (
                  <tr key={b.bucketId} className="border-b border-border/60">
                    <td className="py-2">
                      <div className="font-medium">{bucketLabel(b.bucketId)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{b.bucketId}</div>
                    </td>
                    <td className="py-2">{formatNumber(b.objectCount)}</td>
                    <td className="py-2">{formatBytes(b.totalBytes)}</td>
                    <td className="py-2 whitespace-nowrap">{formatDateTime(b.lastObjectAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
