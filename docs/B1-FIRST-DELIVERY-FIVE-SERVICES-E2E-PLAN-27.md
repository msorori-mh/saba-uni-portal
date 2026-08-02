# B1 First Delivery Five Services Operational E2E Plan 27

> **Mode**: SOURCE-ONLY Operational E2E Plan & Specification  
> **Baseline Commit**: `87449f85b95d927436e7607ae3c2b6a73245eb0d`  
> **Target Services**: 5 B1 Student Request Services  
> **Plan Status**: PASS_FIVE_SERVICES_E2E_PLAN_READY

---

## 1. Executive Summary

This document specifies the end-to-end operational user journeys for all five B1 services:
1. `enrollment_suspension` (تأجيل الدراسة / تعليق القيد)
2. `excused_absence` (عذر عن اختبار / غياب بعذر)
3. `department_transfer` (تغيير التخصص / نقل قسم)
4. `final_chance` (فرصة إضافية / فرصة أخيرة)
5. `file_withdrawal` (سحب الملف / إخلاء طرف)

Every journey validates student submission, multi-step staff workflow transitions, payment/fee policies, audit logging, notification dispatch, academic status mutations, UI Arabic labels, and replay/idempotency protection.

---

## 2. Shared E2E Validation Lifecycle Requirements

For each of the 5 services, an operational E2E journey must verify all 12 stages in sequence:

```
[Student Submission] ➔ [Draft Save] ➔ [Submit RPC] ➔ [Initial Active Step] ➔
  [Staff Inbox Queue] ➔ [Direct RPC Action] ➔ [Workflow Event Logged] ➔
  [Notification Dispatched] ➔ [Payment / Fee Check] ➔ [Academic Effect Applied] ➔
  [Completion Audit] ➔ [Idempotency / Replay Rejection]
```

1. **Student Submission State**: Request initialized in `submitted` status; student UUID set; form payload validated.
2. **Every Staff Step**: Advanced sequentially without skipping or jumping steps.
3. **Direct RPC Check**: Executed via `act_on_b1_student_request_step_atomic`.
4. **UI Availability Check**: UI cards and action panels visible with correct Arabic titles.
5. **Exact Role and Assignment Check**: Direct actor assignment enforced on every step.
6. **Workflow Transition Verification**: Previous step marked `completed`; next step marked `active`.
7. **Audit-Event Verification**: Record created in `student_request_events` with actor ID and action code.
8. **Notification Verification**: Notification record created in `student_request_notifications`.
9. **Payment or Fee Verification**: Zero fee for free services (`excused_absence`, `file_withdrawal`); external payment verification for paid services (`department_transfer`, `final_chance`, `enrollment_suspension`).
10. **Academic-Effect Verification**: Exact academic mutation triggered (e.g. status change, clearance, record update).
11. **Completion-State Verification**: Final request status marked `approved` or `completed`; 0 remaining active/pending steps.
12. **Idempotency/Replay Check**: Re-submitting an already completed step returns `INVALID_PREDECESSOR_STATE` or `STEP_ALREADY_COMPLETED`.

---

## 3. Service E2E Journey Specifications

### Journey 1: Department Transfer (`department_transfer`)
- **Arabic UI Label**: **تغيير التخصص / نقل قسم**
- **Steps**:
  1. Student Submits Form $\rightarrow$ Target Department selected.
  2. Source Dept Head (`head_dept_src`) approves $\rightarrow$ `approve_source_dept`.
  3. Target Dept Head (`head_dept_tgt`) approves $\rightarrow$ `approve_target_dept`.
  4. Dean (`dean_faculty`) approves $\rightarrow$ `approve_dean`.
  5. Finance Officer (`finance_officer`) verifies payment $\rightarrow$ `confirm_payment` (`confirm_b1_revenue_receipt`).
  6. Central Registrar (`central_registrar`) applies decision $\rightarrow$ `apply_registrar`.
- **Academic Effect**: Student department updated to Target Department upon completion.

