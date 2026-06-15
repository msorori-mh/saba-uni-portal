import { createFileRoute } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
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
  User as UserIcon,
  Loader2,
  Mail,
  Phone,
  X,
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

export const Route = createFileRoute("/admin/faculty")({
  component: AdminFacultyPage,
});

type Faculty = {
  id: string;
  employee_id: string;
  full_name_ar: string;
  full_name_en: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  rank: string | null;
  specialization: string | null;
  program_id: string | null;
  photo: string | null;
  bio_ar: string | null;
  bio_en: string | null;
  is_active: boolean;
  sort_order: number;
};

type Program = { id: string; name_ar: string };

const RANKS = [
  { value: "أستاذ", label: "أستاذ" },
  { value: "أستاذ مشارك", label: "أستاذ مشارك" },
  { value: "أستاذ مساعد", label: "أستاذ مساعد" },
  { value: "محاضر", label: "محاضر" },
  { value: "معيد", label: "معيد" },
];

function AdminFacultyPage() {
  usePagePerf("/admin/faculty");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("all");
  const [rankFilter, setRankFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [viewing, setViewing] = useState<Faculty | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Faculty | null>(null);

  // PERFORMANCE-FIX-02A: server-side pagination
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, programFilter, rankFilter]);

  const { data: facultyPage, isLoading } = useQuery({
    queryKey: ["admin", "faculty", { search, programFilter, rankFilter, page }],
    queryFn: async () => {
      let q = supabase
        .from("faculty")
        .select("*", { count: "exact" })
        .order("sort_order")
        .order("full_name_ar");
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`full_name_ar.ilike.%${s}%,full_name_en.ilike.%${s}%,email.ilike.%${s}%`);
      }
      if (programFilter !== "all") q = q.eq("program_id", programFilter);
      if (rankFilter !== "all") q = q.eq("rank", rankFilter);
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as Faculty[], total: count ?? 0 };
    },
  });
  const faculty: Faculty[] = facultyPage?.rows ?? [];
  const total = facultyPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: programs = [] } = useQuery({
    queryKey: ["admin", "programs", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("id, name_ar")
        .order("sort_order");
      if (error) throw error;
      return data as Program[];
    },
    staleTime: Infinity,
  });

  const programMap = useMemo(
    () => Object.fromEntries(programs.map((p) => [p.id, p.name_ar])),
    [programs],
  );

  // Filters are applied server-side now; this stays as a no-op alias to minimize churn below.
  const filtered = faculty;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("faculty")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) return toast.error("تعذر حذف العضو");
    toast.success("تم حذف العضو");
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["admin", "faculty"] });
    qc.invalidateQueries({ queryKey: ["faculty"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">
            إدارة أعضاء هيئة التدريس
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إضافة وتعديل بيانات أعضاء هيئة التدريس.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="bg-gold-gradient text-primary font-bold hover:opacity-90"
        >
          <Plus className="h-4 w-4 ml-1" /> عضو جديد
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-card border border-border p-4 shadow-card grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث بالاسم أو البريد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger>
            <SelectValue placeholder="القسم" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {programs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name_ar}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rankFilter} onValueChange={setRankFilter}>
          <SelectTrigger>
            <SelectValue placeholder="الرتبة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الرتب</SelectItem>
            {RANKS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-right">
                <th className="p-3 font-semibold text-primary">الصورة</th>
                <th className="p-3 font-semibold text-primary">الاسم</th>
                <th className="p-3 font-semibold text-primary">القسم</th>
                <th className="p-3 font-semibold text-primary">الرتبة</th>
                <th className="p-3 font-semibold text-primary">البريد</th>
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
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <UserIcon className="h-10 w-10 mx-auto text-muted-foreground/50" />
                    <p className="mt-3 text-muted-foreground">
                      لا يوجد أعضاء مطابقون
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((f) => (
                <tr key={f.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <FacultyAvatar f={f} size={40} />
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-primary">
                      {f.full_name_ar}
                    </div>
                    {f.full_name_en && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {f.full_name_en}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {f.program_id ? programMap[f.program_id] || "—" : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">{f.rank || "—"}</td>
                  <td className="p-3 text-muted-foreground text-xs" dir="ltr">
                    {f.email || "—"}
                  </td>
                  <td className="p-3">
                    <FacultyActions
                      f={f}
                      onView={() => setViewing(f)}
                      onEdit={() => {
                        setEditing(f);
                        setFormOpen(true);
                      }}
                      onDelete={() => setDeleteTarget(f)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl bg-card border border-border p-12 text-center">
            <UserIcon className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-muted-foreground">لا يوجد أعضاء</p>
          </div>
        )}
        {filtered.map((f) => (
          <div
            key={f.id}
            className="rounded-xl bg-card border border-border p-4 shadow-card flex gap-3"
          >
            <FacultyAvatar f={f} size={56} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-primary">{f.full_name_ar}</div>
              <div className="text-xs text-muted-foreground">
                {f.rank || "—"} ·{" "}
                {f.program_id ? programMap[f.program_id] || "—" : "—"}
              </div>
              {f.email && (
                <div
                  className="text-xs text-muted-foreground mt-1 truncate"
                  dir="ltr"
                >
                  {f.email}
                </div>
              )}
              <div className="mt-3">
                <FacultyActions
                  f={f}
                  onView={() => setViewing(f)}
                  onEdit={() => {
                    setEditing(f);
                    setFormOpen(true);
                  }}
                  onDelete={() => setDeleteTarget(f)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground">
            عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:bg-secondary"
            >السابق</button>
            <span className="px-2 font-mono text-xs text-muted-foreground">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:bg-secondary"
            >التالي</button>
          </div>
        </div>
      )}


      <FacultyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        programs={programs}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["admin", "faculty"] });
          qc.invalidateQueries({ queryKey: ["faculty"] });
        }}
      />

      <FacultyDetailDialog
        faculty={viewing}
        onClose={() => setViewing(null)}
        programName={
          viewing?.program_id ? programMap[viewing.program_id] || "" : ""
        }
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا العضو؟ لا يمكن التراجع عن العملية.
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

function FacultyAvatar({ f, size }: { f: Faculty; size: number }) {
  if (f.photo) {
    return (
      <img
        src={f.photo}
        alt={f.full_name_ar}
        className="rounded-full object-cover border-2 border-gold/40"
        style={{ height: size, width: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-secondary border-2 border-gold/40 grid place-items-center text-primary font-bold"
      style={{ height: size, width: size, fontSize: size / 3 }}
    >
      {f.full_name_ar.charAt(0)}
    </div>
  );
}

function FacultyActions({
  onView,
  onEdit,
  onDelete,
}: {
  f: Faculty;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onView}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-gold text-gold-dark hover:bg-gold/10 transition-colors"
        title="عرض"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={onEdit}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground hover:opacity-90"
        title="تعديل"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onDelete}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-destructive text-destructive-foreground hover:opacity-90"
        title="حذف"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function FacultyDetailDialog({
  faculty,
  onClose,
  programName,
}: {
  faculty: Faculty | null;
  onClose: () => void;
  programName: string;
}) {
  const { data: papers = [] } = useQuery({
    queryKey: ["admin", "faculty", "papers", faculty?.id],
    enabled: !!faculty?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_papers")
        .select("id, title_ar, publication_year, journal_name")
        .eq("faculty_id", faculty!.id)
        .order("publication_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Dialog open={!!faculty} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {faculty && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl text-primary">
                ملف عضو هيئة التدريس
              </DialogTitle>
              <DialogDescription>
                المعلومات الكاملة والأبحاث المنشورة
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-4 mt-2">
              <FacultyAvatar f={faculty} size={96} />
              <div className="flex-1">
                <h3 className="font-display text-xl font-extrabold text-primary">
                  {faculty.full_name_ar}
                </h3>
                {faculty.full_name_en && (
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    {faculty.full_name_en}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {faculty.rank && (
                    <span className="px-2 py-1 rounded-full bg-gold-gradient text-primary font-bold">
                      {faculty.rank}
                    </span>
                  )}
                  {programName && (
                    <span className="px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                      {programName}
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {faculty.email && (
                    <div className="flex items-center gap-2" dir="ltr">
                      <Mail className="h-3 w-3" /> {faculty.email}
                    </div>
                  )}
                  {faculty.phone && (
                    <div className="flex items-center gap-2" dir="ltr">
                      <Phone className="h-3 w-3" /> {faculty.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {faculty.bio_ar && (
              <div className="mt-4">
                <h4 className="font-bold text-primary mb-1">السيرة الذاتية</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {faculty.bio_ar}
                </p>
              </div>
            )}

            {faculty.specialization && (
              <div className="mt-4">
                <h4 className="font-bold text-primary mb-2">
                  الاهتمامات البحثية
                </h4>
                <div className="flex flex-wrap gap-2">
                  {faculty.specialization
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded-md bg-secondary text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <h4 className="font-bold text-primary mb-2">
                الأبحاث المنشورة ({papers.length})
              </h4>
              {papers.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد أبحاث.</p>
              ) : (
                <ul className="space-y-2">
                  {papers.map((p) => (
                    <li
                      key={p.id}
                      className="text-sm border-r-2 border-gold pr-3"
                    >
                      <div className="font-semibold text-primary">
                        {p.title_ar}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.journal_name} · {p.publication_year}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FacultyFormDialog({
  open,
  onOpenChange,
  editing,
  programs,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Faculty | null;
  programs: Program[];
  onSaved: () => void;
}) {
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [degree, setDegree] = useState("");
  const [rank, setRank] = useState("");
  const [programId, setProgramId] = useState<string>("none");
  const [bioAr, setBioAr] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setNameAr(editing?.full_name_ar || "");
      setNameEn(editing?.full_name_en || "");
      setEmployeeId(editing?.employee_id || "");
      setEmail(editing?.email || "");
      setPhone(editing?.phone || "");
      setDegree(editing?.degree || "");
      setRank(editing?.rank || "");
      setProgramId(editing?.program_id || "none");
      setBioAr(editing?.bio_ar || "");
      setPhoto(editing?.photo || null);
      setTags(
        (editing?.specialization || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      );
      setTagInput("");
      setIsActive(editing?.is_active ?? true);
      setErrors({});
    }
  }, [open, editing]);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/"))
      return toast.error("الرجاء اختيار ملف صورة");
    if (file.size > 5 * 1024 * 1024)
      return toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت");
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("faculty-images")
      .upload(path, file, { upsert: false });
    if (error) {
      setUploading(false);
      return toast.error("فشل رفع الصورة: " + error.message);
    }
    const { data } = supabase.storage.from("faculty-images").getPublicUrl(path);
    setPhoto(data.publicUrl);
    setUploading(false);
    toast.success("تم رفع الصورة");
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (nameAr.trim().length < 3) e.nameAr = "الاسم مطلوب (3 أحرف على الأقل)";
    if (!employeeId.trim()) e.employeeId = "الرقم الوظيفي مطلوب";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = "بريد إلكتروني غير صالح";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      full_name_ar: nameAr.trim(),
      full_name_en: nameEn.trim() || null,
      employee_id: employeeId.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      degree: degree.trim() || null,
      rank: rank || null,
      program_id: programId === "none" ? null : programId,
      bio_ar: bioAr.trim() || null,
      specialization: tags.length ? tags.join(", ") : null,
      photo,
      is_active: isActive,
    };
    const { error } = editing
      ? await supabase.from("faculty").update(payload).eq("id", editing.id)
      : await supabase.from("faculty").insert(payload);
    setSaving(false);
    if (error) return toast.error("فشل الحفظ: " + error.message);
    toast.success(editing ? "تم تحديث بيانات العضو" : "تم إضافة العضو");
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
            {editing ? "تعديل بيانات العضو" : "عضو هيئة تدريس جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Photo */}
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <div className="h-24 w-24 rounded-full border-2 border-dashed border-border bg-secondary/30 overflow-hidden grid place-items-center">
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <Label>الصورة الشخصية</Label>
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
              {photo && (
                <button
                  onClick={() => setPhoto(null)}
                  className="block text-xs text-destructive hover:underline"
                >
                  إزالة الصورة
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>الاسم (عربي) *</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="mt-1"
              />
              {errors.nameAr && (
                <p className="text-xs text-destructive mt-1">{errors.nameAr}</p>
              )}
            </div>
            <div>
              <Label>الاسم (إنجليزي)</Label>
              <Input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="mt-1"
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>الرقم الوظيفي *</Label>
              <Input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="mt-1"
              />
              {errors.employeeId && (
                <p className="text-xs text-destructive mt-1">
                  {errors.employeeId}
                </p>
              )}
            </div>
            <div>
              <Label>الدرجة العلمية</Label>
              <Input
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                placeholder="مثال: دكتوراه"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                dir="ltr"
                type="email"
              />
              {errors.email && (
                <p className="text-xs text-destructive mt-1">{errors.email}</p>
              )}
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1"
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>القسم</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون قسم</SelectItem>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الرتبة العلمية</Label>
              <Select value={rank} onValueChange={setRank}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الرتبة" />
                </SelectTrigger>
                <SelectContent>
                  {RANKS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>السيرة الذاتية</Label>
            <Textarea
              value={bioAr}
              onChange={(e) => setBioAr(e.target.value)}
              rows={4}
              className="mt-1"
            />
          </div>

          <div>
            <Label>الاهتمامات البحثية</Label>
            <div className="mt-1 flex flex-wrap gap-2 p-2 rounded-md border border-input bg-background min-h-12">
              {tags.map((t, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs"
                >
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder="اكتب ثم اضغط Enter..."
                className="flex-1 min-w-32 bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-input bg-background p-3">
            <div>
              <Label>نشط</Label>
              <p className="text-xs text-muted-foreground mt-1">
                {isActive ? "يظهر في الموقع العام" : "مخفي عن الموقع"}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
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
            {editing ? "حفظ التعديلات" : "إضافة العضو"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
