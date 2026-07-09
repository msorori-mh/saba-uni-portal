import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listContactMessages,
  updateContactMessageStatus,
  deleteContactMessage,
} from "@/lib/admin-contacts.functions";
import { toast } from "sonner";
import {
  Mail, Trash2, Eye, CheckCheck, Reply, Loader2, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/contacts")({
  component: AdminContactsPage,
});

type Message = {
  id: string;
  full_name: string;
  email: string;
  subject: string;
  message: string;
  status: string; // 'new' | 'read' | 'replied'
  is_read: boolean;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "جديدة",
  read: "مقروءة",
  replied: "تم الرد",
};

function AdminContactsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContactMessages);
  const updateStatusFn = useServerFn(updateContactMessageStatus);
  const deleteFn = useServerFn(deleteContactMessage);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["admin-contacts"],
    queryFn: () => listFn({ data: {} }),
  });

  const filtered = useMemo(
    () => (statusFilter === "all" ? messages : messages.filter((m) => m.status === statusFilter)),
    [messages, statusFilter],
  );

  const newCount = useMemo(() => messages.filter((m) => m.status === "new").length, [messages]);

  const updateStatus = async (m: Message, status: "new" | "read" | "replied") => {
    try {
      await updateStatusFn({ data: { id: m.id, status } });
      qc.invalidateQueries({ queryKey: ["admin-contacts"] });
      qc.invalidateQueries({ queryKey: ["sidebar-new-messages"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث الحالة");
    }
  };

  const handleView = async (m: Message) => {
    setViewing(m);
    if (m.status === "new") await updateStatus(m, "read");
  };

  const handleReply = async (m: Message) => {
    const subject = encodeURIComponent(`Re: ${m.subject}`);
    window.location.href = `mailto:${m.email}?subject=${subject}`;
    await updateStatus(m, "replied");
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteFn({ data: { id: deleting.id } });
      toast.success("تم حذف الرسالة");
      qc.invalidateQueries({ queryKey: ["admin-contacts"] });
      qc.invalidateQueries({ queryKey: ["sidebar-new-messages"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر الحذف");
    }
    setDeleting(null);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">رسائل التواصل</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} رسالة
            {newCount > 0 && (
              <span className="mr-2 text-amber-600 font-semibold">• {newCount} جديدة</span>
            )}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الرسائل</SelectItem>
            <SelectItem value="new">جديدة</SelectItem>
            <SelectItem value="read">مقروءة</SelectItem>
            <SelectItem value="replied">تم الرد</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Inbox className="mx-auto h-10 w-10 mb-3 opacity-50" />
            لا توجد رسائل
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">الاسم</th>
                  <th className="p-3 font-medium">البريد</th>
                  <th className="p-3 font-medium">الموضوع</th>
                  <th className="p-3 font-medium">الرسالة</th>
                  <th className="p-3 font-medium">الحالة</th>
                  <th className="p-3 font-medium">التاريخ</th>
                  <th className="p-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className={cn(
                      "border-t transition-colors",
                      m.status === "new"
                        ? "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 font-medium"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <td className="p-3">{m.full_name}</td>
                    <td className="p-3 text-muted-foreground" dir="ltr">{m.email}</td>
                    <td className="p-3 max-w-[200px] truncate">{m.subject}</td>
                    <td className="p-3 max-w-[280px] truncate text-muted-foreground">
                      {m.message}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={m.status === "new" ? "default" : "outline"}
                        className={cn(
                          m.status === "new" && "bg-amber-500 hover:bg-amber-600 text-white",
                          m.status === "replied" && "border-green-500 text-green-700",
                        )}
                      >
                        {STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {new Date(m.created_at).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleView(m)} title="عرض">
                          <Eye className="h-4 w-4 text-teal-600" />
                        </Button>
                        {m.status === "new" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => updateStatus(m, "read")}
                            title="تحديد كمقروءة"
                          >
                            <CheckCheck className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => handleReply(m)} title="رد">
                          <Reply className="h-4 w-4 text-amber-600" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleting(m)} title="حذف">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{viewing?.subject}</DialogTitle>
            <DialogDescription>
              من: {viewing?.full_name} •{" "}
              <span dir="ltr" className="inline-block">{viewing?.email}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">
              {viewing && new Date(viewing.created_at).toLocaleString("ar-EG")}
            </div>
            <div className="rounded-md border bg-muted/30 p-4 whitespace-pre-wrap text-sm leading-relaxed">
              {viewing?.message}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>إغلاق</Button>
            <Button
              onClick={() => viewing && handleReply(viewing)}
              variant="gold"
            >
              <Mail className="ml-2 h-4 w-4" /> الرد عبر البريد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الرسالة؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم الحذف نهائياً ولا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
