import {
  hasActivePurposeConsent,
  privacySafeCount,
  type GraduateConsent,
  type PrivacySafeMetric,
} from "./foundation";

/**
 * Graduate survey contracts. Responses are consent-gated (purpose + notice
 * version, mirroring `graduate_survey_response_consent_guard`), one response
 * per graduate per published version, and results are only ever aggregate:
 * the aggregation input deliberately carries answers only, never respondent
 * identity.
 */

export type SurveyQuestionKind = "single_choice" | "free_text";

export interface SurveyQuestion {
  key: string;
  kind: SurveyQuestionKind;
  required: boolean;
  options?: readonly string[];
  maxLength?: number;
}

export const SURVEY_FREE_TEXT_DEFAULT_MAX_LENGTH = 2000;

export type SurveyState = "draft" | "active" | "closed" | "archived";

export interface GraduateSurveyView {
  surveyId: string;
  purposeCode: string;
  state: SurveyState;
  minimumReportCellSize: number;
}

export interface GraduateSurveyVersionView {
  surveyVersionId: string;
  surveyId: string;
  version: number;
  noticeVersion: string;
  questions: readonly SurveyQuestion[];
  publishedAt: string | null;
}

/** Latest published version of a survey, or null when none is published. */
export function resolveActiveSurveyVersion(
  survey: GraduateSurveyView,
  versions: readonly GraduateSurveyVersionView[],
): GraduateSurveyVersionView | null {
  return (
    versions
      .filter((version) => version.surveyId === survey.surveyId && version.publishedAt !== null)
      .toSorted((left, right) => right.version - left.version)
      .at(0) ?? null
  );
}

export type SurveyEligibility = { ok: true } | { ok: false; reason: string };

export function evaluateSurveyResponseEligibility(input: {
  survey: GraduateSurveyView;
  version: GraduateSurveyVersionView;
  consents: readonly GraduateConsent[];
  alreadyResponded: boolean;
}): SurveyEligibility {
  const { survey, version, consents, alreadyResponded } = input;
  if (version.surveyId !== survey.surveyId) {
    return { ok: false, reason: "survey_version_mismatch" };
  }
  if (survey.state !== "active") {
    return { ok: false, reason: "survey_not_active" };
  }
  if (version.publishedAt === null) {
    return { ok: false, reason: "survey_version_not_published" };
  }
  if (!hasActivePurposeConsent(consents, survey.purposeCode, version.noticeVersion)) {
    return { ok: false, reason: "missing_active_survey_consent" };
  }
  if (alreadyResponded) {
    return { ok: false, reason: "duplicate_survey_response" };
  }
  return { ok: true };
}

export type SurveyAnswers = Readonly<Record<string, unknown>>;

export type SurveyAnswersValidation = { ok: true } | { ok: false; errors: string[] };

/** Validates draft answers against the published question contract. */
export function validateSurveyAnswers(
  questions: readonly SurveyQuestion[],
  answers: SurveyAnswers,
): SurveyAnswersValidation {
  const errors: string[] = [];
  const knownKeys = new Set(questions.map((question) => question.key));
  for (const key of Object.keys(answers)) {
    if (!knownKeys.has(key)) {
      errors.push(`unknown_question_key:${key}`);
    }
  }
  for (const question of questions) {
    const value = answers[question.key];
    const answered = value !== undefined && value !== null && value !== "";
    if (question.required && !answered) {
      errors.push(`required_question_unanswered:${question.key}`);
      continue;
    }
    if (!answered) {
      continue;
    }
    if (question.kind === "single_choice") {
      if (typeof value !== "string" || !(question.options ?? []).includes(value)) {
        errors.push(`invalid_choice:${question.key}`);
      }
    } else {
      const maxLength = question.maxLength ?? SURVEY_FREE_TEXT_DEFAULT_MAX_LENGTH;
      if (typeof value !== "string" || value.length > maxLength) {
        errors.push(`free_text_too_long:${question.key}`);
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export interface ChoiceDistribution {
  option: string;
  metric: PrivacySafeMetric;
}

export interface QuestionAggregate {
  key: string;
  kind: SurveyQuestionKind;
  /** Number of responses that answered this question (suppressed when small). */
  responded: PrivacySafeMetric;
  /** Choice distribution for single_choice questions; empty for free text. */
  distribution: readonly ChoiceDistribution[];
}

export interface SurveyAggregateReport {
  minimumCellSize: number;
  totalResponses: PrivacySafeMetric;
  questions: readonly QuestionAggregate[];
}

/**
 * Builds the aggregate-only result of one survey version. Free-text answers
 * are counted, never echoed; every cell below the minimum size is suppressed.
 * The `responses` parameter is answers-only by design so row-level identity
 * cannot leak into the report.
 */
export function aggregateSurveyResponses(
  questions: readonly SurveyQuestion[],
  responses: readonly SurveyAnswers[],
  minimumCellSize = 5,
): SurveyAggregateReport {
  const aggregates: QuestionAggregate[] = questions.map((question) => {
    const answered = responses.filter(
      (answers) =>
        answers[question.key] !== undefined &&
        answers[question.key] !== null &&
        answers[question.key] !== "",
    );
    const distribution: ChoiceDistribution[] =
      question.kind === "single_choice"
        ? (question.options ?? []).map((option) => ({
            option,
            metric: privacySafeCount(
              answered.filter((answers) => answers[question.key] === option),
              minimumCellSize,
            ),
          }))
        : [];
    return {
      key: question.key,
      kind: question.kind,
      responded: privacySafeCount(answered, minimumCellSize),
      distribution,
    };
  });
  return {
    minimumCellSize,
    totalResponses: privacySafeCount(responses, minimumCellSize),
    questions: aggregates,
  };
}
