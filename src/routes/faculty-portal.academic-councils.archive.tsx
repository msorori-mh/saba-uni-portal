import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Loader2, Search } from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { CouncilArchivedMeetingsList } from "@/components/councils/CouncilArchivedMeetingsList";
import { getMyCouncilMeetingsV2 } from "@/lib/faculty-councils.functions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ArchiveSearch = { q: string; council: string };

export const Route = createFileRoute("/faculty-portal/academic-councils/archive")({
  validateSearch: (search: Record<string, unknown>): ArchiveSearch => ({
    q: typeof search.q === "string" ? search.q : "",
    council: typeof search.council === "string" ? search.council : "all",
  }),
  head: () => ({
    meta: [
      { title: "الاجتماعات المؤرشفة — المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ArchivedMeetingsPage,
});

function ArchivedMeetingsPage() {
  const { q, council } = Route.useSearch();
  const navigate = useNavigate({ from: "/faculty-portal/academic-councils/archive" });

  const fetchMeetings = useServerFn(getMyCouncilMeetingsV2);
  const meetingsQuery = useQuery({
    queryKey: ["faculty", "my-council-meetings-v2"],
    queryFn: () => fetchMeetings(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const archived = useMemo(() => {
    const data = meetingsQuery.data;
    const all = [...(data?.upcomingMeetings ?? []), ...(data?.previousMeetings ?? [])];
    return all
      .filter((m) => m.status === "archived")
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  }, [meetingsQuery.data]);

  const councils = useMemo(() => {
    const map = new Map<string, string>();
    archived.forEach((m) => map.set(m.council_id, m.council_name));
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [archived]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return archived.filter((m) => {
      if (council !== "all" && m.council_id !== council) return false;
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
  }, [archived, q, council]);

  const setSearch = (patch: Partial<ArchiveSearch>) => {
    void navigate({ search: (prev) => ({ ...prev, ...patch }) });
  };

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
              جميع اجتماعات المجالس التي أُغلقت وأُرشفت، مع بحث سريع.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1.5" htmlFor="archive-search">
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
          {councils.length > 1 ? (
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
          ) : null}
        </div>

        {meetingsQuery.isLoading ? (
          <div className="grid place-items-center py-16" role="status" aria-label="جاري التحميل">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : archived.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            لا توجد اجتماعات مؤرشفة.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            لا نتائج مطابقة للبحث.
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
