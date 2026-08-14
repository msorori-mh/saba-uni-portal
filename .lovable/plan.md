# COUNCILS_MINUTES_LIFECYCLE_UI_STATE_ALIGNMENT_05

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

| Stage | Chair | Secretary | Other members |
|---|---|---|---|
| minutes_draft | edit + save draft; no submit; no approve/lock; notice "المحضر مسودة ولم يُرسل للمراجعة بعد" | edit + save draft + submit for review; no approve/lock | read-only |
| minutes_review | read the saved draft + approve and lock; no save draft | read-only; no save; no submit | read-only |
| minutes_locked / archived | read-only + PDF export | read-only + PDF export | read-only + PDF export |

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
