# PORTAL-SWARM-FILE-OWNERSHIP

آخر تحديث: 2026-07-21 — المرجع: `origin/main@ff570f3b`

القاعدة: لا يعمل وكيلان على الملف نفسه بالتوازي دون موافقة القائد العام. كل تعديل في Worktree/فرع وPR مستقل.

## الملكية النشطة

| الوكيل | الملفات/النطاق | الفرع | حالة المهمة |
|---|---|---|---|
| القائد العام | docs/PORTAL-SWARM-*.md (8 ملفات) | swarm/coordination-program-01 | IN_PROGRESS |

## حجوزات مسبقة للمهام الجاهزة (تُفعَّل عند الإسناد)

| المهمة | النطاق المحجوز | ملاحظات منع التعارض |
|---|---|---|
| Q-13 routeTree fix | src/routeTree.gen.ts، سكربتات/اختبارات Register | حصري — يمس ملفاً مولداً |
| Q-14 المقاصة | src/**/academic-clearance*، docs/drafts/*clearance*، tests/academic-clearance/ | لا يمس student-requests المشتركة إلا بتنسيق |
| Q-15 مشاريع التخرج | src/**/graduation-project*، docs/drafts/*graduation*، tests/graduation-projects/ | مستقل عن Q-14 |
| Q-16 الخريجون | src/**/graduate*، docs/drafts/*graduate*، tests/graduates-affairs/ | مستقل |
| Q-17 المحاضرات | src/**/lecture-execution* (جديد)، docs/LECTURE-* | ملفات جديدة فقط في البداية |
| Q-18 المواد | src/**/material*، tests/materials/ | لا يمس migrations المطبقة |

## مناطق محظورة دون تفويض القائد العام

- `supabase/migrations/` (ملفات مطبقة) — لا تعديل إطلاقاً؛ forward-only عبر ملفات جديدة.
- `docs/B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md` — الـrunbook القانوني؛ أي تغيير يتطلب مراجعة مستقلة وتوثيق سبب.
- `src/routeTree.gen.ts` — ملف مولّد؛ يُدار حصرياً عبر مهمة Q-13.
- السجلات المحمية (انظر PRODUCTION-GATES) — لا أداة تقترب منها.

## سجل التعارضات

لا تعارضات مسجلة في هذه الدورة حتى الآن.
