# الخطة **معتمدة للتنفيذ Source-only**، وهي العلاج الصحيح للمشكلة التي ظهرت في شاشة رئيس المجلس. مراجعة المصدر الحالي تؤكد أن الواجهة ما زالت تعرض إجراءات المحضر بناءً على الدور أكثر من حالة الـlifecycle، وأن الأخطاء الخلفية تمر للمستخدم بصيغتها الخام.

```text
APPROVED_COUNCILS_MINUTES_LIFECYCLE_UI_STATE_ALIGNMENT_05

SCOPE=SOURCE_ONLY
FILES_ALLOWED=
src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx

MIGRATION=DENY
BACKEND_CHANGE=DENY
RPC_CHANGE=DENY
PRODUCTION_WRITE=0
DEPLOY=DENY
PUBLISH=DENY

```

أثبت فقط هذه النقاط أثناء التنفيذ:

- مزامنة `minutesBody` من `minutesData.body` تكون **مرة عند وصول المسودة أو عند تغير الاجتماع**، ولا تعيد الكتابة فوق نص بدأ المستخدم بتحريره. الأفضل استخدام `dirty/ref` أو ما يعادله.
- عند `minutes_review` للرئيس، العرض يكون **Read-only للنص المحفوظ**، وزر الاعتماد فقط؛ لا Textarea ولا «حفظ المسودة».
- عند `minutes_draft` للرئيس، لا يظهر زر الاعتماد مطلقًا؛ تظهر رسالة: **«المحضر مسودة ولم يُرسل للمراجعة بعد.»**
- بعد أي خطأ lifecycle لا يكفي `minutesQuery.refetch()` وحده؛ أعد أيضًا مزامنة حالة الاجتماع عبر `onStateChanged?.()`/invalidate المناسب، لأن `meetingStatus` يأتي من الأب، وإلا قد تبقى الواجهة على حالة قديمة حتى لو تم تحديث المحضر.
- لا تعرض أي code داخلي مثل `COUNCIL_MINUTES_LOCK_STATE_INVALID` للمستخدم.

المصفوفة النهائية التي أريدها:

```text
minutes_draft + chair:
EDIT=YES
SAVE_DRAFT=YES
SUBMIT_REVIEW=NO
APPROVE_LOCK=NO

minutes_draft + secretary:
EDIT=YES
SAVE_DRAFT=YES
SUBMIT_REVIEW=YES
APPROVE_LOCK=NO

minutes_review + chair:
READ_SAVED_DRAFT=YES
EDIT=NO
SAVE_DRAFT=NO
APPROVE_LOCK=YES

minutes_review + secretary:
READ_ONLY=YES
SAVE_DRAFT=NO
SUBMIT_REVIEW=NO
APPROVE_LOCK=NO

minutes_locked/archived:
READ_ONLY=YES
PDF_EXPORT=YES
EDIT_ACTIONS=ZERO

```

وأضف تحققًا مصدريًا لهذه الحالات:

```text
CHAIR_DRAFT_LOCK_BUTTON_HIDDEN=PASS
SECRETARY_DRAFT_SUBMIT_REVIEW_VISIBLE=PASS
CHAIR_REVIEW_LOCK_BUTTON_VISIBLE=PASS
CHAIR_REVIEW_SAVE_DRAFT_HIDDEN=PASS
SECRETARY_REVIEW_READONLY=PASS
SAVED_DRAFT_LOADED_FOR_CHAIR_REVIEW=PASS
LOCKED_ALL_READONLY=PASS
RAW_MINUTES_BACKEND_CODES_VISIBLE=ZERO
STATE_RACE_RESYNC=PASS

TSC=PASS
DIFF_CHECK=PASS

MIGRATION=0
BACKEND_CHANGE=0
PRODUCTION_WRITE=0
DEPLOY=0
PUBLISH=0

```

وعند نجاحها يكون القرار:

```text
PASS_COUNCILS_MINUTES_LIFECYCLE_UI_STATE_ALIGNMENT_05

```

