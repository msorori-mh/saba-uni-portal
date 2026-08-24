export type StaffShowcaseModule =
  | "dashboard"
  | "profile"
  | "leave"
  | "payroll"
  | "career"
  | "communications"
  | "custody"
  | "requests"
  | "notifications"
  | "certificates"
  | "performance"
  | "attendance"
  | "assignments"
  | "training"
  | "promotions"
  | "clearance"
  | "approvals"
  | "audit";

export const STAFF_SHOWCASE_MARKER = "TEST_ONLY_STAFF_SERVICES_SHOWCASE_01";

export const staffShowcase = {
  employee: {
    number: "EMP-IT-0247",
    name: "أحمد محمد علي",
    nameEn: "Ahmed Mohammed Ali",
    nationalIdMasked: "*******4821",
    department: "الشؤون الإدارية",
    title: "أخصائي أنظمة معلومات",
    grade: "الدرجة السادسة",
    step: "المربوط الثالث",
    manager: "مدير الشؤون الإدارية",
    qualification: "بكالوريوس نظم معلومات",
    email: "ahmed.ali@staff.usr.edu.ye",
    phone: "777 *** 412",
    hireDate: "15 سبتمبر 2019",
    location: "المبنى الرئيسي — الدور الثاني",
  },
  leaveBalances: [
    { type: "اعتيادية", total: 30, used: 12, remaining: 18, unit: "يوم" },
    { type: "عارضة", total: 10, used: 4, remaining: 6, unit: "أيام" },
    { type: "مرضية", total: 15, used: 2, remaining: 13, unit: "يوماً" },
    { type: "مغادرات", total: 24, used: 7, remaining: 17, unit: "ساعة" },
  ],
  leaveRequests: [
    { id: "LV-2026-0184", type: "إجازة اعتيادية", period: "25–29 أغسطس 2026", duration: "5 أيام", status: "بانتظار الموارد البشرية", tone: "amber", attachment: "خطة تسليم المهام.pdf" },
    { id: "PR-2026-0097", type: "مغادرة شخصية", period: "12 أغسطس 2026", duration: "ساعتان", status: "معتمد", tone: "green", attachment: "—" },
    { id: "LV-2026-0132", type: "إجازة مرضية", period: "2–3 يوليو 2026", duration: "يومان", status: "معتمد", tone: "green", attachment: "تقرير طبي.pdf" },
    { id: "LV-2026-0108", type: "إجازة عارضة", period: "7 يونيو 2026", duration: "يوم واحد", status: "مرفوض", tone: "red", attachment: "—" },
  ],
  payroll: {
    period: "يوليو 2026",
    basic: 385000,
    allowances: [
      { label: "بدل طبيعة عمل", value: 65000 },
      { label: "بدل مواصلات", value: 35000 },
      { label: "بدل سكن", value: 55000 },
    ],
    deductions: [
      { label: "تقاعد وتأمينات", value: 28500 },
      { label: "استقطاع نقابي", value: 3500 },
    ],
    net: 508000,
    publishedAt: "31 يوليو 2026 — 11:20 ص",
  },
  payrollHistory: [
    { period: "يوليو 2026", net: 508000, status: "منشور" },
    { period: "يونيو 2026", net: 508000, status: "منشور" },
    { period: "مايو 2026", net: 496000, status: "منشور" },
    { period: "أبريل 2026", net: 496000, status: "منشور" },
  ],
  career: [
    { date: "سبتمبر 2019", title: "التعيين", detail: "فني نظم — الدرجة الثامنة", status: "مكتمل" },
    { date: "يناير 2022", title: "ترقية وظيفية", detail: "أخصائي نظم — الدرجة السابعة", status: "مكتمل" },
    { date: "يناير 2025", title: "تسوية مؤهل", detail: "أخصائي أنظمة معلومات — الدرجة السادسة", status: "مكتمل" },
    { date: "يناير 2027", title: "استحقاق الترقية القادمة", detail: "قيد استكمال مدة الاستحقاق والتقييم", status: "متوقع" },
  ],
  circulars: [
    { id: "CIR-2026-048", title: "تنظيم الدوام خلال فترة الاختبارات", sender: "عمادة الكلية", date: "20 أغسطس 2026", priority: "عاجل", read: false, deadline: "22 أغسطس 2026" },
    { id: "CIR-2026-043", title: "تحديث بيانات الموظفين للعام 2026", sender: "الموارد البشرية", date: "15 أغسطس 2026", priority: "مهم", read: true, deadline: "31 أغسطس 2026" },
    { id: "CIR-2026-039", title: "إجراءات السلامة في المعامل", sender: "إدارة المعامل", date: "8 أغسطس 2026", priority: "عادي", read: true, deadline: "—" },
  ],
  custody: [
    { id: "AST-IT-1048", item: "حاسوب محمول Dell Latitude 5540", serial: "DL-5540-9K82", delivered: "12 فبراير 2025", condition: "جيدة", location: "مكتب الموظف", status: "بعهدتي" },
    { id: "AST-IT-0772", item: "شاشة Dell 24 بوصة", serial: "MN-P2422-772", delivered: "18 سبتمبر 2023", condition: "جيدة", location: "مكتب الموظف", status: "بعهدتي" },
    { id: "AST-IT-0314", item: "جهاز قارئ باركود", serial: "BC-314-08", delivered: "5 يناير 2022", condition: "تحتاج فحصاً", location: "مخزن الإدارة", status: "طلب إرجاع" },
  ],
  notifications: [
    { title: "تم اعتماد طلب المغادرة PR-2026-0097", detail: "اعتمده المسؤول المباشر والموارد البشرية.", time: "منذ ساعتين", tone: "green" },
    { title: "تعميم عاجل جديد", detail: "تنظيم الدوام خلال فترة الاختبارات.", time: "منذ 5 ساعات", tone: "amber" },
    { title: "كشف راتب يوليو متاح", detail: "يتطلب التحقق الإضافي قبل العرض أو التنزيل.", time: "31 يوليو", tone: "blue" },
  ],
  approvals: [
    { id: "LV-2026-0191", employee: "سارة عبدالله حسن", type: "إجازة اعتيادية", duration: "4 أيام", submitted: "اليوم 9:30 ص", balance: "21 يوماً", status: "بانتظارك" },
    { id: "PR-2026-0103", employee: "محمد علي أحمد", type: "مغادرة رسمية", duration: "3 ساعات", submitted: "أمس 1:15 م", balance: "18 ساعة", status: "بانتظارك" },
    { id: "LV-2026-0188", employee: "ريم صالح قاسم", type: "إجازة مرضية", duration: "يومان", submitted: "19 أغسطس", balance: "13 يوماً", status: "مرفق طبي" },
  ],
  certificates: [
    { id: "DOC-2026-0071", type: "إفادة وظيفية", requested: "10 أغسطس 2026", status: "جاهزة للتنزيل", verification: "QR-71-26" },
    { id: "DOC-2025-0188", type: "شهادة خبرة", requested: "18 ديسمبر 2025", status: "صادرة", verification: "QR-188-25" },
  ],
  performance: {
    cycle: "التقييم السنوي 2025/2026",
    score: 91,
    rating: "ممتاز",
    strengths: ["جودة الإنجاز", "الالتزام", "التعاون المؤسسي"],
    development: "استكمال مسار تحليل البيانات المتقدم",
  },
  attendance: {
    month: "أغسطس 2026",
    present: 16,
    late: 1,
    absence: 0,
    leave: 1,
    hours: "126:30",
  },
  assignments: [
    { id: "ASG-2026-031", title: "دعم لجان الاختبارات", period: "24–28 أغسطس", hours: "10 ساعات", status: "معتمد" },
    { id: "OT-2026-014", title: "عمل إضافي — تحديث الأنظمة", period: "14 أغسطس", hours: "4 ساعات", status: "قيد مراجعة Finance" },
  ],
  training: [
    { title: "إدارة الخدمات الرقمية", provider: "مركز التطوير الأكاديمي", date: "5–7 سبتمبر 2026", status: "مسجل" },
    { title: "أمن المعلومات للموظفين", provider: "وحدة الأمن السيبراني", date: "15 يوليو 2026", status: "مكتمل — 92%" },
  ],
  clearance: [
    { unit: "الموارد البشرية", status: "مكتمل", note: "لا التزامات" },
    { unit: "المالية", status: "مكتمل", note: "لا مستحقات" },
    { unit: "المكتبة", status: "مكتمل", note: "لا إعارات" },
    { unit: "العُهد والمخازن", status: "متوقف", note: "جهاز قارئ باركود قيد الإرجاع" },
    { unit: "تقنية المعلومات", status: "بانتظار التنفيذ", note: "إغلاق الصلاحيات بعد التسليم" },
  ],
  audit: [
    { at: "20 أغسطس 2026 — 10:14 ص", actor: "الموارد البشرية", action: "مراجعة طلب الإجازة", result: "أُحيل للاعتماد النهائي" },
    { at: "19 أغسطس 2026 — 1:40 م", actor: "المسؤول المباشر", action: "اعتماد طلب الإجازة", result: "موافق" },
    { at: "19 أغسطس 2026 — 9:12 ص", actor: "الموظف", action: "إرسال طلب الإجازة", result: "تم الاستلام" },
  ],
} as const;

