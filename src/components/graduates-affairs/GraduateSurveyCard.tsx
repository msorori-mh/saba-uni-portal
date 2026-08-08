import { useState } from "react";
import {
  evaluateSurveyResponseEligibility,
  validateSurveyAnswers,
  type GraduateSurveyVersionView,
  type GraduateSurveyView,
  type SurveyAnswers,
} from "@/lib/graduates-affairs/surveys";
import type { GraduateConsent } from "@/lib/graduates-affairs/foundation";

const ELIGIBILITY_LABELS: Record<string, string> = {
  survey_version_mismatch: "إصدار الاستبيان لا يطابق الاستبيان",
  survey_not_active: "الاستبيان غير مفعّل حالياً",
  survey_version_not_published: "إصدار الاستبيان غير منشور",
  missing_active_survey_consent: "لا توجد موافقة فعالة على غرض الاستبيان وإصدار إشعاره",
  duplicate_survey_response: "تمت الإجابة على هذا الإصدار مسبقاً",
};

const ANSWER_ERROR_LABELS: Record<string, string> = {
  required_question_unanswered: "سؤال إلزامي بلا إجابة",
  invalid_choice: "اختيار غير صالح",
  free_text_too_long: "النص يتجاوز الحد المسموح",
  unknown_question_key: "سؤال غير معروف",
};

function answerErrorLabel(error: string): string {
  const [kind, key] = error.split(":");
  return `${ANSWER_ERROR_LABELS[kind] ?? kind}${key ? ` (${key})` : ""}`;
}

/**
 * Graduate survey card. Composes a draft answer locally and validates it
 * against the published question contract; submission is delegated to the
 * caller (no network here), and the SQL consent guard stays the boundary.
 */
export function GraduateSurveyCard(props: {
  survey: GraduateSurveyView;
  version: GraduateSurveyVersionView;
  consents: readonly GraduateConsent[];
  alreadyResponded: boolean;
  onSubmitDraft?: (answers: SurveyAnswers) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const eligibility = evaluateSurveyResponseEligibility({
    survey: props.survey,
    version: props.version,
    consents: props.consents,
    alreadyResponded: props.alreadyResponded,
  });

  const submit = () => {
    if (submitted) return;
    const result = validateSurveyAnswers(props.version.questions, answers);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSubmitted(true);
    props.onSubmitDraft?.(answers);
  };

  const locked = !eligibility.ok || submitted;

  return (
    <section dir="rtl" aria-labelledby="graduate-survey-title" className="rounded-lg border p-4">
      <h3 id="graduate-survey-title" className="font-semibold">
        استبيان — إصدار {props.version.version}
      </h3>
      {!eligibility.ok && (
        <p className="mt-2 text-amber-700" role="status">
          لا يمكن الإجابة: {ELIGIBILITY_LABELS[eligibility.reason] ?? eligibility.reason}
        </p>
      )}
      <fieldset disabled={locked} className="mt-2 space-y-3">
        {props.version.questions.map((question, index) => {
          const questionLabel = `السؤال ${index + 1}`;
          return (
            <div key={question.key}>
              <p className="text-sm font-medium">
                {questionLabel}
                {question.required ? <span aria-hidden="true"> *</span> : null}
                {question.required ? <span className="sr-only"> (إلزامي)</span> : null}
              </p>
              {question.kind === "single_choice" ? (
                <div role="radiogroup" aria-label={questionLabel} className="mt-1 flex gap-4">
                  {(question.options ?? []).map((option) => (
                    <label key={option} className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        name={question.key}
                        value={option}
                        checked={answers[question.key] === option}
                        onChange={() =>
                          setAnswers((current) => ({ ...current, [question.key]: option }))
                        }
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  aria-label={questionLabel}
                  className="mt-1 w-full rounded border p-1 text-sm"
                  maxLength={question.maxLength}
                  value={answers[question.key] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [question.key]: event.target.value }))
                  }
                />
              )}
            </div>
          );
        })}
      </fieldset>
      {errors.length > 0 && (
        <ul
          className="mt-2 list-disc ps-5 text-sm text-red-700"
          aria-label="أخطاء الإجابة"
          role="alert"
        >
          {errors.map((error) => (
            <li key={error}>{answerErrorLabel(error)}</li>
          ))}
        </ul>
      )}
      {submitted && (
        <p className="mt-2 text-sm text-green-700" role="status">
          تم استلام إجابتك. لا يمكن إرسالها مرة أخرى.
        </p>
      )}
      <button
        type="button"
        className="mt-3 min-h-11 rounded border px-3 py-1 text-sm disabled:opacity-50"
        disabled={locked}
        onClick={submit}
      >
        إرسال الإجابة
      </button>
    </section>
  );
}
