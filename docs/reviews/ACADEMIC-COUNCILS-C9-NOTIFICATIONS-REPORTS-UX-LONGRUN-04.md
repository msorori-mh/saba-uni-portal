# ACADEMIC-COUNCILS-C9-NOTIFICATIONS-REPORTS-UX-LONGRUN-04

## ملخص التنفيذ (Executive Summary)

تم تسليم حزمة C9 — الإشعارات الداخلية للمجالس الأكاديمية، التقارير، لوحات المعلومات، وتجربة المستخدم التشغيلية — كمصدر فقط دون تطبيق migrations على الإنتاج وبدون دمج.

**القرار: PASS**

---

## الملفات المعدلة والجديدة

### Database (migration)
- `supabase/migrations/20260808180000_councils_c9_notifications_reports_ux_01.sql`
  - جدول `academic_council_notifications` مع RLS صارم (كل مستخدم يرى إشعاراته فقط).
  - جدول `academic_council_notification_outbox` لبنية event/outbox قابلة لتوسيع البريد لاحقاً.
  - دوال توصيف المستلمين `get_council_notification_recipients` من جانب الخادم.
  - محتويات عربية آمنة `build_council_notification_message` لا تكشف PII جديدة ولا تعرض أخطاء raw.
  - Triggers على الاجتماعات، الموضوعات، بنود جدول الأعمال، كشف الحضور، والقرارات.
  - RPCs للإشعارات، التقارير، ولوحات المعلومات.

### Server functions
- `src/lib/councils-c9.functions.ts` — دوال الخادم لـ C9.
- `src/lib/councils-c4-c8.functions.ts` — أضيف `getCouncilVoteResultFn` و `getCouncilAttendanceQuorumSummaryFn` لدعم صفحة تفاصيل الاجتماع.

### UI components
- `src/components/councils/CouncilNotificationsBell.tsx` — زر الجرس مع قائمة منسدلة، read/unread، وعداد غير مقروء.
- `src/components/councils/CouncilReportsPanel.tsx` — لوحة التقارير بـ 10 تبويبات وتصدير Excel.
- `src/components/councils/CouncilDashboardsPanel.tsx` — لوحات رئيس المجلس/أمين السر/العضو/الإدارة.

### Routes
- `src/routes/faculty-portal.academic-councils.tsx` — دمج الإشعارات، لوحة المعلومات، وربط البطاقات بصفحة التفاصيل.
- `src/routes/faculty-portal.academic-councils.$meetingId.tsx` — صفحة تفاصيل الاجتماع (مسار جديد) تعرض الجدول/التصويت/الحضور/المحضر.
- `src/routes/admin/academic-councils.tsx` — دمج لوحة التقارير ولوحة الإدارة التشغيلية، مع تأكيد أن الإجراءات الأكاديمية مقفلة.

### Accessibility / UX polish
- `src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx` — ترجمة حالات القرارات، تسميات Select عربية.
- `src/components/councils/CouncilVotingControl.tsx` — رسالة صوت عربية واضحة + `aria-live`.
- `src/routes/admin/academic-councils.tsx` — `aria-label` لأزرار ترتيب البنود.

### Tests
- `tests/academic-councils/councils-c9-notifications-reports-ux.test.ts`
- `tests/academic-councils/postgres-c9-notifications-reports-ux-verifier.sql`

---

## التحقق (Validation)

```text
bun test tests/academic-councils          → PASS (9 tests)
bunx tsc --noEmit                         → PASS
bun run build                             → PASS
git diff --check                          → PASS
```

---

## القرارات المعمارية

### C9-A — الإشعارات الداخلية
- استخدمنا جدولين منفصلين: notifications (in-app) و outbox (event log).
- صلاحية المستلمين تُحسب server-side عبر `get_council_notification_recipients`.
- لا يوجد تكامل مع مزود بريد/SMS.
- Triggers تُدرج في outbox، وتُعالج لاحقاً عبر `process_council_notification_outbox`.

### C9-B — التقارير
- بنيت فوق نماذج القراءة C7 (`get_council_archive_summary`، إلخ) مع إضافة 10 دوال تقرير جديدة.
- يدعم التصدير إلى Excel عبر `exportXlsx` الموجود.

