# STUDENT-REQUESTS-STAGING-APPLY-02 Report

**التاريخ:** 2026-07-07  
**المستودع:** `msorori-mh/saba-uni-portal`  
**النوع:** Staging apply + smoke verification  
**القرار:** **NO_GO**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|--------|
| **القرار** | **NO_GO** |
| **البيئة المستهدفة** | **لم يُؤكَّد staging** — المشروع الوحيد في repo: `wpmicqriltrowwonknox` |
| **وقت التطبيق** | **لم يُنفَّذ أي apply** |
| **Backup** | **لم يُؤخَذ** — لا وصول Supabase Management API/CLI |
| **Migrations applied** | **0** (هذه الجلسة) |

**سبب NO_GO:** فشل بوابات preflight الإلزامية (§2) — لا يمكن التحقق من staging-only، ولا قراءة سجل migrations، ولا إنشاء backup، وSupabase CLI غير عملي في البيئة الحالية.

---

## 2. Preflight

| # | Gate | Required | Result |
|---|------|----------|--------|
| G-1 | البيئة Staging وليست Production | ✅ | ❌ **FAIL** — لا project ref منفصل لـ staging في repo |
| G-2 | الفرع `main` متزامن | ✅ | ✅ **PASS** — `main` @ `a527463` |
| G-3 | `20260711020000` على `main` | ✅ | ✅ **PASS** — PR #100 merged |
| G-4 | migrations في Lovable | ✅ | ⚠️ **UNVERIFIED** — لا وصول Lovable dashboard من هذه الجلسة |
| G-5 | backup/snapshot قبل apply | ✅ | ❌ **FAIL** — لم يُنشأ |
| G-6 | قراءة سجل migrations الحالي | ✅ | ❌ **FAIL** — لا اتصال DB |

### 2.1 Git state

```
Branch: main
Commit: a527463 — Add student request P1 foundations (#100)
P1 file: supabase/migrations/20260711020000_student_requests_p1_foundations.sql ✅
```

### 2.2 Supabase project in repo

| المصدر | القيمة |
|--------|--------|
| `supabase/config.toml` | `project_id = wpmicqriltrowwonknox` |
| `vite.config.ts` fallback URL | `https://wpmicqriltrowwonknox.supabase.co` |

**ملاحظة حوكمية (من `COUNCILS-MIGRATION-STAGING-PREP-01`):** المشروع يستخدم Supabase واحد مربوط بـ Lovable/Pilot — **لا staging DB منفصل موثّق** في المستودع. تطبيق migrations على هذا المشروع قد يمس **Pilot/Production** وليس staging معزول.

### 2.3 أدوات الوصول

| الأداة | الحالة |
|--------|--------|
| `supabase` CLI (global npm) | ❌ `ENOENT` — binary missing |
| `SUPABASE_ACCESS_TOKEN` | ❌ not set |
| `DATABASE_URL` | ❌ not set |
| `gh` auth | ✅ logged in (repo read) |

---

## 3. Applied Migrations

**لم يُطبَّق أي migration في هذه الجلسة.**

| # | Migration | Status |
|---|-----------|--------|
| 1 | `20260710130000` | **UNKNOWN** — لا DB access |
| 2 | `20260710140000` | **UNKNOWN** |
| 3 | `20260710150000` | **UNKNOWN** |
| 4 | `20260710160000` | **UNKNOWN** |
| 5 | `20260710170000` | **UNKNOWN** |
| 6 | `20260710180000` | **UNKNOWN** |
| 7 | `20260710190000` | **UNKNOWN** |
| 8 | `20260711000000` | **UNKNOWN** |
| 9 | `20260711020000` | **UNKNOWN** |

---

## 4. Critical Pair (140000 + 150000)

| البند | النتيجة |
|-------|---------|
| هل طُبِّقتا متتاليتين؟ | **N/A** — لم يُنفَّذ apply |
| submit bypass window risk | **غير مُقيَّم** — يتطلب قراءة `pg_trigger` + `schema_migrations` على DB |

---

## 5. Schema Verification

**لم يُنفَّذ** — لا اتصال read-only بقاعدة البيانات.

الحقول/الجداول المطلوبة (§Post-apply checklist) — **غير مُتحقَّق منها**.

---

## 6. RPC and Security Verification

**لم يُنفَّذ** — لا اتصال DB.

---

## 7. UI Smoke Verification

**لم يُنفَّذ** — لا URL staging منفصل موثّق؛ UI smoke بدون apply لا يثبت migrations.

---

## 8. Findings

### Blocking

| ID | Finding | Action required |
|----|---------|-----------------|
| **B-1** | لا تأكيد أن `wpmicqriltrowwonknox` = **Staging only** | User: provide staging project ref OR confirm pilot = staging |
| **B-2** | لا backup/snapshot | User: manual backup via Supabase Dashboard قبل apply |
| **B-3** | لا قراءة `supabase_migrations.schema_migrations` | User: provide `DATABASE_URL` or fix Supabase CLI + link staging |
| **B-4** | Supabase CLI broken (`ENOENT`) | `npm i -g supabase` or use Dashboard SQL apply |
| **B-5** | لا credentials في البيئة | Set `SUPABASE_ACCESS_TOKEN` / DB connection for agent or apply manually |

### Non-blocking

| ID | Finding |
|----|---------|
| NB-1 | P1 migration now on `main` (SB-1 from PREP-02 resolved) |
| NB-2 | All 9 migration files present in repo on `main` |

### Notes

- **Production untouched** — zero DB operations in this session.
- Per user gate rules: stopped before any apply when backup/staging verification failed.

---

## 9. Production Gate

**Production remains BLOCKED.**

Even if staging apply succeeds later:

- Staging PASS + smoke tests
- Report review
- Explicit user approval

---

## 10. No-Business-Data-Write Assurance

This session performed:

- ✅ Git read/checkout/pull on `main`
- ✅ Preflight documentation

This session did **NOT** perform:

- ❌ Supabase apply / migrations run
- ❌ seed / test requests / student/staff data writes
- ❌ cleanup / DELETE / UPDATE
- ❌ Production apply
- ❌ Auth/password policy changes
- ❌ destructive rollback

---

## Appendix — Manual Apply Runbook (for operator)

When B-1..B-5 are resolved:

### Step 0 — Confirm staging

```text
Staging project ref: _______________  (must NOT be production)
Dashboard → Settings → General → Reference ID
```

### Step 1 — Backup

Supabase Dashboard → Database → Backups → Create backup / confirm PITR.

### Step 2 — Read current migrations

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '202607%'
ORDER BY version;
```

### Step 3 — Apply missing only (Dashboard SQL Editor or `supabase db push`)

**Critical:** apply `140000` then **immediately** `150000` in same session if both needed.

Order: 130000 → 140000 → 150000 → 160000 → 170000 → 180000 → 190000 → 110000 → 11020000

### Step 4 — Post-apply verify (read-only SQL)

See `docs/STUDENT-REQUESTS-STAGING-APPLY-PREP-02.md` §6.3 and §7 smoke tests.

---

## Appendix — Next attempt criteria

Re-run **STUDENT-REQUESTS-STAGING-APPLY-02** when:

1. Staging project ref documented and confirmed ≠ production
2. Backup timestamp recorded
3. `schema_migrations` pre-state exported
4. Working Supabase CLI or SQL access with read/write on **staging only**