export const adminStaffShowcase = {
  kpis: [
    { label: "طلبات بانتظار المدير", value: 8, detail: "3 عاجلة" },
    { label: "طلبات بانتظار HR", value: 5, detail: "متوسط 1.4 يوم" },
    { label: "تعاميم غير مؤكدة", value: 17, detail: "من أصل 86 مستلماً" },
    { label: "عهد تحتاج إجراء", value: 6, detail: "2 مرتبطة بإخلاء طرف" },
    { label: "كشوف رواتب جاهزة", value: 112, detail: "دورة يوليو 2026" },
    { label: "ترقيات مستحقة", value: 9, detail: "خلال 90 يوماً" },
    { label: "تقييمات غير مكتملة", value: 14, detail: "دورة 2025/2026" },
    { label: "إخلاءات طرف مفتوحة", value: 4, detail: "1 متوقف بعهدة" },
  ],
  leaveQueue: [
    { id: "LV-2026-0184", employee: "أحمد محمد علي", department: "الشؤون الإدارية", type: "اعتيادية", duration: "5 أيام", manager: "معتمد", hr: "بانتظار HR", risk: "لا تداخل" },
    { id: "LV-2026-0191", employee: "سارة عبدالله حسن", department: "شؤون الطلاب", type: "اعتيادية", duration: "4 أيام", manager: "بانتظار المدير", hr: "لم يبدأ", risk: "يوجد بديل" },
    { id: "LV-2026-0188", employee: "ريم صالح قاسم", department: "المعامل", type: "مرضية", duration: "يومان", manager: "معتمد", hr: "فحص المرفق", risk: "تقرير طبي" },
  ],
  payrollBatches: [
    { period: "يوليو 2026", employees: 112, gross: "57,430,000", deductions: "4,218,000", net: "53,212,000", status: "جاهز للنشر" },
    { period: "يونيو 2026", employees: 111, gross: "56,980,000", deductions: "4,167,000", net: "52,813,000", status: "منشور" },
  ],
  custodyQueue: [
    { id: "TR-2026-0031", employee: "أحمد محمد علي", action: "إرجاع", asset: "جهاز قارئ باركود", serial: "BC-314-08", status: "بانتظار الفحص" },
    { id: "TR-2026-0034", employee: "ريم صالح قاسم", action: "نقل عهدة", asset: "حاسوب مكتبي HP", serial: "HP-EL-8431", status: "بانتظار المستلم" },
  ],
  reports: [
    "تقرير أرصدة الإجازات حسب الإدارة",
    "مؤشرات زمن اعتماد الطلبات",
    "نسبة قراءة التعاميم حسب الجهة",
    "العهد المفتوحة والمتأخرة",
    "الترقيات والتسويات المستحقة",
    "التقييم السنوي حسب الإدارة",
    "الحضور والعمل الإضافي",
    "إخلاءات الطرف وحالة الالتزامات",
  ],
} as const;

export function formatYemeniRial(value: number): string {
  return `${value.toLocaleString("ar-YE")} ر.ي`;
}
