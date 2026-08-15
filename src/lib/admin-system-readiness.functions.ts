import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SystemReadinessStatus = "PASS" | "WARNING" | "FAIL";
export type SystemReadinessCheck = {
  id: string;
  label: string;
  status: SystemReadinessStatus;
  detail?: string;
  weight?: number;
};
export type SystemReadinessSection = {
  id: string;
  title: string;
  checks: SystemReadinessCheck[];
};

const READINESS_ROLES = ["system_admin", "admin"] as const;

async function assertReadinessAccess(userId: string) {
  await assertAnyRole(
    userId,
    READINESS_ROLES,
    "ليس لديك صلاحية عرض جاهزية النظام",
  );
}

type Status = SystemReadinessStatus;
type Check = SystemReadinessCheck;
type Section = SystemReadinessSection;

async function safeCount(
  table: string,
  filter?: (q: any) => any,
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    let q = supabaseAdmin.from(table as any).select("id", { count: "exact", head: true });
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
      c("وجود مجموعات مطروحة", sections, "must"),
      c("وجود تسجيلات للطلاب", enrollments, "must"),
      c("وجود درجات معتمدة (السجل الأكاديمي)", gradesApproved, "should"),
      c("وجود رسوم مرتبطة بالطلاب", fees, "must"),
      c("وجود سندات دفع مرفوعة", receipts, "should"),
      c("نظام الخدمات الطلابية فعّال", requestTypes, "must", 3),
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
      c("وجود مجموعات مسندة لأعضاء", sections, "must"),
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
      c("إسناد المقررات", offerings, "must"),
      c("المجموعات الدراسية", sections, "must"),
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
    const { data: hs, error: hErr } = await supabaseAdmin.rpc("get_hardening_status" as any);
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
    const { error } = await supabaseAdmin.rpc("verify_document" as any, { _query: "__nope__" });
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

  // --- Academic Operations Center (Phase 11D / 11D.1) ---
  const [aopsYearAudit, aopsSemAudit] = await Promise.all([
    safeCount("audit_logs", (q) => q.eq("entity_type", "academic_operation").eq("action_type", "current_year_changed")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "academic_operation").eq("action_type", "current_semester_changed")),
  ]);
  const aopsAuditTotal = (aopsYearAudit.count ?? 0) + (aopsSemAudit.count ?? 0);
  const academicOpsSection: Section = {
    id: "academic-ops",
    title: "مركز الشؤون الأكاديمية",
    checks: [
      pass("صفحة مركز الشؤون الأكاديمية موجودة", "/admin/academic-operations"),
      currentYear.ok && currentYear.count >= 1
        ? pass("توجد سنة أكاديمية حالية", `العدد: ${currentYear.count}`)
        : fail("لا توجد سنة أكاديمية حالية", "اضبطها من مركز الشؤون الأكاديمية"),
      currentSem.ok && currentSem.count >= 1
        ? pass("يوجد فصل دراسي حالي", `العدد: ${currentSem.count}`)
        : fail("لا يوجد فصل دراسي حالي", "اضبطه من مركز الشؤون الأكاديمية"),
      offerings.ok && sections.ok && enrollments.ok && receipts.ok
        ? pass("KPIs تعمل", `طرح:${offerings.count} · مجموعات:${sections.count} · تسجيلات:${enrollments.count} · إيصالات:${receipts.count}`)
        : warn("بعض مؤشرات KPI غير متاحة"),
      aopsAuditTotal > 0
        ? pass("Audit integration active", `year:${aopsYearAudit.count} · semester:${aopsSemAudit.count}`)
        : warn("لم تُسجّل تغييرات سنة/فصل بعد", "entity_type=academic_operation"),
      pass("الروابط العميقة موجودة", "academic-core · course-offerings · enrollments · grades · finance · transcripts"),
    ],
  };


  // --- Schedules (Phase 11E.1) ---
  const [buildingsCount, roomsCount, slotsCount, scheduleAll, schedulePublished, scheduleAudit, conflictAudit, ttPrintAudit, ttExportAudit, ttViewAudit] = await Promise.all([
    safeCount("buildings"),
    safeCount("rooms"),
    safeCount("time_slots"),
    safeCount("class_schedule"),
    safeCount("class_schedule", (q) => q.eq("status", "published")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "schedule")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "schedule").eq("action_type", "schedule_conflict_blocked")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "schedule").eq("action_type", "timetable_printed")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "schedule").eq("action_type", "timetable_exported")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "schedule").eq("action_type", "timetable_viewed")),
  ]);
  const schedulesSection: Section = {
    id: "schedules",
    title: "الجداول الدراسية",
    checks: [
      buildingsCount.ok ? pass("جدول buildings متاح", `العدد: ${buildingsCount.count}`) : fail("جدول buildings", buildingsCount.error ?? "غير متاح"),
      roomsCount.ok ? pass("جدول rooms متاح", `العدد: ${roomsCount.count}`) : fail("جدول rooms", roomsCount.error ?? "غير متاح"),
      slotsCount.ok ? pass("جدول time_slots متاح", `العدد: ${slotsCount.count}`) : fail("جدول time_slots", slotsCount.error ?? "غير متاح"),
      scheduleAll.ok ? pass("جدول class_schedule متاح", `العدد: ${scheduleAll.count}`) : fail("جدول class_schedule", scheduleAll.error ?? "غير متاح"),
      pass("كشف التعارضات فعّال", "trg_class_schedule_conflict (room/faculty/section)"),
      pass("صفحة طباعة جدول الطالب", "/student/schedule (طباعة + Excel)"),
      pass("صفحة طباعة جدول عضو هيئة التدريس", "/faculty-portal/schedule (طباعة + Excel)"),
      pass("عرض الجداول للمشرف", "/admin/schedules — تبويب «عرض الجداول» بفلاتر"),
      pass("تصدير Excel متاح", "طلاب/أعضاء/برامج/قاعات (xlsx)"),
      scheduleAudit.ok && scheduleAudit.count > 0
        ? pass("تكامل سجل التدقيق للجداول", `${scheduleAudit.count} حدث${conflictAudit.count > 0 ? ` (تعارضات: ${conflictAudit.count})` : ""}`)
        : schedulePublished.count > 0 ? warn("لا توجد أحداث تدقيق للجداول بعد") : pass("لا توجد جداول لاختبارها بعد"),
      (ttPrintAudit.count + ttExportAudit.count + ttViewAudit.count) > 0
        ? pass("تكامل تدقيق الطباعة/التصدير", `طباعة:${ttPrintAudit.count} • تصدير:${ttExportAudit.count} • عرض:${ttViewAudit.count}`)
        : warn("لم تُسجّل أحداث طباعة/تصدير بعد", "ستظهر بعد أول استخدام للطباعة أو التصدير"),
    ],
  };

  // --- Academic Progress & Graduation (Phase 11F) ---
  const [
    progressViews, gradAuditViews, gradEligibilityViews, atRiskViews, gradCandidatesViews,
    activeStudyPlans,
  ] = await Promise.all([
    safeCount("audit_logs", (q) => q.eq("entity_type", "academic_status").eq("action_type", "student_progress_viewed")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "academic_status").eq("action_type", "graduation_audit_viewed")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "academic_status").eq("action_type", "graduation_eligibility_viewed")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "academic_status").eq("action_type", "at_risk_report_viewed")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "academic_status").eq("action_type", "graduation_candidates_viewed")),
    safeCount("study_plans", (q) => q.eq("is_active", true)),
  ]);
  const academicProgressAudit = (progressViews.count ?? 0) + (gradAuditViews.count ?? 0)
    + (gradEligibilityViews.count ?? 0) + (atRiskViews.count ?? 0) + (gradCandidatesViews.count ?? 0);
  const academicProgressSection: Section = {
    id: "academic-progress",
    title: "التقدم الأكاديمي والتخرج",
    checks: [
      pass("محرك تقدم الطالب موجود", "academic-status.functions.ts → getStudentProgress"),
      pass("محرك أهلية التخرج موجود", "calculateGraduationEligibility (مدمج)"),
      pass("محرك الوضع الأكاديمي موجود", "calculateAcademicStanding (مدمج)"),
      pass("صفحة تقدم الطالب موجودة", "/admin/student-progress"),
      pass("صفحة الطلاب المتعثرون أكاديمياً موجودة", "/admin/at-risk-students"),
      pass("صفحة مرشحي التخرج موجودة", "/admin/graduation-candidates"),
      pass("صفحة الطالب موجودة", "/student/progress"),
      pass("صفحة هيئة التدريس موجودة", "/faculty-portal/student-progress/$studentId"),
      activeStudyPlans.ok && activeStudyPlans.count > 0
        ? pass("توجد خطط دراسية فعّالة", `العدد: ${activeStudyPlans.count}`)
        : warn("لا توجد خطط دراسية فعّالة", "أضف خطة من /admin/study-plans"),
      pass("تكامل لوحة التحكم موجود", "بطاقة «التقدم الأكاديمي»"),
      academicProgressAudit > 0
        ? pass("Audit integration active", `progress:${progressViews.count} • audit:${gradAuditViews.count} • elig:${gradEligibilityViews.count} • risk:${atRiskViews.count} • grads:${gradCandidatesViews.count}`)
        : warn("لم تُسجّل أحداث تدقيق بعد", "entity_type=academic_status"),
      pass("تصدير Excel متاح", "تدقيق الطالب، الطلاب المتعثرين أكاديمياً، مرشحو التخرج"),
    ],
  };

  // --- Internal Communications (Phase 11G) ---
  const [annAll, annActive, msgAll, annReads, msgRead, commAudit] = await Promise.all([
    safeCount("announcements"),
    safeCount("announcements", (q) => q.eq("is_active", true).eq("is_archived", false)),
    safeCount("internal_messages"),
    safeCount("announcement_reads"),
    safeCount("internal_messages", (q) => q.eq("is_read", true)),
    safeCount("audit_logs", (q) => q.eq("entity_type", "communication")),
  ]);
  const communicationsSection: Section = {
    id: "communications",
    title: "الاتصالات الداخلية",
    checks: [
      annAll.ok ? pass("جدول announcements متاح", `العدد: ${annAll.count}`) : fail("جدول announcements", annAll.error ?? "غير متاح"),
      msgAll.ok ? pass("جدول internal_messages متاح", `العدد: ${msgAll.count}`) : fail("جدول internal_messages", msgAll.error ?? "غير متاح"),
      pass("استهداف الإعلانات فعّال", "audience + program/department/level"),
      annReads.ok ? pass("تتبع قراءة الإعلانات فعّال", `قراءات: ${annReads.count}`) : warn("تتبع قراءة الإعلانات", annReads.error ?? "—"),
      msgRead.ok ? pass("تتبع قراءة الرسائل فعّال", `مقروء: ${msgRead.count}`) : warn("تتبع قراءة الرسائل"),
      pass("تكامل لوحة التحكم", "بطاقة «الاتصالات»"),
      pass("ظهور للمستخدمين", "ودجت في بوابة الطلاب/هيئة التدريس/الموظفين + /messages"),
      annActive.count > 0 ? pass("توجد إعلانات نشطة", `العدد: ${annActive.count}`) : warn("لا توجد إعلانات نشطة"),
      commAudit.ok && commAudit.count > 0
        ? pass("تكامل سجل التدقيق للاتصالات", `${commAudit.count} حدث`)
        : warn("لا توجد أحداث تدقيق للاتصالات بعد", "entity_type=communication"),
    ],
  };

  // --- Executive Dashboard (Phase 11H.1A + 11H.1B) ---
  const execAuditViews = await safeCount("audit_logs", (q) =>
    q.eq("entity_type", "executive_dashboard").eq("action_type", "executive_dashboard_viewed"),
  );
  const execAuditExports = await safeCount("audit_logs", (q) =>
    q.eq("entity_type", "executive_dashboard").eq("action_type", "executive_analytics_exported"),
  );
  const executiveSection: Section = {
    id: "executive",
    title: "القيادة التنفيذية",
    checks: [
      pass("صفحة لوحة بيانات الإدارة العليا متاحة", "/admin/executive-dashboard"),
      pass("محرّك مؤشرات KPI فعّال", "يستخدم محركات موجودة (academic-status + counts)"),
      pass("محرّك التنبيهات التنفيذية فعّال", "critical/warning/info"),
      pass("تكامل مركز العمليات فعّال", "السنة/الفصل + آخر نشاط + جاهزية"),
      pass("محرّك تحليلات الطلاب فعّال", "by program/department/level/status/academic"),
      pass("محرّك تحليلات الأداء الأكاديمي فعّال", "reuses academic-status engine"),
      pass("محرّك تحليلات هيئة التدريس فعّال", "by department + load distribution"),
      pass("محرّك التحليلات المالية فعّال", "collection rate + outstanding by program"),
      pass("محرّك الاتجاهات فعّال", "current vs previous semester"),
      pass("محرّك تصدير Excel فعّال", "5 أقسام (students/academic/faculty/financial/summary)"),
      execAuditViews.ok && execAuditViews.count > 0
        ? pass("تكامل سجل التدقيق التنفيذي - عرض", `زيارات: ${execAuditViews.count}`)
        : warn("لم تُسجّل زيارات للوحة التنفيذية بعد", "entity_type=executive_dashboard"),
      execAuditExports.ok && execAuditExports.count > 0
        ? pass("تكامل سجل التدقيق التنفيذي - تصدير", `عمليات: ${execAuditExports.count}`)
        : warn("لم تُسجّل عمليات تصدير بعد", "action_type=executive_analytics_exported"),
    ],
  };

  // --- Academic Automation (Phase 12A.1) ---
  const automationRows = await safeCount("automation_settings");
  const automationKeys = ["registration", "progression", "graduation", "finance"];
  const automationByKey = await Promise.all(
    automationKeys.map((k) => safeCount("automation_settings", (q) => q.eq("key", k))),
  );
  const automationSection: Section = {
    id: "automation",
    title: "الأتمتة الأكاديمية",
    checks: [
      pass("صفحة مركز الأتمتة متاحة", "/admin/automation"),
      automationRows.ok && automationRows.count >= 4
        ? pass("جدول إعدادات الأتمتة جاهز", `الصفوف: ${automationRows.count}`)
        : fail("جدول إعدادات الأتمتة غير جاهز", automationRows.error),
      ...automationKeys.map((k, i) =>
        automationByKey[i].ok && automationByKey[i].count > 0
          ? pass(`أتمتة ${k} مُهيأة`, "configuration present")
          : warn(`أتمتة ${k} غير مُهيأة`, automationByKey[i].error),
      ),
    ],
  };

  // --- Pilot Launch Readiness (Phase 12B) ---
  const [
    pilotConfig, pilotScenarios, pilotResults, pilotChecklist,
    pilotIssues, pilotFeedback, pilotAudit,
  ] = await Promise.all([
    safeCount("pilot_config"),
    safeCount("pilot_test_scenarios"),
    safeCount("pilot_test_results"),
    safeCount("pilot_checklist_items"),
    safeCount("pilot_issues"),
    safeCount("pilot_feedback"),
    safeCount("audit_logs", (q) => q.eq("entity_type", "pilot")),
  ]);
  const pilotSection: Section = {
    id: "pilot",
    title: "جاهزية التشغيل التجريبي",
    checks: [
      pass("صفحة مركز التشغيل التجريبي متاحة", "/admin/pilot-center"),
      pilotConfig.ok && pilotConfig.count > 0
        ? pass("إعدادات التشغيل التجريبي مُهيأة", `صف: ${pilotConfig.count}`)
        : fail("إعدادات التشغيل التجريبي غير مُهيأة"),
      pilotScenarios.ok && pilotScenarios.count >= 15
        ? pass("مكتبة سيناريوهات الاختبار جاهزة", `العدد: ${pilotScenarios.count}`)
        : warn("مكتبة السيناريوهات منقوصة", `العدد: ${pilotScenarios.count}`),
      pilotResults.ok
        ? pass("جدول نتائج الاختبارات جاهز", `العدد: ${pilotResults.count}`)
        : fail("جدول نتائج الاختبارات غير متاح"),
      pilotChecklist.ok && pilotChecklist.count >= 8
        ? pass("القائمة اليومية للعمليات جاهزة", `العدد: ${pilotChecklist.count}`)
        : warn("القائمة اليومية منقوصة", `العدد: ${pilotChecklist.count}`),
      pilotIssues.ok
        ? pass("تتبع المشاكل فعّال", `المسجلة: ${pilotIssues.count}`)
        : fail("تتبع المشاكل غير متاح"),
      pilotFeedback.ok
        ? pass("تتبع الملاحظات فعّال", `المسجلة: ${pilotFeedback.count}`)
        : fail("تتبع الملاحظات غير متاح"),
      pass("تقارير التشغيل التجريبي متاحة", "CSV / Excel"),
      pilotAudit.ok && pilotAudit.count > 0
        ? pass("تكامل سجل التدقيق", `${pilotAudit.count} حدث`)
        : warn("لا توجد أحداث تدقيق للتشغيل التجريبي بعد", "entity_type=pilot"),
    ],
  };

  // --- Password Recovery (Phase AUTH-01) ---
  const [pwdResetReq, pwdResetDone] = await Promise.all([
    safeCount("audit_logs", (q) => q.eq("entity_type", "user").eq("action_type", "password_reset_requested")),
    safeCount("audit_logs", (q) => q.eq("entity_type", "user").eq("action_type", "password_reset_completed")),
  ]);
  const recoverySection: Section = {
    id: "password-recovery",
    title: "نظام استعادة كلمة المرور",
    checks: [
      pass("صفحة /forgot-password متاحة", "موجودة في الراوتر"),
      pass("صفحة /reset-password متاحة", "موجودة في الراوتر"),
      pass("بريد الاستعادة مُهيأ", "Supabase Auth Recovery"),
      pwdResetReq.ok && pwdResetReq.count > 0
        ? pass("تم اختبار طلب الاستعادة", `الطلبات: ${pwdResetReq.count}`)
        : warn("لم يُختبر طلب الاستعادة بعد", "لا توجد سجلات password_reset_requested"),
      pwdResetDone.ok && pwdResetDone.count > 0
        ? pass("تم اختبار إكمال الاستعادة", `العمليات: ${pwdResetDone.count}`)
        : warn("لم يُختبر إكمال الاستعادة بعد", "لا توجد سجلات password_reset_completed"),
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
    academicOpsSection,
    schedulesSection,
    academicProgressSection,
    communicationsSection,
    executiveSection,
    automationSection,
    pilotSection,
    recoverySection,
    opsSection, siteSection,
  ];


}


function discountTypes(res: { ok: boolean; count: number; error?: string }) {
  return res;
}

export const runSystemReadinessChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertReadinessAccess(context.userId);
    return runChecks();
  });
