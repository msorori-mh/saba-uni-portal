# PORTAL-PR194-CLOSURE-THEN-PR195-VERIFICATION-01

| الحقل | القيمة |
|---|---|
| اسم البرنامج | `PORTAL-PR194-CLOSURE-THEN-PR195-VERIFICATION-01` |
| المستودع | `msorori-mh/saba-uni-portal` |
| المسار المحلي | `C:\projects\saba-uni-portal` |
| تاريخ التحقق | 2026-07-21 |
| `origin/main` عند الإغلاق | `edb26740257e1168164e6fdee43a303c8e23fd61` |
| القرار النهائي | `PASS_PR194_AND_PR195_MERGED_MAIN_GREEN_READY_FOR_ACCOUNT_IMPORT_PREFLIGHT` |

## ملخص تنفيذي

تم التحقق عبر `git fetch` + `gh` من دمج PR #194 ثم PR #195 على `main`، وأن Web CI على commits الدمج أخضر. البرنامج جاهز لمرحلة **preflight** لاستيراد حسابات الطلاب فقط — **بدون** deploy أو استيراد إنتاج في هذا البرنامج.

---

## Phase A — إغلاق PR #194 (CI hardening + bun remediation)

| البند | التحقق |
|---|---|
| رأس الفرع قبل الدمج | `af987829d2ed74a3915b04bc71d0da62c2a7d37a` |
| حالة PR | **MERGED** @ `2026-07-21T17:41:04Z` |
| URL | https://github.com/msorori-mh/saba-uni-portal/pull/194 |
| Commit الدمج (squash) على main | `e3dbd9375838291614e90f3b437f35537a98d252` |
| العنوان | ci: إدراج اختبارات bun وPG 17 verifiers في CI (Q-20) |

### ما دخل في الإغلاق (سلسلة remediation)

- إضافات workflow: `quality` + `bun-tests` (fail-closed) + مصفوفة PG 17 verifiers.
- إصلاحات baseline لـ `bun test tests/` حتى تصبح خضراء fail-closed.
- تقارير مرتبطة على main: `docs/PORTAL-CI-HARDENING-PR194-CLOSURE-01-REPORT.md`, `docs/PORTAL-BUN-TEST-BASELINE-REMEDIATION-01-REPORT.md`, `docs/CI-TESTS-AND-PG-VERIFIERS-01-REPORT.md`.

### البوابات المحلية (من سجل الإغلاق / remediation — مُعتمدة كجزء من سلسلة A)

| البوابة | النتيجة المسجّلة |
|---|---|
| اختبارات مستهدفة (remediation) | 108 (مسار الإصلاح) |
| `bun test tests/` | **1242/1242 × 2** |
| TypeScript (`tsc --noEmit`) | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
| PG 17 chains | **8/8** |

### GitHub CI على PR ثم على main بعد الدمج

| السياق | Run | النتيجة |
|---|---|---|
| Web CI على رأس PR `af98782` | `29852490335` | success |
| Web CI على merge commit `e3dbd93` | https://github.com/msorori-mh/saba-uni-portal/actions/runs/29853983227 | **success** |

وظائف Web CI على `e3dbd93` (كلها success):

1. Install · Lint · Typecheck · Build (`quality`)
2. Bun tests (`bun-tests`)
3–10. PG 17 verifiers × **8** (foundation/lifecycle/clearance/materials/lecture/graduates)

→ **quality + bun-tests + pg = 10/10** (مصفوفة PG نفسها **8/8**).

**نتيجة Phase A:** PR #194 مدمج squash على main عند `e3dbd93` وWeb CI أخضر.

---

## Phase B — PR #195 (بدأ فقط بعد اكتمال A)

