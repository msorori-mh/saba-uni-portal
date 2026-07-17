# بوابة الكلية — قواعد الوكلاء

## نطاق العمل

- العمل SOURCE-ONLY ما لم يصدر تصريح صريح بخلاف ذلك.
- يمنع تطبيق migrations أو تعديل بيانات الإنتاج.
- يمنع Publish أو Deploy.
- يمنع الوصول الكتابي إلى Supabase production.
- يمنع تغيير request_types.student_visible.
- يمنع إنشاء موظفين أو حسابات أو تعيينات وهمية.
- يمنع لمس الطلبات والوثائق الإنتاجية أو التجريبية الموجودة.

## Git والعزل

- لا يعمل أي وكيل مباشرة على main.
- لكل مهمة branch وworktree مستقلان.
- يمنع مشاركة ملف قابل للتعديل بين وكيلين في الوقت نفسه.
- يمنع reset وclean والحذف والتغييرات خارج النطاق.
- التغيير غير المعروف في worktree يُعزل، ولا يوقف المسارات المستقلة الآمنة.

## دورة حياة طلبات الطلاب

- يجب تحديد processing_unit وprocessing_role لكل خطوة موظف.
- لا يوجد bypass عام للأدمن أو المسجل أو العميد.
- التعيين المباشر له الأولوية المطلقة.
- يجب اختبار السماح للدور الصحيح والرفض لجميع الأدوار الأخرى عبر RPC مباشرة.
- إخفاء الزر في الواجهة ليس تفويضاً أمنياً.
- لا E2E قبل اكتمال مصفوفة التفويض الإيجابية والسلبية.

## الرسوم

- لا توجد بوابة دفع أو مبالغ أو عملات داخل البوابة.
- الخدمات المدفوعة توجه الطالب للسداد في النظام الجامعي الرئيسي.
- تبقى payment_confirmation للتحقق المالي اليدوي الخارجي.
- الخدمات المجانية تتجاوز خطوات الدفع دون إنشاء بيانات مالية وهمية.

## الوثائق

- إنشاء الوثيقة وPDF والرفع يكون في document_issuance فقط.
- التوقيع لا ينشئ وثيقة أو PDF أو Storage artifact.
- التحميل مسموح فقط للوثائق issued أو archived.
- QR والتحقق العام لا يكشفان بيانات حساسة.
- التخزين الرسمي خاص ولا يعتمد على public URLs.

## النطاق المحمي

- لا تعدّل enrollment_certificate إلا لمنع regression أو لتحقيق توافق موثق.
- يمنع تعديل migrations المطبقة.
- يمنع backfill أو cleanup أو delete أو reset.
- لا تغييرات بصرية غير لازمة.

## التحقق الإلزامي

عند تعديل ملفات runtime:

- `bunx tsc --noEmit`
- `bun test tests/student-requests`
- `bun run security:test` عند توفر بيئة آمنة
- `bun run build` عند الحاجة
- `git diff --check`

## تقرير كل وكيل

يجب أن يتضمن:

- الملفات المعدلة
- الاختبارات والنتائج
- الافتراضات
- المخاطر
- العوائق
- أثر الإنتاج
- قرار PASS أو HOLD

## SAFE AUTOPILOT EXECUTION POLICY — BINDING

اعمل بصورة تلقائية ومستمرة حتى اكتمال المشروع.

القاعدة الأساسية:

- نفّذ تلقائياً كل إجراء يقع ضمن ALLOWED_AUTONOMOUS_ACTIONS.
- لا تطلب موافقة المستخدم على إجراء مسموح.
- لا تنفذ أي إجراء يقع ضمن FORBIDDEN_WITHOUT_EXPLICIT_APPROVAL.
- عند مواجهة إجراء ممنوع، سجله في `docs/PROJECT-DECISIONS-NEEDED.md`، وتابع فوراً أي مهام مستقلة لا تعتمد عليه.
- لا تتوقف لمجرد وجود قرار معلق إذا كانت توجد مهام آمنة أخرى قابلة للتنفيذ.

### ALLOWED_AUTONOMOUS_ACTIONS

مسموح تلقائياً:

- قراءة جميع ملفات المستودع والتقارير.
- `git fetch` و`git status` و`git diff` و`git log` و`git show` والبحث في الفروع وworktrees.
- إنشاء branches وworktrees جديدة معزولة.
- تعديل كود المصدر والاختبارات والوثائق.
- إنشاء Draft SQL تحت `docs/migration-drafts` فقط.
- تثبيت الاعتماديات المقفلة وتشغيل tests وtypecheck وbuild وlint و`git diff --check`.
- إنشاء commits محلية.
- push لفروع الميزات والمراجعات العادية فقط، وفتح Pull Requests وقراءة ومتابعة CI ومعالجة findings.
- دمج PR آمن فقط عند نجاح CI والاختبارات وtypecheck وbuild، ووجود مراجعة مستقلة PASS، وعدم وجود CRITICAL أو HIGH findings، وعدم تطبيق Migration أو تغيير student_visible أو Deploy أو Publish أو كتابة إنتاجية.
- تشغيل ثلاث مهام مستقلة كحد أقصى بالتوازي.
- تحديث ملفات حالة المشروع والسجل تلقائياً.

