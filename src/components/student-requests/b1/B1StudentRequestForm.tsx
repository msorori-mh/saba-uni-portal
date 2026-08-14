import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStudentRequestRoutes } from "@/lib/student-requests/surface";
import {
  getEmptyFormValues,
  getStudentRequestFormDefinition,
  type RequestFormFieldDefinition,
  type RequestFormFieldOption,
} from "@/lib/student-requests/request-form-registry";
import { SECURE_ATTACHMENT_MAX_BYTES } from "@/lib/student-requests/secure-attachments-contract";
import {
  resolveSecureAttachmentsRuntimeAvailable,
  SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR,
} from "@/lib/student-requests/secure-attachments-capability";
import {
  B1AdapterError,
  B1_KNOWN_VALUE_LABELS_AR,
  b1AdapterErrorMessageAr,
  b1ValidationMessageAr,
  getB1ServiceConfig,
  getB1UiAdapter,
  validateB1FormValues,
  type B1CanonicalCode,
  type B1Draft,
  type B1FormOptions,
} from "@/lib/student-requests/b1-ui";
import { withSecureAttachmentReferences } from "@/lib/student-requests/b1-ui/attachment-references";
import {
  classifyB1SaveError,
  logB1SaveDiagnostic,
  type B1SavePhase,
} from "@/lib/student-requests/b1-ui/save-error-classification";


import { B1AttachmentUploader } from "./B1AttachmentUploader";
import { formatB1DateAr } from "./b1-datetime";
import { B1DraftStatus, type B1DraftSaveState } from "./B1DraftStatus";
import { B1ErrorState } from "./B1ErrorState";
import { B1LoadingState } from "./B1LoadingState";
import { B1RequestSummary } from "./B1RequestSummary";
import { B1ServiceHeader } from "./B1ServiceHeader";
import { B1SubmissionConfirmation } from "./B1SubmissionConfirmation";
import { StepUpConfirmDialog } from "@/components/security/StepUpConfirmDialog";
import { isBiometricRuntimeAvailable } from "@/lib/native/biometrics";
import { isStepUpSensitiveService, STEP_UP_MESSAGES_AR } from "@/lib/security/step-up-contract";
import { performStepUp } from "@/lib/security/step-up-client";
import {
  getCurrentUserIdForStepUp,
  stepUpRpcClient,
} from "@/lib/security/step-up-browser";
import { B1SuccessState } from "./B1SuccessState";
import {
  describeError,
  describeUpdatedAt,
  traceB1Submit,
} from "@/lib/student-requests/b1-ui/submit-trace";

const AUTOSAVE_MS = 1000;

const MAX_SIZE_MB = SECURE_ATTACHMENT_MAX_BYTES / (1024 * 1024);