| البند | التحقق |
|---|---|
| شرط البدء | بعد دمج #194 و`main` عند `e3dbd93` + CI أخضر |
| تحديث الفرع | **`merge origin/main`** (ليس rebase / ليس force-push) — commit `5aa85688f4277856f4e766b69d96749ab5a605d7` برسالة `merge origin/main into feat/student-existing-accounts-importer-01` |
| HEAD قبل squash | `5aa85688f4277856f4e766b69d96749ab5a605d7` |
| حالة PR | **MERGED** @ `2026-07-21T17:49:50Z` |
| URL | https://github.com/msorori-mh/saba-uni-portal/pull/195 |
| Commit الدمج (squash) على main | `edb26740257e1168164e6fdee43a303c8e23fd61` |

### أمن A–K

- تحقق أمني قبل الدمج: **CRITICAL = 0**, **HIGH = 0** (مسجّل في سلسلة التحقق السابقة لـ #195).

### عناصر قائمة التحقق الثلاثة (سلوك المستورد)

| # | العنصر | الحالة |
|---|---|---|
| 1 | قبول ترويسة عربية على معاينة الاستيراد (preview) | مُتحقق |
| 2 | أدوار غير مصرّح بها — منع من جهة الخادم | مُتحقق |
| 3 | حالة `CONFLICT` — لا تنفيذ لإنشاء/ربط | مُتحقق |

### البوابات المحلية (مسجّلة لـ #195)

| البوابة | النتيجة المسجّلة |
|---|---|
| اختبارات مستهدفة | **16** (`tests/imports/student-existing-accounts-importer.test.ts`) |
| `bun test tests/` كامل | **1258** pass |
| TypeScript | PASS |
| `bun run build` | PASS |

### GitHub CI

| السياق | Run | النتيجة |
|---|---|---|
| Web CI على HEAD `5aa8568` | https://github.com/msorori-mh/saba-uni-portal/actions/runs/29854466345 | **success** (10 jobs) |
| Web CI على merge commit `edb2674` | https://github.com/msorori-mh/saba-uni-portal/actions/runs/29854602219 | **success** (10/10) |

ملاحظة: يوجد تشغيل Android Build منفصل (`29854602177`) على نفس الـ SHA — خارج بوابة Web CI لهذا البرنامج.

**نتيجة Phase B:** PR #195 مدمج squash على main عند `edb2674` وWeb CI أخضر.

---

## إجراءات ممنوعة — لم تُنفَّذ

| الإجراء | الحالة |
|---|---|
| Deploy / Publish إنتاج | لم يُنفَّذ |
| استيراد حسابات طلاب على الإنتاج | لم يُنفَّذ |
| `git push --force` / force-with-lease على main | لم يُنفَّذ |
| `git reset --hard` | لم يُنفَّذ |
| rebase للفرع على main بدل merge (في Phase B) | لم يُستخدم — استُخدم merge |
| Migration apply إنتاج | لم يُنفَّذ |

---

## حالة main النهائية (تحقق مباشر)

```
git fetch origin --prune
origin/main = edb26740257e1168164e6fdee43a303c8e23fd61
subject    = feat(imports): student existing-accounts importer (student_accounts) (#195)
```

| PR | state | mergedAt (UTC) | mergeCommit |
|---|---|---|---|
| #194 | MERGED | 2026-07-21T17:41:04Z | `e3dbd9375838291614e90f3b437f35537a98d252` |
| #195 | MERGED | 2026-07-21T17:49:50Z | `edb26740257e1168164e6fdee43a303c8e23fd61` |

---

## القرار النهائي

**`PASS_PR194_AND_PR195_MERGED_MAIN_GREEN_READY_FOR_ACCOUNT_IMPORT_PREFLIGHT`**

المبرر: الدمجان مؤكدان عبر `gh pr view`، و`origin/main` عند `edb2674`، وWeb CI على commits الدمج ناجح (10/10 بما فيها bun-tests و8 PG verifiers). الخطوة التالية المسموحة برنامجيًا: **preflight** لاستيراد الحسابات فقط — دون تنفيذ استيراد إنتاج في هذا الإغلاق.
