import { useState } from "react";
import {
  Activity,
  BarChart3,
  Banknote,
  BellRing,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  Laptop,
  MailCheck,
  PackageCheck,
  Printer,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  TENDER_SHOWCASE_MARKER,
  adminStaffShowcase,
  staffShowcase,
} from "@/lib/staff-self-service-showcase";

type AdminModule =
  | "overview"
  | "leaves"
  | "payroll"
  | "communications"
  | "custody"
  | "career"
  | "performance"
  | "attendance"
  | "training"
  | "clearance"
  | "reports"
  | "audit";

type Nav = { key: AdminModule; label: string; icon: LucideIcon; roles: string };

const NAV: Nav[] = [
  { key: "overview", label: "لوحة خدمات الموظفين", icon: Activity, roles: "Admin · HR · Finance" },
  { key: "leaves", label: "الإجازات والمغادرات", icon: CalendarDays, roles: "HR · Direct Manager" },
  { key: "payroll", label: "الرواتب والمسار المالي", icon: Banknote, roles: "Finance" },
  { key: "communications", label: "المراسلات والتعاميم", icon: MailCheck, roles: "Admin · HR" },
  { key: "custody", label: "العُهد والتسليم", icon: Laptop, roles: "HR · Custody Officer" },
  { key: "career", label: "الترقيات والتسويات", icon: TrendingUp, roles: "HR" },
  { key: "performance", label: "الأداء السنوي", icon: Star, roles: "HR · Direct Manager" },
  { key: "attendance", label: "الحضور والعمل الإضافي", icon: Clock3, roles: "HR · Finance" },
  { key: "training", label: "التدريب والتطوير", icon: GraduationCap, roles: "HR" },
  { key: "clearance", label: "إخلاء الطرف", icon: PackageCheck, roles: "HR · Finance · IT" },
  { key: "reports", label: "تقارير الموارد البشرية", icon: BarChart3, roles: "HR · Managers" },
  { key: "audit", label: "سجل التدقيق", icon: History, roles: "Administrator" },
];

export function EmployeeServicesShowcase() {
  const [active, setActive] = useState<AdminModule>("overview");
  const [printPack, setPrintPack] = useState(false);
  const current = NAV.find((n) => n.key === active) ?? NAV[0];

  const printCurrent = () => window.print();
  const printAll = () => {
    setPrintPack(true);
    window.setTimeout(() => window.print(), 120);
  };

  return (
    <div className="space-y-5" data-testid="admin-employee-services-showcase">
      <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold text-gold">خدمات الموظفين — الاستعراض الإداري</div>
            <div className="mt-1 text-sm text-muted-foreground">البيانات المعروضة تجريبية ومخصصة لاستعراض خدمات الموظفين ومسارات الاعتماد.</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={printCurrent} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-primary"><Printer className="h-4 w-4" /> طباعة الصفحة</button>
            <button type="button" onClick={printAll} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><FileCheck2 className="h-4 w-4" /> طباعة حزمة الإدارة</button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px,1fr] print:block">
        <aside className="rounded-xl border border-border bg-card p-3 shadow-card print:hidden">
          <div className="mb-2 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">الموارد البشرية وخدمات الموظفين</div>
          <div className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.key} type="button" onClick={() => { setActive(item.key); setPrintPack(false); }} className={`w-full rounded-lg px-3 py-2.5 text-right transition ${active === item.key ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                  <div className="flex items-center gap-2 text-xs font-bold"><Icon className={`h-4 w-4 ${active === item.key ? "text-gold" : "text-primary"}`} /><span>{item.label}</span></div>
                  <div className={`mt-1 pr-6 text-[9px] ${active === item.key ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{item.roles}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0">
          {printPack ? (
            <div data-testid="admin-services-print-pack">
              <AdminPrintCover />
              {NAV.map((item) => <section key={item.key} className="break-after-page py-4" data-admin-evidence={item.key}><PrintHeading title={item.label} /><AdminView module={item.key} /></section>)}
            </div>
          ) : (
            <section data-admin-evidence={active}><PrintHeading title={current.label} /><div className="mb-4 print:hidden"><div className="text-xs font-bold text-gold">الموارد البشرية وخدمات الموظفين</div><h2 className="font-display text-2xl font-extrabold text-primary">{current.label}</h2><div className="mt-1 text-xs text-muted-foreground">الصلاحيات المستهدفة: {current.roles}</div></div><AdminView module={active} /></section>
          )}
        </main>
      </div>
    </div>
  );
}