export function B1StudentRequestForm({ serviceCode }: { serviceCode: B1CanonicalCode }) {
  const navigate = useNavigate();
  const routes = useStudentRequestRoutes();
  const adapter = useMemo(() => getB1UiAdapter(), []);
  const config = getB1ServiceConfig(serviceCode)!;
  const definition = getStudentRequestFormDefinition(serviceCode)!;
  const [draft, setDraft] = useState<B1Draft | null>(null);
  const [options, setOptions] = useState<B1FormOptions | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    getEmptyFormValues(definition),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<B1DraftSaveState>("draft");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [transientSaveError, setTransientSaveError] = useState<string | null>(null);

  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentsRuntimeAvailable, setAttachmentsRuntimeAvailable] = useState(false);
  const [success, setSuccess] = useState<{ requestId: string; requestNumber: string } | null>(
    null,
  );
  const [attachmentSyncing, setAttachmentSyncing] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpBusy, setStepUpBusy] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const attachmentSync = useRef<Promise<void> | null>(null);
  const submitLock = useRef(false);
  const valuesRef = useRef(values);
  const draftRef = useRef(draft);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFailedFile = useRef<{ key: string; file: File } | null>(null);

  valuesRef.current = values;
  draftRef.current = draft;

  const applyDraft = (loaded: B1Draft) => {
    setDraft(loaded);
    const empty = getEmptyFormValues(definition);
    // Legacy drafts may carry keys outside the current contract allowlist
    // (e.g. `_formCode`). Saving them back is rejected server-side, so keep
    // only contract fields when hydrating.
    const contractOnly = Object.fromEntries(
      Object.entries(loaded.formData ?? {}).filter(([key]) =>
        Object.prototype.hasOwnProperty.call(empty, key),
      ),
    );
    setValues({ ...empty, ...contractOnly });
    setSaveState("saved");
  };


  const reloadDraft = async (requestId: string) => {
    const reloaded = await adapter.getB1RequestDraft(requestId);
    if (!reloaded) throw new B1AdapterError("NOT_FOUND", "Draft missing");
    applyDraft(reloaded);
  };

  const load = () => {
    setFatalError(null);
    setTransientSaveError(null);

    setSuccess(null);
    void Promise.all([
      adapter.getAvailableB1RequestTypes(),
      adapter.getB1RequestFormOptions(serviceCode),
      adapter.getB1RuntimeCapability(),
    ])
      .then(async ([availability, loadedOptions, capability]) => {
        const available = availability.some(
          (item) => item.code === serviceCode && item.studentVisible && item.runtimeAvailable,
        );
        if (!available) throw new B1AdapterError("ACTIVATION_BLOCKED", "Service inactive");

        const attachmentsReady = resolveSecureAttachmentsRuntimeAvailable({
          capabilityAvailable: capability.available === true,
          reads: capability.reads,
          // UI mirrors secure-read attachments readiness; server probes the four RPCs on upload.
          rpcPresence: {
            create_intent: capability.reads.includes("attachments"),
            upload: capability.reads.includes("attachments"),
            complete: capability.reads.includes("attachments"),
            download: capability.reads.includes("attachments"),
          },
        }).available;
        setAttachmentsRuntimeAvailable(attachmentsReady);

        // Prefer an open draft/returned request for this service, then create (server restores one draft).
        const listed = await adapter.listB1StudentRequests();
        const open = listed.find(
          (row) =>
            row.serviceCode === serviceCode &&
            (row.status === "draft" || row.status === "returned"),
        );
        const loaded = open
          ? ((await adapter.getB1RequestDraft(open.requestId)) ??
            (await adapter.createB1RequestDraft(serviceCode)))
          : await adapter.createB1RequestDraft(serviceCode);

        applyDraft(loaded);
        setOptions(loadedOptions);
      })
      .catch((error) => setFatalError(b1AdapterErrorMessageAr(error)));
  };

  useEffect(load, [adapter, definition, serviceCode]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const persistDraft = async (
    target: B1Draft,
    vals: Record<string, unknown>,
    fromAutosave = false,
    phase: B1SavePhase = fromAutosave ? "autosave" : "manual_save",
  ) => {
    if (reviewing || submitting || success) return;
    if (!fromAutosave) setSaveState("saving");
    else if (saveState === "saving") return;
    else setSaveState("saving");
    try {
      const saved = await adapter.saveB1RequestDraft(
        target.requestId,
        withSecureAttachmentReferences(serviceCode, vals, target.attachments),
        target.updatedAt,
      );

      setDraft(saved);
      setSaveState("saved");
      // Successful recovery must clear the transient notice; no stale banner.
      setTransientSaveError(null);
    } catch (error) {
      if (error instanceof B1AdapterError && error.code === "STALE_VERSION") {
        try {
          await reloadDraft(target.requestId);
          setFatalError(b1AdapterErrorMessageAr(error));
          setSaveState("save_failed");
        } catch (reloadError) {
          setSaveState("save_failed");
          setFatalError(b1AdapterErrorMessageAr(reloadError));
        }
        return;
      }
      setSaveState("save_failed");
      // A save failure never proves the service is inactive: only the
      // availability/capability probe on load can do that.
      const classification = classifyB1SaveError(error, phase, {
        capabilityProvenUnavailable: false,
      });
      logB1SaveDiagnostic(phase, classification);
      if (classification.severity === "fatal") {
        if (!fromAutosave) setFatalError(classification.messageAr);
      } else if (!fromAutosave) {
        setTransientSaveError(classification.messageAr);
      }
    }
  };

  const save = async (fromAutosave = false) => {
    const current = draftRef.current;
    if (!current) return;
    // Never race a save against an in-flight attachment sync: the sync owns the
    // latest server version and re-persists the secure references itself.
    if (attachmentSync.current) {
      await attachmentSync.current.catch(() => undefined);
      if (fromAutosave) return;
    }
    await persistDraft(draftRef.current ?? current, valuesRef.current, fromAutosave);
  };

  const syncFormDataAfterAttachmentChange = async (requestId: string, fallback: B1Draft) => {
    const run = (async () => {
      let target = fallback;
      try {
        const reloaded = await adapter.getB1RequestDraft(requestId);
        if (reloaded) {
          target = reloaded;
          setDraft(reloaded);
        }
      } catch {
        /* keep optimistic attachment state */
      }
      await persistDraft(target, valuesRef.current, false, "attachment_sync");
    })();

    attachmentSync.current = run;
    setAttachmentSyncing(true);
    try {
      await run;
    } finally {
      if (attachmentSync.current === run) {
        attachmentSync.current = null;
        setAttachmentSyncing(false);
      }
    }
  };

  /** Submit and review must observe a settled attachment state. */
  const awaitAttachmentSync = async () => {
    while (attachmentSync.current) {
      await attachmentSync.current.catch(() => undefined);
    }
  };

  const scheduleAutosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (attachmentSync.current || submitLock.current) return;
      void save(true);
    }, AUTOSAVE_MS);
  };

  const changeField = (name: string, value: unknown) => {
    // Cascading references: a dependent select must not keep a value that no
    // longer belongs to the newly chosen parent (e.g. program vs department).
    const dependents = definition.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.referenceDependsOnField === name)
      .map((field) => field.name);
    setValues((current) => {
      const next = { ...current, [name]: value };
      for (const dependent of dependents) next[dependent] = "";
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      for (const dependent of dependents) delete next[dependent];
      return next;
    });
    setSaveState("draft");
    scheduleAutosave();
  };

  const review = async () => {
    if (attachmentSync.current || uploadingKey) return;
    await awaitAttachmentSync();
    const current = draftRef.current;
    const validationValues = { ...valuesRef.current };
    for (const attachment of current?.attachments ?? []) {
      validationValues[attachment.attachmentType] = {
        fileName: attachment.fileName,
        storagePath: attachment.storageRef,
      };
    }
    const result = validateB1FormValues(serviceCode, validationValues);
    const nextErrors = { ...result.errors };
    for (const requirement of definition.requiredAttachments ?? []) {
      if (!current?.attachments.some((item) => item.attachmentType === requirement.key)) {
        nextErrors[requirement.key] = "secure_attachment_required";
      }
    }
    setErrors(nextErrors);
    const errorNames = Object.keys(nextErrors);
    if (errorNames.length === 0) {
      setReviewing(true);
      return;
    }
    document.getElementById(`b1-field-${errorNames[0]}`)?.focus();
  };

  /**
   * Sensitive services require a server-verified biometric step-up proof before
   * the submit RPC is invoked. Cancel/failure ⇒ ZERO submit RPC calls.
   */
  const requiresStepUp =
    isStepUpSensitiveService(serviceCode) && isBiometricRuntimeAvailable();

  const beginSubmit = () => {
    if (!requiresStepUp) {
      void submit(null);
      return;
    }
    setStepUpError(null);
    setConfirming(false);
    setStepUpOpen(true);
  };

  const runStepUpThenSubmit = async () => {
    if (!draft || stepUpBusy || submitLock.current) return;
    setStepUpBusy(true);
    setStepUpError(null);
    try {
      const userId = await getCurrentUserIdForStepUp();
      if (!userId) {
        setStepUpError(STEP_UP_MESSAGES_AR.failed);
        return;
      }
      const target = draftRef.current ?? draft;
      const payload = {
        requestId: target.requestId,
        canonicalCode: serviceCode,
        formData: withSecureAttachmentReferences(
          serviceCode,
          valuesRef.current,
          target.attachments,
        ),
        attachmentIds: target.attachments.map((item) => item.attachmentId).sort(),
      };
      const outcome = await performStepUp(stepUpRpcClient, {
        serviceCode,
        requestId: target.requestId,
        userId,
        payload,
      });
      if (outcome.status !== "proof") {
        setStepUpError(outcome.messageAr);
        return;
      }
      setStepUpOpen(false);
      await submit(outcome.proofToken);
    } finally {
      setStepUpBusy(false);
    }
  };

  const submit = async (stepUpProof: string | null) => {
    if (!draft || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    let serverFnInvoked = false;
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // Submit must observe the settled attachment state, never a half-applied one.
      await awaitAttachmentSync();
      const target = draftRef.current ?? draft;
      traceB1Submit("SUBMIT_BEFORE_SAVE", {
        serviceCode,
        requestId: target.requestId,
        ...describeUpdatedAt(target.updatedAt),
      });
      const saved = await adapter.saveB1RequestDraft(
        target.requestId,
        withSecureAttachmentReferences(serviceCode, valuesRef.current, target.attachments),
        target.updatedAt,
      );


      traceB1Submit("SUBMIT_AFTER_SAVE", {
        serviceCode,
        requestId: saved.requestId,
        ...describeUpdatedAt(saved.updatedAt),
      });
      traceB1Submit("SUBMIT_BEFORE_SERVER_FN", {
        serviceCode,
        requestId: saved.requestId,
        ...describeUpdatedAt(saved.updatedAt),
      });
      serverFnInvoked = true;
      traceB1Submit("SUBMIT_SERVER_FN_INVOKED", {
        serviceCode,
        requestId: saved.requestId,
        serverFnInvoked: true,
      });
      const result = await adapter.submitB1Request(saved.requestId, saved.updatedAt, stepUpProof);
      traceB1Submit("SUBMIT_SERVER_FN_RETURNED", {
        serviceCode,
        requestId: result.requestId,
        serverFnInvoked: true,
      });
      setConfirming(false);
      setSuccess({
        requestId: result.requestId,
        requestNumber: result.requestNumber ?? saved.requestNumber,
      });
    } catch (error) {
      traceB1Submit("SUBMIT_THROWN", {
        serviceCode,
        requestId: draft.requestId,
        serverFnInvoked,
        ...describeError(error),
      });
      if (error instanceof B1AdapterError && error.code === "STALE_VERSION") {
        try {
          await reloadDraft(draft.requestId);
        } catch {
          /* keep submit error */
        }
      }
      setFatalError(b1AdapterErrorMessageAr(error));
      setConfirming(false);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const uploadAttachment = async (attachmentKey: string, file: File) => {
    if (!draft) return;
    setUploadingKey(attachmentKey);
    setUploadError(null);
    lastFailedFile.current = { key: attachmentKey, file };
    if (!attachmentsRuntimeAvailable) {
      setUploadError(SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR);
      setUploadingKey(null);
      throw new B1AdapterError("BACKEND_CONTRACT_PENDING", "SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE");
    }
    try {
      const uploaded = await adapter.uploadB1RequestAttachment(
        draft.requestId,
        attachmentKey,
        file,
      );
      const fallback: B1Draft = {
        ...draft,
        attachments: [...draft.attachments, uploaded],
      };
      setDraft(fallback);
      setErrors((current) => {
        const next = { ...current };
        delete next[attachmentKey];
        return next;
      });
      lastFailedFile.current = null;
      // Attachment mutations bump the server version: refetch, then persist the
      // secure reference into form_data so submit can resolve it.
      await syncFormDataAfterAttachmentChange(draft.requestId, fallback);

    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const message = /SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE|create_intent|upload|complete|download/i.test(
        raw,
      )
        ? SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR
        : b1AdapterErrorMessageAr(error);
      setUploadError(message);
      throw error;
    } finally {
      setUploadingKey(null);
    }
  };

  if (success) {
    return (
      <B1SuccessState
        titleAr="تم إرسال الطلب بنجاح"
        bodyAr={`رقم الطلب: ${success.requestNumber}`}
        actionLabelAr="متابعة الطلب"
        onAction={() =>
          void navigate({
            to: routes.b1View,
            params: { requestId: success.requestId },
          })
        }
      />
    );
  }

  if (fatalError && !draft) return <B1ErrorState messageAr={fatalError} onRetry={load} />;
  if (!draft || !options) return <B1LoadingState labelAr="جارٍ إعداد مسودة الطلب…" />;

  const summaryItems = definition.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.type !== "info" && field.type !== "file")
      .map((field) => ({
        labelAr: field.labelAr,
        valueAr: formatValue(
          field,
          displayValue(field, values, options),
          resolveOptions(field, values, options),
        ),
      })),
  );

  const acknowledgmentsAr = definition.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.type === "checkbox" && values[field.name] === true)
      .map((field) => field.labelAr),
  );

  const requiredAcknowledgment = definition.sections
    .flatMap((section) => section.fields)
    .find((field) => field.type === "checkbox" && field.required);

  const errorLabelAr = (name: string) =>
    definition.sections.flatMap((section) => section.fields).find((field) => field.name === name)
      ?.labelAr ??
    definition.requiredAttachments?.find((attachment) => attachment.key === name)?.labelAr ??
    name;

  return (
    <div
      dir="rtl"
      data-testid="b1-student-request-form"
      data-service-code={serviceCode}
      className="space-y-5"
    >
      <B1ServiceHeader
        titleAr={config.titleAr}
        descriptionAr={config.descriptionAr}
        requirementsAlertAr={definition.warnings?.join(" ")}
        feePolicyNoteAr={config.feePolicyLabelAr}
      />
      <B1DraftStatus state={saveState} updatedAt={draft.updatedAt} />
      {fatalError ? (
        <B1ErrorState messageAr={fatalError} onRetry={() => setFatalError(null)} />
      ) : null}
      {!fatalError && transientSaveError ? (
        <div
          role="alert"
          data-testid="b1-transient-save-error"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-bold text-amber-900 dark:text-amber-200"
        >
          <span>{transientSaveError}</span>
          <button
            type="button"
            className="rounded-md border border-amber-500/50 px-3 py-1 text-xs font-extrabold"
            onClick={() => void save(false)}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : null}


      {!reviewing ? (
        <form
          className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-card sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void review();
          }}
        >
          {Object.keys(errors).length > 0 ? (
            <div
              role="alert"
              data-testid="b1-form-error-summary"
              className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p className="font-extrabold">راجع الحقول التالية قبل المتابعة:</p>
              <ul className="list-disc space-y-0.5 ps-5">
                {Object.entries(errors).map(([name, key]) => (
                  <li key={name}>
                    {errorLabelAr(name)}: {b1ValidationMessageAr(key)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {definition.sections.map((section, index) => (
            <fieldset key={section.titleAr ?? index} className="min-w-0">
              {section.titleAr ? (
                <legend className="mb-3 font-bold text-primary">{section.titleAr}</legend>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                {section.fields
                  .filter((field) => field.type !== "file")
                  .map((field) => (
                    <B1Field
                      key={field.name}
                      field={field}
                      value={displayValue(field, values, options)}
                      error={errors[field.name]}
                      options={resolveOptions(field, values, options)}
                      onChange={(value) => changeField(field.name, value)}
                    />
                  ))}
              </div>
            </fieldset>
          ))}

          {definition.requiredAttachments?.map((attachment) => (
            <div key={attachment.key} className="space-y-1">
              <span className="block text-sm font-bold text-primary">
                {attachment.labelAr}
                {attachment.required ? " *" : ""}
              </span>
              {attachmentsRuntimeAvailable ? (
                <B1AttachmentUploader
                  attachments={draft.attachments.filter(
                    (item) => item.attachmentType === attachment.key,
                  )}
                  uploading={uploadingKey === attachment.key}
                  maxSizeMB={MAX_SIZE_MB}
                  onUpload={async (file) => {
                    await uploadAttachment(attachment.key, file);
                  }}
                  onRetry={
                    lastFailedFile.current?.key === attachment.key
                      ? async () => {
                          const pending = lastFailedFile.current;
                          if (!pending) return;
                          await uploadAttachment(pending.key, pending.file);
                        }
                      : undefined
                  }
                  onRemove={async (attachmentId) => {
                    await adapter.removeB1RequestAttachment(draft.requestId, attachmentId);
                    // Removal bumps the request version server-side; refetch and
                    // re-persist so form_data drops the removed secure reference.
                    await syncFormDataAfterAttachmentChange(draft.requestId, {
                      ...draft,
                      attachments: draft.attachments.filter(
                        (item) => item.attachmentId !== attachmentId,
                      ),
                    });
                  }}

                />
              ) : (
                <p role="alert" className="text-xs font-bold text-destructive">
                  {SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR}
                </p>
              )}
              {uploadError && uploadingKey === null ? (
                <p role="alert" className="text-xs font-bold text-destructive">
                  {uploadError}
                </p>
              ) : null}
              {errors[attachment.key] ? (
                <p role="alert" className="text-xs font-bold text-destructive">
                  {b1ValidationMessageAr(errors[attachment.key])}
                </p>
              ) : null}
            </div>
          ))}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={attachmentSyncing || submitting}
              className="min-h-11 rounded-lg border border-primary px-4 text-sm font-bold text-primary disabled:opacity-60"
            >
              حفظ المسودة
            </button>
            <button
              type="submit"
              disabled={attachmentSyncing || uploadingKey !== null || submitting}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              مراجعة الطلب
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <B1RequestSummary
            serviceTitleAr={config.titleAr}
            items={summaryItems}
            attachments={draft.attachments}
            acknowledgmentsAr={acknowledgmentsAr}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="min-h-11 rounded-lg border border-primary px-4 text-sm font-bold text-primary"
            >
              تعديل البيانات
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={attachmentSyncing || submitting}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              إرسال الطلب
            </button>
          </div>
        </div>
      )}

      <B1SubmissionConfirmation
        open={confirming}
        onOpenChange={setConfirming}
        titleAr="تأكيد إرسال الطلب"
        bodyAr="راجع البيانات والمرفقات قبل الإرسال. لن تتمكن من تعديل المسودة بعد الإرسال."
        requireAcknowledgment={Boolean(requiredAcknowledgment)}
        acknowledgmentLabelAr={requiredAcknowledgment?.labelAr}
        submitting={submitting || attachmentSyncing}
        onConfirm={beginSubmit}
      />

      <StepUpConfirmDialog
        open={stepUpOpen}
        onOpenChange={(next) => {
          setStepUpOpen(next);
          if (!next) setStepUpError(null);
        }}
        serviceCode={serviceCode}
        busy={stepUpBusy || submitting}
        errorAr={stepUpError}
        onConfirm={() => void runStepUpThenSubmit()}
      />

    </div>
  );
}

function B1Field({
  field,
  value,
  error,
  options,
  onChange,
}: {
  field: RequestFormFieldDefinition;
  value: unknown;
  error?: string;
  options?: readonly RequestFormFieldOption[];
  onChange: (value: unknown) => void;
}) {
  const fieldId = `b1-field-${field.name}`;
  const errorId = `${fieldId}-error`;
  if (field.type === "info" || field.type === "readonly") {
    return (
      <div className="rounded-lg bg-muted/40 p-3 text-sm">
        <strong>{field.labelAr}: </strong>
        {knownValueLabelAr(value ?? field.defaultValue)}
      </div>
    );
  }
  const common = "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";
  const helperId = field.helperTextAr ? `${fieldId}-helper` : undefined;
  const describedBy =
    [error ? errorId : undefined, helperId].filter(Boolean).join(" ") || undefined;
  const ariaProps = {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": field.required || undefined,
  };
  const errorMessage = error ? (
    <span id={errorId} role="alert" className="block text-xs font-bold text-destructive">
      {b1ValidationMessageAr(error)}
    </span>
  ) : null;
  const helperMessage = field.helperTextAr ? (
    <span id={helperId} className="block text-[11px] text-muted-foreground">
      {field.helperTextAr}
    </span>
  ) : null;

  if (field.type === "checkbox") {
    return (
      <div className="space-y-1 sm:col-span-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-bold text-primary">
          <input
            id={fieldId}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            className="h-5 w-5 shrink-0 accent-primary"
            {...ariaProps}
          />
          <span>
            {field.labelAr}
            {field.required ? " *" : ""}
          </span>
        </label>
        {helperMessage}
        {errorMessage}
      </div>
    );
  }

  if (field.referenceResolverKey === "current_student_enrollments" && (options?.length ?? 0) === 0) {
    return (
      <div
        data-testid="b1-no-current-enrollments"
        className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm sm:col-span-2"
      >
        <div className="font-bold text-amber-900">
          لا توجد مقررات مسجَّلة لك في الفصل الدراسي الحالي
        </div>
        <p className="text-xs leading-relaxed text-amber-900/90">
          طلب «غياب بعذر» يُقدَّم على مقرر محدد، ويعتمد على سجل تسجيلك الأكاديمي في الفصل الحالي.
          سجلّك يُظهر حالياً صفر تسجيلات معتمدة، لذلك لا يمكن اختيار المقرر ولا استكمال الطلب. هذا
          نقص في البيانات المسبقة وليس عطلاً في الخدمة.
        </p>
        <div className="text-xs font-bold text-amber-900">الإجراء المقترح:</div>
        <ol className="list-decimal space-y-1 pe-4 text-xs leading-relaxed text-amber-900/90">
          <li>تأكد من اكتمال تسجيلك للفصل الحالي في النظام الجامعي الرئيسي.</li>
          <li>
            إن كنت مسجلاً فعلياً، راجع قسم شؤون الطلاب أو مسؤول التسجيل في قسمك لاعتماد التسجيل في
            البوابة.
          </li>
          <li>بعد ظهور المقررات في «مقرراتي»، عد إلى هذه الصفحة وأكمل الطلب.</li>
        </ol>
        <p className="text-[11px] text-amber-900/80">
          إن كان الغياب يخص فصلاً سابقاً، قدّم الطلب عبر شؤون الطلاب مباشرة لأن البوابة تغطي الفصل
          الحالي فقط.
        </p>
      </div>
    );
  }

  return (
    <label className={field.type === "textarea" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <span className="block text-sm font-bold text-primary">
        {field.labelAr}
        {field.required ? " *" : ""}
      </span>
      {field.type === "textarea" ? (
        <textarea
          id={fieldId}
          rows={4}
          className={`${common} py-2`}
          value={String(value ?? "")}
          placeholder={field.placeholderAr}
          onChange={(event) => onChange(event.target.value)}
          {...ariaProps}
        />
      ) : field.type === "select" ? (
        <select
          id={fieldId}
          className={common}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          {...ariaProps}
        >
          <option value="">اختر…</option>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.labelAr}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={fieldId}
          type={field.type === "date" ? "date" : "text"}
          dir={field.type === "date" ? "ltr" : "rtl"}
          className={common}
          value={String(value ?? "")}
          placeholder={field.placeholderAr}
          onChange={(event) => onChange(event.target.value)}
          {...ariaProps}
        />
      )}
      {helperMessage}
      {errorMessage}
    </label>
  );
}

/** Distinguish repeated course labels by their group order (مجموعة ١، ٢ …). */
function disambiguateEnrollmentOptions(
  options: readonly RequestFormFieldOption[],
): readonly RequestFormFieldOption[] {
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.labelAr, (counts.get(option.labelAr) ?? 0) + 1);
  const seen = new Map<string, number>();
  return options.map((option) => {
    if ((counts.get(option.labelAr) ?? 0) < 2) return option;
    const index = (seen.get(option.labelAr) ?? 0) + 1;
    seen.set(option.labelAr, index);
    return { ...option, labelAr: `${option.labelAr} — مجموعة ${index}` };
  });
}

function resolveOptions(
  field: RequestFormFieldDefinition,
  values: Record<string, unknown>,
  options: B1FormOptions,
) {
  const dependency = String(values[field.referenceDependsOnField ?? ""] ?? "");
  if (field.referenceResolverKey === "academic_years") return options.academicYears;
  if (field.referenceResolverKey === "semesters_for_year")
    return options.semestersByYear[dependency] ?? [];
  if (field.referenceResolverKey === "current_student_enrollments")
    return disambiguateEnrollmentOptions(options.currentEnrollments);
  if (field.referenceResolverKey === "available_departments")
    // The backend rejects transferring into the current department, so it must
    // never appear as a target choice.
    return options.availableDepartments.filter(
      (option) => option.labelAr !== options.currentDepartmentLabelAr,
    );
  if (field.referenceResolverKey === "available_programs")
    return options.programsByDepartment[dependency] ?? [];
  return field.options;
}

function knownValueLabelAr(value: unknown): string {
  const raw = String(value ?? "—");
  return B1_KNOWN_VALUE_LABELS_AR[raw] ?? raw;
}

function formatValue(
  field: RequestFormFieldDefinition,
  value: unknown,
  options?: readonly RequestFormFieldOption[],
) {
  if (field.type === "checkbox") return value === true ? "نعم" : "لا";
  const resolved = options ?? field.options;
  const label = resolved?.find((option) => option.value === value)?.labelAr;
  if (label) return label;
  if (field.type === "date" && typeof value === "string" && value) return formatB1DateAr(value);
  return knownValueLabelAr(value);
}

function displayValue(
  field: RequestFormFieldDefinition,
  values: Record<string, unknown>,
  options: B1FormOptions,
) {
  const value = values[field.name];
  if (value !== undefined && value !== null && String(value) !== "") return value;
  if (field.name === "current_department")
    return options.currentDepartmentLabelAr ?? field.defaultValue;
  if (field.name === "current_program") return options.currentProgramLabelAr ?? field.defaultValue;
  return value ?? field.defaultValue;
}
