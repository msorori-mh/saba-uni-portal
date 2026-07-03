# COUNCILS-MVP-DB-HARDEN-01 — تقرير تنفيذ

## القرار النهائي
**PASS** — READY FOR UI INTEGRATION

---

## 1) النطاق
- 7 جداول: `academic_councils`, `academic_council_members`, `academic_council_meetings`, `academic_council_topics`, `academic_council_agenda_items`, `academic_council_minutes`, `academic_council_decisions`.
- 5 دوال مساعدة: `is_council_admin(uuid)`, `is_council_member(uuid,uuid)`, `has_council_role(uuid,uuid,academic_council_member_role)`, `can_manage_council(uuid,uuid)`, `can_write_council_agenda(uuid,uuid)`.
- GRANT/REVOKE فقط — لا تغييرات هيكلية، لا سياسات جديدة، لا بيانات.

## 2) SQL المطبّق
مطبَّق عبر `supabase--migration` كنداء واحد:

```sql
REVOKE ALL PRIVILEGES ON TABLE
  public.academic_councils,
  public.academic_council_members,
  public.academic_council_meetings,
  public.academic_council_topics,
  public.academic_council_agenda_items,
  public.academic_council_minutes,
  public.academic_council_decisions
FROM anon;

REVOKE EXECUTE ON FUNCTION public.is_council_admin(uuid)                                                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_council_member(uuid, uuid)                                                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_council_role(uuid, uuid, public.academic_council_member_role)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_council(uuid, uuid)                                               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_write_council_agenda(uuid, uuid)                                         FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON <الجداول السبعة> TO authenticated;
GRANT ALL ON <الجداول السبعة> TO service_role;

GRANT EXECUTE ON FUNCTION <الدوال الخمس> TO authenticated, service_role;
```

ملاحظة: المحاولة الأولى فشلت بسبب توقيع خاطئ (`is_council_admin(uuid,uuid)` و`council_member_role`). تم تصحيح التواقيع (`is_council_admin(uuid)` و`academic_council_member_role`) ونجحت المحاولة الثانية.

## 3) هل حُصر التعديل داخل نطاق المجالس؟
نعم. لم تُلمس أي جداول/دوال خارج البادئة `academic_council*` والدوال الخمس المذكورة.

## 4) نتائج فحص anon قبل/بعد

**قبل** (`pg_class.relacl` لكل الجداول السبعة):
```
{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwDxtm/postgres, service_role=arwdDxtm/postgres, ...}
```
anon كان يحمل `arwdDxtm` (كل الصلاحيات) و`EXECUTE` على الدوال الخمس + `PUBLIC` كان `f` (طبيعي).

**بعد**:
```
{postgres=arwdDxtm/postgres, authenticated=arwDxtm/postgres, service_role=arwdDxtm/postgres, ...}
```
- `anon` مُزال بالكامل من `relacl` لكل الجداول السبعة → لا صلاحيات.
- `has_function_privilege('anon', ..., 'EXECUTE') = false` لكل الدوال الخمس.
- `has_function_privilege('public', ..., 'EXECUTE') = false` لكل الدوال الخمس.

## 5) نتائج فحص authenticated / service_role
- `authenticated = arwDxtm` (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) على كل جدول — كافٍ للـ RLS.
- `service_role = arwdDxtm` (ALL) على كل جدول — محفوظ.
- `has_function_privilege('authenticated'|'service_role', ..., 'EXECUTE') = true` لكل الدوال الخمس.

## 6) نتائج RLS
`pg_class.relrowsecurity = true` لكل الجداول السبعة. لم تُنشأ أو تُعدَّل أي policy.

## 7) عدّادات الصفوف
كل الجداول السبعة `count(*) = 0` بعد التنفيذ — لم تُدخل بيانات.

## 8) الأسئلة الإلزامية
| البند | الجواب |
|---|---|
| تعديل بيانات؟ | لا |
| تعديل Storage؟ | لا |
| إرسال إيميلات؟ | لا |
| Cron؟ | لا |
| تعديل كود؟ | لا |
| نشر؟ | لا |
| seed data؟ | لا |
| تعديل جداول الطلاب/الطلبات/التقارير/الخطط/الجدولة؟ | لا |
| policies جديدة لـ anon؟ | لا |
| ALTER DEFAULT PRIVILEGES على schema public؟ | لا |
| هل بقيت F-01؟ | لا — anon فقد EXECUTE على كل الدوال الخمس. |
| هل بقيت F-02؟ | لا — anon فقد كل الصلاحيات على الجداول السبعة. |

## 9) تأثير على المسارات الحالية
لا. التعديل GRANT/REVOKE على مجال المجالس فقط، والواجهة المرتبطة (`/admin/academic-councils`) لا تزال Scaffold غير موصولة. المسارات التالية سليمة (لا تعتمد على أي من الجداول/الدوال المُقيَّدة):
- `/admin`, `/admin/academic-councils`, `/admin/reports`, `/admin/student-requests`, `/admin/study-plans`, `/student/requests`, `/student/requests/new`.

## 10) ملاحظات linter (خارج النطاق)
Linter Supabase أبلغ عن 163 تنبيهاً كلها **موجودة مسبقاً** (Public Buckets، دوال أخرى بـ SECURITY DEFINER من Pilot، `search_path` على دوال قديمة). لم تُضِف هذه المرحلة أي مشكلة جديدة؛ التنبيهات الخاصة بدوال المجالس الخمس **اختفت** بعد REVOKE.

## 11) التوصية
**READY FOR UI INTEGRATION** — قاعدة المجالس الآن مُحكمة الصلاحيات، RLS فعّال، ولا تعرّض أي سطح anon. يمكن البدء بربط UI عبر `authenticated` فقط عند اعتماد المرحلة التالية.