function AdminView({ module }: { module: AdminModule }) {
  switch (module) {
    case "overview": return <Overview />;
    case "leaves": return <Leaves />;
    case "payroll": return <Payroll />;
    case "communications": return <Communications />;
    case "custody": return <Custody />;
    case "career": return <Career />;
    case "performance": return <Performance />;
    case "attendance": return <Attendance />;
    case "training": return <Training />;
    case "clearance": return <Clearance />;
    case "reports": return <Reports />;
    case "audit": return <Audit />;
  }
}

function Overview() {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{adminStaffShowcase.kpis.map((k, i) => <AdminKpi key={k.label} icon={[CalendarCheck, ClipboardCheck, MailCheck, Laptop, Banknote, TrendingUp, Star, PackageCheck][i]} label={k.label} value={String(k.value)} detail={k.detail} />)}</div><div className="grid gap-5 lg:grid-cols-2"><Panel title="يحتاج انتباهك" icon={BellRing}><Notice tone="red" title="3 طلبات تجاوزت مدة المعالجة المستهدفة" detail="طلبان لدى المسؤول المباشر وطلب واحد لدى الموارد البشرية." /><Notice tone="amber" title="17 موظفاً لم يؤكدوا استلام تعميم عاجل" detail="آخر موعد لتأكيد الاستلام 22 أغسطس 2026." /><Notice tone="blue" title="دفعة رواتب يوليو جاهزة للنشر" detail="112 كشفاً؛ الوصول حصري لدور Finance." /></Panel><Panel title="حالة التكاملات المستقبلية" icon={ShieldCheck}><Integration name="نظام الموارد البشرية" state="قراءة آمنة — المرحلة الثانية" /><Integration name="النظام المالي" state="قراءة آمنة — المرحلة الثانية" /><Integration name="سجل العُهد والمخازن" state="مزامنة مضبوطة — المرحلة الثانية" /><Integration name="البريد وإشعارات الجوال" state="قنوات إشعار — المرحلة الثانية" /></Panel></div><Panel title="أحدث طلبات الإجازة" icon={CalendarDays}><LeaveTable /></Panel></div>;
}

function Leaves() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={CalendarDays} label="إجمالي طلبات الشهر" value="46" detail="+8% عن الشهر السابق" /><AdminKpi icon={Clock3} label="بانتظار المدير" value="8" detail="متوسط 0.8 يوم" /><AdminKpi icon={ClipboardCheck} label="بانتظار HR" value="5" detail="متوسط 1.4 يوم" /><AdminKpi icon={CheckCircle2} label="معتمدة" value="33" detail="71.7%" /></div><Panel title="صندوق الاعتمادات" icon={ClipboardCheck}><div className="mb-3 flex flex-wrap gap-2"><input className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="بحث بالموظف أو رقم الطلب..." /><select className="rounded-lg border border-border px-3 py-2 text-sm"><option>كل الإدارات</option><option>الشؤون الإدارية</option><option>شؤون الطلاب</option></select><select className="rounded-lg border border-border px-3 py-2 text-sm"><option>كل المراحل</option><option>بانتظار المدير</option><option>بانتظار HR</option></select></div><LeaveTable /></Panel><div className="grid gap-5 lg:grid-cols-2"><Panel title="تفاصيل الطلب LV-2026-0184" icon={FileText}><FieldGrid fields={[["الموظف", "أحمد محمد علي"], ["القسم", "الشؤون الإدارية"], ["النوع", "إجازة اعتيادية"], ["الفترة", "25–29 أغسطس 2026"], ["المدة", "5 أيام"], ["الرصيد بعد الاعتماد", "13 يوماً"], ["البديل", "سارة عبدالله حسن"], ["المرفق", "خطة تسليم المهام.pdf"]]} /><div className="mt-4 flex gap-2"><button className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">اعتماد HR</button><button className="rounded-lg border border-red-300 px-4 py-2 text-xs font-bold text-red-700">رفض مع السبب</button><button className="rounded-lg border border-border px-4 py-2 text-xs font-bold">طلب استكمال</button></div></Panel><Panel title="السجل الزمني" icon={History}><Timeline items={[["19 أغسطس — 9:12 ص", "إرسال الموظف", "تم التحقق من الرصيد وعدم التداخل"], ["19 أغسطس — 1:40 م", "اعتماد المسؤول المباشر", "موافق — البديل محدد"], ["20 أغسطس — 10:14 ص", "مراجعة HR", "بانتظار القرار النهائي"]]} /></Panel></div></div>; }

