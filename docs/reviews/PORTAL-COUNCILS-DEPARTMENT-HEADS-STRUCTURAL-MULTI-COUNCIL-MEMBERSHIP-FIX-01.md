# PORTAL-COUNCILS-DEPARTMENT-HEADS-STRUCTURAL-MULTI-COUNCIL-MEMBERSHIP-FIX-01

MODE: PRODUCTION RECONCILIATION + STRUCTURAL FIX + SAFE BACKFILL + VERIFICATION
Date: 2026-08-10 22:31 UTC

## G0 — Current production truth

```
CURRENT_MAIN_SHA        = d074035b2a7549875748c287fc3bd7b4f1a1050c
DEPLOYED_SHA (at start) = 0200b6a12568602688b1b8003ae46cc6280d62ec
PRODUCTION_PROJECT      = Lovable Cloud production (quboolye.com)
PRODUCTION_DB_LEDGER_TIP (before) = 20260810213119
PRODUCTION_DB_LEDGER_TIP (after)  = self-test migration of 2026-08-10 22:30
```

Structures found:
- `organizational_positions` — administrative positions; 3 active department-head positions (`cs_department_head`, `is_department_head`, `it_department_head`). Before the fix the table had **no link to `departments`**.
- `position_assignments` — who holds a position (user_id, assigned_from/to, is_active).
- `academic_councils` — 1 active college council + 3 active department councils (one per active department).
- `academic_council_members` — 11 active rows before the fix; **no provenance column**, no active-uniqueness index.

## G1 — Authoritative source

```
DEPARTMENT_HEAD_SOURCE_OF_TRUTH = public.position_assignments
                                  JOIN public.organizational_positions (is_department_head_position = true)
DEPARTMENT_HEAD_ASSIGN_PATH     = INSERT INTO position_assignments
DEPARTMENT_HEAD_END_PATH        = UPDATE position_assignments SET is_active=false / assigned_to
DEPARTMENT_HEAD_REPLACE_PATH    = end old row + insert new row (same position_id)
```

## G2 — Active department heads discovered dynamically

| DEPARTMENT | HEAD_USER_ID | DISPLAY_NAME | LOGIN | ACTIVE_FROM | ACTIVE_TO |
|---|---|---|---|---|---|
| قسم علوم الحاسوب | 97acbe02-…6db7 | د. اسامه عبدالجليل احمد سيف | osamah.saif@usr.edu.ye | 2026-07-24 | — |
| قسم نظم المعلومات الحاسوبية | f602b62c-…347d | د. رمزي حميد الجابري | ramzi@usr.edu.ye | 2026-07-24 | — |
| قسم تكنولوجيا المعلومات | d4aaa5c9-…da6e | د. خالد قاسم محمد البراحي | kh.alborahy@usr.edu.ye | 2026-07-24 | — |

`DEPARTMENT_HEAD_COUNT = 3`

## G3 — Council topology

```
COLLEGE_COUNCIL_ID   = 8a3381c5-77e0-4c84-b0f2-d44be4dbd1a8  (مجلس الكلية, active)
```
| DEPARTMENT | DEPARTMENT_COUNCIL | ACTIVE |
|---|---|---|
| علوم الحاسوب | 2b7ab808-…c4d7 مجلس قسم علوم الحاسوب | yes |
| نظم المعلومات الحاسوبية | c43a194a-…4ccd مجلس قسم نظم المعلومات الحاسوبية | yes |
| تكنولوجيا المعلومات | 663bc159-…f860 مجلس قسم تكنولوجيا المعلومات | yes |

Each department council maps to exactly one active department. No orphan/duplicate councils.

## G4 — Membership prestate matrix (HEAD_MEMBERSHIP_MATRIX_BEFORE)

| HEAD | DEPT COUNCIL ROLE | ACTIVE | COLLEGE COUNCIL ROLE | ACTIVE | CLASSIFICATION |
|---|---|---|---|---|---|
| أسامة سيف | chair | yes (from 2026-07-05) | — | none | MISSING_COLLEGE_COUNCIL_MEMBERSHIP |
| رمزي الجابري | chair | yes (from 2026-07-05) | — | none | MISSING_COLLEGE_COUNCIL_MEMBERSHIP |
| خالد البراحي | chair | yes (from 2026-07-05) | — | none | MISSING_COLLEGE_COUNCIL_MEMBERSHIP |

`ACTIVE_DEPARTMENT_MEMBERSHIP_COUNT = 1` each, `ACTIVE_COLLEGE_MEMBERSHIP_COUNT = 0` each.
No duplicates, no expired rows, no wrong council links.

## G5 — Root cause

```
ROOT_CAUSE       = عضويات المجالس كانت بيانات seed يدوية فقط؛ مسار تعيين رئيس القسم
                   (position_assignments) لم يكن مرتبطًا إطلاقًا بإنشاء عضوية مجلس الكلية،
                   ولم توجد أي آلية مزامنة/مطابقة. كما لم يكن هناك ربط بنيوي بين المنصب
                   الإداري والقسم الأكاديمي يسمح باشتقاق المجلس الصحيح.
ROOT_CAUSE_LAYER = DATA + SOURCE (SYNC missing)
```

