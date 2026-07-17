# ENROLLMENT-CERTIFICATE-AVAILABILITY-BANNER-UX-FIX-01

Decision: `PASS_ENROLLMENT_CERTIFICATE_AVAILABILITY_BANNER_UX_FIX_MERGED`

## Root cause

`getStudentRequestUiEligibility` mixed pristine form completeness and the subject field into `blockedReasons`. The eligibility card therefore converted empty required fields into a red `blocked` / “غير متاح” decision, and rendered service information inside that same blocking card.

## Implemented separation

- Eligibility: only trusted picker/RPC denial, disabled service, academic status/audience, unsupported runtime, or a verified closed window can create a blocking reason.
- Validation: required fields remain submit-readiness checks and appear inline only after an attempted submit. They never change the availability badge.
- Information: enrollment-certificate guidance is rendered in a neutral blue information card, outside blocking reasons.
- Loading/technical failure: neutral loading or warning state; submission remains fail-closed until the result is `available`, without claiming the student is ineligible.

## Modified files

- `src/lib/student-requests/request-eligibility-ui.ts`
- `src/lib/student-requests/request-form-registry.ts`
- `src/components/student-requests/StudentRequestEligibilityNotice.tsx`
- `src/components/student-requests/DynamicStudentRequestForm.tsx`
- `src/routes/student.requests.new.tsx`
- `tests/student-requests/enrollment-certificate-availability-banner-ux-fix-01.test.ts`

No enrollment-certificate workflow, backend submit contract, migration, `student_visible`, or production data was changed.

## Verification

- Focused UX tests: 6/6 PASS.
- Full `tests/student-requests`: 443/443 PASS.
- TypeScript: PASS.
- Production build: PASS.
- Changed-file ESLint: 0 errors; two pre-existing Fast Refresh warnings.
- Full lint: repository-wide CRLF/Prettier baseline failure, isolated from this change.
- `git diff --check`: PASS.
- Independent review: PASS; CRITICAL/HIGH/MEDIUM/LOW = 0/0/0/0.
- Web CI: PASS.

## Delivery

- Commit: `ae281b1`.
- PR: #143.
- Merge commit: `0da75d8b199d516a5d6d8498a0ea0d67c9c8e360`.

The source fix is merged. A separate authorized Deploy is required before the change appears in production; no Deploy or Publish occurred in this phase.