function Payroll() { return <div className="space-y-5"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><ShieldCheck className="ml-2 inline h-4 w-4" /> تظهر هذه الصفحة لدور Finance والأدمن المخول فقط. ولا تعرض الرواتب الفردية في مؤشرات الإدارة العامة.</div><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={UsersRound} label="عدد الموظفين" value="112" detail="دورة يوليو" /><AdminKpi icon={Banknote} label="إجمالي الاستحقاقات" value="57.43 م" detail="ريال يمني" /><AdminKpi icon={TrendingUp} label="الاستقطاعات" value="4.218 م" detail="ريال يمني" /><AdminKpi icon={CheckCircle2} label="صافي الدفعة" value="53.212 م" detail="جاهز للنشر" /></div><Panel title="دورات الرواتب" icon={Banknote}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["الفترة", "الموظفون", "إجمالي الاستحقاقات", "الاستقطاعات", "الصافي", "الحالة", "إجراءات"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{adminStaffShowcase.payrollBatches.map((b) => <tr key={b.period} className="border-t border-border"><td className="px-3 py-3 font-bold text-primary">{b.period}</td><td className="px-3 py-3">{b.employees}</td><td className="px-3 py-3">{b.gross}</td><td className="px-3 py-3">{b.deductions}</td><td className="px-3 py-3 font-bold">{b.net}</td><td className="px-3 py-3"><Status tone={b.status === "منشور" ? "green" : "amber"}>{b.status}</Status></td><td className="px-3 py-3"><button className="text-xs font-bold text-primary">مراجعة مقيدة</button></td></tr>)}</tbody></table></div></Panel><Panel title="ضوابط النشر المالي" icon={ShieldCheck}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Control title="فصل المهام" detail="المعدّ والمراجع والناشر أدوار مستقلة" /><Control title="MFA" detail="إلزامي قبل النشر أو التصدير" /><Control title="كشف الموظف" detail="ذاتـي فقط مع إعادة تحقق" /><Control title="سجل التدقيق" detail="يوثق العرض والتنزيل والنشر" /></div></Panel></div>; }

function Communications() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={MailCheck} label="تعاميم منشورة" value="48" detail="هذا العام" /><AdminKpi icon={UsersRound} label="المستلمون" value="86" detail="ضمن آخر تعميم" /><AdminKpi icon={CheckCircle2} label="أكدوا الاستلام" value="69" detail="80.2%" /><AdminKpi icon={BellRing} label="غير مؤكد" value="17" detail="يتطلب تذكيراً" /></div><div className="grid gap-5 lg:grid-cols-[.8fr,1.2fr]"><Panel title="إنشاء تعميم داخلي" icon={FileText}><Field label="العنوان"><input defaultValue="تنظيم الدوام خلال فترة الاختبارات" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></Field><div className="grid grid-cols-2 gap-3"><Field label="الجهة المرسلة"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>عمادة الكلية</option></select></Field><Field label="الأهمية"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>عاجل</option><option>مهم</option><option>عادي</option></select></Field></div><Field label="الجمهور"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>جميع الموظفين</option><option>إدارة محددة</option><option>موظفون محددون</option></select></Field><Field label="نص التعميم"><textarea className="min-h-28 w-full rounded-lg border border-border px-3 py-2 text-sm" defaultValue="يعتمد جدول الدوام المرفق خلال فترة الاختبارات، مع ضرورة تأكيد القراءة والاستلام." /></Field><div className="mt-3 flex gap-2"><button className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">حفظ ونشر</button><button className="rounded-lg border border-border px-4 py-2 text-xs font-bold">حفظ كمسودة</button></div></Panel><Panel title="متابعة القراءة والاستلام" icon={MailCheck}><div className="mb-4 flex h-3 overflow-hidden rounded-full bg-secondary"><div className="w-[80.2%] bg-emerald-500" /></div><div className="grid gap-3 sm:grid-cols-3"><Mini label="تم الاستلام" value="69" tone="green" /><Mini label="غير مقروء" value="12" tone="amber" /><Mini label="مقروء دون تأكيد" value="5" tone="blue" /></div><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["الموظف", "الإدارة", "وقت القراءة", "الاستلام"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{[["أحمد محمد علي", "الشؤون الإدارية", "لم يقرأ", "غير مؤكد"], ["سارة عبدالله حسن", "شؤون الطلاب", "اليوم 9:44 ص", "مؤكد"], ["محمد علي أحمد", "السكرتارية", "أمس 1:10 م", "مقروء فقط"]].map((r) => <tr key={r[0]} className="border-t border-border">{r.map((c) => <td key={c} className="px-3 py-3 text-xs">{c}</td>)}</tr>)}</tbody></table></div><button className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-bold text-primary">إرسال تذكير لغير المؤكدين</button></Panel></div></div>; }

