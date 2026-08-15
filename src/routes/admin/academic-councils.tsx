import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LEGACY_MEETING_DATES_WARNING,
  firstMeetingDateError,
  hasLegacyMeetingDateViolation,
  isPreSessionTransitionBlocked,
} from "@/lib/councils-meeting-dates";
import {
  ScrollText, Users2, CalendarClock, FilePlus2, ListChecks, FileText,
  ClipboardCheck, Archive, BarChart3,
  AlertTriangle, Loader2, UserPlus, UserMinus, Search, Pencil,
  ChevronUp, ChevronDown, CheckCircle2, Plus, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CouncilReportsView } from "@/components/councils/CouncilReportsView";
import {
  getCouncilsSummary,
  getCouncilMemberships,
  searchAcademicsForCouncilLink,
  linkAcademicToCouncil,
  deactivateCouncilMembership,
  getCouncilMeetingsForAdmin,
  scheduleCouncilMeeting,
  updateCouncilMeeting,
  getCouncilTopicReviewQueueForAdmin,
  reviewCouncilTopic,
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
  type AdminTopicReviewQueueItem,
  type CouncilAgendaItem,
  type AvailableTopicForAgenda,
} from "@/lib/admin-councils.functions";
import {
  countMinutesReview,
  deriveAdminActionRequiredItems,
} from "@/lib/admin-portal/councils-operational";

