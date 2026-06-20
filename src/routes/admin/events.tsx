import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAdminEvents,
  upsertAdminEvent,
  deleteAdminEvent,
  toggleAdminEventPublish,
} from "@/lib/admin-events.functions";
import { uploadAdminStorageFile, removeAdminStorageFile } from "@/lib/admin-storage.functions";
import { readFileAsBase64, storagePathFromPublicUrl } from "@/lib/file-upload";
import {
  Plus, Pencil, Trash2, Calendar as CalendarIcon, MapPin, Loader2, Upload, X, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/events")({
  component: AdminEventsPage,
});

const BUCKET = "events-images";

type EventRow = {
  id: string;
  title_ar: string;
  title_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
  image: string | null;
  is_published: boolean;
  is_featured: boolean;
  registration_url: string | null;
};

function AdminEventsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminEvents);
  const deleteFn = useServerFn(deleteAdminEvent);
  const toggleFn = useServerFn(toggleAdminEventPublish);
  const removeStorageFn = useServerFn(removeAdminStorageFile);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<EventRow | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => (await listFn({ data: {} })) as EventRow[],
  });

  const sorted = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const upcoming = events.filter((e) => e.event_date >= today);
    const past = events.filter((e) => e.event_date < today).reverse();
    const all = [...upcoming, ...past];
    if (!search) return all;
    return all.filter((e) =>
      e.title_ar.toLowerCase().includes(search.toLowerCase()),
    );
  }, [events, search]);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      if (deleting.image) {
        const path = storagePathFromPublicUrl(BUCKET, deleting.image);
        if (path) {
          await removeStorageFn({ data: { bucket: BUCKET, path } });
        }
      }
      await deleteFn({ data: { id: deleting.id } });
      toast.success("تم حذف الفعالية");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      setDeleting(null);
    }
  };

  const togglePublish = async (ev: EventRow, val: boolean) => {
    try {
      await toggleFn({ data: { id: ev.id, is_published: val } });
      toast.success(val ? "تم النشر" : "تم إلغاء النشر");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر التحديث");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إدارة الفعاليات</h1>
          <p className="text-sm text-muted-foreground">{sorted.length} فعالية</p>
        </div>
        <Button
          onClick={() => { setEditing(null); setOpen(true); }}
          style={{ backgroundColor: "#d4af37", color: "#000" }}
        >
          <Plus className="ml-2 h-4 w-4" /> فعالية جديدة
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالعنوان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <CalendarIcon className="mx-auto h-10 w-10 mb-3 opacity-50" />
            لا توجد فعاليات
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">الصورة</th>
                  <th className="p-3 font-medium">العنوان</th>
                  <th className="p-3 font-medium">التاريخ</th>
                  <th className="p-3 font-medium">المكان</th>
                  <th className="p-3 font-medium">الحالة</th>
                  <th className="p-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((ev) => {
                  const isPast = ev.event_date < new Date().toISOString().split("T")[0];
                  return (
                    <tr key={ev.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        {ev.image ? (
                          <img src={ev.image} alt="" className="h-12 w-16 object-cover rounded" />
                        ) : (
                          <div className="h-12 w-16 grid place-items-center bg-muted rounded text-muted-foreground">
                            <CalendarIcon className="h-4 w-4" />
                          </div>
                        )}
                      </td>
                      <td className="p-3 max-w-[260px]">
                        <div className="font-medium line-clamp-2">{ev.title_ar}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span>{new Date(ev.event_date).toLocaleDateString("ar-EG")}</span>
                          {ev.event_time && (
                            <span className="text-xs text-muted-foreground">{ev.event_time}</span>
                          )}
                          {isPast && <Badge variant="outline" className="w-fit mt-1 text-[10px]">منتهية</Badge>}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {ev.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {ev.location}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3">
                        <Switch
                          checked={ev.is_published}
                          onCheckedChange={(v) => togglePublish(ev, v)}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(ev); setOpen(true); }}>
                            <Pencil className="h-4 w-4 text-teal-600" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleting(ev)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EventFormDialog
        open={open}
        onOpenChange={setOpen}
        event={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-events"] })}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الفعالية؟</AlertDialogTitle>
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

function EventFormDialog({
  open, onOpenChange, event, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: EventRow | null;
  onSaved: () => void;
}) {
  const uploadFn = useServerFn(uploadAdminStorageFile);
  const removeStorageFn = useServerFn(removeAdminStorageFile);
  const upsertFn = useServerFn(upsertAdminEvent);
  const isEdit = !!event;
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descAr, setDescAr] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isPublished, setIsPublished] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitleAr(event?.title_ar ?? "");
      setTitleEn(event?.title_en ?? "");
      setDescAr(event?.description_ar ?? "");
      setDate(event?.event_date ?? "");
      setTime(event?.event_time ?? "");
      setLocation(event?.location ?? "");
      setRegistrationUrl(event?.registration_url ?? "");
      setImageUrl(event?.image ?? "");
      setFile(null);
      setIsPublished(event?.is_published ?? true);
      setIsFeatured(event?.is_featured ?? false);
    }
  }, [open, event]);

  const uploadImage = async (): Promise<string | null> => {
    if (!file) return imageUrl || null;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5MB");
      return null;
    }
    try {
      const fileBase64 = await readFileAsBase64(file);
      const { publicUrl } = await uploadFn({
        data: {
          bucket: BUCKET,
          fileBase64,
          contentType: file.type,
          fileName: file.name,
          maxBytes: 5 * 1024 * 1024,
        },
      });
      if (event?.image) {
        const prevPath = storagePathFromPublicUrl(BUCKET, event.image);
        if (prevPath) {
          await removeStorageFn({ data: { bucket: BUCKET, path: prevPath } });
        }
      }
      return publicUrl;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
      return null;
    }
  };

  const handleSave = async () => {
    if (!titleAr.trim()) return toast.error("العنوان مطلوب");
    if (!date) return toast.error("التاريخ مطلوب");

    setSaving(true);
    try {
      const finalImage = file ? await uploadImage() : imageUrl || null;
      if (file && !finalImage) { setSaving(false); return; }

      await upsertFn({
        data: {
          id: event?.id,
          title_ar: titleAr.trim(),
          title_en: titleEn.trim() || null,
          description_ar: descAr.trim() || null,
          description_en: null,
          event_date: date,
          event_time: time || null,
          location: location.trim() || null,
          registration_url: registrationUrl.trim() || null,
          image: finalImage,
          is_published: isPublished,
          is_featured: isFeatured,
        },
      });
      toast.success(isEdit ? "تم التحديث" : "تمت الإضافة");
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل الفعالية" : "فعالية جديدة"}</DialogTitle>
          <DialogDescription>أدخل بيانات الفعالية.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2 py-2">
          <div className="md:col-span-2">
            <Label>العنوان (عربي) *</Label>
            <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>العنوان (إنجليزي)</Label>
            <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} dir="ltr" />
          </div>
          <div className="md:col-span-2">
            <Label>الوصف</Label>
            <Textarea rows={4} value={descAr} onChange={(e) => setDescAr(e.target.value)} />
          </div>
          <div>
            <Label>التاريخ *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>الوقت</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>المكان</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>رابط التسجيل</Label>
            <Input value={registrationUrl} onChange={(e) => setRegistrationUrl(e.target.value)} dir="ltr" />
          </div>

          <div className="md:col-span-2">
            <Label>الصورة</Label>
            {imageUrl && !file ? (
              <div className="relative mt-1 w-fit">
                <img src={imageUrl} alt="" className="h-32 rounded border object-cover" />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 cursor-pointer hover:bg-muted/50 mt-1">
                <Upload className="h-4 w-4" />
                <span className="text-sm">{file ? file.name : "اختر صورة (5MB حد أقصى)"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            <Label>منشور</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
            <Label>مميزة</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: "#d4af37", color: "#000" }}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