function Custody() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={Laptop} label="إجمالي الأصول" value="274" detail="بالكلية" /><AdminKpi icon={UsersRound} label="بعهدة موظفين" value="211" detail="77%" /><AdminKpi icon={PackageCheck} label="طلبات نقل/إرجاع" value="6" detail="2 عاجلة" /><AdminKpi icon={ShieldCheck} label="مرتبطة بإخلاء طرف" value="2" detail="تمنع الإغلاق" /></div><Panel title="طلبات نقل وإرجاع العُهد" icon={PackageCheck}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["المعاملة", "الموظف", "الإجراء", "العهدة", "التسلسلي", "الحالة", "الإجراء التالي"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{adminStaffShowcase.custodyQueue.map((r) => <tr key={r.id} className="border-t border-border"><td className="px-3 py-3 font-mono text-xs">{r.id}</td><td className="px-3 py-3 font-bold">{r.employee}</td><td className="px-3 py-3">{r.action}</td><td className="px-3 py-3">{r.asset}</td><td className="px-3 py-3 font-mono text-xs">{r.serial}</td><td className="px-3 py-3"><Status tone="amber">{r.status}</Status></td><td className="px-3 py-3"><button className="text-xs font-bold text-primary">فتح المحضر</button></td></tr>)}</tbody></table></div></Panel><div className="grid gap-5 lg:grid-cols-2"><Panel title="فحص واستلام العهدة" icon={ClipboardCheck}><FieldGrid fields={[["العهدة", "جهاز قارئ باركود"], ["رقم الأصل", "AST-IT-0314"], ["الرقم التسلسلي", "BC-314-08"], ["المسلّم", "أحمد محمد علي"], ["الحالة المبلغ عنها", "تحتاج فحصاً"], ["ارتباط إخلاء الطرف", "نعم — CL-2026-0019"]]} /><div className="mt-4 flex gap-2"><button className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">استلام بحالة جيدة</button><button className="rounded-lg border border-amber-300 px-4 py-2 text-xs font-bold text-amber-800">تسجيل ملاحظة فنية</button></div></Panel><Panel title="محضر إلكتروني" icon={FileCheck2}><div className="rounded-xl border border-dashed border-border p-5 text-center"><FileText className="mx-auto h-10 w-10 text-primary" /><div className="mt-2 font-bold text-primary">HDO-2026-0031</div><div className="mt-1 text-xs text-muted-foreground">وقع الموظف · بانتظار توقيع أمين المخزن</div><button className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-bold">معاينة PDF وQR</button></div></Panel></div></div>; }