export const Route = createFileRoute("/admin/academic-councils")({
  head: () => ({
    meta: [
      { title: "إدارة المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcademicCouncilsPage,
});

// ============================================================================
// SHARED UI PIECES
// ============================================================================

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
  minutes_review: "محضر بانتظار الاعتماد",
  minutes_locked: "محضر مقفل",
  archived: "مؤرشف",
  cancelled: "ملغى",
};

/** Manual edit dropdown — does not broaden into full lifecycle RPC states. */
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
    const intakeOpensIso = toIsoFromDatetimeLocal(intakeOpensAt);
    const intakeClosesIso = toIsoFromDatetimeLocal(intakeClosesAt);
    const scheduleDateError = firstMeetingDateError({
      scheduledAt: scheduledIso,
      intakeOpensAt: intakeOpensIso ?? null,
      intakeClosesAt: intakeClosesIso ?? null,
    });
    if (scheduleDateError) {
      toast.error(scheduleDateError);
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
          intakeOpensAt: intakeOpensIso,
          intakeClosesAt: intakeClosesIso,
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
    const editOpensIso = editIntakeOpensAt.trim()
      ? toIsoFromDatetimeLocal(editIntakeOpensAt) ?? null
      : null;
    const editClosesIso = editIntakeClosesAt.trim()
      ? toIsoFromDatetimeLocal(editIntakeClosesAt) ?? null
      : null;
    const editDateError = firstMeetingDateError({
      scheduledAt: scheduledIso,
      intakeOpensAt: editOpensIso,
      intakeClosesAt: editClosesIso,
    });
    if (editDateError) {
      toast.error(editDateError);
      return;
    }
    if (
      isPreSessionTransitionBlocked(editStatus, {
        scheduledAt: scheduledIso,
        intakeOpensAt: editOpensIso,
        intakeClosesAt: editClosesIso,
      })
    ) {
      toast.error(LEGACY_MEETING_DATES_WARNING);
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
          intakeOpensAt: editOpensIso,
          intakeClosesAt: editClosesIso,
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
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          تتوفر الإجراءات وفق عضويتك وصلاحيتك داخل المجلس. جدولة الاجتماع تتطلب عضوية رئيس المجلس.
        </p>
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
                    <td className="p-2 font-medium text-primary">
                      {m.title}
                      {hasLegacyMeetingDateViolation({
                        scheduledAt: m.scheduled_at,
                        intakeOpensAt: m.intake_opens_at,
                        intakeClosesAt: m.intake_closes_at,
                      }) ? (
                        <span
                          data-testid="admin-meeting-legacy-dates-warning"
                          className="mt-1 block text-[10px] font-normal text-amber-700 dark:text-amber-400"
                        >
                          {LEGACY_MEETING_DATES_WARNING}
                        </span>
                      ) : null}
                    </td>
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
// TOPIC REVIEW QUEUE — chair/secretary actions via RPC (admin app_role alone denied)
// ============================================================================

const TOPIC_REVIEW_STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "submitted", label: "مقدّم" },
  { value: "under_review", label: "قيد المراجعة" },
  { value: "needs_completion", label: "يحتاج استكمالاً" },
  { value: "accepted_for_agenda", label: "مقبول للجدول" },
  { value: "rejected", label: "مرفوض" },
];

function CouncilTopicReviewQueuePanel({
  council,
}: {
  council: CouncilsOverviewItem;
}) {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(getCouncilTopicReviewQueueForAdmin);
  const reviewTopic = useServerFn(reviewCouncilTopic);
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busyByTopic, setBusyByTopic] = useState<Record<string, boolean>>({});

  const {
    data: queueData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin", "academic-councils", "topic-review-queue", council.id],
    queryFn: () => fetchQueue({ data: { councilId: council.id } }),
    staleTime: 15_000,
  });

  const queue = queueData?.queue ?? [];
  const actorRole = queueData?.actorRole ?? null;
  const isChair = actorRole === "chair";
  const isSecretary = actorRole === "secretary";
  const canAct = isChair || isSecretary;

  const filtered = useMemo(() => {
    if (activeStatus === "all") return queue;
    return queue.filter((t) => t.status === activeStatus);
  }, [queue, activeStatus]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: queue.length };
    for (const item of queue) {
      map[item.status] = (map[item.status] ?? 0) + 1;
    }
    return map;
  }, [queue]);

  const handleReview = async (
    topic: AdminTopicReviewQueueItem,
    status: "under_review" | "needs_completion" | "accepted_for_agenda" | "rejected",
  ) => {
    if (!canAct) {
      toast.error("لا تملك صلاحية مراجعة هذا الموضوع عبر عضوية المجلس.");
      return;
    }
    if ((status === "accepted_for_agenda" || status === "rejected") && !isChair) {
      toast.error("قرار القبول النهائي أو الرفض يعود لرئيس المجلس فقط.");
      return;
    }
    setBusyByTopic((prev) => ({ ...prev, [topic.topic_id]: true }));
    try {
      await reviewTopic({
        data: {
          topicId: topic.topic_id,
          status,
          expectedStatus: topic.status as
            | "submitted"
            | "under_review"
            | "needs_completion"
            | "accepted_for_agenda"
            | "rejected",
          reviewNote: reviewNotes[topic.topic_id]?.trim() || undefined,
        },
      });
      toast.success("تم تحديث حالة الموضوع");
      setReviewNotes((prev) => ({ ...prev, [topic.topic_id]: "" }));
      await qc.invalidateQueries({
        queryKey: ["admin", "academic-councils", "topic-review-queue", council.id],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر حفظ حالة المراجعة.");
    } finally {
      setBusyByTopic((prev) => ({ ...prev, [topic.topic_id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TOPIC_REVIEW_STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            size="sm"
            variant={activeStatus === tab.value ? "default" : "outline"}
            className="text-xs gap-1.5"
            onClick={() => setActiveStatus(tab.value)}
          >
            {tab.label}
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                activeStatus === tab.value
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {counts[tab.value] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      {!canAct ? (
        <p className="text-[11px] text-muted-foreground" data-testid="admin-topics-role-gate">
          تتوفر الإجراءات وفق عضويتك وصلاحيتك داخل المجلس. إجراءات المراجعة تتطلب عضوية رئيس أو أمين سر في هذا المجلس.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground" data-testid="admin-topics-role-aware">
          تتوفر الإجراءات وفق عضويتك وصلاحيتك داخل المجلس.
        </p>
      )}

      {isLoading ? (
        <div className="p-6 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="p-4 text-xs text-destructive">
          تعذر تحميل قائمة مراجعة الموضوعات. قد تتطلب صلاحيات إضافية على هذا المجلس.
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState text="لا توجد موضوعات مطابقة للحالة المحددة في هذا المجلس." />
      ) : (
        <div className="grid gap-3">
          {filtered.map((topic) => (
            <TopicReviewQueueCard
              key={topic.topic_id}
              topic={topic}
              canAct={canAct}
              isChair={isChair}
              isSecretary={isSecretary}
              busy={Boolean(busyByTopic[topic.topic_id])}
              reviewNote={reviewNotes[topic.topic_id] ?? ""}
              onNoteChange={(value) =>
                setReviewNotes((prev) => ({ ...prev, [topic.topic_id]: value }))
              }
              onReview={(status) => void handleReview(topic, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TopicReviewQueueCard({
  topic,
  canAct,
  isChair,
  isSecretary,
  busy,
  reviewNote,
  onNoteChange,
  onReview,
}: {
  topic: AdminTopicReviewQueueItem;
  canAct: boolean;
  isChair: boolean;
  isSecretary: boolean;
  busy: boolean;
  reviewNote: string;
  onNoteChange: (value: string) => void;
  onReview: (
    status: "under_review" | "needs_completion" | "accepted_for_agenda" | "rejected",
  ) => void;
}) {
  const showActions =
    canAct &&
    (topic.status === "submitted" || topic.status === "under_review");

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-primary text-sm leading-relaxed">{topic.title}</h3>
          <div className="mt-1 text-[11px] text-muted-foreground">
            <span>المرسل: {topic.submitted_by}</span>
            <span className="mx-2">·</span>
            <span>تاريخ التقديم: {formatDateTime(topic.submitted_at)}</span>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {topicStatusLabelAdmin(topic.status)}
        </Badge>
      </div>

      {topic.review_note ? (
        <div className="rounded-md bg-muted/30 p-2.5 text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">ملاحظة المراجعة:</span>{" "}
          {topic.review_note}
        </div>
      ) : null}

      {topic.meeting_id ? (
        <div className="text-[11px] text-muted-foreground">
          مرتبط باجتماع:{" "}
          <span className="font-mono text-foreground">{topic.meeting_id}</span>
        </div>
      ) : null}

      {showActions ? (
        <div className="space-y-2 border-t border-border pt-3">
          <Textarea
            value={reviewNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="ملاحظة المراجعة (مطلوبة عند طلب الاستكمال)"
            className="min-h-[72px] text-xs"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            {(isChair || isSecretary) && topic.status === "submitted" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onReview("under_review")}
              >
                بدء المراجعة
              </Button>
            ) : null}
            {(isChair || isSecretary) && topic.status === "under_review" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onReview("needs_completion")}
              >
                طلب استكمال
              </Button>
            ) : null}
            {isChair && topic.status === "under_review" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => onReview("accepted_for_agenda")}
                >
                  قبول للجدول
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => onReview("rejected")}
                >
                  رفض
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
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
  /** Same lifecycle rules as the faculty workspace dialog. */
  const agendaFrozen = isAgendaFrozen(selectedMeeting?.status);
  const canEditAgenda = isAgendaEditable(selectedMeeting?.status);
  const canFinalizeAgenda = canFinalizeAgendaAtStatus(selectedMeeting?.status);

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
    submitted: "مقدّم",
    under_review: "قيد المراجعة",
    needs_completion: "يحتاج استكمالاً",
    accepted_for_agenda: "مقبول للجدول",
    rejected: "مرفوض",
  };
  return labels[status] ?? status;
}

function councilTypeLabel(type: string): string {
  if (type === "college") return "كلية";
  if (type === "department") return "قسم";
  return type;
}

function CompactCouncilCard({
  council,
  selected,
  onSelect,
}: {
  council: CouncilsOverviewItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-testid={`admin-council-card-${council.id}`}
        className={`w-full rounded-lg border p-2.5 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          selected
            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
            : "border-border bg-background hover:bg-muted/40"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-primary text-sm truncate">{council.name}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {councilTypeLabel(council.council_type)} · الأعضاء: {council.members_count}
              {council.next_meeting_at
                ? ` · القادم: ${formatDateTime(council.next_meeting_at)}`
                : ""}
            </div>
          </div>
          <Badge
            variant={council.is_active ? "secondary" : "outline"}
            className="text-[10px] shrink-0"
          >
            {council.is_active ? "مفعّل" : "غير مفعّل"}
          </Badge>
        </div>
      </button>
    </li>
  );
}

function AdminNextMeetingPriority({
  meeting,
  onOpenMeetings,
  onOpenAgenda,
  onOpenTopics,
}: {
  meeting: AdminCouncilMeetingItem;
  onOpenMeetings: () => void;
  onOpenAgenda: () => void;
  onOpenTopics: () => void;
}) {
  return (
    <section
      data-testid="admin-next-meeting-priority"
      className="rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary shrink-0">
          <CalendarClock className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-bold text-primary text-sm">الاجتماع القادم</h2>
          <p className="text-sm font-bold text-foreground">{meeting.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(meeting.scheduled_at)}
            {meeting.location ? ` · ${meeting.location}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-[10px]">
              {meetingStatusLabel(meeting.status)}
            </Badge>
            {meeting.intake_closes_at ? (
              <Badge variant="secondary" className="text-[10px]">
                إغلاق الاستقبال: {formatDateTime(meeting.intake_closes_at)}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" size="sm" className="min-h-9 text-xs" onClick={onOpenMeetings}>
              عرض/تعديل الاجتماع
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9 text-xs"
              onClick={onOpenAgenda}
            >
              جدول الأعمال
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-9 text-xs"
              onClick={onOpenTopics}
            >
              الموضوعات
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminActionRequiredPanel({
  items,
  onNavigate,
}: {
  items: ReturnType<typeof deriveAdminActionRequiredItems>;
  onNavigate: (tab: string) => void;
}) {
  return (
    <section data-testid="admin-action-required" className="space-y-2">
      <h2 className="font-display text-sm font-bold text-primary">يتطلب انتباهك</h2>
      {items.length === 0 ? (
        <div
          data-testid="admin-action-required-empty"
          className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground"
        >
          لا توجد إجراءات عاجلة لهذا المجلس حالياً.
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              data-testid={`admin-action-${item.kind}`}
              className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-start gap-2"
            >
              <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-primary">{item.title}</div>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
                {item.tab ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2 h-8 text-xs gap-1"
                    onClick={() => onNavigate(item.tab!)}
                  >
                    فتح
                    <ArrowLeft className="h-3 w-3" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MinutesDecisionsPanel({
  meetings,
  isLoading,
  isError,
}: {
  meetings: AdminCouncilMeetingItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  const relevant = meetings.filter((m) =>
    ["minutes_draft", "minutes_review", "minutes_locked", "archived"].includes(m.status),
  );

  if (isLoading) {
    return (
      <div className="p-6 grid place-items-center" role="status" aria-label="جاري التحميل">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        تعذّر تحميل بيانات المحاضر لهذا المجلس.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="admin-minutes-decisions-panel">
      {relevant.length === 0 ? (
        <EmptyState text="لا توجد محاضر مرتبطة بهذا المجلس حالياً." />
      ) : (
        <ul className="space-y-2">
          {relevant.map((m) => (
            <li
              key={m.meeting_id}
              className="rounded-lg border border-border bg-background p-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-primary">{m.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDateTime(m.scheduled_at)}
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {meetingStatusLabel(m.status)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        إصدار القرارات الرسمية يتم عبر دورة الحوكمة وفق عضوية المجلس؛ دور الأدمن وحده لا يمنح سلطة أكاديمية.
        أعداد القرارات العامة للبوابة تظهر في شريط المؤشرات أعلى الصفحة فقط وليست خاصة بهذا المجلس.
      </p>
    </div>
  );
}

function FollowUpPanel() {
  return (
    <div
      data-testid="admin-followup-panel"
      className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground space-y-2"
    >
      <EmptyState text="لا تتوفر حالياً بيانات متابعة قرارات محمّلة على مستوى المجلس المحدد." />
      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
        مؤشرات القرارات العامة (قيد المتابعة / المتأخرة) تُعرض في شريط ملخص البوابة أعلى الصفحة ولا تُنسب إلى المجلس الحالي.
        يمكن الرجوع إلى تقارير المجلس عند توفر تقرير متخصص.
      </p>
    </div>
  );
}

function ArchivePanel({
  meetings,
  isLoading,
  isError,
}: {
  meetings: AdminCouncilMeetingItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  const archived = meetings.filter((m) => m.status === "archived");
  if (isLoading) {
    return (
      <div className="p-6 grid place-items-center" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        تعذّر تحميل الأرشيف لهذا المجلس.
      </div>
    );
  }
  if (archived.length === 0) {
    return <EmptyState text="لا توجد اجتماعات مؤرشفة لهذا المجلس." />;
  }
  return (
    <ul className="space-y-2" data-testid="admin-archive-panel">
      {archived.map((m) => (
        <li
          key={m.meeting_id}
          className="rounded-lg border border-border bg-background p-3 flex flex-wrap justify-between gap-2"
        >
          <div>
            <div className="text-sm font-bold text-primary">{m.title}</div>
            <div className="text-[11px] text-muted-foreground">{formatDateTime(m.scheduled_at)}</div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {meetingStatusLabel(m.status)}
          </Badge>
        </li>
      ))}
    </ul>
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
  const fetchMeetings = useServerFn(getCouncilMeetingsForAdmin);
  const fetchTopicQueue = useServerFn(getCouncilTopicReviewQueueForAdmin);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "academic-councils", "summary"],
    queryFn: () => fetchSummary(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const summary: CouncilsSummary = data ?? EMPTY_SUMMARY;
  const allCouncils = summary.councils;

  const [selectedCouncilId, setSelectedCouncilId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<string>("overview");

  const selectedCouncil = useMemo(
    () => allCouncils.find((c) => c.id === selectedCouncilId) ?? null,
    [allCouncils, selectedCouncilId],
  );

  useEffect(() => {
    if (!isLoading && allCouncils.length === 1 && selectedCouncilId === null) {
      setSelectedCouncilId(allCouncils[0]!.id);
    }
  }, [isLoading, allCouncils, selectedCouncilId]);

  const meetingsQuery = useQuery({
    queryKey: ["admin", "academic-councils", "meetings", selectedCouncilId],
    queryFn: () => fetchMeetings({ data: { councilId: selectedCouncilId! } }),
    enabled: Boolean(selectedCouncilId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const topicsQuery = useQuery({
    queryKey: ["admin", "academic-councils", "topic-review-queue", selectedCouncilId],
    queryFn: () => fetchTopicQueue({ data: { councilId: selectedCouncilId! } }),
    enabled: Boolean(selectedCouncilId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const allMeetings = useMemo(() => {
    const upcoming = meetingsQuery.data?.upcomingMeetings ?? [];
    const previous = meetingsQuery.data?.previousMeetings ?? [];
    return [...upcoming, ...previous];
  }, [meetingsQuery.data]);

  const nextMeeting = useMemo(() => {
    const upcoming = meetingsQuery.data?.upcomingMeetings ?? [];
    return upcoming[0] ?? null;
  }, [meetingsQuery.data]);

  const minutesReviewCount = useMemo(
    () => countMinutesReview(allMeetings),
    [allMeetings],
  );

  const actionItems = useMemo(() => {
    if (!selectedCouncil) return [];
    return deriveAdminActionRequiredItems({
      selectedCouncilName: selectedCouncil.name,
      upcomingMeeting: nextMeeting
        ? {
            meeting_id: nextMeeting.meeting_id,
            title: nextMeeting.title,
            status: String(nextMeeting.status),
            scheduled_at: nextMeeting.scheduled_at,
          }
        : null,
      meetings: allMeetings.map((m) => ({
        meeting_id: m.meeting_id,
        title: m.title,
        status: String(m.status),
        scheduled_at: m.scheduled_at,
      })),
      topics: (topicsQuery.data?.queue ?? []).map((t) => ({
        topic_id: t.topic_id,
        title: t.title,
        status: t.status,
      })),
    });
  }, [selectedCouncil, nextMeeting, allMeetings, topicsQuery.data?.queue]);

  const kpis = [
    {
      label: "الاجتماعات القادمة",
      value: summary.kpis.upcoming_meetings,
      icon: CalendarClock,
      testId: "admin-kpi-upcoming-meetings",
    },
    {
      label: "الموضوعات التي تحتاج متابعة",
      value: summary.kpis.submitted_topics,
      icon: FilePlus2,
      testId: "admin-kpi-submitted-topics",
    },
    {
      label: "القرارات قيد المتابعة",
      value: summary.kpis.open_decisions,
      icon: ClipboardCheck,
      testId: "admin-kpi-open-decisions",
    },
    {
      label: "القرارات المتأخرة",
      value: summary.kpis.overdue_decisions,
      icon: AlertTriangle,
      testId: "admin-kpi-overdue-decisions",
    },
  ] as const;

  const selectCouncil = (id: string) => {
    setSelectedCouncilId(id);
  };

  const goMembers = () => {
    setWorkspaceTab("members");
  };

  const goMeetings = () => {
    setWorkspaceTab("meetings");
  };

  return (
    <div className="space-y-4 sm:space-y-5" dir="rtl" data-testid="admin-councils-operational-workspace">
      <header
        data-testid="admin-councils-page-header"
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <ScrollText className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-primary">
              إدارة المجالس الأكاديمية
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground max-w-2xl leading-relaxed">
              إدارة مجالس الكلية والأقسام والاجتماعات والموضوعات والقرارات من مساحة تشغيل موحدة.
            </p>
          </div>
        </div>
        {selectedCouncil ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            data-testid="admin-councils-reports-action"
            onClick={() => setWorkspaceTab("reports")}
          >
            التقارير
          </Button>
        ) : null}
      </header>

      {isError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          تعذّر تحميل بيانات المجالس حالياً. يرجى إعادة المحاولة.
        </div>
      ) : null}

      <div
        data-testid="admin-councils-operational-summary"
        className="grid grid-cols-2 lg:grid-cols-4 gap-2"
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            data-testid={k.testId}
            className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-start gap-2 min-w-0"
          >
            <k.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">{k.label}</div>
              <div className="mt-0.5 text-sm font-bold text-primary">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : k.value}
              </div>
            </div>
          </div>
        ))}
        {selectedCouncil && meetingsQuery.isSuccess && minutesReviewCount > 0 ? (
          <div
            data-testid="admin-kpi-minutes-review"
            className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-start gap-2 min-w-0 col-span-2 lg:col-span-1"
          >
            <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">محاضر بانتظار الاعتماد</div>
              <div className="mt-0.5 text-sm font-bold text-primary">{minutesReviewCount}</div>
            </div>
          </div>
        ) : null}
      </div>

      <section
        data-testid="admin-selected-council-control"
        className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-bold text-primary shrink-0" htmlFor="admin-council-select">
            المجلس الحالي
          </label>
          <Select
            value={selectedCouncilId ?? undefined}
            onValueChange={(v) => selectCouncil(v)}
            dir="rtl"
            disabled={isLoading || allCouncils.length === 0}
          >
            <SelectTrigger
              id="admin-council-select"
              className="sm:max-w-md"
              data-testid="admin-council-select"
            >
              <SelectValue placeholder="اختر مجلساً للعمل عليه" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {allCouncils.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {councilTypeLabel(c.council_type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-6" role="status" aria-label="جاري التحميل">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : allCouncils.length === 0 ? (
          <EmptyState text="لا توجد مجالس مفعّلة حالياً." />
        ) : (
          <ul
            data-testid="admin-council-cards"
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          >
            {allCouncils.map((c) => (
              <CompactCouncilCard
                key={c.id}
                council={c}
                selected={selectedCouncilId === c.id}
                onSelect={() => selectCouncil(c.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {!selectedCouncil ? (
        <div
          data-testid="admin-councils-no-selection"
          className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center space-y-2"
        >
          <Users2 className="h-8 w-8 text-muted-foreground mx-auto" aria-hidden />
          <p className="text-sm font-medium text-foreground">اختر مجلساً لفتح مساحة العمل التشغيلية</p>
          <p className="text-xs text-muted-foreground">
            بعد الاختيار تظهر نظرة عامة والأعضاء والاجتماعات والموضوعات وجدول الأعمال.
          </p>
        </div>
      ) : (
        <>
          <section
            data-testid="admin-council-context-header"
            className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-start justify-between gap-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-primary text-base">{selectedCouncil.name}</h2>
                <Badge variant="outline" className="text-[10px]">
                  {councilTypeLabel(selectedCouncil.council_type)}
                </Badge>
                <Badge
                  variant={selectedCouncil.is_active ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {selectedCouncil.is_active ? "مفعّل" : "غير مفعّل"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                الأعضاء النشطون: {selectedCouncil.members_count}
                {selectedCouncil.next_meeting_at
                  ? ` · الاجتماع القادم: ${formatDateTime(selectedCouncil.next_meeting_at)}`
                  : " · لا يوجد اجتماع قادم مسجّل"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                تتوفر الإجراءات وفق عضويتك وصلاحيتك داخل المجلس.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs min-h-9"
                onClick={goMembers}
              >
                <Users2 className="h-3.5 w-3.5" aria-hidden />
                إدارة العضويات
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 text-xs min-h-9"
                onClick={goMeetings}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                جدولة اجتماع
              </Button>
            </div>
          </section>

          <Tabs
            value={workspaceTab}
            onValueChange={setWorkspaceTab}
            dir="rtl"
            data-testid="admin-councils-workspace-tabs"
          >
            <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1">
              <TabsTrigger
                value="overview"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-overview"
              >
                <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                نظرة عامة
              </TabsTrigger>
              <TabsTrigger
                value="members"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-members"
              >
                <Users2 className="h-3.5 w-3.5" aria-hidden />
                الأعضاء
              </TabsTrigger>
              <TabsTrigger
                value="meetings"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-meetings"
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                الاجتماعات
              </TabsTrigger>
              <TabsTrigger
                value="topics"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-topics"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                الموضوعات
              </TabsTrigger>
              <TabsTrigger
                value="agenda"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-agenda"
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                جدول الأعمال
              </TabsTrigger>
              <TabsTrigger
                value="minutes-decisions"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-minutes-decisions"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                المحاضر والقرارات
              </TabsTrigger>
              <TabsTrigger
                value="follow-up"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-follow-up"
              >
                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                المتابعة
              </TabsTrigger>
              <TabsTrigger
                value="archive"
                className="min-h-10 flex-1 sm:flex-none text-xs sm:text-sm gap-1.5"
                data-testid="admin-tab-archive"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
                الأرشيف
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <AdminActionRequiredPanel
                items={actionItems}
                onNavigate={(tab) => setWorkspaceTab(tab)}
              />
              {nextMeeting ? (
                <AdminNextMeetingPriority
                  meeting={nextMeeting}
                  onOpenMeetings={() => setWorkspaceTab("meetings")}
                  onOpenAgenda={() => setWorkspaceTab("agenda")}
                  onOpenTopics={() => setWorkspaceTab("topics")}
                />
              ) : meetingsQuery.isLoading ? (
                <div className="grid place-items-center py-8" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <EmptyState text="لا يوجد اجتماع قادم لهذا المجلس." />
              )}
            </TabsContent>

            <TabsContent value="members" className="mt-4" data-testid="admin-tab-panel-members">
              <CouncilMembershipPanel council={selectedCouncil} />
            </TabsContent>

            <TabsContent value="meetings" className="mt-4" data-testid="admin-tab-panel-meetings">
              <CouncilMeetingsPanel council={selectedCouncil} />
            </TabsContent>

            <TabsContent value="topics" className="mt-4" data-testid="admin-tab-panel-topics">
              <CouncilTopicReviewQueuePanel council={selectedCouncil} />
            </TabsContent>

            <TabsContent value="agenda" className="mt-4" data-testid="admin-tab-panel-agenda">
              <CouncilAgendaPanel council={selectedCouncil} />
            </TabsContent>

            <TabsContent
              value="minutes-decisions"
              className="mt-4"
              data-testid="admin-tab-panel-minutes-decisions"
            >
              <MinutesDecisionsPanel
                meetings={allMeetings}
                isLoading={meetingsQuery.isLoading}
                isError={meetingsQuery.isError}
              />
            </TabsContent>

            <TabsContent value="follow-up" className="mt-4" data-testid="admin-tab-panel-follow-up">
              <FollowUpPanel />
            </TabsContent>

            <TabsContent value="archive" className="mt-4" data-testid="admin-tab-panel-archive">
              <ArchivePanel
                meetings={allMeetings}
                isLoading={meetingsQuery.isLoading}
                isError={meetingsQuery.isError}
              />
            </TabsContent>

            <TabsContent value="reports" className="mt-4" data-testid="admin-tab-panel-reports">
              <CouncilReportsView
                councilId={selectedCouncil.id}
                councilName={selectedCouncil.name}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
