import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ScrollText, Users2, CalendarClock, FilePlus2, ListChecks, FileText,
  ClipboardCheck, Archive, Bell, Info, Lock, LayoutDashboard, BarChart3,
  AlertTriangle, ArrowRight, Loader2, UserPlus, UserMinus, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getCouncilsSummary,
  getCouncilMemberships,
  searchAcademicsForCouncilLink,
  linkAcademicToCouncil,
  deactivateCouncilMembership,
  COUNCIL_LINK_MEMBER_ROLES,
  type CouncilsSummary,
  type CouncilsOverviewItem,
  type CouncilMembershipItem,
  type AcademicLinkCandidate,
  type CouncilLinkMemberRole,
} from "@/lib/admin-councils.functions";

export const Route = createFileRoute("/admin/academic-councils")({
  head: () => ({
    meta: [
      { title: "بوابة إدارة المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcademicCouncilsPage,
});

// ============================================================================
// SHARED UI PIECES
// ============================================================================

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  id,
  sectionRef,
}: {
  icon: typeof ScrollText;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  id?: string;
  sectionRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section
      id={id}
      ref={sectionRef}
      className="rounded-xl border border-border bg-card shadow-card"
    >
      <header className="flex items-start gap-3 border-b border-border/60 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-primary">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LockedAction({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled className="gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        {label}
      </Button>
      <span className="text-[11px] text-muted-foreground">
        {hint ?? "سيتاح بعد اكتمال اعتماد صلاحيات الكتابة على بوابة المجالس."}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

const MEMBER_ROLE_LABELS: Record<CouncilLinkMemberRole, string> = {
  chair: "رئيس المجلس",
  secretary: "أمين السر",
  member: "عضو",
  viewer: "مطّلع",
};

const RLS_USER_MESSAGE =
  "تعذر تنفيذ العملية بسبب قيود الصلاحيات الحالية. قد تتطلب هذه العملية تفعيل صلاحيات إضافية من قاعدة البيانات.";

function mapMembershipError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("صلاحياتك على هذا المجلس") ||
    lower.includes("policy") ||
    lower.includes("permission denied") ||
    lower.includes("row-level security")
  ) {
    return RLS_USER_MESSAGE;
  }
  return message;
}

// ============================================================================
// MEMBERSHIP ADMIN
// ============================================================================

function CouncilMembershipPanel({
  council,
}: {
  council: CouncilsOverviewItem;
}) {
  const qc = useQueryClient();
  const fetchMemberships = useServerFn(getCouncilMemberships);
  const searchAcademics = useServerFn(searchAcademicsForCouncilLink);
  const linkMember = useServerFn(linkAcademicToCouncil);
  const deactivateMember = useServerFn(deactivateCouncilMembership);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<AcademicLinkCandidate | null>(null);
  const [linkRole, setLinkRole] = useState<CouncilLinkMemberRole>("member");
  const [linkBusy, setLinkBusy] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<CouncilMembershipItem | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  const trimmedSearch = searchQuery.trim();
  const searchEnabled = trimmedSearch.length >= 2;

  const {
    data: memberships = [],
    isLoading: membershipsLoading,
    isError: membershipsError,
  } = useQuery({
    queryKey: ["admin", "academic-councils", "memberships", council.id],
    queryFn: () => fetchMemberships({ data: { councilId: council.id } }),
    staleTime: 15_000,
  });

  const {
    data: searchResults = [],
    isLoading: searchLoading,
    isError: searchError,
  } = useQuery({
    queryKey: ["admin", "academic-councils", "academic-search", trimmedSearch],
    queryFn: () => searchAcademics({ data: { query: trimmedSearch } }),
    enabled: searchEnabled,
    staleTime: 10_000,
  });

  const activeUserIds = useMemo(
    () => new Set(memberships.filter((m) => m.is_active).map((m) => m.user_id)),
    [memberships],
  );

  const refreshMemberships = () => {
    qc.invalidateQueries({ queryKey: ["admin", "academic-councils", "memberships", council.id] });
    qc.invalidateQueries({ queryKey: ["admin", "academic-councils", "summary"] });
  };

  const handleLink = async () => {
    if (!selectedCandidate) {
      toast.error("اختر أكاديمياً من نتائج البحث أولاً");
      return;
    }
    if (activeUserIds.has(selectedCandidate.user_id)) {
      toast.error("هذا الأكاديمي عضو فعّال في المجلس بالفعل");
      return;
    }
    setLinkBusy(true);
    try {
      await linkMember({
        data: {
          councilId: council.id,
          facultyProfileId: selectedCandidate.faculty_profile_id,
          role: linkRole,
        },
      });
      toast.success("تم ربط العضو بالمجلس بنجاح");
      setSelectedCandidate(null);
      setSearchQuery("");
      refreshMemberships();
    } catch (e) {
      toast.error(mapMembershipError(e instanceof Error ? e.message : "تعذر ربط العضو"));
    } finally {
      setLinkBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivateBusy(true);
    try {
      await deactivateMember({ data: { membershipId: deactivateTarget.id } });
      toast.success("تم تعطيل العضوية بنجاح");
      setDeactivateTarget(null);
      refreshMemberships();
    } catch (e) {
      toast.error(mapMembershipError(e instanceof Error ? e.message : "تعذر تعطيل العضوية"));
    } finally {
      setDeactivateBusy(false);
    }
  };

  const alreadyActive =
    selectedCandidate !== null && activeUserIds.has(selectedCandidate.user_id);

  return (
    <div className="space-y-4">
      {/* Link form */}
      <div className="rounded-lg border-2 border-primary/20 bg-background p-4 space-y-3">
        <div className="font-bold text-primary text-base flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          إضافة عضو إلى المجلس — {council.name}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">
            ابحث باسم عضو هيئة التدريس أو البريد أو الرقم الأكاديمي
          </label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCandidate(null);
              }}
              placeholder="ابحث باسم عضو هيئة التدريس أو البريد أو الرقم الأكاديمي"
              className="pr-9"
              dir="rtl"
            />
          </div>
        </div>

        {!searchEnabled && trimmedSearch.length > 0 ? (
          <p className="text-xs text-muted-foreground">أدخل حرفين على الأقل لبدء البحث.</p>
        ) : null}

        {searchEnabled ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 min-h-[4rem]">
            {searchLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري البحث…
              </div>
            ) : searchError ? (
              <p className="text-xs text-destructive">تعذر البحث حالياً. حاول مرة أخرى.</p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد نتائج مطابقة.</p>
            ) : (
              <ul className="space-y-2">
                {searchResults.map((hit) => {
                  const selected = selectedCandidate?.faculty_profile_id === hit.faculty_profile_id;
                  const isActiveMember = activeUserIds.has(hit.user_id);
                  return (
                    <li key={hit.faculty_profile_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedCandidate(hit)}
                        className={`w-full text-right rounded-md border p-2 text-xs transition-colors ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:bg-muted/40"
                        }`}
                      >
                        <div className="font-bold text-primary">{hit.name}</div>
                        <div className="mt-0.5 text-muted-foreground">
                          {hit.email ?? "—"} · الرقم: {hit.employee_number ?? "—"}
                        </div>
                        {isActiveMember ? (
                          <div className="mt-1 text-amber-700">عضو فعّال في هذا المجلس مسبقاً</div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {selectedCandidate ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">دور العضوية</label>
              <Select
                value={linkRole}
                onValueChange={(v) => setLinkRole(v as CouncilLinkMemberRole)}
              >
                <SelectTrigger dir="rtl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {COUNCIL_LINK_MEMBER_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {MEMBER_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                className="w-full gap-1.5"
                disabled={linkBusy || alreadyActive}
                onClick={handleLink}
              >
                {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                حفظ العضوية
              </Button>
            </div>
          </div>
        ) : null}

        {alreadyActive ? (
          <p className="text-xs text-amber-700">
            لا يمكن الربط: الأكاديمي المختار عضو فعّال في هذا المجلس.
          </p>
        ) : null}
      </div>

      {/* Membership list */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/30 px-3 py-2 text-xs font-bold text-primary border-b border-border">
          عضويات المجلس
        </div>
        {membershipsLoading ? (
          <div className="p-6 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : membershipsError ? (
          <div className="p-4 text-xs text-destructive">
            تعذر تحميل العضويات. قد تتطلب صلاحيات إضافية على هذا المجلس.
          </div>
        ) : memberships.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            لا توجد عضويات مرتبطة بهذا المجلس حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">الاسم</th>
                  <th className="p-2 font-medium">البريد</th>
                  <th className="p-2 font-medium">الرقم الأكاديمي</th>
                  <th className="p-2 font-medium">الدور</th>
                  <th className="p-2 font-medium">الحالة</th>
                  <th className="p-2 font-medium">بداية العضوية</th>
                  <th className="p-2 font-medium">تاريخ التعطيل</th>
                  <th className="p-2 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={m.id} className="border-t border-border/60">
                    <td className="p-2 font-medium text-primary">{m.name}</td>
                    <td className="p-2 text-muted-foreground" dir="ltr">{m.email ?? "—"}</td>
                    <td className="p-2 font-mono">{m.employee_number ?? "—"}</td>
                    <td className="p-2">
                      {MEMBER_ROLE_LABELS[m.member_role as CouncilLinkMemberRole] ?? m.member_role}
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={m.is_active ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {m.is_active ? "فعّالة" : "غير فعّالة"}
                      </Badge>
                    </td>
                    <td className="p-2">{formatDateOnly(m.active_from)}</td>
                    <td className="p-2">{m.active_to ? formatDateOnly(m.active_to) : "—"}</td>
                    <td className="p-2">
                      {m.is_active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/5"
                          onClick={() => setDeactivateTarget(m)}
                        >
                          <UserMinus className="h-3 w-3" />
                          تعطيل
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => !open && !deactivateBusy && setDeactivateTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تعطيل العضوية</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من تعطيل هذه العضوية؟ لن يتم حذف السجل، ويمكن الرجوع إليه لاحقاً.
              {deactivateTarget ? (
                <span className="mt-2 block font-medium text-foreground">
                  {deactivateTarget.name}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivateBusy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivateBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleDeactivate();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deactivateBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "تعطيل العضوية"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CouncilPickerRow({
  council,
  selected,
  onSelect,
  onManageMembership,
}: {
  council: CouncilsOverviewItem;
  selected: boolean;
  onSelect: () => void;
  onManageMembership: () => void;
}) {
  return (
    <li
      className={`rounded-lg border p-3 transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-background"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 min-w-0 text-right hover:opacity-90 transition-opacity"
        >
          <div className="font-bold text-primary text-sm">{council.name}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            الأعضاء: {council.members_count} · الاجتماع القادم: {formatDateTime(council.next_meeting_at)}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={council.is_active ? "secondary" : "outline"} className="text-[11px]">
            {council.is_active ? "مفعّل" : "غير مفعّل"}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            className="gap-1.5 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onManageMembership();
            }}
          >
            <Users2 className="h-3.5 w-3.5" />
            إدارة العضويات
          </Button>
        </div>
      </div>
    </li>
  );
}

// ============================================================================
// PAGE
// ============================================================================

const EMPTY_SUMMARY: CouncilsSummary = {
  councils: [],
  kpis: {
    upcoming_meetings: 0,
    submitted_topics: 0,
    open_decisions: 0,
    overdue_decisions: 0,
  },
  agenda_stages: { draft: 0, under_review: 0, approved: 0, deferred: 0 },
  upcoming_meetings: [],
};

function AcademicCouncilsPage() {
  const fetchSummary = useServerFn(getCouncilsSummary);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "academic-councils", "summary"],
    queryFn: () => fetchSummary(),
    staleTime: 30_000,
  });

  const summary: CouncilsSummary = data ?? EMPTY_SUMMARY;
  const collegeCouncils = summary.councils.filter((c) => c.council_type === "college");
  const departmentCouncils = summary.councils.filter((c) => c.council_type === "department");
  const allCouncils = summary.councils;

  const [selectedCouncilId, setSelectedCouncilId] = useState<string | null>(null);
  const [pendingMembershipFocus, setPendingMembershipFocus] = useState(false);
  const membershipPanelRef = useRef<HTMLElement>(null);
  const selectedCouncil = useMemo(
    () => allCouncils.find((c) => c.id === selectedCouncilId) ?? null,
    [allCouncils, selectedCouncilId],
  );

  const selectCouncil = (id: string) => setSelectedCouncilId(id);

  const selectCouncilAndFocusMembership = (id: string) => {
    setSelectedCouncilId(id);
    setPendingMembershipFocus(true);
  };

  useEffect(() => {
    if (!isLoading && allCouncils.length === 1 && selectedCouncilId === null) {
      setSelectedCouncilId(allCouncils[0].id);
    }
  }, [isLoading, allCouncils, selectedCouncilId]);

  useEffect(() => {
    if (!pendingMembershipFocus || !selectedCouncilId) return;
    setPendingMembershipFocus(false);
    const panel = membershipPanelRef.current;
    if (!panel) return;
    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [pendingMembershipFocus, selectedCouncilId]);

  const kpis = [
    { label: "الاجتماعات القادمة", value: summary.kpis.upcoming_meetings, icon: CalendarClock },
    { label: "الموضوعات المرفوعة", value: summary.kpis.submitted_topics, icon: FilePlus2 },
    { label: "القرارات قيد المتابعة", value: summary.kpis.open_decisions, icon: ClipboardCheck },
    { label: "القرارات المتأخرة", value: summary.kpis.overdue_decisions, icon: AlertTriangle },
  ] as const;

  const agendaStages = [
    { label: "دراسة المقترح", count: summary.agenda_stages.draft },
    { label: "قيد المراجعة", count: summary.agenda_stages.under_review },
    { label: "معتمد على جدول الأعمال", count: summary.agenda_stages.approved },
    { label: "مؤجَّل", count: summary.agenda_stages.deferred },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold-gradient text-primary-deep shrink-0">
          <ScrollText className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-primary">
              بوابة إدارة المجالس الأكاديمية
            </h1>
            <Badge variant="outline" className="border-emerald-400 bg-emerald-50 text-emerald-800">
              عضويات مفعّلة
            </Badge>
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              باقي الوظائف — قراءة فقط
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
            بوابة رقمية متخصصة لإدارة مجالس الكلية ومجالس الأقسام، تشمل جدولة الاجتماعات،
            استقبال الموضوعات، إعداد جداول الأعمال، توثيق المحاضر والقرارات، متابعة تنفيذ
            التوصيات، وأرشفة أعمال المجالس وفق صلاحيات مؤسسية دقيقة.
          </p>
        </div>
      </div>

      {/* Notice */}
      <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 flex items-start gap-3 text-emerald-900">
        <Info className="h-5 w-5 shrink-0 mt-0.5 text-emerald-700" />
        <div className="text-sm">
          <div className="font-bold">إدارة العضويات مفعّلة</div>
          <div className="mt-0.5 leading-relaxed">
            يمكنك اختيار مجلس وإدارة عضوياته (بحث، ربط، تعطيل دون حذف). عمليات الاجتماعات
            والموضوعات والقرارات والتنبيهات لا تزال في وضع القراءة فقط.
          </div>
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          تعذّر تحميل بيانات المجالس حالياً. يرجى إعادة المحاولة لاحقاً.
        </div>
      ) : null}

      {/* KPI strip */}
      <SectionCard
        icon={BarChart3}
        title="لوحة المجالس"
        subtitle="مؤشرات مباشرة من قاعدة بيانات المجالس."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <k.icon className="h-4 w-4" />
                <span className="text-xs">{k.label}</span>
              </div>
              <div className="mt-1 font-bold text-primary">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : k.value}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* College + department councils overview */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={Users2}
          title="مجلس الكلية"
          subtitle="مجلس واحد على مستوى الكلية."
        >
          {isLoading ? (
            <EmptyState text="جاري تحميل بيانات مجلس الكلية…" />
          ) : collegeCouncils.length === 0 ? (
            <EmptyState text="لا يوجد مجلس كلية مفعّل حالياً." />
          ) : (
            <ul className="space-y-2">
              {collegeCouncils.map((c) => (
                <CouncilPickerRow
                  key={c.id}
                  council={c}
                  selected={selectedCouncilId === c.id}
                  onSelect={() => selectCouncil(c.id)}
                  onManageMembership={() => selectCouncilAndFocusMembership(c.id)}
                />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={Users2}
          title="مجالس الأقسام"
          subtitle="مجلس لكل قسم أكاديمي داخل الكلية."
        >
          {isLoading ? (
            <EmptyState text="جاري تحميل بيانات مجالس الأقسام…" />
          ) : departmentCouncils.length === 0 ? (
            <EmptyState text="لا توجد مجالس أقسام مفعّلة حالياً." />
          ) : (
            <ul className="space-y-2">
              {departmentCouncils.map((c) => (
                <CouncilPickerRow
                  key={c.id}
                  council={c}
                  selected={selectedCouncilId === c.id}
                  onSelect={() => selectCouncil(c.id)}
                  onManageMembership={() => selectCouncilAndFocusMembership(c.id)}
                />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Membership administration */}
      <SectionCard
        id="council-membership-panel"
        sectionRef={membershipPanelRef}
        icon={Users2}
        title="إدارة عضويات المجلس"
        subtitle="أضف أعضاء هيئة التدريس إلى المجلس، أو عطّل العضويات دون حذف."
      >
        {selectedCouncil ? (
          <p className="mb-4 text-xs text-muted-foreground">
            المجلس المحدد: <span className="font-bold text-primary">{selectedCouncil.name}</span>
          </p>
        ) : null}
        {!selectedCouncil ? (
          <div className="rounded-lg border border-dashed border-amber-300/60 bg-amber-50/50 p-6 text-center space-y-3">
            <p className="text-sm text-foreground font-medium">
              اضغط على بطاقة مجلس الكلية أو زر «إدارة العضويات» للبدء.
            </p>
            <p className="text-xs text-muted-foreground">
              بعد اختيار المجلس ستظهر: البحث عن الأكاديمي، اختيار الدور، وزر «حفظ العضوية».
            </p>
          </div>
        ) : (
          <CouncilMembershipPanel council={selectedCouncil} />
        )}
      </SectionCard>

      {/* Upcoming meetings */}
      <SectionCard
        icon={CalendarClock}
        title="الاجتماعات القادمة"
        subtitle="أقرب خمسة اجتماعات مجدولة."
      >
        {isLoading ? (
          <EmptyState text="جاري تحميل الاجتماعات…" />
        ) : summary.upcoming_meetings.length === 0 ? (
          <EmptyState text="لا توجد اجتماعات مجدولة حالياً." />
        ) : (
          <ul className="space-y-2">
            {summary.upcoming_meetings.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3"
              >
                <div>
                  <div className="font-bold text-primary text-sm">{m.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {m.council_name} · الموعد: {formatDateTime(m.scheduled_at)} ·
                    المكان: {m.location ?? "—"}
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px]">مجدول</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <LockedAction label="إنشاء اجتماع" />
        </div>
      </SectionCard>

      {/* Submit topic */}
      <SectionCard
        icon={FilePlus2}
        title="رفع موضوع جديد"
        subtitle="استقبال الموضوعات المقترحة للإدراج في جدول الأعمال."
      >
        <EmptyState text="نموذج رفع الموضوع سيتاح بعد اعتماد مرحلة الكتابة." />
        <div className="mt-4">
          <LockedAction label="رفع موضوع جديد" />
        </div>
      </SectionCard>

      {/* Agenda stages */}
      <SectionCard
        icon={ListChecks}
        title="جدول الأعمال"
        subtitle="توزيع الموضوعات على مراحل جدول الأعمال."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agendaStages.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-bold text-primary">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : s.count}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <LockedAction label="اعتماد جدول أعمال" />
        </div>
      </SectionCard>

      {/* Minutes & decisions */}
      <SectionCard
        icon={FileText}
        title="المحاضر والقرارات"
        subtitle="توثيق المحاضر واعتماد القرارات رسمياً."
      >
        <EmptyState text="لا توجد محاضر أو قرارات لعرضها حالياً." />
        <div className="mt-4">
          <LockedAction label="إصدار قرار" />
        </div>
      </SectionCard>

      {/* Follow-up */}
      <SectionCard
        icon={ClipboardCheck}
        title="متابعة تنفيذ القرارات"
        subtitle="تتبع حالة تنفيذ التوصيات والقرارات."
      >
        {isLoading ? (
          <EmptyState text="جاري تحميل بيانات المتابعة…" />
        ) : summary.kpis.open_decisions === 0 ? (
          <EmptyState text="لا توجد قرارات قيد المتابعة حالياً." />
        ) : (
          <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
            يوجد {summary.kpis.open_decisions} قرار قيد المتابعة، منها
            {" "}{summary.kpis.overdue_decisions} متأخرة.
          </div>
        )}
      </SectionCard>

      {/* Archive + Reports */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={Archive}
          title="الأرشيف"
          subtitle="أرشفة أعمال المجالس السابقة للرجوع إليها."
        >
          <EmptyState text="سيُعرض هنا أرشيف المحاضر والقرارات المعتمدة." />
        </SectionCard>

        <SectionCard
          icon={BarChart3}
          title="التقارير"
          subtitle="تقارير أداء المجالس ونسب تنفيذ التوصيات."
        >
          <EmptyState text="ستُتاح التقارير بعد تفعيل مرحلة الكتابة والقرارات." />
        </SectionCard>
      </div>

      {/* Scheduling + notifications settings */}
      <SectionCard
        icon={Bell}
        title="إعدادات الجدولة والتنبيهات"
        subtitle="ضبط مواعيد التنبيهات والتذكيرات الآلية."
      >
        <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed list-disc pr-5">
          <li>قواعد جدولة دورية للاجتماعات (يومياً/أسبوعياً/شهرياً) — قيد التأسيس.</li>
          <li>تنبيهات قبل موعد الاجتماع للأعضاء — قيد التأسيس.</li>
          <li>تنبيهات فتح وإغلاق استقبال الموضوعات — قيد التأسيس.</li>
          <li>تذكيرات القرارات المتأخرة على المسؤولين — قيد التأسيس.</li>
        </ul>
        <div className="mt-4">
          <LockedAction label="إرسال تنبيه" hint="سيتاح بعد تفعيل خدمات التنبيهات المؤسسية." />
        </div>
      </SectionCard>

      {/* Concept cards */}
      <SectionCard
        icon={Info}
        title="نظرة معمارية على البوابة"
        subtitle="بطاقات تعريفية للتصميم المعتمد."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: LayoutDashboard, title: "هدف البوابة", desc: "توحيد إدارة مجلس الكلية ومجالس الأقسام في بيئة رقمية آمنة تحفظ سرية القرارات وتحدد الصلاحيات." },
            { icon: Users2, title: "مجلس الكلية", desc: "مجلس واحد على مستوى الكلية يضم العمادة ورؤساء الأقسام وأعضاء التمثيل الأكاديمي." },
            { icon: Users2, title: "مجالس الأقسام", desc: "مجلس لكل قسم أكاديمي معزول عن باقي الأقسام وفق سياسة العزل بالقسم." },
            { icon: FilePlus2, title: "دورة الموضوع", desc: "من الرفع إلى المراجعة إلى الاعتماد على جدول الأعمال أو التأجيل أو الرفض." },
            { icon: CalendarClock, title: "دورة الاجتماع", desc: "من الجدولة إلى فتح استقبال المواضيع إلى الجلسة إلى إغلاق المحضر والأرشفة." },
            { icon: ClipboardCheck, title: "دورة القرار والمتابعة", desc: "إصدار القرار، إسناد المسؤول، تتبع التنفيذ، وإغلاقه رسمياً بعد الإنجاز." },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-primary shrink-0">
                  <c.icon className="h-4 w-4" />
                </div>
                <div className="font-bold text-primary text-sm">{c.title}</div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Footer note */}
      <div className="rounded-lg border border-dashed border-border bg-card p-4 flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
        <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <div>
          الوظائف التشغيلية الأخرى (جدولة الاجتماعات، استقبال الموضوعات، إصدار القرارات،
          إرسال التنبيهات) ستُفعَّل في مراحل لاحقة. إدارة العضويات متاحة الآن ضمن هذا القسم.
        </div>
      </div>
    </div>
  );
}