function Career() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={TrendingUp} label="ترقيات خلال 90 يوماً" value="9" detail="6 مستوفاة" /><AdminKpi icon={FileText} label="تسويات مؤهل" value="4" detail="2 قيد المراجعة" /><AdminKpi icon={Clock3} label="متوسط الإنجاز" value="6.3 يوم" detail="من استكمال الملف" /><AdminKpi icon={CheckCircle2} label="قرارات صادرة" value="18" detail="هذا العام" /></div><Panel title="قائمة الاستحقاقات" icon={TrendingUp}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["الموظف", "الدرجة الحالية", "الاستحقاق", "التقييم", "اكتمال الملف", "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{[["أحمد محمد علي", "السادسة / 3", "يناير 2027", "91%", "83%", "مراجعة HR"], ["سارة عبدالله حسن", "السابعة / 4", "نوفمبر 2026", "88%", "100%", "جاهز للجنة"], ["محمد علي أحمد", "الثامنة / 2", "فبراير 2027", "84%", "67%", "نقص وثائق"]].map((r) => <tr key={r[0]} className="border-t border-border">{r.map((c, i) => <td key={i} className="px-3 py-3 text-xs">{c}</td>)}</tr>)}</tbody></table></div></Panel></div>; }

function Performance() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={UsersRound} label="الموظفون المشمولون" value="112" detail="دورة 2025/2026" /><AdminKpi icon={CheckCircle2} label="تقييمات مكتملة" value="98" detail="87.5%" /><AdminKpi icon={Clock3} label="غير مكتملة" value="14" detail="تتطلب متابعة" /><AdminKpi icon={Star} label="متوسط النتيجة" value="86.4%" detail="جيد جداً" /></div><Panel title="تقدم دورة التقييم السنوي" icon={Star}><div className="grid gap-3 lg:grid-cols-3">{[["الشؤون الإدارية", "24/26", "92%"], ["شؤون الطلاب", "18/22", "82%"], ["المعامل", "31/34", "91%"]].map((r) => <div key={r[0]} className="rounded-xl border border-border p-4"><div className="flex justify-between text-xs font-bold"><span>{r[0]}</span><span className="text-primary">{r[2]}</span></div><div className="mt-3 h-2 rounded-full bg-secondary"><div className="h-full rounded-full bg-gold" style={{ width: r[2] }} /></div><div className="mt-2 text-[10px] text-muted-foreground">مكتمل {r[1]}</div></div>)}</div></Panel></div>; }

function Attendance() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={CalendarCheck} label="حاضرون اليوم" value="103" detail="91.9%" /><AdminKpi icon={CalendarDays} label="في إجازة" value="6" detail="معتمدة" /><AdminKpi icon={Clock3} label="تأخير" value="3" detail="أكثر من 10 دقائق" /><AdminKpi icon={Banknote} label="عمل إضافي للمراجعة" value="7" detail="26 ساعة" /></div><Panel title="الحضور والعمل الإضافي حسب الإدارة" icon={Clock3}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["الإدارة", "الموظفون", "الحضور", "التأخير", "الإجازات", "ساعات إضافية"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{[["الشؤون الإدارية", "26", "24", "1", "1", "12"], ["شؤون الطلاب", "22", "19", "1", "2", "8"], ["المعامل", "34", "32", "1", "1", "6"]].map((r) => <tr key={r[0]} className="border-t border-border">{r.map((c) => <td key={c} className="px-3 py-3 text-xs">{c}</td>)}</tr>)}</tbody></table></div></Panel></div>; }

function Training() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={GraduationCap} label="برامج العام" value="12" detail="8 مكتملة" /><AdminKpi icon={UsersRound} label="مشاركات الموظفين" value="146" detail="1.3 لكل موظف" /><AdminKpi icon={Clock3} label="ساعات التدريب" value="1,284" detail="إجمالي" /><AdminKpi icon={Star} label="متوسط التقييم" value="92%" detail="رضا المشاركين" /></div><Panel title="خطة التطوير المهني" icon={GraduationCap}><div className="grid gap-3 lg:grid-cols-3">{[["إدارة الخدمات الرقمية", "5–7 سبتمبر", "24/30 مسجلاً", "مفتوح"], ["أمن المعلومات", "15 يوليو", "86/86 مكتملاً", "مغلق"], ["تحليل البيانات", "12–16 أكتوبر", "قيد الاعتماد", "مخطط"]].map((r) => <div key={r[0]} className="rounded-xl border border-border p-4"><Status tone={r[3] === "مغلق" ? "green" : r[3] === "مفتوح" ? "blue" : "amber"}>{r[3]}</Status><div className="mt-3 font-bold text-primary">{r[0]}</div><div className="mt-1 text-xs text-muted-foreground">{r[1]} · {r[2]}</div><button className="mt-3 text-xs font-bold text-primary">إدارة البرنامج</button></div>)}</div></Panel></div>; }

