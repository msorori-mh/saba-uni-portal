import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { scheduleCouncilMeeting } from "@/lib/admin-councils.functions";
import { firstMeetingDateError } from "@/lib/councils-meeting-dates";
import type { MyCouncilMembershipV2 } from "@/lib/faculty-councils.functions";
import { extractErrorMessage, mapMeetingUiError, toIsoFromDatetimeLocal } from "./shared";

export type ScheduleMeetingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chairMemberships: MyCouncilMembershipV2[];
  onScheduled: () => void;
};

export function ScheduleMeetingDialog({
  open,
  onOpenChange,
  chairMemberships,
  onScheduled,
}: ScheduleMeetingDialogProps) {
  const scheduleMeeting = useServerFn(scheduleCouncilMeeting);
  const [councilId, setCouncilId] = useState(chairMemberships[0]?.council_id ?? "");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [intakeOpensAt, setIntakeOpensAt] = useState("");
  const [intakeClosesAt, setIntakeClosesAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !chairMemberships.some((m) => m.council_id === councilId)) {
      setCouncilId(chairMemberships[0]?.council_id ?? "");
    }
  }, [chairMemberships, councilId, open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!councilId) return;
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
    const dateError = firstMeetingDateError({
      scheduledAt: scheduledIso,
      intakeOpensAt: intakeOpensIso ?? null,
      intakeClosesAt: intakeClosesIso ?? null,
    });
    if (dateError) {
      toast.error(dateError);
      return;
    }
    setBusy(true);
    try {
      await scheduleMeeting({
        data: {
          councilId,
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
      onScheduled();
      onOpenChange(false);
    } catch (err) {
      toast.error(mapMeetingUiError(extractErrorMessage(err), "schedule"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        dir="rtl"
        data-testid="schedule-meeting-dialog"
        className="max-h-[90vh] max-w-lg overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>جدولة اجتماع</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            بصفتك رئيس مجلس، يمكنك جدولة اجتماع لمجلسك فقط. الحماية النهائية عبر صلاحيات قاعدة
            البيانات.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">المجلس</label>
            <Select value={councilId} onValueChange={setCouncilId} dir="rtl">
              <SelectTrigger>
                <SelectValue placeholder="اختر المجلس" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {chairMemberships.map((m) => (
                  <SelectItem key={m.membership_id} value={m.council_id}>
                    {m.council_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">عنوان الاجتماع</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
            <Input value={location} onChange={(e) => setLocation(e.target.value)} dir="rtl" />
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium">ملاحظات (اختياري)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} dir="rtl" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-9"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
            <Button type="submit" className="min-h-9 gap-2" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4" />
              )}
              جدولة الاجتماع
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