### Journey 2: Enrollment Suspension (`enrollment_suspension`)
- **Arabic UI Label**: **تأجيل الدراسة / تعليق القيد**
- **Steps**:
  1. Student Submits Form $\rightarrow$ Duration selected.
  2. Manager (`manager_student_affairs`) reviews & approves $\rightarrow$ `approve_manager`.
  3. Central Registrar (`central_registrar`) applies $\rightarrow$ `apply_registrar`.
- **Academic Effect**: Student enrollment status updated to `suspended` for designated semester.

### Journey 3: Excused Absence (`excused_absence`)
- **Arabic UI Label**: **عذر عن اختبار / غياب بعذر**
- **Steps**:
  1. Student Submits Form $\rightarrow$ Medical/Official excuse attachment uploaded.
  2. Manager (`manager_student_affairs`) reviews excuse $\rightarrow$ `approve_manager`.
  3. Academic Specialist (`specialist_academic`) records excuse $\rightarrow$ `apply_specialist_record`.
- **Academic Effect**: Absence record updated with excused status. Zero financial fee.

### Journey 4: File Withdrawal (`file_withdrawal`)
- **Arabic UI Label**: **سحب الملف / إخلاء طرف**
- **Steps**:
  1. Student Submits Clearance Request.
  2. Library Officer (`officer_library`) clears $\rightarrow$ `clear_library`.
  3. Labs Officer (`officer_labs`) clears $\rightarrow$ `clear_labs`.
  4. Activities Officer (`officer_activities`) clears $\rightarrow$ `clear_activities`.
  5. Finance Officer (`finance_officer`) clears financial record $\rightarrow$ `clear_finance`.
  6. Central Registrar (`central_registrar`) applies withdrawal $\rightarrow$ `apply_registrar`.
  7. Central Registrar archives file $\rightarrow$ `archive_file`.
- **Academic Effect**: Student status updated to `withdrawn`; physical file archived. Zero financial fee.

### Journey 5: Final Chance (`final_chance`)
- **Arabic UI Label**: **فرصة إضافية / فرصة أخيرة**
- **Steps**:
  1. Student Submits Request $\rightarrow$ Reason details attached.
  2. Manager (`manager_student_affairs`) approves eligibility $\rightarrow$ `approve_manager`.
  3. Dean (`dean_faculty`) approves academic council recommendation $\rightarrow$ `approve_dean`.
  4. Finance Officer (`finance_officer`) confirms external fee payment $\rightarrow$ `confirm_payment`.
  5. Central Registrar (`central_registrar`) applies chance extension $\rightarrow$ `apply_registrar`.
- **Academic Effect**: Academic standing updated; additional chance registered.

---

## 4. Manual UI Verification Checklist (Arabic Labels)

| Service | Student UI Page Label | Staff Inbox Queue Label | Action Button Label | Status Badge |
|---|---|---|---|---|
| `department_transfer` | طلب تغيير التخصص | صندوق وارد تغيير التخصص | اعتماد موافقة القسم / تأكيد السداد | قيد المراجعة / مكتمل |
| `enrollment_suspension` | طلب تأجيل الدراسة | صندوق وارد تعليق القيد | اعتماد طلب التأجيل / تنفيذ التسجيل | قيد المراجعة / مكتمل |
| `excused_absence` | تقديم عذر غياب | صندوق وارد أعذار الغياب | اعتماد العذر / تسجيل عذر الاختبار | قيد المراجعة / مكتمل |
| `file_withdrawal` | طلب إخلاء طرف وسحب ملف | صندوق وارد إخلاء الطرف | إخلاء طرف المكتبة/المعامل/المالية | قيد المراجعة / موثق |
| `final_chance` | طلب فرصة إضافية | صندوق وارد الفرصة الأخيرة | موافقة العميد / تأكيد الرسوم / تطبيق | قيد المراجعة / مكتمل |

---

## 5. Verification Code Reference

- Integrated E2E runner: `tests/student-requests/b1-integrated-runtime-e2e-01.test.ts`
- E2E Source RC test: `tests/student-requests/first-delivery-five-services-e2e-source-rc.test.ts`

---

## 6. Final E2E Plan Decision

```
PASS_FIVE_SERVICES_E2E_PLAN_READY
```
