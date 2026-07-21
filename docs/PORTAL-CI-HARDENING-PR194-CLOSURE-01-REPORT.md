# PORTAL-CI-HARDENING-PR194-CLOSURE-01

| الحقل | القيمة |
|---|---|
| البرنامج | `PORTAL-CI-HARDENING-PR194-CLOSURE-01` |
| المستودع | `msorori-mh/saba-uni-portal` |
| المسار | `C:\projects\saba-uni-portal` |
| التاريخ | 2026-07-21 |
| `origin/main` عند البدء | `df90f1a8379da4b15c561a87ebc21e3a31e2550e` |
| فرع PR #194 | `ci/add-tests-and-pg-verifiers` |
| رأس قبل التحديث | `cba9df1f8827b166f0c1fbc2743a3d57f53d4ab6` |

## G0 — التقرير المحلي

| البند | الحالة |
|---|---|
| `docs/PORTAL-OLD-PRS-DISPOSITION-CLOSURE-01-REPORT.md` | محفوظ محلياً (غير ملتزم) |
| نسخة احتياطية | `C:\projects\portal-local-reports\PORTAL-OLD-PRS-DISPOSITION-CLOSURE-01-REPORT.md` |
| لم يُحذف | ✅ |

## G1 — Rebase

- `git fetch origin --prune`
- rebase نظيف على `origin/main` @ `df90f1a` — **نجح بلا تعارض**
- لم يُمس #149 / #155

## G2 — Workflow الحقيقي

| البند | الحالة |
|---|---|
| نقل إلى `.github/workflows/ci.yml` | ✅ |
| حذف `docs/ci/CI-ADD-TESTS-AND-PG-VERIFIERS.proposed.yml` | ✅ |
| `quality`: install / lint / typecheck / build | محفوظ دون إضعاف |
| `bun-tests`: اكتشاف + رفض صفر + `bun test tests/` بلا `continue-on-error` | ✅ |

## G3 — سلسلة PG الثامنة

أُضيفت `graduation-projects-lifecycle` بالترتيب المطلوب:

1. `tests/graduation-projects/postgres-minimal-schema.sql`
2. `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql`
3. `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql`
4. `tests/graduation-projects/postgres-foundation-verifier.sql`
5. `tests/graduation-projects/postgres-lifecycle-verifier.sql`

متغيرات `-v` (من minimal-schema + نتيجة #190 المدموجة — بلا اختراع):

```
department_id=20000000-0000-0000-0000-000000000001
student_profile_id=30000000-0000-0000-0000-000000000001
student_user_id=10000000-0000-0000-0000-000000000001
faculty_profile_id=40000000-0000-0000-0000-000000000001
faculty_user_id=10000000-0000-0000-0000-000000000002
```

**العدد: 8/8**

## G4 — التوثيق

- حُدّث `docs/CI-TESTS-AND-PG-VERIFIERS-01-REPORT.md` (أساس `df90f1a`، #190 مدمج، 8/8، workflow حقيقي)
- أُزيلت عبارة «#190 غير موجود على main»
- وُصف PR #194 يُحدَّث مع الدفع

## G5 — التحقق المحلي

| الفحص | النتيجة |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test tests/` (Windows + Linux container `oven/bun:1.3.14`) | **FAIL — 8/1242** |
| TypeScript (`tsc --noEmit`) | PASS (exit 0؛ لا سكربت `typecheck` في package.json — مطابق لسلوك CI الشرطي) |
| `bun run build` | PASS؛ الشجرة بلا تغييرات مولَّدة غير ملتزمة بعد البناء |
| `git diff --check` | PASS بعد إزالة trailing whitespace |
| PG 17 chains × 8 (Docker، عنقود مستقل لكل سلسلة) | **8/8 PASS** بما فيها `graduation-projects-lifecycle` |

### الاختبارات الثمانية الراسبة (fail-closed — لا تجاوز)

1. `G4 — Arabic PDF spike on Wrangler Worker runtime`
2. `B2 — attachSupabaseAuth stays registered in start.ts` (يتوقع `auth-attacher` بينما المصدر يستخدم `auth-attacher.local`)
3. `revalidateBulkImportRows forwards updateExisting` × 2
4. `STUDENT-TO-COHORT-BINDING-AUDIT-01 evidence` × 2
5. `canonical current-term resolver` (mobile grades consumer)
6. `StudentRequestEligibilityNotice` (بطاقة معلومات زرقاء تظهر لطالب مؤهل)

هذه إخفاقات موجودة على شجرة `main` الحالية (ليست من تعديل runtime في هذه المرحلة). تفعيل `bun-tests` fail-closed يكشفها عمداً.

## G6 — GitHub / الدمج

- دُفع الفرع: رأس `9d1451c` على `ci/add-tests-and-pg-verifiers` (rebase على `df90f1a` + workflow حقيقي).
- PR #194: base=`main`، **MERGEABLE**، لا تعارضات.
- تشغيل Actions: https://github.com/msorori-mh/saba-uni-portal/actions/runs/29850698784

| البوابة | النتيجة |
|---|---|
| `quality` (Install · Lint · Typecheck · Build) | **PASS** |
| `bun-tests` | **FAIL** |
| `pg-verifiers` (8 أرجل بما فيها lifecycle) | **8/8 PASS** |

- **لا دمج** — شرط البوابات غير مكتمل (`bun-tests` failure).
- لم يُحذف `ci/q20-probe` (يُحذف فقط بعد الدمج الآمن).
- لم يُحذف `ci/add-tests-and-pg-verifiers`.

## ما لم يُنفَّذ (التزام)

Deploy / Publish / Migration apply / Production SQL / D-01 / D-02 / `student_visible` / تعديل #149/#155 / إغلاق PRs أخرى / إصلاح runtime للاختبارات الثمانية (خارج نطاق hardening النقي؛ يمنع الدمج).

## المهمة التالية الموصى بها (واحدة)

إصلاح أو عزل موثّق للاختبارات الثمانية الراسبة على `main` (أو PR متابعة ضيق)، ثم إعادة تشغيل بوابات #194 ودمج squash عند 8/8 + bun-tests PASS.

---

## القرار النهائي

**`HOLD_CI_HARDENING_PR194`**

السبب الحاسم: بوابة `bun-tests` fail-closed **لا تمر** (8 فشل على Linux وWindows). سلاسل PG 8/8 وworkflow الحقيقي جاهزان، لكن شرط الدمج غير مستوفًى.
