# PORTAL-B1-PACKAGE66-EOL-PORTABILITY-REMEDIATION — RERUN 2

## سبب المراجعة

`CURSOR_HOLD_B1_66_SHA=6ae592b36c583201a93036ee75579e4d0b983f96`
سبب الفشل المعلن:
`PACKAGE66_GITATTRIBUTES_EOL_PINS_MISSING_AND_PACKAGE65_CASESRAW_REFERENCEERROR`

## الوضع الفعلي للمصدر

الـSHA المراجَع `6ae592b3` هو **سلف** للـHEAD الحالي، وكلا العطلين مُصلَحان بالفعل بعده:

1. `.gitattributes` — أُضيفت الأسطر الناقصة الثلاثة:
   - `scripts/b1-isolated-authorization-env-65/*.py text eol=lf`
   - `tests/b1-five-services-rpc-authorization-preflight-01/*.sql text eol=lf`
   - `tests/b1-five-services-rpc-authorization-preflight-01/*.json text eol=lf`
   (مع بقاء الأسطر الخمسة السابقة، ودون `* text=auto`)

2. `isolated-authorization-environment-65.test.ts` — حُذف المتغير غير المعرّف
   `casesRaw` واستُبدل بالتأكيد المستقر `isStoredAsLf(rel)` على محتوى
   المستودع (git index) بدل بايتات شجرة العمل، فلا ReferenceError ولا فشل
   على checkout بنمط CRLF.

## الحدود

- لا تغيير في منطق التفويض.
- لا تغيير في دلالات SQL.
- لا اتصال بالإنتاج، لا Migration، لا Workflow RPC، لا Deploy.
- لا تغيير `student_visible`.
- `enrollment_certificate` لم يُمس.

## البوابات

| البوابة | النتيجة |
|---|---|
| `bun test .../atomic-rpc-literal-configured-action-package-66.test.ts` | PASS |
| `bun test .../isolated-authorization-environment-65.test.ts` | PASS |
| `bun test tests/b1-five-services-rpc-authorization-preflight-01` | PASS (146) |
| `bunx tsc --noEmit` | PASS |
| `bun test tests/student-requests` | PASS |
| `bun run build` | PASS |
| `git diff --check` | PASS |
