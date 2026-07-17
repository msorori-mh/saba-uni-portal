# EXTERNAL UNIVERSITY PAYMENT CONFIRMATION — SOURCE REPORT

- السياسة المعتمدة: `EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION` للخدمتين `department_transfer` و`final_chance`.
- أزيل شرط `fee_type.code` وحذفت خطوة `fee_assessment` من عقدي B1-02.
- لا يسجل العقد مبلغاً أو عملة أو فاتورة أو مرجع دفع أو gateway أو رصيداً داخلياً.
- تبقى `payment_confirmation` لموظف المالية المعيّن مباشرة فقط، ولا استكمال قبل `payment_confirmed`.
- `final_chance` هي اختبار مقرر كفرصة نهائية فقط؛ لا قائمة `chance_type`، والكتابة الجديدة `final_chance` حصراً، والقيم القديمة قراءة/تطبيع فقط.
- لم تعدل migrations مطبقة، ولم يطبق SQL، ولم يتغير `student_visible`.
- runtime مغلق حتى migration منفصلة ومصفوفة RPC إيجابية/سلبية في بيئة آمنة.

## Verification

- `bunx tsc --noEmit`: PASS.
- `bun test tests/student-requests`: PASS بعد تثبيت الاعتماديات المقفلة.
- `bun run build`: PASS.
- الاختبارات المستهدفة بعد إغلاق findings: 59 PASS، 0 fail.
- `git diff --check`: PASS.
- المراجعة المستقلة: PASS، بلا HIGH أو CRITICAL.
- `bun run lint`: baseline HOLD بسبب CRLF/Prettier في ملفات كثيرة غير معدلة؛ لم يوسع النطاق لإعادة تنسيق المستودع كله.

## Assumptions and risks

- `extra_chance` يبقى stored request-type alias مؤقتاً لأن القيود والـRPCs المطبقة تعتمد عليه؛ لا backfill أو تعديل migration مطبقة.
- runtime و`student_visible` يظلان fail-closed حتى تطبيق خطة migrations واختبار التفويض المباشر.
- توجد دالة حفظ قديمة غير قابلة للوصول في نافذة التحويل؛ لا تعرض الواجهة Actions. تنظيفها LOW لاحق ولا يفتح مسار تنفيذ.

Production impact: none. Decision: PASS_SOURCE_ONLY.
