# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G7-01 — تقرير

**التاريخ:** 2026-07-10
**المستند:** تطبيق migration G7 على Supabase production (تسلسلي — G7 فقط)

---

## البيئة

| البند | القيمة |
|-------|--------|
| **Repository** | [msorori-mh/saba-uni-portal](https://github.com/msorori-mh/saba-uni-portal) |
| **Branch** | `main` |
| **Supabase production ref** | `wpmicqriltrowwonknox` |
| **Lovable project** | `4b291119-790f-4484-9285-c2b774e1ba6f` |
| **Migration** | `supabase/migrations/20260710190000_student_request_workflow_runtime.sql` |

---

## مصدر migration القانوني

| البند | القيمة |
|-------|--------|
| **Commit** | `0929253900ce33c85702043696a6d6ee952538b8` |
| **Git blob** | `a91af19853042922541729c6f8f78f895b83d62a` |
| **Canonical SHA256** | `7a2ddcb5ae3f672200115ae13eb63a6379f8074dee9dc722e08333c873f06932` |
| **Canonical bytes** | 11810 |
| **Line endings** | LF |
| **Application source** | `git cat-file blob` → `/tmp/g7-canonical.sql` |

- المحتوى المُطبَّق مطابق لـ Git object القانوني (لا اختلاف working-tree عن canonical blob).
- `git status` / `git diff` على مسار migration: نظيف عند نقطة التحقق.

---

## نتيجة التحقق الأمني

تم التحقق من أن migration G7 (النسخة القانونية أعلاه) تتضمن الضوابط التالية قبل/ضمن التطبيق:

### Auth gate

داخل `initialize_student_request_workflow(uuid)`:

- عند `auth.uid() IS NULL` → `RAISE EXCEPTION` مع **`ERRCODE = '28000'`** (منع استدعاء SECURITY DEFINER دون JWT).

### REVOKE — دوال داخلية

```sql
REVOKE ALL ON FUNCTION public.get_active_workflow_for_request_type(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.initialize_student_request_workflow(uuid)
  FROM PUBLIC, anon, authenticated;
```

### REVOKE / GRANT — `submit_student_request`

```sql
REVOKE ALL ON FUNCTION public.submit_student_request(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_student_request(uuid)
  TO authenticated;
```

**النتيجة:** لا EXECUTE لـ `anon` على الدوال الثلاث؛ الدالتان الداخليتان غير متاحتين لـ `authenticated` مباشرة؛ `submit_student_request` للمصادقين فقط.

---

## نتيجة التطبيق

| البند | الحالة |
|-------|--------|
| **عدد migrations** | migration واحدة فقط (G7) |
| **آلية التطبيق** | أداة Supabase المُدارة (managed migration apply) |
| **اكتمال التطبيق** | نجاح كامل — **بدون** partial apply |
| **سجل G7** | مسجَّل **مرة واحدة** في تاريخ migrations |
| **G8** | **لم** يُطبَّق ضمن هذا الإجراء |

---

## الدوال

التحقق بعد التطبيق — وجود التوقيعات التالية **فقط** (لا overloads غير مقصودة):

| الدالة | SECURITY DEFINER | `SET search_path = public` |
|--------|------------------|----------------------------|
| `get_active_workflow_for_request_type(uuid)` | نعم | نعم |
| `initialize_student_request_workflow(uuid)` | نعم | نعم |
| `submit_student_request(uuid)` | نعم | نعم |

---

## ACL

| الدالة | PUBLIC | anon | authenticated |
|--------|--------|------|---------------|
| `get_active_workflow_for_request_type(uuid)` | لا EXECUTE | لا EXECUTE | لا EXECUTE |
| `initialize_student_request_workflow(uuid)` | لا EXECUTE | لا EXECUTE | لا EXECUTE |
| `submit_student_request(uuid)` | لا EXECUTE | لا EXECUTE | **EXECUTE** |

---

## سلامة البيانات

| البند | الحالة |
|-------|--------|
| إنشاء workflow config | **لم** يُنشأ |
| runtime steps / events | **لم** يُنشأ |
| تنفيذ submit فعلي عبر RPC | **لم** يُنفَّذ |
| جداول legacy | **بدون** تغيير |
| RLS / policies | **بدون** تعديل |
| seed | **لم** يُنفَّذ |
| G8 | **لم** يُطبَّق |
| Publish / Deploy | **لم** يُنفَّذ |

---

## Database Linter

| المرحلة | عدد التنبيهات |
|---------|----------------|
| **قبل G7** | 223 |
| **بعد G7** | 222 |

- التنبيهات المتبقية من **نفس الفئات العامة** كما قبل G7 (لا فئة جديدة حرجة مرتبطة بهذا التطبيق).
- تحذيرات `search_path` على الدوال الجديدة: **غير حاصمة** لأن التعريفات تحتوي صراحةً على `SET search_path = public`.
- **لا** finding جديد يسمح لـ `anon` بتنفيذ أيٍ من الدوال الثلاث.

---

## القرار

**PASS_G7_APPLIED_READY_FOR_G8**
