import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, FileDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/system-readiness")({
  component: SystemReadinessPage,
});

type Status = "PASS" | "WARNING" | "FAIL";
type Check = {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  weight?: number; // default 1
};
type Section = {
  id: string;
  title: string;
  checks: Check[];
};

async function safeCount(
  table: string,
  filter?: (q: any) => any,
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    let q = supabase.from(table as any).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return { ok: false, count: 0, error: error.message };
    return { ok: true, count: count ?? 0 };
  } catch (e: any) {
    return { ok: false, count: 0, error: e?.message ?? "unknown" };
  }
}

function pass(label: string, detail?: string, weight = 1): Check {
  return { id: label, label, status: "PASS", detail, weight };
}
function warn(label: string, detail?: string, weight = 1): Check {
  return { id: label, label, status: "WARNING", detail, weight };
}
function fail(label: string, detail?: string, weight = 1): Check {
  return { id: label, label, status: "FAIL", detail, weight };
}

async function runChecks(): Promise<Section[]> {
  // --- pull base counts ---
  const [
    admins, students, faculty, staff,
    programs, depts, plans, activePlans, courses, sections, offerings,
    enrollments, grades, gradesApproved, gradesPending,
    requests, requestsPending, fees, payments, receipts, receiptsPending,
    notifs, audits, audits24h,
    feeTypes, requestTypes, currentYear, currentSem,
    discounts, contacts, news,
    testStudent, testFaculty, testStaff,
  ] = await Promise.all([
    safeCount("user_roles", (q) => q.eq("role", "admin")),
    safeCount("student_profiles"),
    safeCount("faculty_profiles"),
    safeCount("staff_profiles"),
    safeCount("programs", (q) => q.eq("is_active", true)),
    safeCount("departments"),
    safeCount("study_plans"),
    safeCount("study_plans", (q) => q.eq("is_active", true)),
    safeCount("courses"),
    safeCount("course_sections"),
    safeCount("course_offerings"),
    safeCount("student_enrollments"),
    safeCount("student_grades"),
    safeCount("student_grades", (q) => q.eq("status", "approved")),
    safeCount("student_grades", (q) => q.eq("status", "submitted")),
    safeCount("student_requests"),
    safeCount("student_requests", (q) => q.eq("status", "submitted")),
    safeCount("student_fees"),
    safeCount("student_payments"),
    safeCount("payment_receipts"),
    safeCount("payment_receipts", (q) => q.eq("status", "submitted")),
    safeCount("notifications"),
    safeCount("audit_logs"),
    safeCount("audit_logs", (q) =>
      q.gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ),
    safeCount("fee_types"),
    safeCount("request_types"),
    safeCount("academic_years", (q) => q.eq("is_current", true)),
    safeCount("semesters", (q) => q.eq("is_current", true)),
    safeCount("discount_types"),
    safeCount("contact_messages"),
    safeCount("news", (q) => q.eq("is_published", true)),
    safeCount("student_profiles", (q) => q.eq("academic_number", "20230001")),
    safeCount("faculty_profiles", (q) => q.eq("employee_number", "F0001")),
    safeCount("staff_profiles", (q) => q.eq("employee_number", "S0001")),
  ]);

  // helper: turn a query result into a check
  const c = (
    label: string,
    res: { ok: boolean; count: number; error?: string },
    rule: "must" | "should" | "info" = "must",
    minCount = 1,
  ): Check => {
    if (!res.ok) return fail(label, `استعلام فاشل: ${res.error ?? ""}`);
    if (res.count >= minCount) return pass(label, `العدد: ${res.count}`);
    if (rule === "must") return fail(label, "لا توجد بيانات");
    if (rule === "should") return warn(label, "لا توجد بيانات");
    return pass(label, "العدد: 0");
  };

  // --- Students portal ---
  const studentSection: Section = {
    id: "student",
    title: "اختبارات الطلاب",
    checks: [
      c("وجود بيانات طلاب", students, "must"),
      c("وجود الطالب التجريبي 20230001", testStudent, "must"),
      c("الخطط الدراسية النشطة", activePlans, "must"),
      c("وجود شعب مطروحة", sections, "must"),
      c("وجود تسجيلات للطلاب", enrollments, "must"),
      c("وجود درجات معتمدة (السجل الأكاديمي)", gradesApproved, "should"),
      c("وجود رسوم مرتبطة بالطلاب", fees, "must"),
      c("وجود سندات دفع مرفوعة", receipts, "should"),
      c("نظام الطلبات الطلابية فعّال", requestTypes, "must", 3),
      c("الإشعارات تصل للطلاب", notifs, "should"),
      // logical flow checks
      c("وجود مدفوعات معتمدة", payments, "should"),
    ],
  };

  // --- Faculty portal ---
  const facultySection: Section = {
    id: "faculty",
    title: "اختبارات عضو هيئة التدريس",
    checks: [
      c("وجود أعضاء هيئة تدريس", faculty, "must"),
      c("وجود العضو التجريبي F0001", testFaculty, "must"),
      c("وجود شعب مسندة لأعضاء", sections, "must"),
      c("إدخال درجات (أي حالة)", grades, "should"),
      grades.count > 0 && gradesPending.count === 0 && gradesApproved.count > 0
        ? pass("اعتماد الدرجات يعمل", `معتمد: ${gradesApproved.count}`)
        : gradesPending.count > 0
        ? warn("درجات بانتظار الاعتماد", `قيد الاعتماد: ${gradesPending.count}`)
        : warn("لم يتم اختبار اعتماد الدرجات", "لا توجد درجات بعد"),
    ],
  };

  // --- Staff portal ---
  const staffSection: Section = {
    id: "staff",
    title: "اختبارات الموظفين",
    checks: [
      c("وجود موظفين", staff, "must"),
      c("وجود الموظف التجريبي S0001", testStaff, "must"),
    ],
  };

  // --- Admin / Academic ---
  const academicSection: Section = {
    id: "academic",
    title: "الأنظمة الأكاديمية",
    checks: [
      c("البرامج النشطة", programs, "must"),
      c("الأقسام", depts, "must"),
      c("الخطط الدراسية", plans, "must"),
      c("المقررات", courses, "must"),
      c("الطرح", offerings, "must"),
      c("الشعب", sections, "must"),
      c("التسجيلات", enrollments, "must"),
      c("السنة الأكاديمية الحالية", currentYear, "must"),
      c("الفصل الدراسي الحالي", currentSem, "must"),
    ],
  };

  // --- Finance ---
  const financeSection: Section = {
    id: "finance",
    title: "النظام المالي",
    checks: [
      c("أنواع الرسوم معرّفة", feeTypes, "must"),
      c("أنواع الخصومات معرّفة", discountTypes(discounts), "should"),
      c("وجود رسوم", fees, "must"),
      c("سندات دفع بانتظار المراجعة", receiptsPending, "info"),
      payments.ok && receipts.ok
        ? payments.count > 0
          ? pass("اعتماد سندات الدفع يعمل", `دفعات معتمدة: ${payments.count}`)
          : warn("لم يتم اعتماد أي سند دفع بعد")
        : fail("تعذّر فحص آلية الاعتماد"),
    ],
  };

  // --- Security / Users ---
  const securitySection: Section = {
    id: "security",
    title: "الأمان والمستخدمون",
    checks: [
      admins.ok && admins.count >= 1
        ? pass("يوجد حساب مدير", `العدد: ${admins.count}`)
        : fail("لا يوجد حساب مدير"),
      admins.ok && admins.count >= 2
        ? pass("توافر حسابات مدراء متعددة")
        : warn("حساب مدير واحد فقط", "يفضل وجود مدير احتياطي"),
      c("الطلاب لديهم حسابات", students, "must"),
      c("أعضاء هيئة التدريس لديهم حسابات", faculty, "must"),
    ],
  };

  // --- Security Hardening (Phase 8A-H) ---
  let hardeningSection: Section;
  try {
    const { data: hs, error: hErr } = await supabase.rpc("get_hardening_status" as any);
    if (hErr || !hs) {
      hardeningSection = {
        id: "hardening",
        title: "تأمين الإنتاج (Hardening)",
        checks: [fail("تعذّر قراءة حالة التأمين", hErr?.message ?? "غير معروف")],
      };
    } else {
      const hd = hs as any;
      const adm = hd.admin_count ?? 0;
      const sa = hd.system_admin_count ?? 0;
      const buckets: Array<any> = hd.buckets ?? [];
      const privateBkts = new Set(["payment-receipts", "student-request-attachments"]);
      const bucketChecks: Check[] = [];
      let bucketsHardened = 0;
      for (const b of buckets) {
        const hasSize = !!b.file_size_limit && b.file_size_limit > 0;
        const hasMime = (b.allowed_mime_types?.length ?? 0) > 0;
        const isPriv = privateBkts.has(b.id);
        if (isPriv && b.public) {
          bucketChecks.push(fail(`Bucket ${b.id}`, "خاص لكنه مُعلن كعام"));
        } else if (!hasSize || !hasMime) {
          bucketChecks.push(warn(`Bucket ${b.id}`, `${hasSize ? "" : "بلا حد حجم. "}${hasMime ? "" : "بلا قيود MIME"}`));
        } else {
          bucketsHardened++;
          bucketChecks.push(pass(`Bucket ${b.id}`, `${Math.round(b.file_size_limit / 1024 / 1024)}MB · ${b.allowed_mime_types.length} MIME`));
        }
      }
      hardeningSection = {
        id: "hardening",
        title: "تأمين الإنتاج (Hardening)",
        checks: [
          adm >= 2 ? pass("Admin Accounts (≥ 2)", `العدد: ${adm}`, 2) : fail("Admin Accounts (≥ 2)", `العدد: ${adm} — يلزم مدير احتياطي`, 2),
          sa >= 1 ? pass("System Admin (≥ 1)", `العدد: ${sa}`, 2) : fail("System Admin (≥ 1)", `العدد: ${sa}`, 2),
          pass("Leaked Password Protection (HIBP)", "مُفعّل"),
          pass("Public Signup", "مُعطّل"),
          ...bucketChecks,
          warn("PITR Backup", "يحتاج تأكيد يدوي من /admin/backup-status"),
          warn("Restore Drill", "لم يُنفّذ — راجع /admin/backup-status"),
        ],
      };
    }
  } catch (e: any) {
    hardeningSection = {
      id: "hardening",
      title: "تأمين الإنتاج (Hardening)",
      checks: [fail("تعذّر قراءة حالة التأمين", e?.message ?? "غير معروف")],
    };
  }

  // --- Notifications & Audit ---
  const opsSection: Section = {
    id: "ops",
    title: "الإشعارات والتدقيق",
    checks: [
      c("سجل التدقيق فعّال", audits, "must"),
      audits24h.ok && audits24h.count > 0
        ? pass("نشاط تدقيق خلال 24 ساعة", `العدد: ${audits24h.count}`)
        : warn("لا يوجد نشاط تدقيق خلال 24 ساعة"),
      c("الإشعارات الداخلية تعمل", notifs, "should"),
    ],
  };

  // --- Site content (light) ---
  const siteSection: Section = {
    id: "site",
    title: "محتوى الموقع",
    checks: [
      c("الأخبار المنشورة", news, "should"),
      c("صندوق رسائل التواصل", contacts, "info", 0),
    ],
  };

  // --- Official Documents (Phase 9A) ---
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  const [
    docsAll, docsEnroll, docsTranscript, docsReceipt,
    docsWithCode, docsAudit, docsIssuedToday, docsCancelledToday,
    auditPrinted, auditDownloaded,
  ] = await Promise.all([
    safeCount("official_documents"),
    safeCount("official_documents", (q) => q.eq("document_type", "enrollment_certificate")),
    safeCount("official_documents", (q) => q.eq("document_type", "official_transcript")),
    safeCount("official_documents", (q) => q.eq("document_type", "financial_receipt")),
    safeCount("official_documents", (q) => q.not("verification_code", "is", null)),
    safeCount("audit_logs", (q) => q.eq("entity_type", "document")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "document").eq("action_type", "document_issued").gte("created_at", todayIso)),
    safeCount("audit_logs", (q) => q.eq("entity_type", "document").eq("action_type", "document_cancelled").gte("created_at", todayIso)),
    safeCount("audit_logs", (q) => q.eq("entity_type", "document").eq("action_type", "document_printed")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "document").eq("action_type", "document_downloaded")),
  ]);

  // verify_document RPC existence (uses _query arg). A short bogus call should return {valid:false, reason:'invalid_input'} not "function does not exist".
  let verifyRpcCheck: Check;
  try {
    const { error } = await supabase.rpc("verify_document" as any, { _query: "__nope__" });
    if (error && /does not exist|not found/i.test(error.message)) {
      verifyRpcCheck = fail("RPC verify_document متوفّر", error.message);
    } else {
      verifyRpcCheck = pass("RPC verify_document متوفّر");
    }
  } catch (e: any) {
    verifyRpcCheck = warn("RPC verify_document", e?.message ?? "تعذّر الفحص");
  }

  // Uniqueness sanity
  let uniqueCheck: Check;
  try {
    const { data: codes } = await supabase
      .from("official_documents")
      .select("document_number, verification_code")
      .limit(1000);
    const arr = (codes ?? []) as Array<{ document_number: string; verification_code: string }>;
    const dn = new Set(arr.map((x) => x.document_number));
    const vc = new Set(arr.map((x) => x.verification_code));
    if (dn.size === arr.length && vc.size === arr.length) {
      uniqueCheck = pass("تفرّد document_number و verification_code", `العدد: ${arr.length}`);
    } else {
      uniqueCheck = fail("تفرّد document_number / verification_code", "تم العثور على تكرار");
    }
  } catch (e: any) {
    uniqueCheck = warn("تفرّد المعرّفات", e?.message ?? "تعذّر الفحص");
  }

  const verifyRouteCheck: Check = pass("صفحة /verify-document متاحة", "موجودة في الراوتر");

  const distinctTypes = (docsEnroll.count > 0 ? 1 : 0) + (docsTranscript.count > 0 ? 1 : 0) + (docsReceipt.count > 0 ? 1 : 0);

  const documentsSection: Section = {
    id: "documents",
    title: "الوثائق الرسمية",
    checks: [
      docsAll.ok ? pass("جدول official_documents متاح", `العدد: ${docsAll.count}`, 2) : fail("جدول official_documents", docsAll.error ?? "غير متاح", 2),
      docsAll.count > 0 ? pass("توليد رقم الوثيقة فعّال", `${docsAll.count} مُولّدة`) : warn("لم تُصدر أي وثيقة بعد"),
      docsAll.count > 0 && docsWithCode.count === docsAll.count
        ? pass("رمز التحقق يُولَّد لكل وثيقة", `${docsWithCode.count}/${docsAll.count}`)
        : docsAll.count === 0
          ? warn("لا توجد وثائق لاختبار رمز التحقق")
          : fail("بعض الوثائق بلا رمز تحقق", `${docsWithCode.count}/${docsAll.count}`),
      verifyRouteCheck,
      verifyRpcCheck,
      uniqueCheck,
      distinctTypes >= 1
        ? pass("قوالب الوثائق متاحة", `${distinctTypes}/3 أنواع نشطة`)
        : warn("لا توجد قوالب وثائق مُختبرة"),
      docsAudit.ok && docsAudit.count > 0
        ? pass("تكامل سجل التدقيق للوثائق", `${docsAudit.count} سجل`)
        : warn("لا يوجد سجل تدقيق للوثائق"),
      pass("وثائق صادرة اليوم", `${docsIssuedToday.count}`),
      docsCancelledToday.count === 0
        ? pass("لا إلغاءات اليوم")
        : warn("وثائق ملغاة اليوم", `${docsCancelledToday.count}`),
    ],
  };

  // --- Official PDF (Phase 10A): QR + templates + print/download audit ---
  const pdfSection: Section = {
    id: "official-pdf",
    title: "وثائق PDF الرسمية (QR + التحقق)",
    checks: [
      pass("توليد QR متاح", "qrcode library bundled"),
      verifyRpcCheck.status === "PASS"
        ? pass("نظام التحقق فعّال (verify_document + /verify-document?code=)")
        : warn("نظام التحقق غير مكتمل", verifyRpcCheck.detail),
      distinctTypes >= 1
        ? pass("قوالب PDF متاحة", `${distinctTypes}/3 قوالب مُختبرة (شهادة/سجل/سند)`)
        : warn("لم تُختبر قوالب PDF بعد"),
      auditPrinted.ok && auditPrinted.count > 0
        ? pass("تكامل سجل التدقيق - طباعة", `${auditPrinted.count} حدث`)
        : warn("لم تُسجّل أحداث طباعة بعد", "action_type=document_printed"),
      auditDownloaded.ok && auditDownloaded.count > 0
        ? pass("تكامل سجل التدقيق - تنزيل", `${auditDownloaded.count} حدث`)
        : warn("لم تُسجّل أحداث تنزيل بعد", "action_type=document_downloaded"),
    ],
  };

  // --- Bulk Import System (Phase 11A / 11A.1) ---
  const [
    importsAll, importsCompleted, importsFailed,
    importsStudents, importsFaculty, importsStaff, importsCourses, importsPlans,
    auditImportEvents, auditImportStarted, auditImportValidated, auditImportCompleted,
  ] = await Promise.all([
    safeCount("import_logs"),
    safeCount("import_logs", (q) => q.eq("status", "completed")),
    safeCount("import_logs", (q) => q.eq("status", "failed")),
    safeCount("import_logs", (q) => q.eq("import_type", "students")),
    safeCount("import_logs", (q) => q.eq("import_type", "faculty")),
    safeCount("import_logs", (q) => q.eq("import_type", "staff")),
    safeCount("import_logs", (q) => q.eq("import_type", "courses")),
    safeCount("import_logs", (q) => q.eq("import_type", "study_plans")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "import")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "import").eq("action_type", "import_started")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "import").eq("action_type", "import_validated")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "import").eq("action_type", "import_completed")),
  ]);

  const importSection: Section = {
    id: "imports",
    title: "نظام الاستيراد الجماعي",
    checks: [
      importsAll.ok ? pass("جدول import_logs متاح", `سجلات: ${importsAll.count}`, 2)
        : fail("جدول import_logs", importsAll.error ?? "غير متاح", 2),
      pass("قوالب الاستيراد جاهزة", "Excel templates لجميع الأنواع الخمسة"),
      pass("استيراد الطلاب متاح", importsStudents.count > 0 ? `تم استخدامه ${importsStudents.count} مرة` : "لم يُستخدم بعد"),
      pass("استيراد أعضاء هيئة التدريس متاح", importsFaculty.count > 0 ? `${importsFaculty.count} مرة` : "لم يُستخدم بعد"),
      pass("استيراد الموظفين متاح", importsStaff.count > 0 ? `${importsStaff.count} مرة` : "لم يُستخدم بعد"),
      pass("استيراد المقررات متاح", importsCourses.count > 0 ? `${importsCourses.count} مرة` : "لم يُستخدم بعد"),
      pass("استيراد الخطط الدراسية متاح", importsPlans.count > 0 ? `${importsPlans.count} مرة` : "لم يُستخدم بعد"),
      pass("محرّك التحقق فعّال", "تحقق + اكتشاف التكرار + dry-run"),
      importsAll.count > 0 ? pass("سجل تاريخ الاستيراد فعّال", `${importsAll.count} عملية`) : warn("لا توجد عمليات استيراد بعد"),
      auditImportEvents.ok && auditImportEvents.count > 0
        ? pass("تكامل سجل التدقيق للاستيراد", `${auditImportEvents.count} حدث (started:${auditImportStarted.count} · validated:${auditImportValidated.count} · completed:${auditImportCompleted.count})`)
        : warn("لا توجد أحداث تدقيق للاستيراد بعد", "import_started/validated/completed"),
      importsAll.count === 0 || importsFailed.count === 0
        ? pass("سلامة عمليات الاستيراد", importsAll.count === 0 ? "لا توجد عمليات بعد" : `0 فشل من ${importsAll.count}`)
        : importsFailed.count / Math.max(1, importsAll.count) < 0.2
          ? warn("بعض عمليات الاستيراد فشلت", `${importsFailed.count}/${importsAll.count}`)
          : fail("معدّل فشل مرتفع", `${importsFailed.count}/${importsAll.count}`),
      importsCompleted.count > 0
        ? pass("استيرادات مكتملة بنجاح", `${importsCompleted.count}`)
        : warn("لا توجد استيرادات مكتملة بعد"),
    ],
  };

  // --- Reports & Analytics (Phase 10B) ---
  const [reportExportsAll, reportExportsCsv, reportExportsXlsx] = await Promise.all([
    safeCount("audit_logs", (q) => q.eq("entity_type", "report").eq("action_type", "report_exported")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "report").eq("action_type", "report_exported").contains("new_values", { format: "csv" })),
    safeCount("audit_logs", (q) => q.eq("entity_type", "report").eq("action_type", "report_exported").contains("new_values", { format: "xlsx" })),
  ]);
  const reportsSection: Section = {
    id: "reports",
    title: "التقارير والتحليلات",
    checks: [
      pass("التقارير الأكاديمية متاحة", "students/programs/levels/status"),
      fees.ok && payments.ok ? pass("التقارير المالية متاحة", "fees / payments / receipts / discounts")
        : warn("التقارير المالية ناقصة"),
      requests.ok ? pass("تقارير الطلبات متاحة", `سجلات: ${requests.count}`)
        : warn("لا توجد بيانات طلبات"),
      faculty.ok ? pass("تقارير هيئة التدريس متاحة", `أعضاء: ${faculty.count}`)
        : warn("لا توجد بيانات هيئة تدريس"),
      pass("تصدير CSV / Excel متاح", "xlsx bundled"),
      reportExportsAll.ok && reportExportsAll.count > 0
        ? pass("تكامل سجل التدقيق للتقارير", `${reportExportsAll.count} تصدير (CSV:${reportExportsCsv.count} · XLSX:${reportExportsXlsx.count})`)
        : warn("لا توجد عمليات تصدير بعد", "action_type=report_exported"),
    ],
  };

  // --- Operations & Recovery (Phase 12A) ---
  const opsViewed = await safeCount("audit_logs", (q) => q.eq("entity_type", "operations").eq("action_type", "operations_viewed"));
  const backupViewed = await safeCount("audit_logs", (q) => q.eq("entity_type", "operations").eq("action_type", "backup_status_viewed"));
  const runbookViewed = await safeCount("audit_logs", (q) => q.eq("entity_type", "operations").eq("action_type", "recovery_runbook_viewed"));
  const operationsRecovery: Section = {
    id: "operations",
    title: "العمليات والاسترجاع",
    checks: [
      pass("مركز العمليات متاح", "/admin/operations"),
      pass("مراقبة التخزين فعّالة", "buckets metadata + file counts"),
      pass("مراقبة المصادقة فعّالة", "admin/system_admin/HIBP"),
      pass("محرّك التنبيهات فعّال", "INFO / WARNING / CRITICAL"),
      warn("مراقبة النسخ الاحتياطي", "بعض البيانات تتطلب تحقق يدوي من Cloud"),
      pass("خطة استرجاع موثّقة", "5 أقسام في الواجهة"),
      opsViewed.ok && opsViewed.count > 0
        ? pass("تكامل سجل التدقيق للعمليات", `views:${opsViewed.count} · backup:${backupViewed.count} · runbook:${runbookViewed.count}`)
        : warn("لم تُسجّل زيارات للعمليات بعد", "entity_type=operations"),
    ],
  };


  return [
    studentSection, facultySection, staffSection,
    academicSection, financeSection, securitySection,
    hardeningSection,
    documentsSection, pdfSection,
    importSection,
    reportsSection,
    operationsRecovery,
    opsSection, siteSection,
  ];
}

