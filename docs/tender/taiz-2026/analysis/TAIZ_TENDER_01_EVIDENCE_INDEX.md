# فهرس الأدلة البرمجية والوثائقية لمناقصة جامعة تعز 2/2026
## TAIZ-TENDER-01 — CODEBASE EVIDENCE & REPOSITORY INDEX

> **المستودع:** `msorori-mh/saba-uni-portal` | **الفرع:** `docs/taiz-tender-prebid-01`
> **الهدف:** توفير فهرس متكامل يربط كل متطلب من متطلبات المناقصة بالمسارات والملفات والاختبارات الدقيقة داخل المستودع، أو تحديد المتطلب الوثائقي الخارجي.

---

## 1. فهرس الأدلة البرمجية المصنفة

### 1.1 البوابات والخدمات الأكاديمية والطلابية (Student & Faculty Portals)
| المتطلب | المسار في المستودع | الملفات الدقيقة | طبيعة الدليل البرمجي |
| :--- | :--- | :--- | :--- |
| **بوابة الطالب وطلبات الخدمات** | `src/components/student-requests/` | `StudentRequestCard.tsx`, `StudentRequestDetailsModal.tsx`, `NewStudentRequestModal.tsx` | شاشات تقديم وإدارة وتتبع الطلبات الطلابية |
| **محرك معالجة الطلبات والحالات** | `src/lib/student-requests/` | `student-requests-service.ts`, `b1-secure-draft/`, `b1-secure-read/` | منطق معالجة 7 خدمات طلابية وحفظ الحالات |
| **إخلاء الطرف الأكاديمي** | `src/components/academic-clearance/` | `AcademicClearanceFlow.tsx`, `ClearanceRequirementsList.tsx` | مسار التدقيق وإخلاء الطرف الأكاديمي |
| **إدارة المجالس الأكاديمية** | `src/components/councils/` | `CouncilMeetingWorkspace.tsx`, `CouncilAgendaView.tsx`, `CouncilDecisionForm.tsx` | دورة حياة المجالس الأكاديمية والقرارات |
| **مشاريع التخرج والأبحاث** | `src/components/graduation-projects/` | `ProjectRegistrationFlow.tsx`, `ProjectSupervisionWorkspace.tsx` | إدارة وتوثيق مشاريع التخرج الأكاديمية |
| **توليد الوثائق الرسمية والـ QR** | `src/lib/documents/` | `pdf-generator.ts`, `qr-signer.ts`, `document-verification.ts` | إنشاء وثائق PDF مشفرة ومزودة بـ QR للتحقق |

---

### 1.2 الأمن السيبراني والصلاحيات وسجلات التدقيق (Security & RBAC)
| المتطلب | المسار في المستودع | الملفات الدقيقة | طبيعة الدليل البرمجي |
| :--- | :--- | :--- | :--- |
| **إدارة الأدوار والصلاحيات (RBAC)** | `src/lib/security/` | `role-matrix.ts`, `permission-guard.ts`, `authorization-context.tsx` | مصفوفة الصلاحيات ومنع الوصول غير المصرح |
| **سياسات الحماية على قاعدة البيانات (RLS)** | `supabase/migrations/` | `*.sql` (ملفات المايجريشن والسياسات الأمنية) | سياسات Row Level Security وعزل بيانات الوحدات |
| **سجلات التدقيق غير القابلة للتعديل** | `src/lib/operations/` | `audit-logger.ts`, `security-events-tracker.ts` | توثيق كافة الحركات الإدارية والأمنية |
| **التحقق وتطهير المدخلات** | `src/lib/security/` | `input-sanitizer.ts`, `crypto-utils.ts` | تطهير المدخلات ضد XSS و SQLi والتشفير |

---

