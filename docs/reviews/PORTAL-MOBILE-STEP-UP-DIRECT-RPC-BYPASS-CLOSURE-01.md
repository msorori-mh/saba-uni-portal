# PORTAL-MOBILE-STEP-UP — إغلاق ثغرة الاستدعاء المباشر لتوقيع 5 معاملات

الحالة: مصدر فقط (SOURCE ONLY) — لا يوجد أي تطبيق إنتاجي.

## المعالجة

في `docs/migration-drafts/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.sql`:

1. أعيدت تسمية الدالة الأصلية إلى
   `public.submit_b1_student_request_atomic_core(uuid,text,jsonb,timestamptz,uuid[])`
   وسُحبت صلاحية التنفيذ من `PUBLIC/anon/authenticated` (Core/internal فقط).
2. أُنشئ wrapper بنفس توقيع الـ5 معاملات (حفاظًا على المسارات الأخرى) يمنع
   الخدمات الخمس الحساسة إلا إذا كان الـproof قد استُهلك في نفس المعاملة
   (`step_up_proofs.consumed_at = now()`)، وهو ما لا يحدث إلا عبر overload الـ7 معاملات.
3. لا يوجد أي منفذ يسمح للعميل باستدعاء `mint_step_up_proof` أو `consume_step_up_proof`.
4. إصلاح عيب برمجي مكتشف أثناء التنفيذ الفعلي: التباس أعمدة
   `expires_at/proof_token` داخل `mint_step_up_proof` (تم تأهيل الأعمدة باسم مستعار).

## الإثبات التنفيذي (Postgres حقيقي، لا Source text)

`scripts/step-up-direct-rpc-bypass/harness.ts` يقيم قاعدة Postgres مؤقتة
(in-process)، يعيد بناء عقد ما قبل الترحيل (5 args + GRANT to authenticated)،
يطبّق مسودة الترحيل حرفيًا، ثم ينفذ الحالات بدور `authenticated`.
الاختبار: `tests/mobile/step-up-direct-rpc-bypass.test.ts`.

| Case | Result |
| --- | --- |
| 5_ARG_SENSITIVE_DIRECT_RPC | DENY (STEP_UP_PROOF_REQUIRED) |
| 5_ARG_CORE_DIRECT_RPC | DENY (permission denied) |
| 7_ARG_WITHOUT_PROOF | DENY (STEP_UP_PROOF_REQUIRED) |
| 7_ARG_VALID_PROOF | PASS |
| REPLAY | DENY (STEP_UP_PROOF_INVALID) |
| 5_ARG_AFTER_CONSUMED_PROOF (معاملة سابقة) | DENY |
| PAYLOAD_TAMPER | DENY |
| MINT/CONSUME مباشرة من authenticated | DENY |
| NON_SENSITIVE_LEGACY_5_ARG | PASS (لم ينكسر) |

## proacl بعد الترحيل

```
submit_b1_student_request_atomic(5 args)  => postgres=X/postgres | authenticated=X/postgres
submit_b1_student_request_atomic(7 args)  => postgres=X/postgres | authenticated=X/postgres
submit_b1_student_request_atomic_core     => postgres=X/postgres
mint_step_up_proof(uuid)                  => postgres=X/postgres | service_role=X/postgres
consume_step_up_proof(...)                => postgres=X/postgres
```

## التحقق

- `bunx tsc --noEmit` — PASS
- `bun test tests/mobile` — 88/88 PASS
- `bun test tests/student-requests` — 1075/1075 PASS
- `bun run build` — PASS
- `git diff --check` — نظيف

PASS_MOBILE_STEP_UP_NO_DIRECT_RPC_BYPASS
5_ARG_SENSITIVE_DIRECT_RPC=DENY
7_ARG_WITHOUT_PROOF=DENY
7_ARG_VALID_PROOF=PASS
REPLAY=DENY
ALL_SOURCE_TESTS=PASS
