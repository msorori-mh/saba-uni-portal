# STUDENT REQUEST SECURE ATTACHMENTS — SOURCE 01

## القرار التنفيذي

تم إنشاء أساس source-only مستقل للمرفقات الآمنة مع إبقاء Runtime مغلقاً صراحةً عبر `SECURE_ATTACHMENTS_RUNTIME_AVAILABLE=false`. لا Bucket أو table أو RPC متاح فعلياً قبل مراجعة وتطبيق الـDraft بموافقة مستقلة.

## الملفات والرموز

- `secure-attachments-contract.ts`: الثوابت، الحالات، الأخطاء، بناء object path، transitions، reference/submit/authorization validators.
- `secure-attachments.functions.ts`: intent، server-proxy upload، completion، list، logical reject، signed download.
- `SecureStudentRequestAttachmentsField.tsx`: حالات idle/validating/preparing/uploading/completing/success/failed/rejecting.
- registry/adapter/dynamic form/submit contract: توحيد حقول `excused_absence` وربط fail-closed.
- `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql`: Draft فقط.
- `secure-attachments-source-contract.test.ts`: مصفوفة source-contract.

## العقد المعتمد

- Bucket: `student-request-secure-attachments`، خاص، بلا public URL.
- Table: `student_request_attachment_uploads`.
- MIME: PDF/JPEG/PNG.
- الحجم: 5 MiB لكل ملف.
- العدد: 1–3 للحقل `excuse_documents`.
- signed download: 300 ثانية.
- checksum SHA-256 اختياري، immutable إن قدم، ولا يحل محل object verification.
- launch state: `BLOCKED_PENDING_SECURE_ATTACHMENTS_RUNTIME`.

## الهوية والتدفق

المسار يولد خادمياً: `student-requests/{student_profile_id}/{student_request_id}/{attachment_id}/content.{ext}`. الاسم الأصلي metadata فقط. intent يثبت owner + draft + service + field + limits. الرفع عبر server proxy حتى لا يرى العميل bucket/path. completion يتحقق من metadata و`storage.objects` والحجم وMIME ثم ينقل `pending → uploaded → attached`. لا workflow أو submit داخل الرفع.

## Submit والتفويض

Submit يرفض Runtime الغائب، zero/four attachments، pending/uploaded غير attached/rejected، placeholder/local File، ومخالفة الطلب/الطالب/field/MIME/size. يجب استدعاء DB assertion في transaction قبل workflow initialization عند تنفيذ migration لاحقاً.

التنزيل يقبل attachment ID فقط. الطالب المالك مسموح، أو direct assignee للخطوة النشطة مع unit/role معرفين. لا role-pool ولا admin/registrar/dean bypass. الرابط موقع قصير العمر.

## State machine

- `pending → uploaded`: ALLOW
- `uploaded → attached`: ALLOW
- `pending|uploaded → rejected`: ALLOW
- `rejected → attached` و`attached → pending`: DENY
- الرفض منطقي فقط؛ لا DELETE أو cleanup.

## Draft SQL والأمان

الـDraft يقترح bucket/table/immutability trigger وRPCs وintent-bound Storage policies و`public.log_audit` المثبت في المصدر للأحداث: intent created، upload completed، attached، rejected، downloaded. يستخدم SECURITY DEFINER عند الحاجة مع search_path ثابت وREVOKE/GRANT محدود. لا IDs إنتاجية أو dynamic SQL أو fee code أو student_visible أو enrollment_certificate.

## مصفوفة الاختبارات

تغطي owner draft ALLOW؛ foreign/submitted/completed/unknown resubmit/path/bucket/MIME/size/fourth DENY؛ opaque attached references؛ zero/one/three/four؛ ownership mismatch؛ direct assignment والـbypasses؛ transitions الإيجابية والسلبية. الاختبارات source-contract وليست Runtime E2E.

## Regression

لم يتغير uploader القديم أو bucket القديم أو إيصالات الدفع أو مرفقات المجالس أو مواد المقررات أو enrollment_certificate أو Storage Saga أو verify_document أو applied migrations أو package/lockfile أو routes أو student_visible.

## نتائج التحقق

- `bun test tests/student-requests`: 316 pass / 0 fail، 1194 assertions، 19 files.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS خارج sandbox بعد أن أعطى التشغيل الأول داخله `spawn EPERM`؛ الإعادة المصرح بها اكتملت exit 0.
- `git diff --check`: PASS.
- جدد Build `src/routeTree.gen.ts` دون route change؛ أعيدت الزيادة المولدة إلى محتوى HEAD بتعديل محدد ولم تُضمّن.

## الجاهزية والعوائق

Source-ready: contracts، wrappers، UI fail-closed، adapter fields، Draft SQL، tests. غير مطبق Runtime: bucket/table/RPCs/policies، server-proxy execution، object verification، submit DB enforcement، secure staff download. يلزم review مستقل ثم sequential apply صريح قبل تفعيل الخدمة.

## أثر الإنتاج والقيود

لا أثر إنتاجي. لم ينفذ Supabase أو database write أو migration أو Bucket/Policy apply أو deploy/publish أو push/PR. لم تعدل أي بيانات أو worktree آخر.