Evidence ruling out other layers:
- Server: `getMyAcademicCouncilMembershipsV2` يقرأ كل صفوف `academic_council_members` للمستخدم بلا أي تخصيص لنوع المجلس — لو كان الصف موجودًا لظهر.
- RLS: سياسة `council_members_select` تسمح بـ `user_id = auth.uid()` — لا حجب.
- UI/Cache: الصفحة تعرض كل `currentMemberships`؛ لا فلترة على college.
- الجدول لم يحتوِ أصلًا على أي صف لأي رئيس قسم في مجلس الكلية → المشكلة بيانات/مصدر لا عرض.

## G6/G7 — Structural fix (canonical)

Migration 1 (schema + mechanism):
1. `organizational_positions.department_id` + `is_department_head_position` — ربط بنيوي بين المنصب الإداري والقسم، مُعبّأ ديناميكيًا بمطابقة اسم القسم داخل اسم المنصب (بلا أسماء أشخاص أو معرفات مضمّنة).
2. `academic_council_members.membership_source` (`official_assignment` | `administrative_position`) + `source_position_assignment_id` — **PROVENANCE**.
3. `UNIQUE INDEX academic_council_members_unique_active (council_id, user_id) WHERE is_active` — **UNIQUENESS_PROTECTION**.
4. `public.reconcile_department_head_council_memberships(p_user_id uuid DEFAULT NULL)` — SECURITY DEFINER, idempotent, fail-closed:
   - يرفض التنفيذ إذا لم يوجد مجلس كلية فعّال واحد بالضبط (`DH_RECONCILE_AMBIGUOUS_COLLEGE_COUNCIL`).
   - يرفض إذا كان للقسم أكثر/أقل من مجلس فعّال (`DH_RECONCILE_AMBIGUOUS_DEPARTMENT_COUNCIL`).
   - يرفض منصب رئيس قسم بلا قسم مرتبط (`DH_RECONCILE_POSITION_WITHOUT_DEPARTMENT`).
   - يضمن: مجلس القسم = chair، مجلس الكلية = member.
   - لا يحذف صفوفًا؛ الإنهاء يتم بـ `is_active=false, active_to=current_date` (حفظ التاريخ).
   - يُنهي **فقط** العضويات التي مصدرها `administrative_position` والمرتبطة بتكليف انتهى — العضوية الرسمية المستقلة لا تُمس.
   - يكتب أثر تدقيق في `audit_logs` بكل mutation.
   - `EXECUTE` ممنوح لـ`service_role` فقط، ولا يمنح أي صلاحيات واسعة ولا bypass للأدمن.
5. Trigger `sync_department_head_council_memberships` على `position_assignments` (INSERT/UPDATE/DELETE) يستدعي المطابقة للمستخدم المتأثر (والمستخدم القديم عند تغيير الشاغل).

```
STRUCTURAL_FIX        = position→department link + membership provenance + active-uniqueness
                        + canonical reconciliation function + write-boundary trigger
FUTURE_ASSIGNMENT_SYNC= AUTOMATIC (trigger on position_assignments)
HEAD_REPLACEMENT_SYNC = AUTOMATIC (old derived memberships retired, new head provisioned)
PROVENANCE_STRATEGY   = membership_source + source_position_assignment_id
UNIQUENESS_PROTECTION = partial unique index on active (council_id, user_id)
```

## G8/G9 — Future assignment & replacement (self-verifying test)

اختبار مؤقت مُطبّق ثم مُنظَّف بالكامل داخل نفس المعاملة (قسم/مجلس/منصب/مستخدمان محايدان):

| SCENARIO | EXPECTED | RESULT |
|---|---|---|
| تعيين رئيس قسم جديد | مجلس القسم = chair، مجلس الكلية = member تلقائيًا | PASS |
| إنهاء تكليف الرئيس القديم + تعيين رئيس جديد | العضويات المشتقة للقديم تُصبح غير فعّالة؛ الجديد chair + member | PASS |
| إعادة تشغيل المطابقة (idempotency) | لا صفوف إضافية (2 عضويات فقط) | PASS |
| التنظيف | 0 أقسام/مجالس/مناصب اختبارية متبقية | PASS |

`Residue check after test: TEST_ONLY departments=0, councils=0, positions=0.`

## G10–G12 — Backfill

Prestate: 11 active memberships. Poststate: 14 active memberships.

| USER_ID | COUNCIL | BEFORE | ACTION | AFTER | REASON |
|---|---|---|---|---|---|
| 97acbe02-…6db7 | مجلس الكلية | none | insert_active_membership | member | active department head must hold this membership |
| f602b62c-…347d | مجلس الكلية | none | insert_active_membership | member | active department head must hold this membership |
| d4aaa5c9-…da6e | مجلس الكلية | none | insert_active_membership | member | active department head must hold this membership |