هذه المهمة مستقلة عن حزمة **التصويت والإشعارات وثوابت التواريخ 04**؛ لا تخلطهما في تعديل واحد حتى تظل المراجعة والإغلاق واضحين.COUNCILS_MINUTES_LIFECYCLE_UI_STATE_ALIGNMENT_05

Source-only. No migration, no backend change. The database state machine is correct; the interface must follow it instead of offering actions the backend will reject.

## Confirmed by reading the source

In `CouncilSessionAndGovernanceWorkspace.tsx`:

- The lock button renders under `{isChair && ...}` only, with no meeting-status condition — the chair sees "اعتماد وقفل المحضر رسمياً" while the meeting is still `minutes_draft`.
- "حفظ المسودة" renders whenever `canWriteAgenda` is true, including at `minutes_review`, although saving is only accepted at `minutes_draft`.
- `minutesBody` starts as `""` and is never synchronised from the fetched minutes, so the editor/review area is empty even when a draft exists.
- Backend errors are surfaced raw via `toast.error(err.message)`, which is how `COUNCIL_MINUTES_LOCK_STATE_INVALID: status is minutes_draft` reached the user.

Also confirmed: `get_council_historical_minutes` already returns `body` and `status` to any council member at any stage, so the saved draft text is available to the chair during review without any backend change.

## The lifecycle the interface will follow

```text
end of session
      v
minutes_draft   -> secretary/chair write and save the draft
      v            (secretary only) submit for review
minutes_review  -> chair reviews the saved text, approves and locks
      v
minutes_locked  -> read-only for everyone, PDF export available
```

## Permission matrix to implement


| Stage                     | Chair                                                                                       | Secretary                                              | Other members          |
| ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------- |
| minutes_draft             | edit + save draft; no submit; no approve/lock; notice "المحضر مسودة ولم يُرسل للمراجعة بعد" | edit + save draft + submit for review; no approve/lock | read-only              |
| minutes_review            | read the saved draft + approve and lock; no save draft                                      | read-only; no save; no submit                          | read-only              |
| minutes_locked / archived | read-only + PDF export                                                                      | read-only + PDF export                                 | read-only + PDF export |


## Changes

1. **State-aware gating.** Derive `isDraftStage` (`minutes_draft`) and `isReviewStage` (`minutes_review`) from the meeting status, and render:
  - save draft: only at draft stage for chair and secretary;
  - submit for review: only at draft stage for the secretary;
  - approve and lock: only at review stage for the chair.
2. **Load the saved text.** Seed `minutesBody` from the fetched minutes body once it arrives (without overwriting text the user is currently typing), so the chair reviews the actual draft rather than an empty box.
3. **Read-only review view for the chair.** At `minutes_review` the saved text is shown as formatted read-only content, not an editable textarea, next to the approve-and-lock action.
4. **Stage notices in Arabic.** A short line explaining the current stage and what is needed next — for the chair at draft stage: "المحضر مسودة ولم يُرسل للمراجعة بعد"; for the secretary at review stage: the minutes are with the chair for approval.
5. **Human error messages.** Map the backend codes in the minutes handlers instead of printing them:
  - `COUNCIL_MINUTES_LOCK_STATE_INVALID` -> "لا يمكن اعتماد المحضر الآن. يجب إرسال المسودة للمراجعة أولاً."
  - `COUNCIL_MINUTES_DRAFT_STATE_INVALID` (save outside draft stage) -> "لا يمكن تعديل المسودة بعد إرسالها للمراجعة."
  - anything else keeps a generic Arabic fallback. On such an error the minutes query is refetched so the UI resynchronises with the real state (race condition safety).
6. **Header badge** reflects the true stage: مسودة المحضر / قيد مراجعة الرئيس / محضر مقفل رسمياً.

## Files

- `src/components/councils/CouncilSessionAndGovernanceWorkspace.tsx` — the only file changed.

## Verification

- Typecheck.
- Read-through of the rendered matrix per role and per stage.
- No SQL, no data writes, no publish.