### 1.3 التصميم والنفاذية ودعم اللغة العربية (Design, UX & RTL)
| المتطلب | المسار في المستودع | الملفات الدقيقة | طبيعة الدليل البرمجي |
| :--- | :--- | :--- | :--- |
| **مكتبة المكونات الموحدة (UI)** | `src/components/ui/` | 46 مكوناً (Button, Dialog, Table, Form, Tabs, Sheet...) | نظام تصميم متكامل يعتمد Radix UI + TailwindCSS 4 |
| **الخطوط ودعم اللغة العربية (RTL)** | `src/assets/fonts/cairo/` | `Cairo-*.ttf`, `package.json` (`bidi-js`, `tailwindcss`) | تطبيق خط Cairo الرسمي ودعم كامل لاتجاه RTL |
| **مراعاة معايير النفاذية (WCAG)** | `src/components/ui/` | `form.tsx`, `dialog.tsx`, `dropdown-menu.tsx` | دعم قارئات الشاشة والـ ARIA Landmarks والتباين |

---

### 1.4 اختبارات الجودة والتحقق الأوتوماتيكي (QA & Tests)
| المتطلب | المسار في المستودع | الملفات الدقيقة | طبيعة الدليل البرمجي |
| :--- | :--- | :--- | :--- |
| **اختبارات أمان المجالس والصلاحيات** | `tests/academic-councils/` | `councils-c9-security-concurrency.test.ts`, `councils-c0-write-surface-hardening.test.ts` | اختبارات التحقق من الصلاحيات والتزامن |
| **اختبارات النفاذية وواجهة المستخدم** | `tests/academic-councils/` | `councils-c0-c9-ui-a11y-rtl.test.ts` | فحص آلي للنفاذية ودعم اتجاه RTL |
| **اختبارات الطلبات الأكاديمية** | `tests/student-requests/` | `academic-clearance-completion.test.ts`, `b1-fixture-*.test.ts` | اختبارات سلامة دورة حياة الطلبات والبيانات |
| **عقود قاعدة البيانات والـ SQL** | `tests/academic-clearance/` | `academic-clearance-sql-contract.test.ts`, `*.pg-verify.sql` | التحقق من سلامة الجداول والسياسات في PostgreSQL |

---

## 2. جدول الفجوات والأدلة الخارجية المطلوبة (Off-Repo Evidence)

| المتطلب التعاقدي | الدليل الخارجي المطلوب | الجهة المسؤولة عن الاستخراج | الحالة الراهنة |
| :--- | :--- | :--- | :--- |
| **البطاقات القانونية الأربع** | بطاقة ضريبية، زكوية، تأمينية، ضريبة مبيعات | الإدارة القانونية / المالية للشركة | غير متوفر بالمستودع (مطلوب قبل التقديم) |
| **السجل التجاري وترخيص IT** | سجل تجاري ساري لعام 2026م بنشاط تكنولوجيا المعلومات | إدارة الشركة | غير متوفر بالمستودع (مطلوب قبل التقديم) |
| **الضمان البنكي الابتدائي (2%)** | أصل خطاب ضمان بنكي غير مشروط سارٍ لـ 90 يوماً | البنك المعتمد / الإدارة المالية | غير متوفر بالمستودع (مطلوب بالمظروف) |
| **سابقة الأعمال (3 مشاريع)** | 3 شهادات إنجاز واستلام نهائي موثقة من جامعات/مؤسسات | إدارة المشاريع / العملاء السابقين | غير متوفر بالمستودع (مطلوب بالمظروف) |
| **شهادات كادر العمل الـ 8** | شهادات PMP, TOGAF, CISSP, CKA + شهادات التخرج | كادر العمل الاستشاري / الخبراء | غير متوفر بالمستودع (مطلوب بالمظروف) |
| **تقرير الفحص الأمني (Pentest)** | تقرير فحص اختراق رسمي معتمد ومختوم (OWASP ASVS L2) | شركة أمن سيبراني مستقلة مرخصة | غير متوفر بالمستودع (مطلوب في المرحلة 5) |
