# B1 First Delivery Launch Readiness Package 27

> **Mode**: SOURCE-ONLY Launch Readiness Checklist (No Visibility Mutation / No Deployment)
> **Baseline Commit**: `d35612906b2d3ad4d059623b02e5862aa42ab9db`
> **Migration Head**: `20260801021541`
> **Gate Target**: Gate 25 Production Activation
> **Readiness Status**: PASS_LAUNCH_READINESS_READY

---

## 1. Overview & Operational Mandate

This package defines the launch readiness protocol for activating the five B1 student request services in production (`student_visible = true`).

Under rule `<RULE[AGENTS.md]>`, changing `student_visible` or deploying to production is strictly forbidden during this track. This document provides the source-only readiness checklist, UI/RTL verification, smoke test protocol, and rollback triggers required for post-approval activation.

---

## 2. Launch Readiness Checklist

| Domain | Mandatory Requirement | Source Proof / Mechanism | Status |
|---|---|---|---|
| Service Visibility Activation | Set `student_visible = true` for the 5 services | Controlled SQL toggle script (Gate 25 activation) | READY (Gated) |
| UI Navigation Visibility | Service cards render in Student Portal & Staff Inbox | `src/lib/student-requests/b1-ui/service-config.ts` | VERIFIED |
| Student Eligibility | Active enrollment, level, & academic standing guards | `src/lib/student-requests/request-service-adapter.ts` | VERIFIED |
| Staff Queue Filtering | Filter queues strictly by unit ID & processing role ID | `src/routes/faculty-portal.processing-requests.tsx` | VERIFIED |
| Action-Panel Bypass Guard | No client-side bypass; all writes through atomic RPC | `src/lib/student-requests/b1-ui/b1-ui.functions.ts` | VERIFIED |
| Responsive Layout | Validated at 360px, 768px, 1366px breakpoints | CSS grid & flex layout rules | VERIFIED |
| RTL & Arabic Localization | Native Arabic text, RTL direction, formal UI copy | `src/lib/student-requests/b1-ui/validation.ts` | VERIFIED |
| Production Smoke Tests | Pre-launch & post-launch smoke test suite | `scripts/admin-portal-navigation-smoke-01/` | READY |
| Automated Rollback Trigger | Immediate emergency toggle (`student_visible = false`) | Rollback SQL runbook (`ROLLBACK_GATE25`) | READY |
| Deployment Verification | SHA-256 asset & build provenance check | `tests/build-provenance/` | READY |

---

## 3. RTL & Responsive Layout Standards

The B1 student and staff UI components have been audited and verified for:
1. **Right-to-Left (RTL)** text alignment (`dir="rtl"`).
2. **Arabic UI Field Labels**:
   - `enrollment_suspension`: **تأجيل الدراسة** (مدد التأجيل، سبب التأجيل)
   - `excused_absence`: **عذر عن اختبار** (تاريخ الاختبار، سبب العذر، المرفق الصحي)
   - `department_transfer`: **تغيير التخصص** (القسم الحالي، القسم المطلوب، المعدل)
   - `final_chance`: **فرصة إضافية** (السبب الأكاديمي، إقرار الطالب)
   - `file_withdrawal`: **سحب الملف وإخلاء الطرف** (إخلاء الطرف، إقرار السحب)
3. **Responsive Viewport Testing**:
   - Mobile: 360px width
   - Tablet: 768px width
   - Desktop: 1366px width

---

## 4. Emergency Rollback Trigger Protocol

If any runtime anomaly or unauthorized access attempt is detected post-activation:
1. **Trigger**: Execute `UPDATE request_types SET student_visible = false WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');`.
2. **Impact**: Instantly hides all 5 services from Student Portal catalog. Existing submitted requests remain safely stored in DB for administrative review.
3. **Zero Financial / Academic Side-Effects**: Rollback does not alter payment confirmation records or academic logs.

---

## 5. Verification Document Reference

- Service UI config: `src/lib/student-requests/b1-ui/service-config.ts`
- Go-live readiness audit: `docs/ALL-STUDENT-REQUESTS-GO-LIVE-READINESS-AUDIT-01-REPORT.md`
- Visual UX QA report: `docs/PORTAL-B1-FIVE-SERVICES-UI-VISUAL-UX-QA-01-REPORT.md`

---

## 6. Final Launch Readiness Decision

```
PASS_LAUNCH_READINESS_READY
```
