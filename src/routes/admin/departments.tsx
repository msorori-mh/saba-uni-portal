import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listDepartments,
  listProgramsAdmin,
  listDepartmentOptions,
  uploadDepartmentImage,
  upsertDepartment,
  deleteDepartment,
  upsertProgram,
  deleteProgram,
} from "@/lib/admin-departments.functions";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Loader2,
  Building2,
  GraduationCap,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/admin/departments")({
  component: AdminDepartmentsPage,
});

type Department = {
  id: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  image: string | null;
  is_active: boolean;
  sort_order: number;
};

type Program = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  department_id: string | null;
  degree_type: string | null;
  years: number | null;
  is_active: boolean;
  sort_order: number;
};

const DEGREES = [
  { value: "بكالوريوس", label: "بكالوريوس" },
  { value: "ماجستير", label: "ماجستير" },
  { value: "دبلوم", label: "دبلوم" },
  { value: "دكتوراه", label: "دكتوراه" },
];

function AdminDepartmentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">
          إدارة الأقسام والبرامج
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تنظيم أقسام الكلية والبرامج الأكاديمية التابعة لها.
        </p>
      </div>

      <Tabs defaultValue="departments" dir="rtl">
        <TabsList>
          <TabsTrigger value="departments" className="gap-2">
            <Building2 className="h-4 w-4" /> الأقسام
          </TabsTrigger>
          <TabsTrigger value="programs" className="gap-2">
            <GraduationCap className="h-4 w-4" /> البرامج
          </TabsTrigger>
        </TabsList>
        <TabsContent value="departments" className="mt-4">
          <DepartmentsTab />
        </TabsContent>
        <TabsContent value="programs" className="mt-4">
          <ProgramsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- DEPARTMENTS -------------------- */