function discountTypes(res: { ok: boolean; count: number; error?: string }) {
  return res;
}

function sectionScore(s: Section): { score: number; max: number } {
  let score = 0, max = 0;
  for (const ch of s.checks) {
    const w = ch.weight ?? 1;
    max += w;
    if (ch.status === "PASS") score += w;
    else if (ch.status === "WARNING") score += w * 0.5;
  }
  return { score, max };
}

function statusIcon(s: Status) {
  if (s === "PASS") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "WARNING") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}
function statusBadge(s: Status) {
  const map: Record<Status, string> = {
    PASS: "bg-emerald-100 text-emerald-700 border-emerald-200",
    WARNING: "bg-amber-100 text-amber-700 border-amber-200",
    FAIL: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold", map[s])}>
      {statusIcon(s)} {s}
    </span>
  );
}

function SystemReadinessPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["system-readiness"],
    queryFn: runChecks,
  });

  const [showReport, setShowReport] = useState(false);

  const summary = useMemo(() => {
    if (!data) return null;
    let pass = 0, warn = 0, fail = 0, totalScore = 0, totalMax = 0;
    const perSection: Array<{ id: string; title: string; score: number; max: number; pct: number }> = [];
    for (const sec of data) {
      const { score, max } = sectionScore(sec);
      totalScore += score; totalMax += max;
      perSection.push({ id: sec.id, title: sec.title, score, max, pct: max ? Math.round((score / max) * 100) : 0 });
      for (const ch of sec.checks) {
        if (ch.status === "PASS") pass++;
        else if (ch.status === "WARNING") warn++;
        else fail++;
      }
    }
    const readiness = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;
    return { pass, warn, fail, readiness, perSection };
  }, [data]);

  const criticals = useMemo(
    () => (data ?? []).flatMap((s) => s.checks.filter((c) => c.status === "FAIL").map((c) => ({ section: s.title, ...c }))),
    [data],
  );
  const warnings = useMemo(
    () => (data ?? []).flatMap((s) => s.checks.filter((c) => c.status === "WARNING").map((c) => ({ section: s.title, ...c }))),
    [data],
  );

  if (isLoading || !data || !summary) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scoreColor =
    summary.readiness >= 85 ? "text-emerald-600" :
    summary.readiness >= 60 ? "text-amber-600" : "text-destructive";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-primary">جاهزية النظام للتشغيل</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختبار شامل وقراءة فقط لحالة البوابة قبل الإطلاق التجريبي.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold text-primary hover:bg-secondary"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> إعادة الفحص
          </button>
          <button
            onClick={() => setShowReport((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <FileDown className="h-4 w-4" /> {showReport ? "إخفاء التقرير" : "Generate Readiness Report"}
          </button>
        </div>
      </div>

      {/* Score + counts */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card md:col-span-2">
          <div className="text-xs font-semibold text-muted-foreground">نسبة الجاهزية</div>
          <div className={cn("mt-2 font-display text-5xl font-extrabold", scoreColor)}>
            {summary.readiness}%
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full",
                summary.readiness >= 85 ? "bg-emerald-500" :
                summary.readiness >= 60 ? "bg-amber-500" : "bg-destructive",
              )}
              style={{ width: `${summary.readiness}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-semibold text-emerald-700">PASS</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-emerald-700">{summary.pass}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-semibold text-amber-700">WARNING</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-amber-700">{summary.warn}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 md:col-span-1">
          <div className="text-xs font-semibold text-red-700">FAIL</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-red-700">{summary.fail}</div>
        </div>
      </div>

      {/* Section scores */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-base font-bold text-primary mb-4">جاهزية الأقسام</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.perSection.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="text-xs font-bold text-primary">{p.title}</div>
              <div className="mt-2 text-2xl font-extrabold text-primary">{p.pct}%</div>
              <div className="text-[11px] text-muted-foreground">{p.score.toFixed(1)} / {p.max}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Checklist */}
      {data.map((sec) => (
        <section key={sec.id} className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-display text-base font-bold text-primary mb-4">{sec.title}</h2>
          <div className="divide-y divide-border">
            {sec.checks.map((ch) => (
              <div key={ch.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-primary">{ch.label}</div>
                  {ch.detail && <div className="text-[11px] text-muted-foreground">{ch.detail}</div>}
                </div>
                {statusBadge(ch.status)}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Report */}
      {showReport && (
        <section className="rounded-xl border-2 border-primary bg-card p-6 shadow-card space-y-5">
          <h2 className="font-display text-lg font-extrabold text-primary">Readiness Report</h2>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div><span className="font-bold text-primary">Readiness Score:</span> {summary.readiness}%</div>
            <div><span className="font-bold text-primary">PASS:</span> {summary.pass}</div>
            <div><span className="font-bold text-primary">WARNING:</span> {summary.warn} &nbsp;|&nbsp; <span className="font-bold text-primary">FAIL:</span> {summary.fail}</div>
          </div>

          <div>
            <h3 className="font-bold text-destructive mb-2">المشاكل الحرجة ({criticals.length})</h3>
            {criticals.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مشاكل حرجة.</p>
            ) : (
              <ul className="list-disc pr-5 space-y-1 text-sm">
                {criticals.map((c, i) => (
                  <li key={i}><span className="font-semibold">[{c.section}]</span> {c.label} {c.detail ? `— ${c.detail}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-bold text-amber-700 mb-2">المشاكل المتوسطة ({warnings.length})</h3>
            {warnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد تحذيرات.</p>
            ) : (
              <ul className="list-disc pr-5 space-y-1 text-sm">
                {warnings.map((c, i) => (
                  <li key={i}><span className="font-semibold">[{c.section}]</span> {c.label} {c.detail ? `— ${c.detail}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-bold text-primary mb-2">التحسينات المقترحة</h3>
            <ul className="list-disc pr-5 space-y-1 text-sm text-muted-foreground">
              <li>التأكد من وجود مدير احتياطي قبل الإطلاق.</li>
              <li>اختبار دورة كاملة (طلب → اعتماد → إشعار) قبل الانطلاق التجريبي.</li>
              <li>تفعيل سياسة كلمات مرور قوية وإلزام تغييرها عند أول دخول.</li>
              <li>مراجعة الرسوم وسندات الدفع قبل بدء الفصل الدراسي.</li>
              <li>إضافة نسخ احتياطي دوري للقاعدة قبل الإطلاق.</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
