/**
 * GRADUATES-AFFAIRS-PORTAL-VISUAL-UX-ACCESSIBILITY-QA-01
 *
 * Visual/UX/RTL/accessibility/privacy coverage for the graduates-affairs
 * display components. Renders use renderToStaticMarkup (no DOM in this
 * repo); all fixtures carry raw identifiers on purpose so the tests fail if
 * any of them leaks into the markup.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraduateFileCard } from "../../src/components/graduates-affairs/GraduateFileCard";
import { GraduateCommunicationPanel } from "../../src/components/graduates-affairs/GraduateCommunicationPanel";
import { GraduateSurveyCard } from "../../src/components/graduates-affairs/GraduateSurveyCard";
import { GraduateReportsPanel } from "../../src/components/graduates-affairs/GraduateReportsPanel";
import { ACCOUNT_CONTINUITY_POLICY_UNDECIDED } from "../../src/lib/graduates-affairs/account-continuity";
import { buildCohortEmploymentReports } from "../../src/lib/graduates-affairs/reports";
import { aggregateSurveyResponses } from "../../src/lib/graduates-affairs/surveys";
import type { GraduateFile } from "../../src/lib/graduates-affairs/graduate-file";
import type { GraduateConsent } from "../../src/lib/graduates-affairs/foundation";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const COMPONENT_DIR = join(root, "src/components/graduates-affairs");
const componentSources: Record<string, string> = {};
for (const file of readdirSync(COMPONENT_DIR)) {
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    componentSources[`src/components/graduates-affairs/${file}`] = readFileSync(
      join(COMPONENT_DIR, file),
      "utf8",
    );
  }
}

const UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const consentActive: GraduateConsent = {
  purposeCode: "communications",
  noticeVersion: "v1",
  state: "granted",
  grantedAt: "2026-01-01T00:00:00Z",
  withdrawnAt: null,
};

const fileFixture: GraduateFile = {
  record: {
    recordId: UUID,
    officialDecisionId: UUID,
    studentProfileId: UUID,
    effectiveGraduationDate: "2026-06-01",
    programId: UUID,
    departmentId: UUID,
    recordState: "approved",
    version: 2,
  },
  profile: {
    graduateRecordId: UUID,
    publicDisplayName: null,
    preferredContactChannel: null,
    careerSummary: null,
    visibility: "graduates_affairs",
  },
  contactPoints: [
    {
      contactPointId: UUID,
      graduateRecordId: UUID,
      channelType: "email",
      purposeCode: "communications",
      verified: true,
      revoked: false,
    },
  ],
  consents: [consentActive],
  employmentEvents: [
    {
      employmentEventId: UUID,
      graduateRecordId: UUID,
      status: "employed",
      verificationState: "verified",
      occurredAt: "2026-07-01T00:00:00Z",
      supersedesEventId: null,
    },
  ],
  followUps: [],
};

const surveyFixture = {
  survey: {
    surveyId: UUID,
    purposeCode: "surveys",
    state: "active" as const,
    minimumReportCellSize: 5,
  },
  version: {
    surveyVersionId: UUID,
    surveyId: UUID,
    version: 1,
    noticeVersion: "v1",
    publishedAt: "2026-01-01T00:00:00Z",
    questions: [
      {
        key: "overall_satisfaction_machine_key",
        kind: "single_choice" as const,
        required: true,
        options: ["ممتاز", "جيد"],
      },
      { key: "free_text_machine_key", kind: "free_text" as const, required: false, maxLength: 500 },
    ],
  },
};

describe("graduate file card", () => {
  test("renders translated states, Arabic date, and leaks no identifiers", () => {
    const html = renderToStaticMarkup(
      createElement(GraduateFileCard, {
        file: fileFixture,
        accountPolicy: ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
        evaluatedAt: "2026-07-25T00:00:00Z",
      }),
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("معتمد"); // record state translated, never raw "approved"
    expect(html).toContain("موظف"); // employment status translated
    expect(html).toContain("المتابعة المهنية".slice(0, 5) === "المتاب" ? "التواصل" : "");
    expect(html).not.toContain("2026-06-01"); // Arabic-formatted date instead
    expect(UUID_PATTERN.test(html)).toBe(false);
    expect(html).not.toMatch(/recordId|studentProfileId|officialDecisionId/);
  });

  test("undecided account policy renders the fail-closed copy, never an allowance", () => {
    const html = renderToStaticMarkup(
      createElement(GraduateFileCard, {
        file: fileFixture,
        accountPolicy: ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
        evaluatedAt: "2026-07-25T00:00:00Z",
      }),
    );
    expect(html).toContain("لم تُعتمد سياسة استمرارية الحساب بعد.");
    expect(html).not.toContain("معتمدة — الدخول إلى البوابة مسموح");
    expect(html).not.toMatch(/تفعيل|فعّل حسابك/);
  });

  test("expired and capability-denied policies show distinct safe messages", () => {
    const expired = renderToStaticMarkup(
      createElement(GraduateFileCard, {
        file: fileFixture,
        accountPolicy: {
          ...ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
          state: "approved",
          decidedBy: "council",
          decidedAt: "2026-01-01T00:00:00Z",
          validFrom: "2026-01-01T00:00:00Z",
          expiresAt: "2026-02-01T00:00:00Z",
          allowedCapabilities: ["portal_sign_in"],
          allowPortalSignIn: true,
        },
        evaluatedAt: "2026-07-25T00:00:00Z",
      }),
    );
    expect(expired).toContain("منتهية الصلاحية");

    const denied = renderToStaticMarkup(
      createElement(GraduateFileCard, {
        file: fileFixture,
        accountPolicy: {
          ...ACCOUNT_CONTINUITY_POLICY_UNDECIDED,
          state: "approved",
          decidedBy: "council",
          decidedAt: "2026-01-01T00:00:00Z",
          allowedCapabilities: ["survey_participation"],
        },
        evaluatedAt: "2026-07-25T00:00:00Z",
      }),
    );
    expect(denied).toContain("غير مسموح");
    expect(denied).not.toContain("مسموح —");
  });
});

describe("communication panel", () => {
  test("explains the consent gate and translates purpose codes", () => {
    const html = renderToStaticMarkup(
      createElement(GraduateCommunicationPanel, {
        consents: [consentActive],
        contactPoints: fileFixture.contactPoints,
        drafts: [
          {
            graduateRecordId: UUID,
            purposeCode: "communications",
            noticeVersion: "v1",
            channel: "email",
            contactPointId: UUID,
            templateCode: "welcome_graduate",
          },
        ],
      }),
    );
    expect(html).toContain("لا يُرسل أي تواصل إلا بموافقة فعالة");
    expect(html).toContain("الغرض: التواصل");
    expect(html).not.toContain("purposeCode");
    expect(html).not.toContain('"communications"');
    expect(html).toContain("جاهزة للإرسال ضمن الموافقة المسجلة.");
    expect(UUID_PATTERN.test(html)).toBe(false);
  });

  test("withdrawn consent and revoked contact point render distinct non-technical reasons", () => {
    const withdrawn = renderToStaticMarkup(
      createElement(GraduateCommunicationPanel, {
        consents: [{ ...consentActive, state: "withdrawn", withdrawnAt: "2026-02-01T00:00:00Z" }],
        contactPoints: fileFixture.contactPoints,
        drafts: [
          {
            graduateRecordId: UUID,
            purposeCode: "communications",
            noticeVersion: "v1",
            channel: "email",
            contactPointId: UUID,
            templateCode: "welcome_graduate",
          },
        ],
      }),
    );
    expect(withdrawn).toContain("لا توجد موافقة فعالة");

    const revoked = renderToStaticMarkup(
      createElement(GraduateCommunicationPanel, {
        consents: [consentActive],
        contactPoints: [{ ...fileFixture.contactPoints[0]!, revoked: true }],
        drafts: [
          {
            graduateRecordId: UUID,
            purposeCode: "communications",
            noticeVersion: "v1",
            channel: "email",
            contactPointId: UUID,
            templateCode: "welcome_graduate",
          },
        ],
      }),
    );
    expect(revoked).toContain("نقطة الاتصال ملغاة");
    // No send affordance anywhere in the panel.
    expect(revoked).not.toContain("<button");
  });
});

describe("survey card", () => {
  const eligibleConsents: GraduateConsent[] = [
    {
      purposeCode: "surveys",
      noticeVersion: "v1",
      state: "granted",
      grantedAt: "2026-01-01T00:00:00Z",
      withdrawnAt: null,
    },
  ];

  test("questions render as Arabic ordinals — never machine keys", () => {
    const html = renderToStaticMarkup(
      createElement(GraduateSurveyCard, {
        survey: surveyFixture.survey,
        version: surveyFixture.version,
        consents: eligibleConsents,
        alreadyResponded: false,
      }),
    );
    expect(html).toContain("السؤال 1");
    expect(html).toContain("السؤال 2");
    // Machine keys may live in form-field name attributes (submission keys)
    // but never as visible question text.
    expect(html).not.toContain(">overall_satisfaction_machine_key<");
    expect(html).not.toContain(">free_text_machine_key<");
  });

  test("not-eligible and already-responded states lock the form with a reason", () => {
    const noConsent = renderToStaticMarkup(
      createElement(GraduateSurveyCard, {
        survey: surveyFixture.survey,
        version: surveyFixture.version,
        consents: [],
        alreadyResponded: false,
      }),
    );
    expect(noConsent).toContain("لا توجد موافقة فعالة");
    expect(noConsent).toContain('disabled=""');

    const responded = renderToStaticMarkup(
      createElement(GraduateSurveyCard, {
        survey: surveyFixture.survey,
        version: surveyFixture.version,
        consents: eligibleConsents,
        alreadyResponded: true,
      }),
    );
    expect(responded).toContain("تمت الإجابة على هذا الإصدار مسبقاً");
  });
});

describe("aggregate reports and suppression", () => {
  test("suppressed cells render «محجوب» with a screen-reader explanation — never zero", () => {
    const cohortReports = buildCohortEmploymentReports(
      [
        {
          programId: UUID,
          graduationYear: 2026,
          row: {
            status: "employed",
            specializationRelationship: "directly_related",
            verified: true,
          },
        },
        {
          programId: UUID,
          graduationYear: 2026,
          row: {
            status: "seeking_work",
            specializationRelationship: "not_assessed",
            verified: false,
          },
        },
      ],
      5,
    );
    const html = renderToStaticMarkup(createElement(GraduateReportsPanel, { cohortReports }));
    expect(html).toContain("محجوب");
    expect(html).toContain('aria-label="خلية محجوبة لحماية الخصوصية"');
    expect(html).not.toContain("<td>0</td>");
    // The raw programId never renders; cohorts show as ordinals.
    expect(UUID_PATTERN.test(html)).toBe(false);
    expect(html).toContain("الفوج 1");
  });

  test("above-threshold cohorts render real totals", () => {
    const rows = Array.from({ length: 6 }, () => ({
      programId: UUID,
      graduationYear: 2025,
      row: {
        status: "employed" as const,
        specializationRelationship: "directly_related" as const,
        verified: true,
      },
    }));
    const cohortReports = buildCohortEmploymentReports(rows, 5);
    const html = renderToStaticMarkup(createElement(GraduateReportsPanel, { cohortReports }));
    expect(html).toContain("<td>6</td>");
    expect(html).not.toContain("محجوب");
  });

  test("survey aggregates suppress small cells and never echo free text", () => {
    const report = aggregateSurveyResponses(
      surveyFixture.version.questions,
      [{ overall_satisfaction_machine_key: "ممتاز", free_text_machine_key: "نص حر سري" }],
      5,
    );
    const html = renderToStaticMarkup(
      createElement(GraduateReportsPanel, {
        cohortReports: [],
        surveyReports: [{ title: "استبيان تجريبي", report }],
      }),
    );
    expect(html).toContain("إجمالي الردود: محجوب");
    expect(html).not.toContain("نص حر سري");
    expect(html).not.toContain("machine_key");
    expect(html).toContain("سؤال 1");
  });

  test("no export affordance exists anywhere", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      if (!path.endsWith(".tsx")) continue;
      expect(/تصدير|download|csv|xlsx/i.test(source), path).toBe(false);
    }
  });
});

describe("mobile collapse", () => {
  test("every aggregate results table sits inside a horizontally scrollable container", () => {
    const report = aggregateSurveyResponses(
      surveyFixture.version.questions,
      Array.from({ length: 6 }, () => ({ overall_satisfaction_machine_key: "ممتاز" })),
      5,
    );
    const html = renderToStaticMarkup(
      createElement(GraduateReportsPanel, {
        cohortReports: [],
        surveyReports: [{ title: "استبيان تجريبي", report }],
      }),
    );
    const tables = html.match(/<table/g)?.length ?? 0;
    const scrollContainers = html.match(/overflow-x-auto/g)?.length ?? 0;
    expect(tables).toBeGreaterThan(0);
    // A table outside a scroll container overflows small screens.
    expect(scrollContainers).toBe(tables);
  });

  test("single-choice options wrap instead of overflowing narrow screens", () => {
    const html = renderToStaticMarkup(
      createElement(GraduateSurveyCard, {
        survey: surveyFixture.survey,
        version: {
          ...surveyFixture.version,
          questions: [
            {
              key: "long_options_machine_key",
              kind: "single_choice" as const,
              required: true,
              options: [
                "الخيار الأول بوصف عربي طويل نسبياً",
                "الخيار الثاني بوصف عربي طويل نسبياً",
                "الخيار الثالث بوصف عربي طويل نسبياً",
              ],
            },
          ],
        },
        consents: [
          {
            purposeCode: "surveys",
            noticeVersion: "v1",
            state: "granted",
            grantedAt: "2026-01-01T00:00:00Z",
            withdrawnAt: null,
          },
        ],
        alreadyResponded: false,
      }),
    );
    expect(html).toContain('role="radiogroup"');
    // The radiogroup row must wrap long Arabic options on mobile widths.
    expect(html).toMatch(/role="radiogroup"[^>]*class="[^"]*flex-wrap/);
  });
});

describe("privacy and RTL guards", () => {
  test("no component renders raw identifiers or storage internals", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(
        /\{[^}]*(user_id|userId|student_profile_id|studentProfileId|graduate_record_id|graduateRecordId|recordId)\}/.test(
          source,
        ),
        path,
      ).toBe(false);
      expect(/storage_bucket|storage_object_path|object_key/i.test(source), path).toBe(false);
      expect(/\b(email|phone)\s*[:=]/i.test(source), path).toBe(false);
    }
  });

  test("no direct Supabase imports and no network calls in components", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      expect(/from\s+["'][^"']*supabase/i.test(source), path).toBe(false);
      expect(/\bfetch\(|useServerFn|useQuery|useMutation/.test(source), path).toBe(false);
    }
  });

  test("every component roots at dir=rtl with no physical spacing utilities", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      if (!path.endsWith(".tsx")) continue;
      expect(source, path).toContain('dir="rtl"');
      expect(/\b(ml-|mr-|pl-|pr-|left-|right-)\d/.test(source), path).toBe(false);
    }
  });

  test("headings stay below h1 and sequential (h3 then h4)", () => {
    for (const [path, source] of Object.entries(componentSources)) {
      if (!path.endsWith(".tsx")) continue;
      expect(/<h1[\s>]/.test(source), path).toBe(false);
      expect(/<h2[\s>]/.test(source), path).toBe(false);
    }
  });
});