function Clearance() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><AdminKpi icon={PackageCheck} label="إخلاءات مفتوحة" value="4" detail="هذا الشهر" /><AdminKpi icon={CheckCircle2} label="مكتملة" value="11" detail="هذا العام" /><AdminKpi icon={Laptop} label="متوقفة بعهدة" value="2" detail="تحتاج استلام" /><AdminKpi icon={Clock3} label="متوسط الإنجاز" value="2.1 يوم" detail="بعد بدء الطلب" /></div><Panel title="حالة إخلاءات الطرف" icon={PackageCheck}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["المعاملة", "الموظف", "السبب", "HR", "Finance", "المكتبة", "العُهد", "IT", "الحالة"].map((h) => <th key={h} className="px-2 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{[["CL-2026-0019", "أحمد محمد علي", "نقل", "✓", "✓", "✓", "متوقف", "بانتظار", "متوقف"], ["CL-2026-0017", "هدى صالح حسن", "انتهاء خدمة", "✓", "✓", "✓", "✓", "✓", "مكتمل"]].map((r) => <tr key={r[0]} className="border-t border-border">{r.map((c, i) => <td key={i} className="px-2 py-3 text-xs">{c}</td>)}</tr>)}</tbody></table></div></Panel></div>; }

function Reports() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{adminStaffShowcase.reports.map((r, i) => <div key={r} className="rounded-xl border border-border bg-card p-4 shadow-card"><div className="grid h-9 w-9 place-items-center rounded-lg bg-gold/15 text-gold"><BarChart3 className="h-4 w-4" /></div><div className="mt-3 text-sm font-extrabold text-primary">{r}</div><div className="mt-1 text-[10px] text-muted-foreground">فلاتر الفترة والإدارة والحالة</div><div className="mt-4 flex gap-2"><button className="text-xs font-bold text-primary">فتح التقرير</button><button className="text-xs font-bold text-muted-foreground">PDF</button></div></div>)}</div><Panel title="مؤشرات تشغيلية مختارة" icon={BarChart3}><div className="grid gap-4 md:grid-cols-3"><Chart label="اعتماد الطلبات خلال يومين" value="89%" width="89%" /><Chart label="قراءة التعاميم" value="80.2%" width="80.2%" /><Chart label="اكتمال التقييم السنوي" value="87.5%" width="87.5%" /></div></Panel></div>; }