function DepartmentsTab() {
  const qc = useQueryClient();
  const listDeptsFn = useServerFn(listDepartments);
  const listProgsFn = useServerFn(listProgramsAdmin);
  const deleteDeptFn = useServerFn(deleteDepartment);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["admin", "departments"],
    queryFn: () => listDeptsFn({ data: {} }),
  });

  const { data: programs = [] } = useQuery({
    queryKey: ["admin", "programs"],
    queryFn: () => listProgsFn({ data: {} }),
  });

  const programsCount = useMemo(() => {
    const m: Record<string, number> = {};
    programs.forEach((p) => {
      const prog = p as Program;
      if (prog.department_id) m[prog.department_id] = (m[prog.department_id] || 0) + 1;
    });
    return m;
  }, [programs]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDeptFn({ data: { id: deleteTarget.id } });
      toast.success("تم حذف القسم");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin", "departments"] });
      qc.invalidateQueries({ queryKey: ["admin", "programs"] });
    } catch (e) {
      toast.error("تعذر الحذف: " + (e instanceof Error ? e.message : "خطأ غير معروف"));
    }
  };

  const targetProgramsCount = deleteTarget
    ? programsCount[deleteTarget.id] || 0
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="bg-gold-gradient text-primary font-bold hover:opacity-90"
        >
          <Plus className="h-4 w-4 ml-1" /> قسم جديد
        </Button>
      </div>

      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-right">
                <th className="p-3 font-semibold text-primary">الصورة</th>
                <th className="p-3 font-semibold text-primary">الاسم</th>
                <th className="p-3 font-semibold text-primary">الوصف</th>
                <th className="p-3 font-semibold text-primary">عدد البرامج</th>
                <th className="p-3 font-semibold text-primary">الحالة</th>
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
              {!isLoading && departments.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50" />
                    <p className="mt-3 text-muted-foreground">
                      لا توجد أقسام مضافة بعد
                    </p>
                  </td>
                </tr>
              )}
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    {d.image ? (
                      <img
                        src={d.image}
                        alt=""
                        className="h-12 w-16 object-cover rounded"
                      />
                    ) : (
                      <div className="h-12 w-16 rounded bg-secondary grid place-items-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-primary">{d.name_ar}</div>
                    {d.name_en && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {d.name_en}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground max-w-xs">
                    <div className="line-clamp-2">{d.description_ar || "—"}</div>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center justify-center min-w-8 h-6 px-2 rounded-full bg-gold-gradient text-primary text-xs font-bold">
                      {programsCount[d.id] || 0}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs font-semibold ${
                        d.is_active ? "text-green-600" : "text-muted-foreground"
                      }`}
                    >
                      {d.is_active ? "نشط" : "غير نشط"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditing(d);
                          setFormOpen(true);
                        }}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                        title="تعديل"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(d)}
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
      </div>

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() =>
          qc.invalidateQueries({ queryKey: ["admin", "departments"] })
        }
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف القسم</AlertDialogTitle>
            <AlertDialogDescription>
              {targetProgramsCount > 0 ? (
                <>
                  ⚠️ هذا القسم مرتبط بـ{" "}
                  <strong>{targetProgramsCount}</strong> برنامج. سيتم فصل
                  البرامج عن القسم (دون حذفها). هل تريد المتابعة؟
                </>
              ) : (
                <>هل أنت متأكد من حذف هذا القسم؟ لا يمكن التراجع عن العملية.</>
              )}
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

function DepartmentFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Department | null;
  onSaved: () => void;
}) {
  const uploadFn = useServerFn(uploadDepartmentImage);
  const upsertFn = useServerFn(upsertDepartment);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [descAr, setDescAr] = useState("");
  const [descEn, setDescEn] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setNameAr(editing?.name_ar || "");
      setNameEn(editing?.name_en || "");
      setDescAr(editing?.description_ar || "");
      setDescEn(editing?.description_en || "");
      setImage(editing?.image || null);
      setSortOrder(editing?.sort_order || 0);
      setIsActive(editing?.is_active ?? true);
      setErrors({});
    }
  }, [open, editing]);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/"))
      return toast.error("الرجاء اختيار صورة");
    if (file.size > 5 * 1024 * 1024) return toast.error("الحد الأقصى 5 ميجابايت");
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("فشل قراءة الملف"));
        reader.readAsDataURL(file);
      });
      const { publicUrl } = await uploadFn({
        data: {
          fileBase64: base64,
          contentType: file.type,
          fileName: file.name,
        },
      });
      setImage(publicUrl);
      toast.success("تم رفع الصورة");
    } catch (e) {
      toast.error("فشل الرفع: " + (e instanceof Error ? e.message : "خطأ غير معروف"));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (nameAr.trim().length < 3) e.nameAr = "الاسم مطلوب (3 أحرف على الأقل)";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          name_ar: nameAr.trim(),
          name_en: nameEn.trim() || null,
          description_ar: descAr.trim() || null,
          description_en: descEn.trim() || null,
          image,
          sort_order: sortOrder,
          is_active: isActive,
        },
      });
      toast.success(editing ? "تم تحديث القسم" : "تم إنشاء القسم");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error("فشل الحفظ: " + (e instanceof Error ? e.message : "خطأ غير معروف"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-primary">
            {editing ? "تعديل القسم" : "قسم جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>صورة القسم</Label>
            <div className="mt-2 flex items-start gap-4">
              <div className="h-24 w-32 rounded-lg border-2 border-dashed border-border bg-secondary/30 overflow-hidden grid place-items-center">
                {image ? (
                  <img src={image} alt="" className="h-full w-full object-cover" />
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
                      if (f) upload(f);
                    }}
                  />
                </label>
                {image && (
                  <button
                    onClick={() => setImage(null)}
                    className="block text-xs text-destructive hover:underline"
                  >
                    إزالة الصورة
                  </button>
                )}
              </div>
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

          <div>
            <Label>الوصف (عربي)</Label>
            <Textarea
              value={descAr}
              onChange={(e) => setDescAr(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>

          <div>
            <Label>الوصف (إنجليزي)</Label>
            <Textarea
              value={descEn}
              onChange={(e) => setDescEn(e.target.value)}
              rows={2}
              className="mt-1"
              dir="ltr"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>ترتيب العرض</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-input bg-background p-3">
              <Label>نشط</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
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
            {editing ? "حفظ التعديلات" : "إنشاء القسم"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- PROGRAMS -------------------- */

function ProgramsTab() {
  const qc = useQueryClient();
  const listProgsFn = useServerFn(listProgramsAdmin);
  const listDeptsFn = useServerFn(listDepartmentOptions);
  const deleteProgFn = useServerFn(deleteProgram);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ["admin", "programs"],
    queryFn: () => listProgsFn({ data: {} }),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["admin", "departments"],
    queryFn: () => listDeptsFn({ data: {} }),
  });

  const deptMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name_ar])),
    [departments],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProgFn({ data: { id: deleteTarget.id } });
      toast.success("تم حذف البرنامج");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin", "programs"] });
    } catch (e) {
      toast.error("تعذر الحذف: " + (e instanceof Error ? e.message : "خطأ غير معروف"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={departments.length === 0}
          className="bg-gold-gradient text-primary font-bold hover:opacity-90"
        >
          <Plus className="h-4 w-4 ml-1" /> برنامج جديد
        </Button>
      </div>

      {departments.length === 0 && (
        <div className="rounded-lg bg-gold/10 border border-gold/40 p-4 text-sm text-primary">
          أضف قسماً على الأقل من تبويب "الأقسام" قبل إنشاء برامج.
        </div>
      )}

      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-right">
                <th className="p-3 font-semibold text-primary">الاسم</th>
                <th className="p-3 font-semibold text-primary">القسم</th>
                <th className="p-3 font-semibold text-primary">الدرجة</th>
                <th className="p-3 font-semibold text-primary">المدة</th>
                <th className="p-3 font-semibold text-primary">الحالة</th>
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
              {!isLoading && programs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/50" />
                    <p className="mt-3 text-muted-foreground">
                      لا توجد برامج مضافة بعد
                    </p>
                  </td>
                </tr>
              )}
              {programs.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <div className="font-semibold text-primary">{p.name_ar}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {p.code}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {p.department_id ? deptMap[p.department_id] || "—" : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {p.degree_type || "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {p.years ? `${p.years} سنوات` : "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs font-semibold ${
                        p.is_active ? "text-green-600" : "text-muted-foreground"
                      }`}
                    >
                      {p.is_active ? "نشط" : "غير نشط"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                        title="تعديل"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
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
      </div>

      <ProgramFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        departments={departments}
        onSaved={() =>
          qc.invalidateQueries({ queryKey: ["admin", "programs"] })
        }
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف البرنامج</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا البرنامج؟ لا يمكن التراجع عن العملية.
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

function ProgramFormDialog({
  open,
  onOpenChange,
  editing,
  departments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Program | null;
  departments: { id: string; name_ar: string }[];
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertProgram);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [descAr, setDescAr] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [degreeType, setDegreeType] = useState<string>("");
  const [years, setYears] = useState<number>(4);
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setNameAr(editing?.name_ar || "");
      setNameEn(editing?.name_en || "");
      setCode(editing?.code || "");
      setDescAr(editing?.description_ar || "");
      setDepartmentId(editing?.department_id || "");
      setDegreeType(editing?.degree_type || "بكالوريوس");
      setYears(editing?.years || 4);
      setSortOrder(editing?.sort_order || 0);
      setIsActive(editing?.is_active ?? true);
      setErrors({});
    }
  }, [open, editing]);

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (nameAr.trim().length < 3) e.nameAr = "الاسم مطلوب";
    if (!code.trim()) e.code = "الرمز مطلوب";
    if (!departmentId) e.departmentId = "اختر القسم";
    if (!degreeType) e.degreeType = "اختر الدرجة";
    if (!years || years < 1 || years > 10) e.years = "المدة بين 1 و 10";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          name_ar: nameAr.trim(),
          name_en: nameEn.trim() || null,
          code: code.trim(),
          description_ar: descAr.trim() || null,
          department_id: departmentId,
          degree_type: degreeType as "بكالوريوس" | "ماجستير" | "دبلوم" | "دكتوراه",
          years,
          sort_order: sortOrder,
          is_active: isActive,
        },
      });
      toast.success(editing ? "تم تحديث البرنامج" : "تم إنشاء البرنامج");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error("فشل الحفظ: " + (e instanceof Error ? e.message : "خطأ غير معروف"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-primary">
            {editing ? "تعديل البرنامج" : "برنامج جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <Label>رمز البرنامج *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1"
                dir="ltr"
                placeholder="CS-BSC"
              />
              {errors.code && (
                <p className="text-xs text-destructive mt-1">{errors.code}</p>
              )}
            </div>
            <div>
              <Label>القسم *</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.departmentId && (
                <p className="text-xs text-destructive mt-1">
                  {errors.departmentId}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>الدرجة *</Label>
              <Select value={degreeType} onValueChange={setDegreeType}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الدرجة" />
                </SelectTrigger>
                <SelectContent>
                  {DEGREES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.degreeType && (
                <p className="text-xs text-destructive mt-1">
                  {errors.degreeType}
                </p>
              )}
            </div>
            <div>
              <Label>المدة (سنوات) *</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={years}
                onChange={(e) => setYears(Number(e.target.value) || 0)}
                className="mt-1"
              />
              {errors.years && (
                <p className="text-xs text-destructive mt-1">{errors.years}</p>
              )}
            </div>
          </div>

          <div>
            <Label>الوصف</Label>
            <Textarea
              value={descAr}
              onChange={(e) => setDescAr(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>ترتيب العرض</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-input bg-background p-3">
              <Label>نشط</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
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
            disabled={saving}
            className="bg-gold-gradient text-primary font-bold hover:opacity-90"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            {editing ? "حفظ التعديلات" : "إنشاء البرنامج"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
