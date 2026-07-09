import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAdminResearchPapers,
  listAdminResearchFacultyOptions,
  upsertAdminResearchPaper,
  deleteAdminResearchPaper,
} from "@/lib/admin-research.functions";
import { uploadAdminStorageFile, removeAdminStorageFile } from "@/lib/admin-storage.functions";
import { readFileAsBase64, storagePathFromPublicUrl } from "@/lib/file-upload";
import { validateUpload } from "@/lib/storage-validation";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  FileText,
  Loader2,
  Upload,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
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

export const Route = createFileRoute("/admin/research")({
  component: AdminResearchPage,
});

type Paper = {
  id: string;
  title_ar: string;
  title_en: string | null;
  abstract_ar: string | null;
  abstract_en: string | null;
  authors: string;
  publication_year: number;
  journal_name: string | null;
  faculty_id: string | null;
  pdf_url: string | null;
  external_url: string | null;
  doi: string | null;
  keywords: string | null;
  is_published: boolean;
};

type FacultyOpt = { id: string; full_name_ar: string };

const PAGE_SIZE = 10;
const PDF_BUCKET = "research-pdfs";

function AdminResearchPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminResearchPapers);
  const listFacultyFn = useServerFn(listAdminResearchFacultyOptions);
  const deleteFn = useServerFn(deleteAdminResearchPaper);
  const removeStorageFn = useServerFn(removeAdminStorageFile);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [facultyFilter, setFacultyFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Paper | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Paper | null>(null);

  const { data: papers = [], isLoading } = useQuery({
    queryKey: ["admin-research"],
    queryFn: async () => (await listFn({ data: {} })) as Paper[],
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ["admin-faculty-options"],
    queryFn: async () => (await listFacultyFn({ data: {} })) as FacultyOpt[],
  });

  const facultyMap = useMemo(
    () => Object.fromEntries(faculty.map((f) => [f.id, f.full_name_ar])),
    [faculty],
  );

  const years = useMemo(() => {
    const s = new Set(papers.map((p) => p.publication_year));
    return Array.from(s).sort((a, b) => b - a);
  }, [papers]);

  const filtered = useMemo(() => {
    return papers.filter((p) => {
      if (search && !p.title_ar.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (yearFilter !== "all" && String(p.publication_year) !== yearFilter)
        return false;
      if (facultyFilter !== "all" && p.faculty_id !== facultyFilter)
        return false;
      return true;
    });
  }, [papers, search, yearFilter, facultyFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      if (deleting.pdf_url) {
        const path = storagePathFromPublicUrl(PDF_BUCKET, deleting.pdf_url);
        if (path) {
          await removeStorageFn({ data: { bucket: PDF_BUCKET, path } });
        }
      }
      await deleteFn({ data: { id: deleting.id } });
      toast.success("تم حذف البحث");
      qc.invalidateQueries({ queryKey: ["admin-research"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إدارة الأبحاث العلمية</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} بحث
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          variant="gold"
        >
          <Plus className="ml-2 h-4 w-4" /> بحث جديد
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالعنوان..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pr-9"
          />
        </div>
        <Select
          value={yearFilter}
          onValueChange={(v) => {
            setYearFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="السنة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل السنوات</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={facultyFilter}
          onValueChange={(v) => {
            setFacultyFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="عضو هيئة التدريس" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأعضاء</SelectItem>
            {faculty.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.full_name_ar}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pageItems.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <FileText className="mx-auto h-10 w-10 mb-3 opacity-50" />
            لا توجد أبحاث مضافة بعد
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">العنوان</th>
                  <th className="p-3 font-medium">الباحثون</th>
                  <th className="p-3 font-medium">السنة</th>
                  <th className="p-3 font-medium">المجلة</th>
                  <th className="p-3 font-medium">الملف</th>
                  <th className="p-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 max-w-[280px]">
                      <div className="font-medium line-clamp-2">{p.title_ar}</div>
                      {p.faculty_id && facultyMap[p.faculty_id] && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {facultyMap[p.faculty_id]}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground max-w-[200px] line-clamp-2">
                      {p.authors}
                    </td>
                    <td className="p-3">{p.publication_year}</td>
                    <td className="p-3 text-muted-foreground max-w-[180px] truncate">
                      {p.journal_name ?? "—"}
                    </td>
                    <td className="p-3">
                      {p.pdf_url ? (
                        <a
                          href={p.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-red-600 hover:underline"
                        >
                          <FileText className="h-4 w-4" /> PDF
                        </a>
                      ) : p.external_url ? (
                        <a
                          href={p.external_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" /> رابط
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing(p);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 text-teal-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleting(p)}
                        >
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">
              صفحة {page} من {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ResearchFormDialog
        open={open}
        onOpenChange={setOpen}
        paper={editing}
        faculty={faculty}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-research"] })}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذا البحث؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف البحث والملف المرفق نهائياً ولا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ResearchFormDialog({
  open,
  onOpenChange,
  paper,
  faculty,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  paper: Paper | null;
  faculty: FacultyOpt[];
  onSaved: () => void;
}) {
  const uploadFn = useServerFn(uploadAdminStorageFile);
  const removeStorageFn = useServerFn(removeAdminStorageFile);
  const upsertFn = useServerFn(upsertAdminResearchPaper);
  const isEdit = !!paper;
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [abstractAr, setAbstractAr] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [journal, setJournal] = useState("");
  const [facultyId, setFacultyId] = useState<string>("");
  const [doi, setDoi] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitleAr(paper?.title_ar ?? "");
      setTitleEn(paper?.title_en ?? "");
      setAbstractAr(paper?.abstract_ar ?? "");
      setAuthors(paper?.authors ?? "");
      setYear(paper?.publication_year ?? new Date().getFullYear());
      setJournal(paper?.journal_name ?? "");
      setFacultyId(paper?.faculty_id ?? "");
      setDoi(paper?.doi ?? "");
      setExternalUrl(paper?.external_url ?? "");
      setPdfUrl(paper?.pdf_url ?? "");
      setFile(null);
    }
  }, [open, paper]);

  const uploadPdf = async (): Promise<string | null> => {
    if (!file) return pdfUrl || null;
    const validation = validateUpload(file, "research_pdf");
    if (!validation.ok) {
      toast.error(validation.message);
      return null;
    }
    setUploading(true);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const { publicUrl } = await uploadFn({
        data: {
          bucket: PDF_BUCKET,
          fileBase64,
          contentType: file.type || "application/pdf",
          fileName: file.name,
          maxBytes: 20 * 1024 * 1024,
        },
      });
      if (paper?.pdf_url) {
        const prevPath = storagePathFromPublicUrl(PDF_BUCKET, paper.pdf_url);
        if (prevPath) {
          await removeStorageFn({ data: { bucket: PDF_BUCKET, path: prevPath } });
        }
      }
      return publicUrl;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الملف");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!titleAr.trim()) return toast.error("العنوان مطلوب");
    if (!authors.trim()) return toast.error("الباحثون مطلوبون");
    if (!year || year < 1900 || year > 2100)
      return toast.error("سنة النشر غير صحيحة");

    setSaving(true);
    try {
      let finalPdf: string | null = pdfUrl || null;
      if (file) {
        finalPdf = await uploadPdf();
        if (file && finalPdf === null) {
          setSaving(false);
          return;
        }
      }

      await upsertFn({
        data: {
          id: paper?.id,
          title_ar: titleAr.trim(),
          title_en: titleEn.trim() || null,
          abstract_ar: abstractAr.trim() || null,
          abstract_en: null,
          authors: authors.trim(),
          publication_year: year,
          journal_name: journal.trim() || null,
          faculty_id: facultyId || null,
          doi: doi.trim() || null,
          external_url: externalUrl.trim() || null,
          pdf_url: finalPdf,
        },
      });
      toast.success(isEdit ? "تم تحديث البحث" : "تمت إضافة البحث");
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const removePdf = async () => {
    if (pdfUrl && paper?.pdf_url === pdfUrl) {
      const path = storagePathFromPublicUrl(PDF_BUCKET, pdfUrl);
      if (path) {
        await removeStorageFn({ data: { bucket: PDF_BUCKET, path } });
      }
    }
    setPdfUrl("");
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل البحث" : "بحث جديد"}</DialogTitle>
          <DialogDescription>
            أدخل بيانات البحث العلمي والملف المرفق.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>العنوان (عربي) *</Label>
              <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>العنوان (إنجليزي)</Label>
              <Input
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="md:col-span-2">
              <Label>الملخص</Label>
              <Textarea
                rows={4}
                value={abstractAr}
                onChange={(e) => setAbstractAr(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label>الباحثون * (افصل بفاصلة)</Label>
              <Input
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="د. أحمد محمد، د. سارة علي"
              />
            </div>
            <div>
              <Label>سنة النشر *</Label>
              <Input
                type="number"
                min={1900}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>اسم المجلة</Label>
              <Input value={journal} onChange={(e) => setJournal(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>عضو هيئة التدريس</Label>
              <Select
                value={facultyId || "none"}
                onValueChange={(v) => setFacultyId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر عضو هيئة تدريس" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— لا يوجد —</SelectItem>
                  {faculty.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.full_name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>DOI</Label>
              <Input value={doi} onChange={(e) => setDoi(e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>رابط خارجي</Label>
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="md:col-span-2">
              <Label>ملف PDF</Label>
              {pdfUrl && !file ? (
                <div className="flex items-center justify-between rounded-md border p-3 mt-1">
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-red-600 hover:underline"
                  >
                    <FileText className="h-4 w-4" /> الملف الحالي
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={removePdf}
                  >
                    <X className="h-4 w-4" /> إزالة
                  </Button>
                </div>
              ) : (
                <div className="mt-1">
                  <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 cursor-pointer hover:bg-muted/50">
                    <Upload className="h-4 w-4" />
                    <span className="text-sm">
                      {file ? file.name : "اختر ملف PDF (حد أقصى 20MB)"}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {file && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFile(null)}
                      className="mt-1"
                    >
                      <X className="h-4 w-4 ml-1" /> إلغاء الاختيار
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || uploading}
            variant="gold"
          >
            {(saving || uploading) && (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            )}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