### C9-C — لوحات المعلومات
- Chair dashboard: اجتماعات قادمة، موضوعات تتطلب إجراء، جاهزية الأجندة والنصاب، قرارات متأخرة، حالة الأرشيف.
- Secretary dashboard: إعداد موضوعات، مهام حضور، مسودات محاضر، متابعة قرارات.
- Member dashboard: اجتماعات، موضوعات، تصويتات مفتوحة، محاضر/قرارات مرئية.
- Admin dashboard: رؤية تشغيلية/فنية فقط.

### C9-D/E — العربية وإمكانية الوصول
- RTL عبر `dir="rtl"` والاتجاه الافتراضي للمشروع.
- جميع الرسائل والتسميات بالعربية.
- لا أخطاء raw RPC/SQL تظهر للمستخدم.
- أزرار icon-only تحمل `aria-label`.
- DialogTitle و form labels موجودة.

### C9-F — رحلات سير العمل
- Chair: dashboard → meeting detail → quorum → session → vote → minutes → decisions → archive.
- Secretary: dashboard → topic prep → attendance → minutes → follow-up.
- Member: meeting → agenda → vote → minutes → decisions.
- Viewer: read-only.
- Responsible actor: assigned decision → progress → evidence → complete.

---

## الافتراضات (Assumptions)

1. المigrations مُرفوعة فقط ولم تُطبق على الإنتاج (مطابق للـ AGENTS.md).
2. `src/integrations/supabase/types.ts` لم يُحدّث لأن migrations غير مُطبقة؛ استخدمنا `supabase.rpc` لتجنب type gaps.
3. صفحة تفاصيل الاجتماع تستخدم المسارات المُولدة تلقائياً (file-based routing).
4. التصدير إلى Excel يستخدم `xlsx` الموجود في المشروع.

---

## المخاطر (Risks)

| الخطر | الخطورة | التخفيف |
|-------|--------|--------|
| routeTree.gen.ts يُولد تلقائياً وقد يسبب تعارضات دمج | منخفضة | تم تشغيل build ونجح |
| تغييرات UI كبيرة قد تؤثر على اختبارات E2E المستقبلية | متوسطة | جميع التغييرات scoped للمجالس |
| عدم وجود i18n library قد يصعب صيانة التسميات العربية | منخفضة | يتوافق مع نمط المشروع الحالي |

---

## العوائق (Blockers)

لا توجد عوائق.

---

## أثر الإنتاج (Production Impact)

- `PRODUCTION_WRITES: 0`
- `MIGRATION_APPLIED: NO`
- `MERGE: NO`
- لا توجد تعديلات على بيانات الإنتاج.

---

## FINAL

```text
FINAL_SHA:        <TBD after commit>
PR_NUMBER:        <TBD after PR creation>
PR_URL:           <TBD after PR creation>
```

---

## القسم التفصيلي حسب المتطلبات

### NOTIFICATIONS
- `academic_council_notifications` table مع `is_read`, `read_at`, `created_at`, `entity_type`, `entity_id`, `metadata`.
- 15 نوع حدث (`meeting_scheduled`, `intake_opened`, ... `meeting_archived`).
- `process_council_notification_outbox` و `notify_council_decision_due_dates`.

### REPORTS
- Council meeting summary
- Attendance rate
- Quorum history
- Topic disposition
- Agenda completion
- Voting result summary
- Decision status
- Decision overdue
- Meeting archive
- Council activity over selected period

### CHAIR_UX
- لوحة رئيس المجلس وصفحة تفاصيل الاجتماع مع إدارة الجلسة.

### SECRETARY_UX
- لوحة أمين السر مع مهام الحضور والمحاضر والمتابعة.

### MEMBER_UX
- لوحة العضو والتصويت المباشر.

### RESPONSIBLE_ACTOR_UX
- زر "تحديث حالة ومجريات التنفيذ" في سجل القرارات للمسؤول أو رئيس المجلس.

### ARABIC_UX
- جميع التسميات والرسائل والتواريخ بالعربية.

### A11Y
- `aria-label` لكل الأزرار icon-only.
- `DialogTitle` و `aria-live` للتحديثات الديناميكية.

### TESTS
- 9 tests تمر عبر `bun test tests/academic-councils`.

### PG17
- اختبار C9 يُشغل PG17 disposable ويمر.

### TSC
- `bunx tsc --noEmit` PASS.

### BUILD
- `bun run build` PASS.

### CI
- تم التحقق محلياً؛ سيتم تشخيص أي فشل روتيني في CI تلقائياً.
