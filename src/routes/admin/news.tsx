import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Upload,
  Search,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/admin/news")({
  component: AdminNewsPage,
});

type NewsRow = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  content_ar: string | null;
  content_en: string | null;
  excerpt_ar: string | null;
  excerpt_en: string | null;
  featured_image: string | null;
  category: string;
  is_published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
};

const CATEGORIES = [
  { value: "news", label: "أخبار" },
  { value: "announcement", label: "إعلانات" },
  { value: "event", label: "فعاليات" },
  { value: "general", label: "عام" },
];

const PAGE_SIZE = 10;

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s\u0600-\u06FF]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || `news-${Date.now()}`;
}

function AdminNewsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NewsRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NewsRow | null>(null);

  const { data: allNews = [], isLoading } = useQuery({
    queryKey: ["admin", "news", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news")
        .select("*")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as NewsRow[];
    },
  });

  const filtered = useMemo(() => {
    let list = [...allNews];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((n) => n.title_ar.toLowerCase().includes(s));
    }
    if (category !== "all") list = list.filter((n) => n.category === category);
    if (status !== "all")
      list = list.filter((n) => (status === "published" ? n.is_published : !n.is_published));
    list.sort((a, b) => {
      const da = new Date(a.published_at).getTime();
      const db = new Date(b.published_at).getTime();
      return sortDesc ? db - da : da - db;
    });
    return list;
  }, [allNews, search, category, status, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const togglePublish = async (row: NewsRow) => {
    const { error } = await supabase
      .from("news")
      .update({ is_published: !row.is_published })
      .eq("id", row.id);
    if (error) return toast.error("تعذر تحديث الحالة");
    toast.success(!row.is_published ? "تم نشر الخبر" : "تم إلغاء النشر");
    qc.invalidateQueries({ queryKey: ["admin", "news"] });
    qc.invalidateQueries({ queryKey: ["news"] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("news").delete().eq("id", deleteTarget.id);
    if (error) return toast.error("تعذر حذف الخبر");
    toast.success("تم حذف الخبر");
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["admin", "news"] });
    qc.invalidateQueries({ queryKey: ["news"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">
            إدارة الأخبار
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إضافة وتعديل وحذف الأخبار والإعلانات والفعاليات.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="bg-gold-gradient text-primary font-bold hover:opacity-90"
        >
          <Plus className="h-4 w-4 ml-1" />
          خبر جديد
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-card border border-border p-4 shadow-card grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالعنوان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="التصنيف" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="published">منشور</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-right">
                <th className="p-3 font-semibold text-primary">الصورة</th>
                <th className="p-3 font-semibold text-primary">العنوان</th>
                <th className="p-3 font-semibold text-primary">التصنيف</th>
                <th className="p-3 font-semibold text-primary">الحالة</th>
                <th
                  className="p-3 font-semibold text-primary cursor-pointer select-none"
                  onClick={() => setSortDesc((v) => !v)}
                >
                  تاريخ النشر {sortDesc ? "↓" : "↑"}
                </th>
                <th className="p-3 font-semibold text-primary">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin inline text-primary" />
                  </td>
                </tr>
              )}
              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/50" />
                    <p className="mt-3 text-muted-foreground">
                      لا توجد أخبار مضافة بعد
                    </p>
                  </td>
                </tr>
              )}
              {pageItems.map((n) => (
                <tr key={n.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    {n.featured_image ? (
                      <img
                        src={n.featured_image}
                        alt=""
                        className="h-12 w-16 object-cover rounded"
                      />
                    ) : (
                      <div className="h-12 w-16 rounded bg-secondary grid place-items-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-semibold text-primary max-w-[280px]">
                    <div className="line-clamp-2">{n.title_ar}</div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {CATEGORIES.find((c) => c.value === n.category)?.label || n.category}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={n.is_published}
                        onCheckedChange={() => togglePublish(n)}
                      />
                      <span
                        className={`text-xs font-semibold ${
                          n.is_published ? "text-green-600" : "text-muted-foreground"
                        }`}
                      >
                        {n.is_published ? "منشور" : "مسودة"}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(n.published_at).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <a
                        href={`/news/${n.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-gold text-gold-dark hover:bg-gold/10 transition-colors"
                        title="عرض"
                      >
                        <Eye className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => {
                          setEditing(n);
                          setFormOpen(true);
                        }}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                        title="تعديل"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(n)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-destructive text-destructive-foreground hover:opacity-90"
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="text-xs text-muted-foreground">
              {filtered.length} خبر · صفحة {page} من {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </div>

      <NewsFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin", "news"] });
          qc.invalidateQueries({ queryKey: ["news"] });
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا الخبر؟ لا يمكن التراجع عن هذه العملية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewsFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: NewsRow | null;
  onSaved: () => void;
}) {
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [excerptAr, setExcerptAr] = useState("");
  const [contentAr, setContentAr] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [category, setCategory] = useState("news");
  const [isPublished, setIsPublished] = useState(true);
  const [featuredImage, setFeaturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setTitleAr(editing?.title_ar || "");
      setTitleEn(editing?.title_en || "");
      setExcerptAr(editing?.excerpt_ar || "");
      setContentAr(editing?.content_ar || "");
      setContentEn(editing?.content_en || "");
      setCategory(editing?.category || "news");
      setIsPublished(editing?.is_published ?? true);
      setFeaturedImage(editing?.featured_image || null);
      setErrors({});
    }
  }, [open, editing]);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      return toast.error("الرجاء اختيار ملف صورة");
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت");
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("news-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) {
      setUploading(false);
      return toast.error("فشل رفع الصورة: " + error.message);
    }
    const { data } = supabase.storage.from("news-images").getPublicUrl(path);
    setFeaturedImage(data.publicUrl);
    setUploading(false);
    toast.success("تم رفع الصورة");
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (titleAr.trim().length < 3) e.titleAr = "العنوان مطلوب (3 أحرف على الأقل)";
    if (excerptAr.trim().length < 5) e.excerptAr = "الملخص مطلوب";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      title_ar: titleAr.trim(),
      title_en: titleEn.trim() || null,
      excerpt_ar: excerptAr.trim(),
      content_ar: contentAr.trim() || null,
      content_en: contentEn.trim() || null,
      category,
      is_published: isPublished,
      featured_image: featuredImage,
      slug: editing?.slug || slugify(titleAr),
    };
    const { error } = editing
      ? await supabase.from("news").update(payload).eq("id", editing.id)
      : await supabase.from("news").insert(payload);
    setSaving(false);
    if (error) return toast.error("فشل الحفظ: " + error.message);
    toast.success(editing ? "تم تحديث الخبر" : "تم إنشاء الخبر");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-primary">
            {editing ? "تعديل الخبر" : "خبر جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Image upload */}
          <div>
            <Label>الصورة الرئيسية</Label>
            <div className="mt-2 flex items-start gap-4">
              <div className="h-28 w-40 rounded-lg border-2 border-dashed border-border bg-secondary/30 overflow-hidden grid place-items-center">
                {featuredImage ? (
                  <img
                    src={featuredImage}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span>{uploading ? "جارٍ الرفع..." : "رفع صورة"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                    }}
                  />
                </label>
                {featuredImage && (
                  <button
                    onClick={() => setFeaturedImage(null)}
                    className="block text-xs text-destructive hover:underline"
                  >
                    إزالة الصورة
                  </button>
                )}
                <Input
                  placeholder="أو الصق رابط الصورة"
                  value={featuredImage || ""}
                  onChange={(e) => setFeaturedImage(e.target.value || null)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="titleAr">العنوان (عربي) *</Label>
              <Input
                id="titleAr"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                className="mt-1"
              />
              {errors.titleAr && (
                <p className="text-xs text-destructive mt-1">{errors.titleAr}</p>
              )}
            </div>
            <div>
              <Label htmlFor="titleEn">العنوان (إنجليزي)</Label>
              <Input
                id="titleEn"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                className="mt-1"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="excerpt">الملخص *</Label>
            <Textarea
              id="excerpt"
              value={excerptAr}
              onChange={(e) => setExcerptAr(e.target.value)}
              rows={2}
              className="mt-1"
            />
            {errors.excerptAr && (
              <p className="text-xs text-destructive mt-1">{errors.excerptAr}</p>
            )}
          </div>

          <div>
            <Label htmlFor="contentAr">المحتوى (عربي)</Label>
            <Textarea
              id="contentAr"
              value={contentAr}
              onChange={(e) => setContentAr(e.target.value)}
              rows={6}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="contentEn">المحتوى (إنجليزي)</Label>
            <Textarea
              id="contentEn"
              value={contentEn}
              onChange={(e) => setContentEn(e.target.value)}
              rows={4}
              className="mt-1"
              dir="ltr"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>التصنيف</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-input bg-background p-3">
              <div>
                <Label>نشر فوري</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {isPublished ? "الخبر سيكون مرئياً للعامة" : "حفظ كمسودة"}
                </p>
              </div>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || uploading}
            className="bg-gold-gradient text-primary font-bold hover:opacity-90"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            {editing ? "حفظ التعديلات" : "نشر الخبر"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