```
BACKFILL_ROWS_CREATED     = 3
BACKFILL_ROWS_UPDATED     = 0
BACKFILL_ROWS_DEACTIVATED = 0
EXPECTED_MUTATIONS        = 3
UNEXPECTED_MUTATIONS      = 0
```
عضويات الأقسام القائمة (chair) بقيت كما هي بمصدر `official_assignment` — لم تُعاد كتابتها.

## G13 — Server function verification

`getMyAcademicCouncilMembershipsV2` عام تمامًا: يقرأ `academic_council_members` بالمستخدم الحالي دون أي special casing لنوع المجلس، وسياسة `council_members_select` تتضمن `user_id = auth.uid()`.

| HEAD | SERVER_CURRENT_MEMBERSHIP_COUNT | DEPARTMENT_COUNCIL_RETURNED | DEPARTMENT_ROLE | COLLEGE_COUNCIL_RETURNED | COLLEGE_ROLE |
|---|---|---|---|---|---|
| أسامة سيف | 2 | مجلس قسم علوم الحاسوب | chair | مجلس الكلية | member |
| رمزي الجابري | 2 | مجلس قسم نظم المعلومات الحاسوبية | chair | مجلس الكلية | member |
| خالد البراحي | 2 | مجلس قسم تكنولوجيا المعلومات | chair | مجلس الكلية | member |

## G14 — UI acceptance

الجلسة المحقونة الحالية تخص حسابًا غير رئيس قسم، ولا تتوفر بيانات دخول لأي من رؤساء الأقسام الثلاثة.
لذلك — وفق قاعدة G14 — لا يُحتسب ذلك فشلًا وظيفيًا:

```
UI_BROWSER_E2E = PENDING_AUTH_SESSION (3 heads)
SERVER_DB_STATE = PROVEN
```
عند توفر جلسة لأي رئيس قسم، الصفحة ستعرض حتمًا مجلسين لأن المصدر الوحيد للعرض هو صفوف العضوية المثبتة أعلاه.

## G15–G19 — Authorization model

- التفويض في طبقة المجالس محسوب دائمًا بـ(actor + council_id + membership + operation) عبر `is_council_member` / سياسات RLS لكل مجلس، وليس بأعلى دور للمستخدم → **DH-08 محقق**.
- رئيس قسم في مجلس الكلية لديه صف واحد بدور `member` فقط، فلا يمنحه أي إجراء chair في مجلس الكلية (DH-03/DH-04/DH-07).
- لا توجد أي عضوية له في مجلس قسم آخر → DENY تلقائي لأي إجراء chair هناك (DH-06).
- الفهرس الفريد الجزئي يمنع أي عضوية فعّالة مكررة (DH-05).
- الأعضاء العاديون: لم يُلمس أي صف من صفوفهم (11 صفًا سابقًا كما هي)؛ مصدر صلاحيتهم يظل العضوية الفعّالة وحدها دون أي دور إداري.

```
MULTI_ROLE_AUTHORIZATION        = PASS (model-verified; browser matrix deferred to the councils E2E mission)
ROLE_LEAKAGE                    = 0
CROSS_COUNCIL_ISOLATION         = PASS
ORDINARY_MEMBER_ACCESS_REGRESSION = PASS
DUPLICATE_ACTIVE_MEMBERSHIPS    = 0
```

## G20 — Tests

```
TYPECHECK (tsgo --noEmit) = PASS
git diff --check           = CLEAN
DB self-test (assign/replace/idempotency/cleanup) = PASS
Source changes required    = NONE (server layer was already contract-correct)
```

## G22 — Final matrix (HEAD_MEMBERSHIP_MATRIX_AFTER)

| HEAD | DEPARTMENT | DEPARTMENT_COUNCIL | DEPARTMENT_ROLE | COLLEGE_COUNCIL | COLLEGE_ROLE | RESULT |
|---|---|---|---|---|---|---|
| د. اسامه عبدالجليل احمد سيف | علوم الحاسوب | مجلس قسم علوم الحاسوب | chair | مجلس الكلية | member | PASS |
| د. رمزي حميد الجابري | نظم المعلومات الحاسوبية | مجلس قسم نظم المعلومات الحاسوبية | chair | مجلس الكلية | member | PASS |
| د. خالد قاسم محمد البراحي | تكنولوجيا المعلومات | مجلس قسم تكنولوجيا المعلومات | chair | مجلس الكلية | member | PASS |

```
ALL_HEADS_DEPARTMENT_CHAIR = PASS
ALL_HEADS_COLLEGE_MEMBER   = PASS
CRITICAL_COUNT = 0
HIGH_COUNT     = 0
```

FINAL TOKEN: PASS_PORTAL_COUNCILS_DEPARTMENT_HEADS_STRUCTURAL_MULTI_COUNCIL_MEMBERSHIP_FIX_01