### FORBIDDEN_WITHOUT_EXPLICIT_APPROVAL

ممنوع التنفيذ دون موافقة صريحة جديدة من المستخدم:

- أي أمر Supabase يتصل بالإنتاج، بما فيه `supabase link` و`supabase db push` و`supabase migration up`.
- تطبيق أي Migration أو SQL.
- إنشاء أو تعديل Bucket فعلي أو Storage Policy إنتاجية.
- أي database write على الإنتاج.
- Deploy أو Publish.
- تغيير student_visible.
- تعديل أو حذف بيانات إنتاجية.
- DROP أو DELETE أو TRUNCATE على بيانات أو كائنات إنتاجية.
- reset أو cleanup، بما فيه `git reset` و`git clean`.
- force push بأي صيغة.
- `rm -rf` أو `Remove-Item -Recurse`.
- حذف Worktree أو Branch قبل توثيق اكتماله.
- تعديل Secrets أو كلمات المرور أو مفاتيح البيئة، أو استخدام بيانات اعتماد الإنتاج.
- تشغيل E2E على مستخدم حقيقي.
- إنشاء أو تعديل موظف أو طالب أو تعيين إنتاجي.
- إصدار أو إلغاء أو أرشفة وثيقة إنتاجية.
- اعتماد fee_type.code أو مبلغ أو عملة.
- اختراع mapping أكاديمي.
- تجاوز Finding أمنية CRITICAL أو HIGH.
- تعديل الكيانات المحمية في هذا الملف.

### FAIL-CLOSED RULE

إذا كان الأمر أو أثره غير واضح:

1. لا تنفذه.
2. صنفه REQUIRES_USER_APPROVAL.
3. سجل الأمر المقترح وسببه وأثره المتوقع.
4. استمر في المهام الآمنة الأخرى.

يحظر التحايل على الممنوعات عبر سكربت وسيط أو package script أو PowerShell أو Python أو Node أو GitHub Actions أو API/HTTP request أو أمر يحمل اسماً مختلفاً لكنه يحقق الأثر الممنوع نفسه. الحكم يكون على أثر العملية، وليس فقط على اسم الأمر.

### NON-BLOCKING AUTOPILOT POLICY

- لا يوجد Global HOLD بسبب Worktree dirty واحد.
- Worktree dirty معروف ومملوك لمهمة: RESUME_BY_OWNER.
- Worktree dirty ضمن نطاق المهمة: CONTINUE_FROM_CURRENT_STATE.
- Worktree يحتوي تغييرات غير معروفة: SKIP_THAT_WORKTREE_AND_CONTINUE.
- اختلافات formatting أو generated files أو trailing whitespace: FIX_AUTOMATICALLY.
- فشل اختبار في مسار واحد: ISOLATE_AND_FIX_OR_CONTINUE_OTHER_PATHS.
- PR متعارض: ISOLATE_PR_AND_CONTINUE_OTHER_PATHS.
- قرار غير محسوم لخدمة واحدة: KEEP_SERVICE_FAIL_CLOSED_AND_CONTINUE_OTHERS.

عند وجود أكثر من حل آمن، اختر الحل الأبسط والأكثر تحفظاً، وثق القرار، نفذه، واستمر. لا تسأل المستخدم في الحالات منخفضة المخاطر.

لا يتوقف القائد بالكامل إلا عند واحد من الآتي:

- نفاد Codex usage فعلياً.
- انقطاع الشبكة أو البيئة بحيث لا يمكن تنفيذ أي مهمة.
- غياب بيانات اعتماد لا يوجد أي مسار مستقل عنها.
- partial production apply فعلي.
- احتمال إجراء تدميري لا يمكن عزله.
- عدم وجود أي مهمة آمنة متبقية.

عند وجود عائق إنتاجي، اعزل الإنتاج واستمر في source/tests/reviews/docs/PRs المستقلة. لا تجعل العائق الإنتاجي يوقف المشروع كله.

### CONTINUOUS EXECUTION

بعد كل مهمة:

1. شغّل الاختبارات اللازمة.
2. وثق النتيجة وcommit التغييرات المكتملة.
3. حدّث `docs/PROJECT-EXECUTION-STATE.md` و`docs/PROJECT-AUTOPILOT-LOG.md` و`docs/PROJECT-DECISIONS-NEEDED.md` حسب الحاجة.
4. اختر تلقائياً أعلى مهمة آمنة تالية.
5. لا تسأل المستخدم: هل أتابع؟
6. لا تتوقف إلا عند تحقق أحد شروط التوقف الكلي أعلاه أو اكتمال المشروع وفق معايير القبول.

لا تستخدم `AGENTS.md` كسجل حالة، ولا تعدله بسبب دورة تشغيل عادية، ولا تترك Worktree القائد dirty بين الدورات.

لا تطلب من المستخدم تأكيد إنشاء branch أو worktree، أو تعديل source/tests/docs، أو إصلاح formatting وlint/typecheck/build، أو إنشاء commits، أو push للفروع العادية، أو فتح PRs، أو معالجة CI وملاحظات المراجعة، أو دمج PR آمن مستوفٍ للشروط، أو استكمال مسار مملوك من حالته الحالية.
