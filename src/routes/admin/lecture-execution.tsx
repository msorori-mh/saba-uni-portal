import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { DeliveryMonitoringPanel } from "@/components/lecture-execution/DeliveryMonitoringPanel";

export const Route = createFileRoute("/admin/lecture-execution")({
  component: LectureExecutionOverviewPage,
});

function LectureExecutionOverviewPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-gold" aria-hidden /> متابعة تنفيذ المحاضرات
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مقارنة ما كان مخططاً تدريسه بما تم تسجيل تنفيذه فعلياً لكل مجموعة، مع أسباب عدم التنفيذ
          ومؤشرات الإنذار المبكر حسب الفترة.
        </p>
      </header>

      <DeliveryMonitoringPanel />
    </div>
  );
}
