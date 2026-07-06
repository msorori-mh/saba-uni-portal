import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ScrollText, Users2, CalendarClock, FilePlus2, ListChecks, FileText,
  ClipboardCheck, Archive, Bell, Info, Lock, LayoutDashboard, BarChart3,
  AlertTriangle, ArrowRight, Loader2, UserPlus, UserMinus, Search, Pencil,
  ChevronUp, ChevronDown, CheckCircle2, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  getCouncilMeetingsForAdmin,
  scheduleCouncilMeeting,
  updateCouncilMeeting,
  getAgendaItemsForMeeting,
  getAvailableTopicsForAgenda,
  addTopicToAgenda,
  addManualAgendaItem,
  updateAgendaItem,
  reorderAgendaItems,
  finalizeMeetingAgenda,
  COUNCIL_LINK_MEMBER_ROLES,
  type CouncilsSummary,
  type CouncilsOverviewItem,
  type CouncilMembershipItem,
  type AcademicLinkCandidate,
  type CouncilLinkMemberRole,
  type AdminCouncilMeetingItem,
  type CouncilAgendaItem,
  type AvailableTopicForAgenda,
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

const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: "مجدول",
  intake_open: "استقبال الموضوعات مفتوح",
  intake_closed: "استقبال الموضوعات مغلق",
  agenda_ready: "جدول الأعمال جاهز",
  in_session: "جلسة قيد الانعقاد",
  minutes_draft: "مسودة محضر",
  minutes_locked: "محضر مقفل",
  archived: "مؤرشف",
  cancelled: "ملغى",
};

const MEETING_STATUS_OPTIONS = [
  "scheduled",
  "intake_open",
  "intake_closed",
  "agenda_ready",
  "in_session",
  "minutes_draft",
  "minutes_locked",
  "archived",
  "cancelled",
] as const;

const MEETING_SCHEDULE_DENIED_UI =
  "لا تملك صلاحية جدولة اجتماع لهذا المجلس.";
const MEETING_UPDATE_DENIED_UI =
  "لا تملك صلاحية تعديل هذا الاجتماع.";
const MEETINGS_LOAD_FAILED_UI = "تعذر تحميل الاجتماعات.";
const MEETING_SAVE_FAILED_UI = "تعذر حفظ الاجتماع.";
const SESSION_EXPIRED_UI =
  "انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى.";

const AGENDA_LOAD_FAILED_UI = "تعذر تحميل جدول الأعمال.";
const AGENDA_TOPICS_LOAD_FAILED_UI = "تعذر تحميل الموضوعات المتاحة.";
const AGENDA_WRITE_DENIED_UI =
  "لا تملك صلاحية إدارة جدول أعمال هذا المجلس.";
const AGENDA_TOPIC_ALREADY_ADDED_UI =
  "هذا الموضوع مضاف مسبقاً إلى جدول الأعمال.";
const AGENDA_REORDER_FAILED_UI = "تعذر حفظ ترتيب جدول الأعمال.";
const AGENDA_FINALIZE_DENIED_UI =
  "لا تملك صلاحية اعتماد جدول الأعمال.";
const AGENDA_SAVE_FAILED_UI = "تعذر حفظ جدول الأعمال.";

