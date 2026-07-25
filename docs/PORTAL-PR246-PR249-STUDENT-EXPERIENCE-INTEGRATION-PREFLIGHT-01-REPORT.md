# PORTAL-PR246-PR249-STUDENT-EXPERIENCE-INTEGRATION-PREFLIGHT-01

- المستودع: `msorori-mh/saba-uni-portal`
- التاريخ: 2026-07-25
- فرع المحاكاة: `preflight/pr246-pr249-student-experience-integration-01`
- الطبيعة: محاكاة دمج محلية فقط — **ليست موافقة دمج إلى main**

## القرار

**PASS_PR246_PR249_STUDENT_EXPERIENCE_INTEGRATION_PREFLIGHT**

## الرؤوس المثبّتة (G0)

| المرجع | SHA | الحالة |
|---|---|---|
| PR `#246` HEAD | `9d2f186bdcdeb539594e9b28325e5ac76a6dab87` | OPEN / MERGEABLE |
| PR `#249` HEAD | `b00c7c03a1eabfb3eaae74db5ada0ed4c56143dd` | OPEN / MERGEABLE |
| `origin/main` | `92d51faa9bcdc9fd99e89579f6a498b463264246` | لم تتغير |
| review threads | لا خيوط غير محلولة | PASS |

الفروع الأصلية لـ`#246` و`#249` لم تُعدَّل.

## ترتيب الدمج (G1) — Merge Commit فقط

1. قاعدة: `origin/main` @ `92d51fa…`
2. Merge `#246` → `2c19859fab68e560accb0557d4ada99e07323aa1`  
   (`Merge PR #246 enrollment-certificate banner Final RC into student experience preflight`)
3. Merge `#249` → `c07c897c6609fe3729464b363374dccb243333d3`  
   (`Merge PR #249 student portal navigation Final RC into student experience preflight`)

كلا الدمجين نجحا باستراتيجية `ort` **بلا تعارضات نصية**.

## التعارضات والتداخل الدلالي (G2)

### تعارضات Git
لا يوجد. مجموعتا الملفات شبه منفصلتين:

| PR `#246` | PR `#249` |
|---|---|
| `StudentRequestEligibilityNotice` | `NotificationsBell`, `StudentRequestsNav`, `Header` |
| `student.requests.*` | `__root`, `mobile.student`, `student.study-plan`, `student.progress`, `student.tsx` |
| banner smoke/tests/docs | nav smoke/tests/docs + error recovery |

لا تداخل على نفس الملف بين الفرعين.

### تحقق دلالي بعد الدمج

| متطلب | النتيجة |
|---|---|
| لا شريط أحمر كاذب في الحالة الطبيعية | PASS — `normal-open` بلا `bg-rose` |
| permission/network لا تتحول إلى empty | PASS — types/network failure تُظهر خطأ آمن مع empty مخفي |
| cancelled / rejected / returned محمية | PASS — لا شريط إنشاء مخالفة فوقها |
| لا raw backend errors في واجهة الطالب المفحوصة | PASS — رسائل عربية آمنة |
| البقاء داخل `/student` | PASS — error recovery |
| `onLogout` يعمل | PASS — study-plan fixture + مصدر `PortalShell` |
| تنقل الجوال سليم + active للمسارات المتداخلة | PASS |
| Escape / focus / `aria-controls` | PASS — قائمة + جرس |
| RTL و360px بلا overflow | PASS |
| لا ازدواج Header/Footer على `/mobile/student` | PASS — `isMobileAppShell` في `__root.tsx` |

لا إصلاح تكاملي على كود المنتج كان مطلوبًا؛ الإضافات محصورة في harness/docs للمحاكاة.

## Browser scenarios (G3)

Harness موحّد: `tests/student-experience-integration-smoke/` على المنفذ **4180**.

| # | السيناريو | النتيجة |
|---|---|---|
| 1 | فتح بوابة الطالب | PASS |
| 2–3 | قائمة الهاتف + Escape + إعادة التركيز | PASS |
| 4–5 | التنقل إلى إفادة القيد / حالة طبيعية بلا شريط أحمر | PASS |
| 6 | violation حقيقية | PASS |
| 7 | permission/types failure ≠ empty | PASS |
| 8 | network failure | PASS |
| 9–11 | cancelled / rejected / returned | PASS |
| 12–13 | study-plan loading/error/empty/success + logout | PASS |
| 14 | تبديل هوية بلا stale cache | PASS |
| 15 | nested mobile active indicator | PASS |
| 16 | 360px RTL بلا overflow | PASS |
| 17 | لا UUID/SQL/RPC/raw في DOM | PASS على كل الصفحات |

الإجمالي: **44/44** (يشمل فحوص خصوصية لكل صفحة + bell aria-controls + error recovery).

الحارس يفشل صراحةً عند: غياب Chrome، فشل dump-dom، DOM فارغ، timeout، أو خروج الخادم مبكرًا (`/health` بين السيناريوهات).

## الاختبارات (G4)

| الأمر | النتيجة |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/student-portal` | **111** pass / 0 fail |
| `bun test tests/student-requests` | **616** pass / 0 fail |
| `bun test tests` | **1571** pass / 0 fail (≥ 1558) |
| `bunx tsc --noEmit` | PASS |
| ESLint على ملفات الـharness | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| Browser integration smoke | **44/44 PASS** |
| المنفذ 4180 بعد الإيقاف | حر |

## الخصوصية والنطاق (G5)

- لا `error.message` خام في fixtures المفحوصة.
- لا UUID / SQL / RPC / PostgREST / RLS في DOM (بعد استثناء `<script>`).
- لا بيانات هوية سابقة بعد تبديل الهوية الاصطناعي.
- لا Production URLs مباشرة في الـsmoke.
- لا Backend / SQL / migrations / RPC / authorization.
- لا B1 ولا dashboards.
- لا Deploy / Publish / بيانات حقيقية.

## العمليات والخوادم التي أُوقفت

- خادم التكامل على `127.0.0.1:4180` (PID جلسة التشغيل) أُوقف بعد الـsmoke.
- عمليات Chrome headless انتهت مع كل `dump-dom` / screenshot.
- لا خوادم متبقية على 4180 بعد التنظيف.
- المخرجات تحت `.tmp/pr246-pr249-integration-smoke/` (مُتجاهَلة عبر `.gitignore`).

## المخاطر المتبقية

- `mergeStateStatus=BLOCKED` على GitHub لـ`#246`/`#249` حالة مراجعات/فحوصات بعيدة عن تعارض المصدر؛ لا تمنع المحاكاة المحلية.
- الـsmoke اصطناعي (fixtures) وليس E2E حيًا ضد بيئة مشتركة.
- هذه النتيجة لا تغني عن قرار دمج منفصل لكل PR إلى main.

## تأكيد صريح

هذه المحاكاة **ليست موافقة دمج إلى main**.  
لم يُدمَج PR `#246` ولا PR `#249` إلى `main`.  
لم تُعدَّل فروعهما الأصلية.
