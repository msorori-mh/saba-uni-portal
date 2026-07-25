# PORTAL-PR249-STUDENT-NAVIGATION-FINAL-RC-01 — تقرير التثبيت النهائي

- المستودع: `msorori-mh/saba-uni-portal`
- المهمة: دمج PR `#250` داخل PR `#249` فقط (Merge Commit)، ثم تثبيت Final RC لتنقل بوابة الطالب وRTL وAccessibility
- التاريخ: 2026-07-25
- فرع PR `#249`: `review/student-portal-navigation-rtl-a11y-qa-01`
- Base لـPR `#249`: `main` @ `92d51faa9bcdc9fd99e89579f6a498b463264246` (لم يتغير)
- Merge Commit لـPR `#250` داخل `#249`: `e131aa9dfa9c76eaade4dc0ae5e0f311bac70626`
- قرار المراجعة المستقلة السابق: `PASS_PR249_INDEPENDENT_STUDENT_NAVIGATION_REVIEW`

## القرار

**PASS_PR249_STUDENT_NAVIGATION_FINAL_RC**

## G0 — Preflight

| التحقق | النتيجة |
|---|---|
| PR `#250` HEAD = `92fccaf7b064de1f5530a35585b970fe310dc06b` | PASS |
| PR `#249` HEAD قبل الدمج = `8cbf25fecdd7e6d2249de18b944cdab650406fbb` | PASS |
| Base لـ`#250` = فرع `#249` | PASS |
| لا review threads غير محلولة | PASS |
| الشجرة نظيفة قبل الدمج | PASS |

## G2 — الدمج

1. `gh pr ready 250`
2. `gh pr merge 250 --merge --match-head-commit 92fccaf7b064de1f5530a35585b970fe310dc06b`

| البند | النتيجة |
|---|---|
| PR `#250` | **MERGED** (`e131aa9…`) |
| PR `#249` | **OPEN** / MERGEABLE |
| `main` | لم تتغير (`92d51fa…`) |
| طريقة الدمج | Merge Commit فقط (لا squash / لا rebase) |

## إصلاحات Codex الأربعة (+ إكمال Final RC)

| # | الإصلاح | الحالة |
|---|---|---|
| 1 | جرس الإشعارات: ربط `aria-controls="notifications-panel"` مع `id="notifications-panel"` | PASS — أُكمل في Final RC لأن `#250` أضاف `id` دون `aria-controls` على الزر |
| 2 | breadcrumb بدون `nav` متداخل | PASS (من `#250`) |
| 3 | bottom-nav يبقى نشطًا على المسارات المتداخلة | PASS (من `#250`) |
| 4 | أخطاء study-plan منفصلة عن empty state + رسائل عربية آمنة | PASS (من `#250`) |
| — | حارس المراجعة `navigation-rtl-a11y-consistency-qa-01` | **14/14** |

## نطاق التغيير بعد الدمج (Final RC)

SOURCE-ONLY ضمن student-portal / tests / docs:

- `src/components/portal/NotificationsBell.tsx` — إكمال `aria-controls`
- `src/components/portal/StudentRequestsNav.tsx` — تنسيق LF/ESLint عند الحاجة
- `src/routes/mobile.student.tsx` / `src/routes/student.study-plan.tsx` — محتوى `#250` + تنسيق
- `tests/student-portal/navigation-rtl-a11y-consistency-qa-01.test.ts` — اشتراط `aria-controls` + panel `id`
- `tests/student-portal/nav-browser-smoke/*` — Chrome headless harness اصطناعي
- `tests/student-portal/student-navigation-browser-smoke-01.test.ts`
- `docs/PORTAL-PR249-STUDENT-NAVIGATION-FINAL-RC-01-REPORT.md`

لم يُمس: dashboards، enrollment_certificate، B1، Backend/SQL/migrations/RPC، Production/Staging، Deploy/Publish، بيانات حقيقية.

## G3 — Source verification

| الأمر | النتيجة |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/student-portal` | **111 pass / 0 fail** (≥ 109) |
| حارس التنقل 14/14 | PASS |
| `bun test tests` | **1558 pass / 0 fail** عبر 143 ملفًا (≥ 1556) |
| `bunx tsc --noEmit` | PASS |
| `bunx eslint` على الملفات المتأثرة | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| `bun run security:test` | لم يُشغّل (لا بيئة Supabase آمنة مصرّح بها) |

## G4 — Chrome headless smoke (بيانات اصطناعية)

Harness: `tests/student-portal/nav-browser-smoke/` على المنفذ `4179` (أو `PR249_SMOKE_PORT`)، بدون Playwright launch (يتعلّق على هذه الآلة).

| السيناريو | النتيجة |
|---|---|
| فتح/إغلاق القائمة بالماوس ولوحة المفاتيح + Escape + إعادة التركيز | PASS |
| notifications trigger/panel `aria-controls` | PASS |
| breadcrumb دون nested `nav` | PASS |
| nested routes تحت mobile grades/requests تبقي active indicator | PASS |
| study-plan loading / error / empty / success | PASS |
| logout من study-plan | PASS |
| error recovery يبقي المستخدم داخل `/student` | PASS |
| 360px بلا overflow أفقي + RTL | PASS |
| لا raw error / UUID / SQL/RPC في DOM | PASS |
| الإجمالي | **19/19** (+ عقد مصدر في launcher) |

الخادم والعمليات أُوقفت بعد الاختبار. المخرجات تحت `.tmp/pr249-nav-smoke/` (مُتجاهَلة عبر `.gitignore`).

## الافتراضات

- تثبيت Final RC على فرع `#249` بعد merge commit لـ`#250` كافٍ دون دمج إلى `main`.
- Chrome headless dump-dom/screenshot بديل مقبول عند تعليق Playwright.
- إكمال `aria-controls` جزء مشروع من Final RC لأنه كان مطلوبًا صراحةً في G1 وغير مكتمل في HEAD المدمج.

## المخاطر والعوائق

- خط أساس CRLF/Prettier الموروث في ملفات أخرى خارج نطاق هذا الـRC قد يعيد ضوضاء ESLint إن شُغّل على نطاق أوسع.
- لا عوائق متبقية ضمن نطاق التنقل / RTL / a11y.

## أثر الإنتاج

SOURCE-ONLY. لا دمج إلى `main`. لا Production/Staging/Deploy/Publish. لا Backend/SQL/migrations/RPC. لا بيانات حقيقية. الأثر محصور في دلالات التنقل وAccessibility واختبارات الانحدار والـsmoke الاصطناعي.

## القرار النهائي

**PASS_PR249_STUDENT_NAVIGATION_FINAL_RC**

PR `#249` يبقى OPEN للمراجعة — **بدون دمج إلى main**.