function meetingStatusLabel(status: string): string {
  return MEETING_STATUS_LABELS[status] ?? status;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromDatetimeLocal(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function mapMeetingUiError(message: string, mode: "schedule" | "update" | "load"): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    lower.includes("token is expired") ||
    lower.includes("انتهت جلسة تسجيل الدخول")
  ) {
    return SESSION_EXPIRED_UI;
  }
  if (message.includes(MEETING_SCHEDULE_DENIED_UI)) return MEETING_SCHEDULE_DENIED_UI;
  if (message.includes(MEETING_UPDATE_DENIED_UI)) return MEETING_UPDATE_DENIED_UI;
  if (message.includes(MEETINGS_LOAD_FAILED_UI)) return MEETINGS_LOAD_FAILED_UI;
  if (message.includes(MEETING_SAVE_FAILED_UI)) return MEETING_SAVE_FAILED_UI;
  if (
    lower.includes("policy") ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("صلاحية")
  ) {
    if (mode === "schedule") return MEETING_SCHEDULE_DENIED_UI;
    if (mode === "update") return MEETING_UPDATE_DENIED_UI;
    return RLS_USER_MESSAGE;
  }
  if (mode === "load") return MEETINGS_LOAD_FAILED_UI;
  if (/^[\x00-\x7F]+$/.test(message.trim()) && message.trim().length > 0) {
    return MEETING_SAVE_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return MEETING_SAVE_FAILED_UI;
}

function mapAgendaUiError(
  message: string,
  mode: "load" | "topics_load" | "write" | "reorder" | "finalize",
): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    lower.includes("token is expired") ||
    lower.includes("انتهت جلسة تسجيل الدخول")
  ) {
    return SESSION_EXPIRED_UI;
  }
  if (message.includes(AGENDA_LOAD_FAILED_UI)) return AGENDA_LOAD_FAILED_UI;
  if (message.includes(AGENDA_TOPICS_LOAD_FAILED_UI)) return AGENDA_TOPICS_LOAD_FAILED_UI;
  if (message.includes(AGENDA_WRITE_DENIED_UI)) return AGENDA_WRITE_DENIED_UI;
  if (message.includes(AGENDA_TOPIC_ALREADY_ADDED_UI)) return AGENDA_TOPIC_ALREADY_ADDED_UI;
  if (message.includes(AGENDA_REORDER_FAILED_UI)) return AGENDA_REORDER_FAILED_UI;
  if (message.includes(AGENDA_FINALIZE_DENIED_UI)) return AGENDA_FINALIZE_DENIED_UI;
  if (
    lower.includes("policy") ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("صلاحية")
  ) {
    if (mode === "finalize") return AGENDA_FINALIZE_DENIED_UI;
    if (mode === "load") return AGENDA_LOAD_FAILED_UI;
    if (mode === "topics_load") return AGENDA_TOPICS_LOAD_FAILED_UI;
    if (mode === "reorder") return AGENDA_REORDER_FAILED_UI;
    return AGENDA_WRITE_DENIED_UI;
  }
  if (mode === "load") return AGENDA_LOAD_FAILED_UI;
  if (mode === "topics_load") return AGENDA_TOPICS_LOAD_FAILED_UI;
  if (mode === "reorder") return AGENDA_REORDER_FAILED_UI;
  if (mode === "finalize") return AGENDA_FINALIZE_DENIED_UI;
  if (/^[\x00-\x7F]+$/.test(message.trim()) && message.trim().length > 0) {
    return AGENDA_SAVE_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return AGENDA_SAVE_FAILED_UI;
}

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

// ============================================================================
// MEETINGS ADMIN
// ============================================================================

