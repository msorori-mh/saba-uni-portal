import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { CouncilArchivedMeetingsList } from "@/components/councils/CouncilArchivedMeetingsList";
import { getMyArchivedCouncilMeetings } from "@/lib/faculty-councils.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ArchiveSearch = {
  q: string;
  council: string;
  decisionFrom: string;
  decisionTo: string;
  approvedFrom: string;
  approvedTo: string;
  page: number;
  pageSize: number;
};

const PAGE_SIZES = [5, 10, 20, 50] as const;

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number, min: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};

export const Route = createFileRoute("/faculty-portal/academic-councils/archive")({
  validateSearch: (search: Record<string, unknown>): ArchiveSearch => ({
    q: str(search.q),
    council: str(search.council, "all") || "all",
    decisionFrom: str(search.decisionFrom),
    decisionTo: str(search.decisionTo),
    approvedFrom: str(search.approvedFrom),
    approvedTo: str(search.approvedTo),
    page: num(search.page, 1, 1),
    pageSize: PAGE_SIZES.includes(num(search.pageSize, 10, 1) as (typeof PAGE_SIZES)[number])
      ? num(search.pageSize, 10, 1)
      : 10,
  }),
  head: () => ({
    meta: [
      { title: "الاجتماعات المؤرشفة — المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ArchivedMeetingsPage,
});


/** Compares an ISO timestamp against an inclusive yyyy-mm-dd range. */
function inDateRange(iso: string | null, from: string, to: string) {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function ArchivedMeetingsPage() {
  const search = Route.useSearch();
  const { q, council, decisionFrom, decisionTo, approvedFrom, approvedTo, page, pageSize } =
    search;

  const navigate = useNavigate({ from: "/faculty-portal/academic-councils/archive" });

  const fetchArchived = useServerFn(getMyArchivedCouncilMeetings);
  const archivedQuery = useQuery({
    queryKey: ["faculty", "archived-council-meetings"],
    queryFn: () => fetchArchived(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const archived = archivedQuery.data?.meetings ?? [];

  const councils = useMemo(() => {
    const map = new Map<string, string>();
    archived.forEach((m) => map.set(m.council_id, m.council_name));
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [archived]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return archived.filter((m) => {
      if (council !== "all" && m.council_id !== council) return false;
      if (!inDateRange(m.last_decision_at, decisionFrom, decisionTo)) return false;
      if (!inDateRange(m.minutes_approved_at, approvedFrom, approvedTo)) return false;
      if (!needle) return true;
      const haystack = [
        String(m.meeting_number ?? ""),
        m.meeting_title ?? "",
        m.council_name ?? "",
        m.location ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [archived, q, council, decisionFrom, decisionTo, approvedFrom, approvedTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  const setSearch = (patch: Partial<ArchiveSearch>) => {
    // أي تغيير في الفلاتر يعيد الترقيم إلى الصفحة الأولى
    const next: Partial<ArchiveSearch> = { page: 1, ...patch };
    void navigate({ search: (prev) => ({ ...prev, ...next }) });
  };

  const goToPage = (target: number) => {
    void navigate({
      search: (prev) => ({ ...prev, page: Math.min(Math.max(1, target), totalPages) }),
    });
  };


  const hasFilters =
    q !== "" ||
    council !== "all" ||
    decisionFrom !== "" ||
    decisionTo !== "" ||
    approvedFrom !== "" ||
    approvedTo !== "";

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[
        { label: "المجالس الأكاديمية", to: "/faculty-portal/academic-councils" },
        { label: "الاجتماعات المؤرشفة" },
      ]}
    >
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6" dir="rtl">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <Archive className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">
              الاجتماعات المؤرشفة
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              جميع اجتماعات المجالس التي أُغلقت وأُرشفت، مع بحث سريع وفلترة.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                className="text-xs text-muted-foreground block mb-1.5"
                htmlFor="archive-search"
              >
                بحث سريع
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="archive-search"
                  value={q}
                  onChange={(e) => setSearch({ q: e.target.value })}
                  placeholder="رقم الاجتماع أو العنوان أو المجلس أو المكان"
                  className="pe-9"
                />
              </div>
            </div>
            <div className="sm:w-64">
              <label className="text-xs text-muted-foreground block mb-1.5">المجلس</label>
              <Select
                value={council}
                onValueChange={(value) => setSearch({ council: value })}
                dir="rtl"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل المجالس</SelectItem>
                  {councils.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                className="text-xs text-muted-foreground block mb-1.5"
                htmlFor="decision-from"
              >
                تاريخ القرار — من
              </label>
              <Input
                id="decision-from"
                type="date"
                value={decisionFrom}
                onChange={(e) => setSearch({ decisionFrom: e.target.value })}
              />
            </div>
            <div>
              <label
                className="text-xs text-muted-foreground block mb-1.5"
                htmlFor="decision-to"
              >
                تاريخ القرار — إلى
              </label>
              <Input
                id="decision-to"
                type="date"
                value={decisionTo}
                onChange={(e) => setSearch({ decisionTo: e.target.value })}
              />
            </div>
            <div>
              <label
                className="text-xs text-muted-foreground block mb-1.5"
                htmlFor="approved-from"
              >
                تاريخ الاعتماد — من
              </label>
              <Input
                id="approved-from"
                type="date"
                value={approvedFrom}
                onChange={(e) => setSearch({ approvedFrom: e.target.value })}
              />
            </div>
            <div>
              <label
                className="text-xs text-muted-foreground block mb-1.5"
                htmlFor="approved-to"
              >
                تاريخ الاعتماد — إلى
              </label>
              <Input
                id="approved-to"
                type="date"
                value={approvedTo}
                onChange={(e) => setSearch({ approvedTo: e.target.value })}
              />
            </div>
          </div>

          {hasFilters ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSearch({
                    q: "",
                    council: "all",
                    decisionFrom: "",
                    decisionTo: "",
                    approvedFrom: "",
                    approvedTo: "",
                  })
                }
              >
                <X className="h-4 w-4" aria-hidden />
                مسح الفلاتر
              </Button>
            </div>
          ) : null}
        </div>

        {archivedQuery.isLoading ? (
          <div className="grid place-items-center py-16" role="status" aria-label="جاري التحميل">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : archived.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            لا توجد اجتماعات مؤرشفة.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            لا نتائج مطابقة للفلاتر المحددة.
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              عدد النتائج: {filtered.length} من {archived.length}
            </p>
            <CouncilArchivedMeetingsList meetings={filtered} />
          </>
        )}
      </main>
    </FacultyPortalShell>
  );
}
