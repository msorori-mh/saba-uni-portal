# RATE-LIMITING-01 — تقرير التنفيذ

> الحالة: ✅ منفّذ (الخيار A+B)
> التاريخ: 2026-06-11

## 1) ما تم بناؤه

### قاعدة البيانات
- **جدول `public.rate_limit_attempts`**
  - حقول: `key`, `action`, `actor_identifier`, `ip_hash`, `user_agent_hash`, `created_at`, `expires_at`, `blocked_until`, `metadata`.
  - **RLS مفعّل بدون أي سياسة** ⇒ لا يقرأه أو يكتبه أي عميل مباشرة. كل الوصول عبر `SECURITY DEFINER`.
  - فهارس: `(key, action, created_at DESC)`, `(expires_at)`, `(blocked_until)`.
- **دالة `check_and_record_rate_limit(p_key, p_action, p_max, p_window_minutes, p_block_minutes)`**
  - `SECURITY DEFINER`, `search_path = public`.
  - تُرجع: `{ allowed, remaining, blocked_until, reason }`.
  - عند تجاوز الحد: تُسجّل صف حظر، وتستدعي `log_audit('security', NULL, 'rate_limit_triggered', ...)`.
  - مُتاحة لـ `authenticated` و`anon` و`service_role` (مطلوبة لتدفقات ما قبل الدخول).
- **دالة `cleanup_rate_limit_attempts()`** — لتنظيف السجلات المنتهية، متاحة لـ `service_role` فقط.

### كود التطبيق
- `src/lib/rate-limit.ts` — Helper للواجهة الأمامية (`checkRateLimit`, `RATE_LIMIT_POLICIES`, `RATE_LIMIT_MESSAGE`, `describeBlockedFor`).
- `src/lib/rate-limit.server.ts` — Helper لاستخدام الـ Server Functions (`enforceRateLimit`).

## 2) السياسات المطبَّقة

| الموقع | الإجراء | الحد | النافذة | مدة الحظر | الحالة |
|---|---|---|---|---|---|
| `/forgot-password` | إرسال رابط الاستعادة | 3 | 30 دقيقة | 30 دقيقة | ✅ كامل |
| `/admin/login` | المحاولات الفاشلة قبل النداء | 5 | 10 دقائق | 15 دقيقة | ⚠️ جزئي (الواجهة فقط) |
| `createFacultyAccountManual` | إنشاء حساب يدوي | 20 / مستخدم | 10 دقائق | 15 دقيقة | ✅ كامل |
| `linkFacultyAccountByEmail` | ربط حساب موجود | 20 / مستخدم | 10 دقائق | 15 دقيقة | ✅ كامل |
| `resetFacultyPasswordManual` | إعادة تعيين كلمة مرور | 20 / مستخدم | 10 دقائق | 15 دقيقة | ✅ كامل |
| `importFacultyAccountsRows` | استيراد جماعي | 3 / مستخدم | 30 دقيقة | 30 دقيقة | ✅ كامل |

> ملاحظة: سياسات إضافية معرَّفة في `RATE_LIMIT_POLICIES` (resetPassword, sensitiveRpc) جاهزة للاستخدام بإضافة سطر واحد عند الحاجة.

## 3) حدود الحماية — مهم

- **حماية تسجيل الدخول جزئية فقط**: الفحص يجري قبل استدعاء `supabase.auth.signInWithPassword` من واجهتنا، لكنه **لا يمنع** أي طرف ثالث يستهدف Supabase Auth API مباشرة (`/auth/v1/token`, `/auth/v1/recover`). الحماية الكاملة ضد Credential Stuffing تتطلب أحد التالي:
  - تفعيل Cloudflare Rate Limiting Rules على المسارات `/auth/v1/*`.
  - أو تفعيل Cloudflare WAF + Bot Management.
  - أو إضافة CAPTCHA على نموذج الدخول (Supabase يدعم hCaptcha أصلياً).
- **رسائل المستخدم محايدة**: لا تكشف وجود/عدم وجود البريد ولا صحة كلمة المرور.
- **Fail-open**: عند فشل الـ RPC لأي سبب بنيوي، يُسمح بالطلب لتجنّب حجب المستخدمين الشرعيين.

## 4) Audit Logs

تُسجَّل تلقائياً ضمن `audit_logs` بنوع الكيان `security` والإجراء `rate_limit_triggered`، مع بيانات `key/action/attempts/blocked_until`.

## 5) الخطوة التالية الموصى بها

- ✅ يمكن الانتقال إلى **STORAGE-HARDENING-01**.
- 🔜 (خارج هذه المرحلة) تفعيل Cloudflare Rate Limiting لإقفال الفجوة على Supabase Auth API.
