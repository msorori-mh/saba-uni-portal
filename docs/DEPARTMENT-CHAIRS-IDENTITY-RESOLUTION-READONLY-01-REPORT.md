# DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01 — تقرير

مرحلة قراءة فقط. لم يُنفَّذ أي INSERT/UPDATE/DELETE/Migration/Deploy/Publish.

## 1. الأقسام المستهدفة

| department_id | name_ar |
|---|---|
| `11111111-1111-4111-8111-111111111111` | قسم علوم الحاسوب |
| `ce485c67-5f7c-498d-b120-4b1130a86ae8` | قسم تكنولوجيا المعلومات |
| `22222222-2222-4222-8222-222222222222` | قسم نظم المعلومات الحاسوبية |

## 2. المطابقة الفعلية لكل رئيس معتمد

### 2.1 د. أسامة عبدالجليل (رئيس قسم علوم الحاسوب — معتمد)
- الاسم المخزن: `د. اسامه عبدالجليل احمد سيف`
- `user_id`: `97acbe02-c59c-409c-8d51-7d4ef72e6db7`
- `faculty_profile_id`: `d08a8509-4c04-472e-885f-053a80be12ec`
- `department_id` الفعلي: `ce485c67-... (قسم تكنولوجيا المعلومات)` ❌
- `position_title` النصي: **رئيس قسم علوم الحاسوب** ✅ (يطابق القرار)
- `academic_rank`: Assistant Professor — `status`: active
- `position_assignments`: **لا يوجد** (organizational_positions لا يحوي منصب chair لكل قسم)
- `request_processing_assignments`: `id = 7ab0b14f-9007-40d6-9aaf-f1cba454ac8f` — unit `department`, role `department_head`, department = **IT (خاطئ)**, is_active = true
- **تعارض**: الحساب سليم وموجود، لكن الربط بقسم علوم الحاسوب مفقود؛ الحقول (faculty_profiles.department_id و request_processing_assignments.department_id) تشير للقسم الخاطئ (IT).

### 2.2 د. خالد البراحي (رئيس قسم تكنولوجيا المعلومات — معتمد)
- الاسم المخزن: `د. خالد قاسم محمد البراحي`
- `user_id`: `d4aaa5c9-72d1-4996-b0e8-d30c6327da6e`
- `faculty_profile_id`: `6f9f004d-c5f6-4dfe-b212-7f79ce8658e3`
- `department_id`: `ce485c67-... (قسم تكنولوجيا المعلومات)` ✅
- `position_title`: `رئيس قسم تكنولوجيا` ✅
- `status`: active
- `position_assignments`: لا يوجد
- `request_processing_assignments`: `id = 912bdb96-3fb9-494c-8caa-7778c7d0d402` — unit `department`, role `department_head`, department = IT ✅, is_active = true

### 2.3 د. رمزي الجابري (رئيس قسم نظم المعلومات — معتمد)
- الاسم المخزن: `د. رمزي حميد الجابري`
- `user_id`: `f602b62c-194b-4591-8e9c-956e5cbb347d`
- `faculty_profile_id`: `c1fe6084-e594-482e-a178-ac8eaffed376`
- `department_id`: `22222222-... (قسم نظم المعلومات الحاسوبية)` ✅
- `position_title`: `رئيس قسم نظم المعلومات الحاسوبية` ✅
- `status`: active
- `position_assignments`: لا يوجد
- `request_processing_assignments`: `id = 4d0f434e-57ab-40b2-8a6f-5f27f330db97` — unit `department`, role `department_head`, department = نظم ✅, is_active = true

## 3. التحقق البنيوي

- ✅ تعارض CS/IT مؤكد: رئيسان نشطان في قسم IT (`د. خالد` + `د. اسامه`)، وصفر رئيس في CS.
- ✅ لا توجد تعيينات منتهية محسوبة كنشطة (كل `is_active=true` بدون سبب متعارض غير القسم).
- ✅ نظم المعلومات: رئيس واحد فقط قابل للتعيين المباشر.
- ⚠️ منصب "رئيس قسم" غير موجود ضمن `organizational_positions` (يوجد `academic_departments` كوحدة عامة فقط)؛ لذلك التفويض حالياً يمر عبر `request_processing_assignments` وليس `position_assignments`. هذا هو المسار الذي تعتمد عليه دالة `user_matches_workflow_runtime_step` بعد التصلّب.

## 4. قسم IT — سجلان نشطان

- السجل الصحيح (يبقى): `912bdb96-3fb9-494c-8caa-7778c7d0d402` — د. خالد البراحي.
- السجل المتعارض (يجب تعطيله لا حذفه): `7ab0b14f-9007-40d6-9aaf-f1cba454ac8f` — د. أسامة على قسم IT.
- **الإجراء الأدنى المقترح (لا يُنفَّذ الآن)**: `UPDATE request_processing_assignments SET is_active = false, updated_at = now() WHERE id = '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f';`

## 5. قسم CS — بلا رئيس

- الحساب موجود وسليم (د. أسامة `97acbe02...`) لكن `faculty_profiles.department_id` وربط المعالجة يشيران لقسم IT الخاطئ.
- **الإجراء الأدنى المقترح (لا يُنفَّذ الآن)**، بعد تعطيل السجل المتعارض أعلاه:
  1. `UPDATE faculty_profiles SET department_id = '11111111-1111-4111-8111-111111111111', updated_at = now() WHERE id = 'd08a8509-4c04-472e-885f-053a80be12ec';`
  2. `INSERT INTO request_processing_assignments (unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active) SELECT rpu.id, rpr.id, 'faculty_profile', 'd08a8509-4c04-472e-885f-053a80be12ec', '11111111-1111-4111-8111-111111111111', true FROM request_processing_units rpu JOIN request_processing_roles rpr ON rpr.unit_id = rpu.id AND rpr.code = 'department_head' WHERE rpu.code = 'department';`

## 6. نظم المعلومات

جاهز بالكامل، رئيس واحد نشط، processing assignment مطابق للقسم الصحيح — لا حاجة لتعديل.

## 7. المصفوفة النهائية

| department | approved_chair | identity_match | department_match | active_position_count | processing_assignment_ready | conflicting_records | required_change | decision |
|---|---|---|---|---|---|---|---|---|
| قسم علوم الحاسوب | د. أسامة عبدالجليل | ✅ (بالاسم/العنوان الوظيفي) | ❌ (مربوط بـ IT) | 0 | ❌ | 1 (سجل IT الخاطئ لأسامة) | إصلاح `faculty_profiles.department_id` + إنشاء processing assignment على CS | HOLD |
| قسم تكنولوجيا المعلومات | د. خالد البراحي | ✅ | ✅ | 2 | ⚠️ (نعم لكن مع رئيس ثانٍ متعارض) | 1 (`7ab0b14f...` لأسامة) | تعطيل السجل المتعارض `is_active=false` | HOLD |
| قسم نظم المعلومات الحاسوبية | د. رمزي الجابري | ✅ | ✅ | 1 | ✅ | 0 | لا شيء | READY |

## القرار النهائي

**HOLD_DEPARTMENT_CHAIRS_IDENTITY_RESOLUTION**

السبب: قسمَا CS/IT بحاجة إلى إجراء تعديل مضبوط (تعطيل سجل + نقل قسم + إنشاء سجل واحد) قبل أن تكون خدمة `department_transfer` مؤهَّلة على جميع الأقسام المدعومة. الهوية الرقمية للرؤساء الثلاثة محلولة بالكامل وموثَّقة أعلاه؛ التعديلات المقترحة أدنى مستوى ممكن ولم تُنفَّذ.
