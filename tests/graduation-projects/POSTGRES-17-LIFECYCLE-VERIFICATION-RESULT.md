# Postgres 17 lifecycle verification — graduation projects

التاريخ: 2026-07-21 · أُعيد التشغيل في 2026-07-21 بعد معالجة مراجعة 4982 (MEDIUM-1 + LOW-1..7)
الهدف: إثبات أن مسودة `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` قابلة للتنفيذ على خادم PostgreSQL 17 حقيقي وأن دورة الحياة الكاملة تعمل عبر RPCs فقط.

الحكم: **نجاح كامل** (في التشغيلين) — 23 حالة denial دقيقة، 24 إعادة idempotent مؤكدة في الحلقة الختامية، 5 تأكيدات replay بمعرّفات حمولة غير متطابقة، 19 مجموعة تأكيدات، تحقق إجماع حتمي، اختلاف رؤية الطالب/المنسق.

1. المخطط الأدنى يوفّر جداول الحقائق وحقول JWT التي تحتاجها حزمة مشاريع التخرج.
2. `graduation_project_events` جدول append-only مع idempotency عبر `(project_id, correlation_id, event_type)`.
3. مخطط الأساس يوفّر الاقتراحات والفريق والمعالم والتسليمات والملفات والمناقشات واللجنة والتقييمات والتصحيحات ونتيجة المشروع.
4. قيود الإكمال (المعالم، التسليمات المقبولة، الملف النهائي النظيف) تحرس تفعيل المشروع.
5. تعيين المنسّق يجب أن يسبق أي إجراء دوري آخر.
6. سير الاقتراح: يبدأ `draft`، ويعتمد المنسّق ليصبح `approved`.
7. قبول عضوية الفريق يفعّل المشروع بمجرد استيفاء كل قيود الإكمال.
8. التسليمات تدور submission→review→accept/reject.
9. الملفات تتطلب كائن تخزين `clean` (مفحوص) قبل قبولها.
10. طلب المناقشة → الجدولة → العقد يمشي بترتيب صارم.
11. أعضاء اللجنة يُسندون من تعيينات `panel_member` النشطة فقط.
12. التقييم draft→final؛ و`save` لا يُقبل بعد الحسم.
13. حسم النتيجة يتطلب إجماع تقييمات اللجنة النهائية (لا ناقص ولا متضارب).
14. التصحيحات تُستكمل من الطالب وتُقبل من رئيس القسم/العميد؛ قبول آخر تصحيح يعيد المشروع إلى `evaluating`.
15. الأرشفة تُنتج `archived` وتسجل حدث `project_archived` (تُسجَّل `correction_required` عند الطلب، ثم `project_archived` عند القبول النهائي).
16. **23 حالة denial دقيقة** (P0001 عبر `pg_temp.expect_gp_error`) — منها 4 أُضيفت لمعالجة مراجعة 4982: تكرار تعيين faculty نشط لنفس `(project_id, role, user_id)` (LOW-1)، تكرار عضو لجنة لنفس المناقشة (LOW-1)، تكرار `object_key` (LOW-1)، و`maximum_score` فوق سعة `numeric(7,2)` يُرفض تحققياً لا بـ overflow خام (LOW-5).
17. **24 زوج استدعاء/إعادة `_retry`** — فحص exactly-once في الحلقة الختامية لكل زوج؛ أُضيف `asg2_retry` إلى الحلقة الختامية فأصبحت تغطي الأزواج الـ24 كلها (LOW-7).
    وخمسة RPCs يُتحقق الآن أنها تُعيد `entity_id` **المسجل** عند الـ replay حتى مع معرّف كيان غير متطابق في الحمولة (LOW-2): `end_assignment`, `resolve_note`, `reject_discussion_request`, `complete_correction`, `accept_correction`.
18. آلة الحالة ترفض الانتقالات خارج الترتيب (لا تخطٍّ للأمام ولا للخلف).
19. الإجماع يُفرض حتمياً: أي تقييم draft أو قرار متضارب يمنع الحسم.
20. اختلاف الرؤية: الطالب لا يرى تقييمات اللجنة قبل الحسم، والمنسق يراها.
21. الأرشفة نهائية وتُرفض الكتابات اللاحقة بحراسات الحالة.
22. exactly-once لكل `(project_id, correlation_id, event_type)`.
23. الدوريات الثلاث `active/completed/archived` متوافقة مع مخطط الأساس.
24. سلسلة التنفيذ (كلها ناجحة):
    1. `tests/graduation-projects/postgres-minimal-schema.sql` — مفاتيح الحقائق عبر `-v department_id …` (5 متغيرات اختبار اصطناعية).
    2. `docs/migration-drafts/GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql` — مخطط الأساس وRPCsه الست.
    3. `docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql` — 21 RPC إضافية (25 إجمالاً) والقيود المكمّلة.
    4. `tests/graduation-projects/postgres-foundation-verifier.sql` — يبقى أخضر فوق المسودة الجديدة.
    5. `tests/graduation-projects/postgres-lifecycle-verifier.sql` — التحقق الكامل لهذا الملف.
25. المخطط الأدنى يضم فقط الحقول المستخدمة في مسارات RPCs (لا اعتماد على أعمدة زائدة).
26. حجم الملفات: postgres-minimal-schema.sql 4221 B · GRADUATION-PROJECTS-MVP-FOUNDATION-01.sql 42197 B · GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql 69339 B · postgres-foundation-verifier.sql 27787 B · postgres-lifecycle-verifier.sql 39557 B.
27. المحرك: التشغيل الأصلي استخدم عقد PostgreSQL 17.10 مضمّناً عبر pgwire نصي (بلا عميل psql). **إعادة 2026-07-21 استخدمت عميل psql 16.2 حقيقياً ← خادم PostgreSQL 17.10** (نفس طوبولوجيا CI: ubuntu-latest ← postgres:17) مع متغيرات `-v` الخمسة نفسها و`-v ON_ERROR_STOP=1` على كل ملف؛ انتهى التحقق بـ `rollback;` وأُثبت عملياً صفر صفوف في `graduation_projects` و`graduation_project_events` بعد التشغيل.
28. الحكم النهائي: **نجاح كامل في التشغيلين** — المسودة والمتحقق (بعد إصلاحات المراجعة) جاهزان للمراجعة والدمج.
