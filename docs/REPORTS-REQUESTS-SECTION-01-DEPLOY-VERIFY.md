# REPORTS-REQUESTS-SECTION-01-DEPLOY-VERIFY

## المزامنة
- Local HEAD = origin/main = **`e9c63da`** ("ربط تقارير الطلبات بالصفحة").
- المصدر يحتوي على `RequestsReport` و `FileWarning` و `student_requests_report` و `student_profile_id/request_number/RequestsReportFilters` — التأكيد عبر grep على `src/routes/admin/reports.tsx` و `src/lib/admin-reports.functions.ts`.

## Build/Deploy
- `preview_ui--publish` تم استدعاؤه **مرتين** خلال هذه الجلسة (النشر مجدول لـ quboolye.com).
- **لا migration** — لم يُنفَّذ.
- **لا import / delete / cleanup / DB / RLS / Storage / Trigger** — أي منها.

## التحقق بعد النشر (وضع الرول‌أوت)
| فحص | نتيجة |
|---|---|
| `curl https://quboolye.com/admin/reports?tab=requests` | HTTP 200 |
| `x-deployment-id` قبل النشر | `67dc313e026d82c3ea063473fb6f25e97ab89eb86c13cd98b9ca37a3c02479a5` |
| `x-deployment-id` بعد النشر (بعد ~15 دقيقة ومحاولتَي publish) | **لم يتغير** — لا يزال نفس الـ ID |
| Chunk المخدوم `assets/reports-C7Y-l923.js` | يحتوي **الكود القديم**: `fetchRequestsReport` يقرأ `id, request_type, status, submitted_at, reviewed_at, created_at` فقط، بدون `student_profile_id` / `request_number` / الفلاتر / `RequestsReport` UI / `FileWarning` / `student_requests_report`. |
| النص العربي "تقارير الطلبات" في الحزمة | **غير موجود** |
| `FileWarning` / `openCount` / فلاتر الفترة / تصدير CSV للطلبات | **غير موجود في الإنتاج** |

## التفسير
- الكود الصحيح مدمج على `main` وموجود في `HEAD` محلياً.
- منصة النشر قبلت طلب Publish مرتين، لكنها لم تُخرج نشرة جديدة حتى الآن: `x-deployment-id` ثابت لنحو 15 دقيقة، والحزمة `reports-C7Y-l923.js` تخدم كوداً قبل التعديل.
- بالتالي لا يمكن التحقق الوظيفي على الإنتاج (تبويب "تقارير الطلبات"، الفلاتر، التصدير، بطاقة "طلبات مفتوحة" → `?tab=requests`، منع غير المخوّل).

## القرار
**BLOCKED** — الرفع مجدول لكنه لم يخرج للإنتاج بعد (deployment-id لم يتغيّر خلال نافذة الانتظار). فور اكتمال الرول‌أوت (تبديل `x-deployment-id` وظهور Chunk جديد يحتوي `FileWarning`/`RequestsReport`)، يُعاد تشغيل التحقق الوظيفي بحساب مخوّل وتحديث القرار.

## توصية
- إعادة تشغيل الـ Deploy من واجهة Publish إن استمر الانتظار، أو الانتظار حتى يخرج الـ deployment الجديد ثم إبلاغي لأعيد التحقق.