function Audit() { return <div className="space-y-5"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><ShieldCheck className="ml-2 inline h-4 w-4" /> المرحلة الثانية ستسجل الأحداث من الخادم في سجل append-only، مع حجب البيانات الحساسة من الوصف.</div><Panel title="سجل التدقيق غير القابل للتعديل" icon={History}><div className="mb-3 flex flex-wrap gap-2"><input className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="بحث برقم المعاملة أو المستخدم..." /><select className="rounded-lg border border-border px-3 py-2 text-sm"><option>كل الأنظمة</option><option>الإجازات</option><option>الرواتب</option><option>العُهد</option></select></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["الوقت", "المستخدم", "الدور", "النظام", "الإجراء", "النتيجة", "معرف الارتباط"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{[["20 أغسطس 10:14", "hr.user@usr.edu.ye", "HR", "الإجازات", "مراجعة طلب", "نجاح", "LV-2026-0184"], ["19 أغسطس 13:40", "manager@usr.edu.ye", "Direct Manager", "الإجازات", "اعتماد", "نجاح", "LV-2026-0184"], ["31 يوليو 11:20", "finance@usr.edu.ye", "Finance", "نشر كشوف", "112 كشفاً", "PAY-2026-07"]].map((r) => <tr key={r[0]} className="border-t border-border">{r.map((c) => <td key={c} className="px-3 py-3 text-xs">{c}</td>)}</tr>)}</tbody></table></div></Panel></div>; }

function AdminPrintCover() { return <section className="hidden min-h-[90vh] place-items-center text-center print:grid print:break-after-page"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-primary text-gold"><UserCog className="h-10 w-10" /></div><div className="mt-6 text-sm font-bold text-gold">جامعة إقليم سبأ</div><h1 className="mt-2 font-display text-3xl font-extrabold text-primary">لوحة إدارة خدمات الموظفين</h1><p className="mt-3 text-muted-foreground">كلية تكنولوجيا المعلومات وعلوم الحاسوب</p><div className="mt-8 font-mono text-[10px] text-muted-foreground">{TENDER_SHOWCASE_MARKER}</div></div></section>; }
function PrintHeading({ title }: { title: string }) { return <div className="mb-5 hidden items-center justify-between border-b-2 border-gold pb-3 print:flex"><div><div className="text-[10px] font-bold text-gold">لوحة الإدارة — الموارد البشرية وخدمات الموظفين</div><h2 className="font-display text-xl font-extrabold text-primary">{title}</h2></div><div className="font-mono text-[9px] text-muted-foreground">{TENDER_SHOWCASE_MARKER}</div></div>; }
function LeaveTable() { return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["الطلب", "الموظف", "الإدارة", "النوع", "المدة", "المدير", "HR", "الفحص"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{adminStaffShowcase.leaveQueue.map((r) => <tr key={r.id} className="border-t border-border"><td className="px-3 py-3 font-mono text-xs font-bold text-primary">{r.id}</td><td className="px-3 py-3 font-bold">{r.employee}</td><td className="px-3 py-3 text-xs">{r.department}</td><td className="px-3 py-3 text-xs">{r.type}</td><td className="px-3 py-3 text-xs">{r.duration}</td><td className="px-3 py-3 text-xs">{r.manager}</td><td className="px-3 py-3 text-xs">{r.hr}</td><td className="px-3 py-3"><Status tone="blue">{r.risk}</Status></td></tr>)}</tbody></table></div>; }
function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5"><h3 className="mb-4 flex items-center gap-2 font-display text-base font-extrabold text-primary"><span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold"><Icon className="h-4 w-4" /></span>{title}</h3>{children}</section>; }
function AdminKpi({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail?: string }) { return <div className="rounded-xl border border-border bg-card p-4 shadow-card"><div className="flex items-start justify-between"><div><div className="text-[11px] font-bold text-muted-foreground">{label}</div><div className="mt-1 font-display text-2xl font-extrabold text-primary">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{detail}</div></div><div className="grid h-9 w-9 place-items-center rounded-lg bg-gold/15 text-gold"><Icon className="h-4 w-4" /></div></div></div>; }
function Notice({ tone, title, detail }: { tone: string; title: string; detail: string }) { const c: Record<string, string> = { red: "border-red-200 bg-red-50 text-red-900", amber: "border-amber-200 bg-amber-50 text-amber-900", blue: "border-blue-200 bg-blue-50 text-blue-900" }; return <div className={`mb-2 rounded-lg border p-3 ${c[tone]}`}><div className="text-xs font-extrabold">{title}</div><div className="mt-1 text-[11px] opacity-80">{detail}</div></div>; }
function Integration({ name, state }: { name: string; state: string }) { return <div className="mb-2 flex items-center justify-between rounded-lg border border-border p-3"><div className="text-xs font-bold text-primary">{name}</div><Status tone="blue">{state}</Status></div>; }
function Control({ title, detail }: { title: string; detail: string }) { return <div className="rounded-lg bg-secondary p-3"><ShieldCheck className="h-4 w-4 text-gold" /><div className="mt-2 text-xs font-extrabold text-primary">{title}</div><div className="mt-1 text-[10px] text-muted-foreground">{detail}</div></div>; }
function Mini({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="rounded-lg bg-secondary p-3 text-center"><div className="font-display text-xl font-extrabold text-primary">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>; }
function Status({ tone, children }: { tone: string; children: React.ReactNode }) { const c: Record<string, string> = { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800" }; return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${c[tone] || c.blue}`}>{children}</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-3 block"><span className="mb-1 block text-xs font-bold text-primary">{label}</span>{children}</label>; }
function FieldGrid({ fields }: { fields: readonly (readonly [string, string])[] }) { return <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([l, v]) => <div key={l} className="rounded-lg bg-secondary p-3"><dt className="text-[10px] text-muted-foreground">{l}</dt><dd className="mt-1 text-xs font-bold">{v}</dd></div>)}</dl>; }
function Timeline({ items }: { items: readonly (readonly string[])[] }) { return <div className="relative before:absolute before:bottom-3 before:right-[9px] before:top-3 before:w-px before:bg-gold/40">{items.map((i, n) => <div key={n} className="relative flex gap-3 pb-5 last:pb-0"><div className="relative z-10 mt-1 h-[19px] w-[19px] shrink-0 rounded-full border-4 border-card bg-gold ring-1 ring-gold/40" /><div><div className="text-[10px] font-bold text-gold">{i[0]}</div><div className="text-sm font-extrabold text-primary">{i[1]}</div><div className="text-xs text-muted-foreground">{i[2]}</div></div></div>)}</div>; }
function Chart({ label, value, width }: { label: string; value: string; width: string }) { return <div className="rounded-xl border border-border p-4"><div className="flex justify-between text-xs font-bold"><span>{label}</span><span className="text-primary">{value}</span></div><div className="mt-3 h-2 rounded-full bg-secondary"><div className="h-full rounded-full bg-gold" style={{ width }} /></div></div>; }
