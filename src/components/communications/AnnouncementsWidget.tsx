import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Megaphone, AlertTriangle, MessageSquare } from "lucide-react";
import { listMyAnnouncements, markAnnouncementViewed } from "@/lib/communications.functions";
import { cn } from "@/lib/utils";

const TYPE_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  academic: "bg-blue-100 text-blue-700 border-blue-200",
  finance: "bg-amber-100 text-amber-700 border-amber-200",
  general: "bg-secondary text-primary border-border",
};
const TYPE_LABEL: Record<string, string> = { urgent: "عاجل", academic: "أكاديمي", finance: "مالي", general: "عام" };

export function AnnouncementsWidget({ limit = 5 }: { limit?: number }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyAnnouncements);
  const markFn = useServerFn(markAnnouncementViewed);

  const { data, isLoading } = useQuery({
    queryKey: ["my-announcements", limit],
    queryFn: () => listFn({ data: { limit } }),
  });

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { announcement_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-announcements"] }),
  });

  const unread = (data ?? []).filter((a) => !a.is_read).length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-primary">الإعلانات</h3>
          {unread > 0 && (
            <span className="rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">{unread}</span>
          )}
        </div>
        <Link to="/messages" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> الرسائل
        </Link>
      </div>

      {isLoading ? (
        <div className="h-20 grid place-items-center text-xs text-muted-foreground">جارٍ التحميل…</div>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground py-4 text-center">لا توجد إعلانات.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((a) => (
            <li key={a.id} className="py-2.5">
              <button
                onClick={() => !a.is_read && mark.mutate(a.id)}
                className="w-full text-right"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {!a.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    {a.announcement_type === "urgent" && <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                    <span className={cn("font-semibold text-sm truncate", !a.is_read && "text-primary")}>{a.title_ar}</span>
                  </div>
                  <span className={cn("text-[10px] border rounded px-1.5 py-0.5 shrink-0", TYPE_COLOR[a.announcement_type])}>
                    {TYPE_LABEL[a.announcement_type] ?? a.announcement_type}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{a.content_ar}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{new Date(a.publish_at).toLocaleString("ar-EG")}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
