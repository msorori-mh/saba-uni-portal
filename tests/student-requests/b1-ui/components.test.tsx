/**
 * B1 shared UI components — static render + source-level guard tests.
 *
 * Render strategy: renderToStaticMarkup (no DOM). The confirmation dialog
 * (Radix portal) renders nothing server-side by design, so it is verified
 * with a no-throw render plus source-level assertions.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  B1AttachmentMeta,
  B1WorkflowStepView,
} from "@/lib/student-requests/b1-ui/adapter.types";
import {
  B1AttachmentUploader,
  B1DraftStatus,
  B1EmployeeActionPanel,
  B1EmptyState,
  B1ErrorState,
  B1LoadingState,
  B1RequestStatusCard,
  B1RequestSummary,
  B1ServiceHeader,
  B1SubmissionConfirmation,
  B1SuccessState,
  B1WorkflowTimeline,
} from "@/components/student-requests/b1";

const ROOT = join(import.meta.dir, "../../..");
const COMPONENTS_DIR = join(ROOT, "src/components/student-requests/b1");

const ATTACHMENTS: readonly B1AttachmentMeta[] = [
  {
    attachmentId: "att-1",
    attachmentType: "medical_report",
    fileName: "تقرير-طبي.pdf",
    fileSizeBytes: 245_760,
    mimeType: "application/pdf",
    status: "attached",
    storageRef: "bucket/opaque-ref-1",
  },
  {
    attachmentId: "att-2",
    attachmentType: "personal_photo",
    fileName: "صورة-شخصية.png",
    fileSizeBytes: 1_572_864,
    mimeType: "image/png",
    status: "uploading",
    storageRef: "bucket/opaque-ref-2",
  },
];

const TIMELINE_STEPS: readonly B1WorkflowStepView[] = [
  {
    key: "intake",
    unit: "student_affairs",
    role: "student_affairs_specialist",
    action: "review",
    labelAr: "المراجعة الأولية",
    status: "completed",
    actedAt: "2026-01-10T09:30:00.000Z",
    commentAr: "تمت المراجعة واستيفاء الشروط.",
  },
  {
    key: "manager",
    unit: "student_affairs",
    role: "student_affairs_manager",
    action: "approve",
    labelAr: "اعتماد المدير",
    status: "active",
  },
  {
    key: "apply",
    unit: "registrar",
    role: "registrar_general",
    action: "apply_decision",
    labelAr: "تطبيق القرار",
    status: "pending",
  },
];

describe("B1ServiceHeader", () => {
  it("renders title, description, rtl and testid", () => {
    const html = renderToStaticMarkup(
      createElement(B1ServiceHeader, {
        titleAr: "طلب تأجيل قيد",
        descriptionAr: "خدمة تقديم طلب تأجيل القيد للفصل الدراسي.",
      }),
    );
    expect(html).toContain('data-testid="b1-service-header"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("طلب تأجيل قيد");
    expect(html).toContain("خدمة تقديم طلب تأجيل القيد للفصل الدراسي.");
    expect(html).not.toContain('role="alert"');
  });

  it("renders requirements alert and fee note when provided", () => {
    const html = renderToStaticMarkup(
      createElement(B1ServiceHeader, {
        titleAr: "طلب فرصة أخيرة",
        descriptionAr: "وصف الخدمة.",
        requirementsAlertAr: "يجب إرفاق تقرير طبي معتمد.",
        feePolicyNoteAr: "السداد يتم في النظام الجامعي الرئيسي.",
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("يجب إرفاق تقرير طبي معتمد.");
    expect(html).toContain("السداد يتم في النظام الجامعي الرئيسي.");
  });
});

describe("B1DraftStatus", () => {
  it("renders all four states with aria-live", () => {
    const expected: Record<string, string> = {
      draft: "مسودة",
      saving: "جارٍ الحفظ",
      saved: "محفوظ",
      save_failed: "فشل الحفظ",
    };
    for (const [state, label] of Object.entries(expected)) {
      const html = renderToStaticMarkup(
        createElement(B1DraftStatus, {
          state: state as "draft" | "saving" | "saved" | "save_failed",
        }),
      );
      expect(html).toContain('data-testid="b1-draft-status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain(label);
    }
  });

  it("renders updatedAt when provided", () => {
    const html = renderToStaticMarkup(
      createElement(B1DraftStatus, {
        state: "saved" as const,
        updatedAt: "2026-01-10T09:30:00.000Z",
      }),
    );
    expect(html).toContain("آخر تحديث");
  });
});

describe("B1WorkflowTimeline", () => {
  it("renders completed/active/pending states in a semantic list", () => {
    const html = renderToStaticMarkup(createElement(B1WorkflowTimeline, { steps: TIMELINE_STEPS }));
    expect(html).toContain('data-testid="b1-workflow-timeline"');
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("المراجعة الأولية");
    expect(html).toContain("اعتماد المدير");
    expect(html).toContain("تطبيق القرار");
    expect(html).toContain("مكتملة");
    expect(html).toContain("المرحلة الحالية");
    expect(html).toContain("معلقة");
    expect(html).toContain("تمت المراجعة واستيفاء الشروط.");
    expect(html).toContain("بتاريخ:");
  });

  it("renders returned and rejected states", () => {
    const steps: readonly B1WorkflowStepView[] = [
      { ...TIMELINE_STEPS[0], key: "r1", status: "returned", labelAr: "مرحلة معادة" },
      { ...TIMELINE_STEPS[1], key: "r2", status: "rejected", labelAr: "مرحلة مرفوضة" },
    ];
    const html = renderToStaticMarkup(createElement(B1WorkflowTimeline, { steps }));
    expect(html).toContain("معادة");
    expect(html).toContain("مرفوضة");
    expect(html).toContain("مرحلة معادة");
    expect(html).toContain("مرحلة مرفوضة");
  });
});

describe("B1AttachmentUploader", () => {
  it("renders attachment names, sizes and statuses without any URL", () => {
    const html = renderToStaticMarkup(
      createElement(B1AttachmentUploader, {
        attachments: ATTACHMENTS,
        onUpload: () => undefined,
        onRemove: () => undefined,
      }),
    );
    expect(html).toContain('data-testid="b1-attachment-uploader"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("تقرير-طبي.pdf");
    expect(html).toContain("صورة-شخصية.png");
    expect(html).toContain("مرفق");
    expect(html).toContain("جارٍ الرفع");
    // Never leak storage references or links. lucide SVGs carry an xmlns
    // attribute, so assert on link/href/src forms rather than bare "http".
    expect(html).not.toMatch(/(?:href|src)="https?:/);
    expect(html).not.toContain("opaque-ref");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
  });

  it("renders default accept and delete buttons", () => {
    const html = renderToStaticMarkup(
      createElement(B1AttachmentUploader, {
        attachments: ATTACHMENTS,
        onUpload: () => undefined,
        onRemove: () => undefined,
      }),
    );
    expect(html).toContain('accept=".pdf,.png,.jpg,.jpeg"');
    expect(html).toContain("حذف المرفق تقرير-طبي.pdf");
    expect(html).toContain("إرفاق ملف");
  });

  it("disables controls when disabled", () => {
    const html = renderToStaticMarkup(
      createElement(B1AttachmentUploader, {
        attachments: ATTACHMENTS,
        onUpload: () => undefined,
        onRemove: () => undefined,
        disabled: true,
      }),
    );
    expect(html).toContain("disabled");
  });

  it("shows uploading progress state", () => {
    const html = renderToStaticMarkup(
      createElement(B1AttachmentUploader, {
        attachments: [],
        onUpload: () => undefined,
        onRemove: () => undefined,
        uploading: true,
      }),
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("جارٍ رفع الملف");
  });
});

describe("B1RequestSummary", () => {
  it("renders items, attachment names and acknowledgments", () => {
    const html = renderToStaticMarkup(
      createElement(B1RequestSummary, {
        serviceTitleAr: "طلب تأجيل قيد",
        items: [
          { labelAr: "العام الجامعي", valueAr: "2025-2026" },
          { labelAr: "الفصل", valueAr: "الأول" },
        ],
        attachments: ATTACHMENTS,
        acknowledgmentsAr: ["أقر بصحة البيانات المدخلة."],
      }),
    );
    expect(html).toContain('data-testid="b1-request-summary"');
    expect(html).toContain("ملخص الطلب — طلب تأجيل قيد");
    expect(html).toContain("العام الجامعي");
    expect(html).toContain("2025-2026");
    expect(html).toContain("تقرير-طبي.pdf");
    expect(html).toContain("أقر بصحة البيانات المدخلة.");
    expect(html).not.toMatch(/(?:href|src)="https?:/);
  });
});

describe("B1SubmissionConfirmation", () => {
  it("renders without throwing (Radix portal is empty in static SSR)", () => {
    const html = renderToStaticMarkup(
      createElement(B1SubmissionConfirmation, {
        open: true,
        onOpenChange: () => undefined,
        titleAr: "تأكيد تقديم الطلب",
        bodyAr: "سيتم إرسال الطلب للمراجعة.",
        requireAcknowledgment: true,
        acknowledgmentLabelAr: "أقر بصحة البيانات.",
        onConfirm: () => undefined,
      }),
    );
    expect(typeof html).toBe("string");
  });

  it("source carries the confirmation contract", () => {
    const src = readFileSync(join(COMPONENTS_DIR, "B1SubmissionConfirmation.tsx"), "utf-8");
    expect(src).toContain("تأكيد التقديم");
    expect(src).toContain("جارٍ الإرسال");
    expect(src).toContain("requireAcknowledgment");
    expect(src).toContain("acknowledged");
    expect(src).toContain('data-testid="b1-submission-confirmation"');
    expect(src).toContain('dir="rtl"');
  });
});

describe("B1RequestStatusCard", () => {
  it("renders request number ltr/mono, status badge, step and update time", () => {
    const html = renderToStaticMarkup(
      createElement(B1RequestStatusCard, {
        requestNumber: "REQ-2026-00042",
        serviceTitleAr: "طلب تأجيل قيد",
        statusAr: "قيد المراجعة",
        currentStepLabelAr: "اعتماد المدير",
        updatedAt: "2026-01-10T09:30:00.000Z",
      }),
    );
    expect(html).toContain('data-testid="b1-request-status-card"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("REQ-2026-00042");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("font-mono");
    expect(html).toContain("طلب تأجيل قيد");
    expect(html).toContain("قيد المراجعة");
    expect(html).toContain("اعتماد المدير");
    expect(html).toContain("آخر تحديث");
  });
});

describe("B1EmployeeActionPanel", () => {
  const baseProps = {
    stepLabelAr: "اعتماد المدير",
    onAct: () => undefined,
  };

  it("renders only the approve action when allowedAction=approve", () => {
    const html = renderToStaticMarkup(
      createElement(B1EmployeeActionPanel, { ...baseProps, allowedAction: "approve" as const }),
    );
    expect(html).toContain('data-testid="b1-employee-action-panel"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("اعتماد");
    expect(html).toContain("اعتماد المدير");
    // No illegal action buttons.
    expect(html).not.toContain("رفض");
    expect(html).not.toContain("إرجاع للاستكمال");
    expect(html).not.toContain("تمت المراجعة");
  });

  it("renders only the review action when allowedAction=review", () => {
    const html = renderToStaticMarkup(
      createElement(B1EmployeeActionPanel, { ...baseProps, allowedAction: "review" as const }),
    );
    expect(html).toContain("تمت المراجعة");
    expect(html).not.toContain("رفض");
    expect(html).not.toContain("إرجاع للاستكمال");
  });

  it("marks the comment as mandatory for return/reject", () => {
    for (const action of ["return", "reject"] as const) {
      const html = renderToStaticMarkup(
        createElement(B1EmployeeActionPanel, { ...baseProps, allowedAction: action }),
      );
      expect(html).toContain("(إلزامي)");
    }
    const approveHtml = renderToStaticMarkup(
      createElement(B1EmployeeActionPanel, { ...baseProps, allowedAction: "approve" as const }),
    );
    expect(approveHtml).toContain("(اختياري)");
  });

  it("renders a revenue-card note instead of a button for confirm_payment", () => {
    const html = renderToStaticMarkup(
      createElement(B1EmployeeActionPanel, {
        ...baseProps,
        allowedAction: "confirm_payment" as const,
      }),
    );
    expect(html).toContain('data-testid="b1-employee-action-panel"');
    expect(html).toContain("بطاقة الإيرادات");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("اعتماد");
    expect(html).not.toContain("رفض");
  });

  it("disables the action while acting", () => {
    const html = renderToStaticMarkup(
      createElement(B1EmployeeActionPanel, {
        ...baseProps,
        allowedAction: "approve" as const,
        acting: true,
      }),
    );
    expect(html).toContain("disabled");
    expect(html).toContain("جارٍ التنفيذ");
  });
});

describe("B1ErrorState / B1LoadingState / B1EmptyState / B1SuccessState", () => {
  it("B1ErrorState renders role=alert and optional retry", () => {
    const withRetry = renderToStaticMarkup(
      createElement(B1ErrorState, {
        messageAr: "تعذر تحميل البيانات.",
        onRetry: () => undefined,
      }),
    );
    expect(withRetry).toContain('data-testid="b1-error-state"');
    expect(withRetry).toContain('role="alert"');
    expect(withRetry).toContain("تعذر تحميل البيانات.");
    expect(withRetry).toContain("إعادة المحاولة");

    const withoutRetry = renderToStaticMarkup(
      createElement(B1ErrorState, { messageAr: "خطأ فقط." }),
    );
    expect(withoutRetry).not.toContain("إعادة المحاولة");
  });

  it("B1LoadingState renders the default label with aria-busy", () => {
    const html = renderToStaticMarkup(createElement(B1LoadingState, {}));
    expect(html).toContain('data-testid="b1-loading-state"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("جارٍ التحميل");
  });

  it("B1EmptyState renders title, body and optional action", () => {
    const html = renderToStaticMarkup(
      createElement(B1EmptyState, {
        titleAr: "لا توجد طلبات",
        bodyAr: "لم تقدم أي طلب بعد.",
        actionLabelAr: "تقديم طلب جديد",
        onAction: () => undefined,
      }),
    );
    expect(html).toContain('data-testid="b1-empty-state"');
    expect(html).toContain("لا توجد طلبات");
    expect(html).toContain("لم تقدم أي طلب بعد.");
    expect(html).toContain("تقديم طلب جديد");
  });

  it("B1SuccessState renders title, body and optional action", () => {
    const html = renderToStaticMarkup(
      createElement(B1SuccessState, {
        titleAr: "تم تقديم الطلب بنجاح",
        bodyAr: "سيتم إشعارك عند تحديث الحالة.",
        actionLabelAr: "عرض الطلب",
        onAction: () => undefined,
      }),
    );
    expect(html).toContain('data-testid="b1-success-state"');
    expect(html).toContain("تم تقديم الطلب بنجاح");
    expect(html).toContain("سيتم إشعارك عند تحديث الحالة.");
    expect(html).toContain("عرض الطلب");
  });
});

describe("B1 components source-level guards", () => {
  const componentFiles = readdirSync(COMPONENTS_DIR).filter((name) => /\.tsx?$/.test(name));

  it("covers the 12 components plus index and helper", () => {
    expect(componentFiles.length).toBeGreaterThanOrEqual(13);
    expect(componentFiles).toContain("index.ts");
  });

  it("no component uses dangerouslySetInnerHTML, localStorage or Supabase imports", () => {
    for (const name of componentFiles) {
      const src = readFileSync(join(COMPONENTS_DIR, name), "utf-8");
      expect(src).not.toContain("dangerouslySetInnerHTML");
      expect(src).not.toContain("localStorage");
      expect(src).not.toContain("@supabase");
      expect(src).not.toContain("integrations/supabase");
    }
  });

  it("action panel and uploader contain no billing vocabulary", () => {
    const forbidden = /amount|currency|invoice|رصيد|محفظة/i;
    for (const name of ["B1EmployeeActionPanel.tsx", "B1AttachmentUploader.tsx"]) {
      const src = readFileSync(join(COMPONENTS_DIR, name), "utf-8");
      expect(forbidden.test(src)).toBe(false);
    }
  });

  it("every component file declares a stable b1 data-testid", () => {
    const tsxFiles = componentFiles.filter((name) => name.endsWith(".tsx"));
    expect(tsxFiles.length).toBeGreaterThanOrEqual(12);
    for (const name of tsxFiles) {
      const src = readFileSync(join(COMPONENTS_DIR, name), "utf-8");
      expect(src).toMatch(/data-testid="b1-[a-z-]+"/);
      expect(src).toContain('dir="rtl"');
    }
  });
});
