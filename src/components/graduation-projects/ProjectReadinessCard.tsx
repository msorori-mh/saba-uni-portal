import type { DiscussionReadiness } from "@/lib/graduation-projects/domain";
import { assessDiscussionReadiness } from "@/lib/graduation-projects/domain";
import { READINESS_BLOCKER_LABELS } from "@/lib/graduation-projects/lifecycle";

export function ProjectReadinessCard({ input }: { input: DiscussionReadiness }) {
  const result = assessDiscussionReadiness(input);
  return (
    <section dir="rtl" aria-labelledby="project-readiness-title" className="rounded-lg border p-4">
      <h3 id="project-readiness-title" className="font-semibold">
        جاهزية المناقشة
      </h3>
      <p className={result.ready ? "text-green-700" : "text-amber-700"}>
        {result.ready ? "جاهز لطلب المناقشة" : "غير جاهز"}
      </p>
      {result.blockers.length > 0 && (
        <ul className="mt-2 list-disc ps-5" aria-label="عوائق الجاهزية">
          {result.blockers.map((blocker) => (
            <li key={blocker}>{READINESS_BLOCKER_LABELS[blocker] ?? blocker}</li>
          ))}
        </ul>
      )}
      {result.atRisk && <p className="mt-2 text-red-700">يوجد تأخر في مرحلة واحدة أو أكثر.</p>}
    </section>
  );
}