function CouncilMeetingsPanel({
  council,
}: {
  council: CouncilsOverviewItem;
}) {
  const qc = useQueryClient();
  const fetchMeetings = useServerFn(getCouncilMeetingsForAdmin);
  const scheduleMeeting = useServerFn(scheduleCouncilMeeting);
  const updateMeeting = useServerFn(updateCouncilMeeting);

  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [intakeOpensAt, setIntakeOpensAt] = useState("");
  const [intakeClosesAt, setIntakeClosesAt] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);

  const [editTarget, setEditTarget] = useState<AdminCouncilMeetingItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editIntakeOpensAt, setEditIntakeOpensAt] = useState("");
  const [editIntakeClosesAt, setEditIntakeClosesAt] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<string>("scheduled");
  const [editBusy, setEditBusy] = useState(false);

  const {
    data: meetingsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin", "academic-councils", "meetings", council.id],
    queryFn: () => fetchMeetings({ data: { councilId: council.id } }),
    staleTime: 15_000,
  });

  const allMeetings = useMemo(() => {
    const upcoming = meetingsData?.upcomingMeetings ?? [];
    const previous = meetingsData?.previousMeetings ?? [];
    return [...upcoming, ...previous];
  }, [meetingsData]);

  const refreshMeetings = () => {
    qc.invalidateQueries({ queryKey: ["admin", "academic-councils", "meetings", council.id] });
    qc.invalidateQueries({ queryKey: ["admin", "academic-councils", "summary"] });
  };

  const openEdit = (m: AdminCouncilMeetingItem) => {
    setEditTarget(m);
    setEditTitle(m.title);
    setEditScheduledAt(toDatetimeLocalValue(m.scheduled_at));
    setEditLocation(m.location ?? "");
    setEditIntakeOpensAt(toDatetimeLocalValue(m.intake_opens_at));
    setEditIntakeClosesAt(toDatetimeLocalValue(m.intake_closes_at));
    setEditNotes(m.notes ?? "");
    setEditStatus(m.status);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      toast.error("عنوان الاجتماع قصير جداً");
      return;
    }
    const scheduledIso = toIsoFromDatetimeLocal(scheduledAt);
    if (!scheduledIso) {
      toast.error("أدخل تاريخاً ووقتاً صالحين للاجتماع");
      return;
    }
    setScheduleBusy(true);
    try {
      await scheduleMeeting({
        data: {
          councilId: council.id,
          title: trimmedTitle,
          scheduledAt: scheduledIso,
          location: location.trim() || undefined,
          intakeOpensAt: toIsoFromDatetimeLocal(intakeOpensAt),
          intakeClosesAt: toIsoFromDatetimeLocal(intakeClosesAt),
          notes: notes.trim() || undefined,
        },
      });
      toast.success("تم جدولة الاجتماع بنجاح");
      setTitle("");
      setScheduledAt("");
      setLocation("");
      setIntakeOpensAt("");
      setIntakeClosesAt("");
      setNotes("");
      refreshMeetings();
    } catch (err) {
      toast.error(
        mapMeetingUiError(err instanceof Error ? err.message : "", "schedule"),
      );
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle.length < 3) {
      toast.error("عنوان الاجتماع قصير جداً");
      return;
    }
    const scheduledIso = toIsoFromDatetimeLocal(editScheduledAt);
    if (!scheduledIso) {
      toast.error("أدخل تاريخاً ووقتاً صالحين للاجتماع");
      return;
    }
    setEditBusy(true);
    try {
      await updateMeeting({
        data: {
          meetingId: editTarget.meeting_id,
          title: trimmedTitle,
          scheduledAt: scheduledIso,
          location: editLocation.trim() || null,
          intakeOpensAt: editIntakeOpensAt.trim()
            ? toIsoFromDatetimeLocal(editIntakeOpensAt) ?? null
            : null,
          intakeClosesAt: editIntakeClosesAt.trim()
            ? toIsoFromDatetimeLocal(editIntakeClosesAt) ?? null
            : null,
          notes: editNotes.trim() || null,
          status: editStatus as (typeof MEETING_STATUS_OPTIONS)[number],
        },
      });
      toast.success("تم تحديث الاجتماع بنجاح");
      setEditTarget(null);
      refreshMeetings();
    } catch (err) {
      toast.error(
        mapMeetingUiError(err instanceof Error ? err.message : "", "update"),
      );
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => void handleSchedule(e)}
        className="rounded-lg border-2 border-primary/20 bg-background p-4 space-y-3"
      >
        <div className="font-bold text-primary text-base flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          جدولة اجتماع — {council.name}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium">عنوان الاجتماع</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان الاجتماع"
              dir="rtl"
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">تاريخ ووقت الاجتماع</label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">المكان (اختياري)</label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="قاعة الاجتماع"
              dir="rtl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">فتح استقبال الموضوعات من (اختياري)</label>
            <Input
              type="datetime-local"
              value={intakeOpensAt}
              onChange={(e) => setIntakeOpensAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">إغلاق استقبال الموضوعات في (اختياري)</label>
            <Input
              type="datetime-local"
              value={intakeClosesAt}
              onChange={(e) => setIntakeClosesAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium">ملاحظات (اختياري)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              dir="rtl"
              maxLength={4000}
            />
          </div>
        </div>
        <Button type="submit" size="sm" className="gap-1.5" disabled={scheduleBusy}>
          {scheduleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          حفظ الاجتماع
        </Button>
      </form>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/30 px-3 py-2 text-xs font-bold text-primary border-b border-border">
          اجتماعات المجلس
        </div>
        {isLoading ? (
          <div className="p-6 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="p-4 text-xs text-destructive">{MEETINGS_LOAD_FAILED_UI}</div>
        ) : allMeetings.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            لا توجد اجتماعات مسجّلة لهذا المجلس حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">رقم</th>
                  <th className="p-2 font-medium">العنوان</th>
                  <th className="p-2 font-medium">الموعد</th>
                  <th className="p-2 font-medium">المكان</th>
                  <th className="p-2 font-medium">الحالة</th>
                  <th className="p-2 font-medium">فتح الاستقبال</th>
                  <th className="p-2 font-medium">إغلاق الاستقبال</th>
                  <th className="p-2 font-medium">ملاحظات</th>
                  <th className="p-2 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {allMeetings.map((m) => (
                  <tr key={m.meeting_id} className="border-t border-border/60 align-top">
                    <td className="p-2 font-mono">{m.meeting_number}</td>
                    <td className="p-2 font-medium text-primary">{m.title}</td>
                    <td className="p-2 whitespace-nowrap">{formatDateTime(m.scheduled_at)}</td>
                    <td className="p-2">{m.location ?? "—"}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[10px]">
                        {meetingStatusLabel(m.status)}
                      </Badge>
                    </td>
                    <td className="p-2 whitespace-nowrap">{formatDateTime(m.intake_opens_at)}</td>
                    <td className="p-2 whitespace-nowrap">{formatDateTime(m.intake_closes_at)}</td>
                    <td className="p-2 max-w-[12rem] truncate" title={m.notes ?? undefined}>
                      {m.notes ?? "—"}
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[10px]"
                        onClick={() => openEdit(m)}
                      >
                        <Pencil className="h-3 w-3" />
                        تعديل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && !editBusy && setEditTarget(null)}
      >
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل الاجتماع</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleUpdate(e)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">العنوان</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">تاريخ ووقت الاجتماع</label>
              <Input
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">المكان</label>
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">فتح استقبال الموضوعات</label>
              <Input
                type="datetime-local"
                value={editIntakeOpensAt}
                onChange={(e) => setEditIntakeOpensAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">إغلاق استقبال الموضوعات</label>
              <Input
                type="datetime-local"
                value={editIntakeClosesAt}
                onChange={(e) => setEditIntakeClosesAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">الحالة</label>
              <Select value={editStatus} onValueChange={setEditStatus} dir="rtl">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {MEETING_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {meetingStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">ملاحظات</label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} dir="rtl" />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={editBusy} onClick={() => setEditTarget(null)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={editBusy} className="gap-1.5">
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// AGENDA ADMIN
// ============================================================================

function swapAgendaOrder(
  items: CouncilAgendaItem[],
  itemId: string,
  direction: "up" | "down",
): CouncilAgendaItem[] {
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
  const idx = sorted.findIndex((i) => i.id === itemId);
  if (idx < 0) return items;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return items;
  const next = [...sorted];
  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  return next.map((item, i) => ({ ...item, order_index: i + 1 }));
}

function CouncilAgendaPanel({
  council,
}: {
  council: CouncilsOverviewItem;
}) {
  const qc = useQueryClient();
  const fetchMeetings = useServerFn(getCouncilMeetingsForAdmin);
  const fetchAgenda = useServerFn(getAgendaItemsForMeeting);
  const fetchAvailableTopics = useServerFn(getAvailableTopicsForAgenda);
  const addTopic = useServerFn(addTopicToAgenda);
  const addManual = useServerFn(addManualAgendaItem);
  const updateItem = useServerFn(updateAgendaItem);
  const reorderItems = useServerFn(reorderAgendaItems);
  const finalizeAgenda = useServerFn(finalizeMeetingAgenda);

  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualOrder, setManualOrder] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [addTopicBusyId, setAddTopicBusyId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);

  const [editTarget, setEditTarget] = useState<CouncilAgendaItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [editApproved, setEditApproved] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const meetingsQuery = useQuery({
    queryKey: ["admin", "academic-councils", "meetings", council.id],
    queryFn: () => fetchMeetings({ data: { councilId: council.id } }),
    staleTime: 15_000,
  });

  const councilMeetings = useMemo(() => {
    const upcoming = meetingsQuery.data?.upcomingMeetings ?? [];
    const previous = meetingsQuery.data?.previousMeetings ?? [];
    return [...upcoming, ...previous];
  }, [meetingsQuery.data]);

  const selectedMeeting = useMemo(
    () => councilMeetings.find((m) => m.meeting_id === selectedMeetingId) ?? null,
    [councilMeetings, selectedMeetingId],
  );

  const agendaQuery = useQuery({
    queryKey: ["admin", "academic-councils", "agenda", selectedMeetingId],
    queryFn: () => fetchAgenda({ data: { meetingId: selectedMeetingId! } }),
    enabled: Boolean(selectedMeetingId),
    staleTime: 10_000,
  });

  const topicsQuery = useQuery({
    queryKey: ["admin", "academic-councils", "agenda-topics", selectedMeetingId],
    queryFn: () => fetchAvailableTopics({ data: { meetingId: selectedMeetingId! } }),
    enabled: Boolean(selectedMeetingId),
    staleTime: 10_000,
  });

  const agendaItems = agendaQuery.data?.items ?? [];
  const availableTopics = topicsQuery.data?.topics ?? [];

  const refreshAgenda = () => {
    if (selectedMeetingId) {
      qc.invalidateQueries({ queryKey: ["admin", "academic-councils", "agenda", selectedMeetingId] });
      qc.invalidateQueries({
        queryKey: ["admin", "academic-councils", "agenda-topics", selectedMeetingId],
      });
    }
    qc.invalidateQueries({ queryKey: ["admin", "academic-councils", "meetings", council.id] });
    qc.invalidateQueries({ queryKey: ["admin", "academic-councils", "summary"] });
  };

  const persistReorder = async (items: CouncilAgendaItem[]) => {
    if (!selectedMeetingId) return;
    setReorderBusy(true);
    try {
      await reorderItems({
        data: {
          meetingId: selectedMeetingId,
          items: items.map((i) => ({
            agendaItemId: i.id,
            orderIndex: i.order_index,
          })),
        },
      });
      toast.success("تم حفظ ترتيب جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(
        mapAgendaUiError(err instanceof Error ? err.message : "", "reorder"),
      );
    } finally {
      setReorderBusy(false);
    }
  };

  const handleMove = (itemId: string, direction: "up" | "down") => {
    const next = swapAgendaOrder(agendaItems, itemId, direction);
    if (next === agendaItems) return;
    void persistReorder(next);
  };

  const handleAddTopic = async (topic: AvailableTopicForAgenda) => {
    if (!selectedMeetingId) return;
    setAddTopicBusyId(topic.topic_id);
    try {
      await addTopic({
        data: { meetingId: selectedMeetingId, topicId: topic.topic_id },
      });
      toast.success("تمت إضافة الموضوع إلى جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(err instanceof Error ? err.message : "", "write"));
    } finally {
      setAddTopicBusyId(null);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeetingId) return;
    const trimmed = manualTitle.trim();
    if (trimmed.length < 3) {
      toast.error("عنوان البند قصير جداً");
      return;
    }
    setManualBusy(true);
    try {
      await addManual({
        data: {
          meetingId: selectedMeetingId,
          title: trimmed,
          notes: manualNotes.trim() || undefined,
          orderIndex: manualOrder.trim() ? Number(manualOrder) : undefined,
        },
      });
      toast.success("تمت إضافة البند.");
      setManualTitle("");
      setManualNotes("");
      setManualOrder("");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(err instanceof Error ? err.message : "", "write"));
    } finally {
      setManualBusy(false);
    }
  };

  const openEdit = (item: CouncilAgendaItem) => {
    setEditTarget(item);
    setEditTitle(item.title);
    setEditNotes(item.notes ?? "");
    setEditOrder(String(item.order_index));
    setEditApproved(item.is_approved);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const trimmed = editTitle.trim();
    if (trimmed.length < 3) {
      toast.error("عنوان البند قصير جداً");
      return;
    }
    const orderNum = Number(editOrder);
    if (!Number.isInteger(orderNum) || orderNum < 1) {
      toast.error("رقم الترتيب غير صالح");
      return;
    }
    setEditBusy(true);
    try {
      await updateItem({
        data: {
          agendaItemId: editTarget.id,
          title: trimmed,
          notes: editNotes.trim() || null,
          orderIndex: orderNum,
          isApproved: editApproved,
        },
      });
      toast.success("تم تحديث البند.");
      setEditTarget(null);
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(err instanceof Error ? err.message : "", "write"));
    } finally {
      setEditBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedMeetingId) return;
    setFinalizeBusy(true);
    try {
      await finalizeAgenda({ data: { meetingId: selectedMeetingId } });
      toast.success("تم اعتماد جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(err instanceof Error ? err.message : "", "finalize"));
    } finally {
      setFinalizeBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
        <label className="text-xs font-medium text-primary">اختر اجتماعاً</label>
        {meetingsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل الاجتماعات…
          </div>
        ) : councilMeetings.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد اجتماعات لهذا المجلس حتى الآن.</p>
        ) : (
          <Select
            value={selectedMeetingId ?? ""}
            onValueChange={(v) => setSelectedMeetingId(v || null)}
            dir="rtl"
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر اجتماعاً لإدارة جدول أعماله" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {councilMeetings.map((m) => (
                <SelectItem key={m.meeting_id} value={m.meeting_id}>
                  #{m.meeting_number} — {m.title} — {formatDateTime(m.scheduled_at)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!selectedMeetingId ? (
        <EmptyState text="اختر اجتماعاً لعرض وإدارة جدول أعماله." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="text-xs">
              <span className="font-bold text-primary">{selectedMeeting?.title}</span>
              <span className="text-muted-foreground mx-2">·</span>
              <span className="text-muted-foreground">
                {meetingStatusLabel(selectedMeeting?.status ?? "")}
              </span>
              <span className="text-muted-foreground mx-2">·</span>
              <span className="text-muted-foreground">
                {agendaItems.length} بند
                {" "}
                ({agendaItems.filter((i) => i.is_approved).length} معتمد)
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={finalizeBusy || selectedMeeting?.status === "agenda_ready"}
              onClick={() => void handleFinalize()}
            >
              {finalizeBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              اعتماد جدول الأعمال
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/30 px-3 py-2 text-xs font-bold text-primary border-b border-border">
                بنود جدول الأعمال
              </div>
              {agendaQuery.isLoading ? (
                <div className="p-6 grid place-items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : agendaQuery.isError ? (
                <div className="p-4 text-xs text-destructive">{AGENDA_LOAD_FAILED_UI}</div>
              ) : agendaItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  لا توجد بنود في جدول الأعمال حتى الآن.
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {agendaItems.map((item, idx) => (
                    <li key={item.id} className="p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {item.order_index}
                            </Badge>
                            <span className="font-bold text-primary text-sm">{item.title}</span>
                            {item.is_approved ? (
                              <Badge variant="secondary" className="text-[10px]">
                                معتمد
                              </Badge>
                            ) : null}
                          </div>
                          {item.topic ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              موضوع مرتبط: {item.topic.title}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-muted-foreground">بند يدوي</p>
                          )}
                          {item.notes ? (
                            <p className="mt-1 text-[11px] text-foreground/80">{item.notes}</p>
                          ) : null}
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            أُنشئ {formatDateTime(item.created_at)}
                            {item.updated_at !== item.created_at
                              ? ` · آخر تحديث ${formatDateTime(item.updated_at)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            disabled={reorderBusy || idx === 0}
                            onClick={() => handleMove(item.id, "up")}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            disabled={reorderBusy || idx === agendaItems.length - 1}
                            onClick={() => handleMove(item.id, "down")}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-[10px]"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-3 w-3" />
                            تعديل
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-3 py-2 text-xs font-bold text-primary border-b border-border">
                  موضوعات متاحة للإضافة
                </div>
                {topicsQuery.isLoading ? (
                  <div className="p-4 grid place-items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : topicsQuery.isError ? (
                  <div className="p-4 text-xs text-destructive">{AGENDA_TOPICS_LOAD_FAILED_UI}</div>
                ) : availableTopics.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    لا توجد موضوعات بحالة «مقبول للجدول» جاهزة للإضافة.
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                    {availableTopics.map((t) => (
                      <li
                        key={t.topic_id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3"
                      >
                        <div className="min-w-0 text-xs">
                          <div className="font-medium text-primary">{t.title}</div>
                          <div className="text-muted-foreground mt-0.5">
                            {topicStatusLabelAdmin(t.status)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[10px] gap-1 shrink-0"
                          disabled={addTopicBusyId === t.topic_id}
                          onClick={() => void handleAddTopic(t)}
                        >
                          {addTopicBusyId === t.topic_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          إضافة إلى جدول الأعمال
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border/60">
                  تُعرض فقط الموضوعات بحالة accepted_for_agenda غير المضافة مسبقاً لهذا الاجتماع.
                </p>
              </div>

              <form
                onSubmit={(e) => void handleManualAdd(e)}
                className="rounded-lg border-2 border-dashed border-primary/20 bg-background p-4 space-y-3"
              >
                <div className="font-bold text-primary text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  إضافة بند يدوي
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">العنوان</label>
                  <Input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    dir="rtl"
                    maxLength={500}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">ملاحظات (اختياري)</label>
                  <Textarea
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    rows={2}
                    dir="rtl"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">الترتيب (اختياري)</label>
                  <Input
                    type="number"
                    min={1}
                    value={manualOrder}
                    onChange={(e) => setManualOrder(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" disabled={manualBusy} className="gap-1.5">
                  {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  إضافة البند
                </Button>
              </form>
            </div>
          </div>
        </>
      )}

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && !editBusy && setEditTarget(null)}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بند الأجندة</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleEdit(e)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">العنوان</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">ملاحظات</label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">رقم الترتيب</label>
              <Input
                type="number"
                min={1}
                value={editOrder}
                onChange={(e) => setEditOrder(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={editApproved}
                onCheckedChange={(v) => setEditApproved(v === true)}
              />
              معتمد على جدول الأعمال
            </label>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={editBusy} onClick={() => setEditTarget(null)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={editBusy} className="gap-1.5">
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function topicStatusLabelAdmin(status: string): string {
  const labels: Record<string, string> = {
    accepted_for_agenda: "مقبول للجدول",
    submitted: "مقدّم",
    under_review: "قيد المراجعة",
  };
  return labels[status] ?? status;
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
              عضويات + اجتماعات + جدول أعمال
            </Badge>
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              الموضوعات والقرارات — قراءة فقط
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
          <div className="font-bold">إدارة العضويات والاجتماعات وجدول الأعمال مفعّلة</div>
          <div className="mt-0.5 leading-relaxed">
            يمكنك اختيار مجلس وإدارة عضوياته وجدولة اجتماعاته وإعداد جدول الأعمال.
            عمليات رفع الموضوعات والقرارات والتنبيهات لا تزال في وضع القراءة فقط.
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

      {/* Meetings administration */}
      <SectionCard
        icon={CalendarClock}
        title="الاجتماعات"
        subtitle="جدولة وتعديل اجتماعات المجلس المحدد (للأدمن ورئيس المجلس عبر الصلاحيات)."
      >
        {selectedCouncil ? (
          <p className="mb-4 text-xs text-muted-foreground">
            المجلس المحدد: <span className="font-bold text-primary">{selectedCouncil.name}</span>
          </p>
        ) : null}
        {!selectedCouncil ? (
          <div className="rounded-lg border border-dashed border-amber-300/60 bg-amber-50/50 p-6 text-center space-y-3">
            <p className="text-sm text-foreground font-medium">
              اختر مجلساً من القائمة أعلاه لعرض اجتماعاته وجدولة اجتماع جديد.
            </p>
          </div>
        ) : (
          <CouncilMeetingsPanel council={selectedCouncil} />
        )}
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

      {/* Agenda */}
      <SectionCard
        icon={ListChecks}
        title="جدول الأعمال"
        subtitle="إعداد وترتيب واعتماد جدول أعمال اجتماع المجلس المحدد."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agendaStages.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-bold text-primary">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : s.count}
              </div>
            </div>
          ))}
        </div>
        {selectedCouncil ? (
          <p className="mb-4 text-xs text-muted-foreground">
            المجلس المحدد: <span className="font-bold text-primary">{selectedCouncil.name}</span>
          </p>
        ) : null}
        {!selectedCouncil ? (
          <EmptyState text="اختر مجلساً من القائمة أعلاه لإدارة جدول أعمال اجتماعاته." />
        ) : (
          <CouncilAgendaPanel council={selectedCouncil} />
        )}
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
          الوظائف التشغيلية الأخرى (استقبال الموضوعات، إصدار القرارات، إرسال التنبيهات)
          ستُفعَّل في مراحل لاحقة. إدارة العضويات والاجتماعات متاحة الآن ضمن هذا القسم.
        </div>
      </div>
    </div>
  );
}
