import type {
  CouncilAuditCapabilityKey,
  CouncilAuthorizationAuditReport,
} from "@/lib/councils-authorization-audit.functions";
import { CAPABILITY_LABELS } from "@/lib/councils-authorization-audit.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Minus, ShieldAlert, ShieldCheck, X } from "lucide-react";

const CAPABILITY_KEYS: CouncilAuditCapabilityKey[] = [
  "can_manage_council",
  "can_schedule_council_meeting",
  "can_write_council_agenda",
  "can_submit_council_topic",
  "quorum_eligible",
];

function CapabilityCell({
  value,
  mismatched,
}: {
  value: boolean | null;
  mismatched: boolean;
}) {
  return (
    <td className="px-3 py-2 text-center">
      <span
        className={
          mismatched
            ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive/15 text-destructive"
            : "inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground"
        }
      >
        {value === null ? (
          <Minus className="h-4 w-4" aria-label="غير متاح" />
        ) : value ? (
          <Check className="h-4 w-4 text-primary" aria-label="مسموح" />
        ) : (
          <X className="h-4 w-4" aria-label="ممنوع" />
        )}
      </span>
    </td>
  );
}

export function CouncilAuthorizationMatrixPanel({
  report,
}: {
  report: CouncilAuthorizationAuditReport;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {report.verdict === "PASS" ? (
              <ShieldCheck className="h-5 w-5 text-primary" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
            نتيجة الفحص:{" "}
            {report.verdict === "PASS"
              ? "السياسات متطابقة في جميع المجالس"
              : "توجد فروقات تحتاج مراجعة"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">عدد المقارنات</p>
            <p className="font-semibold">{report.totalChecks}</p>
          </div>
          <div>
            <p className="text-muted-foreground">الفروقات</p>
            <p className="font-semibold">{report.mismatchCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">أدوار غير معيّنة</p>
            <p className="font-semibold">{report.unassignedRoleCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">وقت الفحص</p>
            <p className="font-semibold">
              {new Date(report.generatedAt).toLocaleString("ar-EG")}
            </p>
          </div>
        </CardContent>
      </Card>

      {report.councils.map((council) => (
        <Card key={council.councilId}>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {council.councilName}
              {council.isBaseline ? (
                <Badge variant="secondary">المرجع للمقارنة</Badge>
              ) : null}
              <Badge variant={council.hasApprovedQuorumPolicy ? "outline" : "destructive"}>
                {council.hasApprovedQuorumPolicy
                  ? "سياسة نصاب معتمدة"
                  : "لا توجد سياسة نصاب معتمدة"}
              </Badge>
              <Badge variant="outline">أعضاء فعّالون: {council.activeMemberCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-right font-medium">الدور</th>
                  {CAPABILITY_KEYS.map((key) => (
                    <th key={key} className="px-3 py-2 text-center font-medium">
                      {CAPABILITY_LABELS[key]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-medium">المطابقة</th>
                </tr>
              </thead>
              <tbody>
                {council.roles.map((roleResult) => (
                  <tr key={roleResult.role} className="border-b last:border-b-0">
                    <td className="px-3 py-2 text-right">
                      <p className="font-medium">{roleResult.roleLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {roleResult.assigned
                          ? roleResult.actorName || "مستخدم بدون اسم مسجّل"
                          : "غير معيّن في هذا المجلس"}
                      </p>
                    </td>
                    {CAPABILITY_KEYS.map((key) => (
                      <CapabilityCell
                        key={key}
                        value={roleResult.capabilities[key]}
                        mismatched={roleResult.mismatchedCapabilities.includes(key)}
                      />
                    ))}
                    <td className="px-3 py-2 text-center">
                      {roleResult.parity === "baseline" ? (
                        <Badge variant="secondary">مرجع</Badge>
                      ) : roleResult.parity === "match" ? (
                        <Badge variant="outline">مطابق</Badge>
                      ) : roleResult.parity === "mismatch" ? (
                        <Badge variant="destructive">مختلف</Badge>
                      ) : (
                        <Badge variant="outline">غير قابل للمقارنة</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
