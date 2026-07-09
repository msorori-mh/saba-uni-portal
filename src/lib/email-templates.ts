// Phase 9B: Arabic RTL email templates
// All templates return { subject, html } - dynamic values are escaped by the renderer

export type EmailTemplateKey =
  | "request_approved"
  | "request_rejected"
  | "receipt_approved"
  | "receipt_rejected"
  | "grade_approved"
  | "document_issued"
  | "password_reset"
  | "welcome";

// Simple HTML-escape to neutralize untrusted variable values
const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface TemplateContext {
  university_name: string;
  college_name: string;
  recipient_name?: string;
  // Free-form template data (already runtime values)
  [k: string]: unknown;
}

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

// Brand palette (hex for email clients — no oklch)
const BRAND = {
  primaryDeep: "#12384D",
  primary: "#0B6384",
  gold: "#E3A313",
  background: "#F6F8F9",
  surface: "#FFFFFF",
  border: "#D9E3E8",
  muted: "#667985",
  text: "#12384D",
  mutedBg: "#EAF3F7",
  goldSoft: "#FFF3D6",
} as const;

const shell = (title: string, bodyHtml: string, ctx: TemplateContext): string => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:'Tajawal','Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:${BRAND.surface};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
    <div style="background:${BRAND.primaryDeep};color:#ffffff;padding:20px 24px;">
      <div style="font-size:13px;opacity:.85;">${esc(ctx.university_name)}</div>
      <div style="font-size:18px;font-weight:bold;margin-top:4px;">${esc(ctx.college_name)}</div>
    </div>
    <div style="padding:24px;color:${BRAND.text};font-size:14px;line-height:1.8;">
      ${bodyHtml}
    </div>
    <div style="padding:14px 24px;background:${BRAND.background};border-top:1px solid ${BRAND.border};color:${BRAND.muted};font-size:11px;text-align:center;">
      هذه رسالة آلية من نظام البوابة الإلكترونية. الرجاء عدم الرد عليها.
    </div>
  </div>
</body>
</html>`;

const greet = (ctx: TemplateContext): string =>
  ctx.recipient_name
    ? `<p>السلام عليكم ${esc(ctx.recipient_name)}،</p>`
    : `<p>السلام عليكم،</p>`;

export function renderTemplate(
  key: EmailTemplateKey,
  ctx: TemplateContext,
): Rendered {
  switch (key) {
    case "request_approved": {
      const title = "تم اعتماد طلبك";
      const body = `${greet(ctx)}
        <p>نفيدكم بأنه قد <strong style="color:#059669;">تم اعتماد طلبكم</strong> ذو العنوان:</p>
        <p style="background:${BRAND.mutedBg};padding:10px 14px;border-radius:8px;font-weight:bold;">${esc(ctx.request_title)}</p>
        ${ctx.document_number ? `<p>تم إصدار وثيقتكم الرسمية:</p>
        <ul>
          <li>رقم الوثيقة: <code style="background:${BRAND.mutedBg};padding:2px 6px;border-radius:4px;">${esc(ctx.document_number)}</code></li>
          ${ctx.verification_code ? `<li>رمز التحقق: <code style="background:${BRAND.mutedBg};padding:2px 6px;border-radius:4px;">${esc(ctx.verification_code)}</code></li>` : ""}
        </ul>
        ${ctx.document_url ? `<p><a href="${esc(ctx.document_url)}" style="color:${BRAND.primary};font-weight:bold;">عرض الوثيقة (طباعة / PDF + QR)</a></p>` : ""}
        ${ctx.verify_url ? `<p><a href="${esc(ctx.verify_url)}" style="color:${BRAND.primary};">التحقق من صحة الوثيقة</a></p>` : ""}` : ""}
        <p>يمكنكم متابعة تفاصيل الطلب من خلال البوابة الإلكترونية للطالب.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: `تم اعتماد طلبكم: ${ctx.request_title}` };
    }
    case "request_rejected": {
      const title = "تم رفض طلبك";
      const body = `${greet(ctx)}
        <p>نأسف لإبلاغكم بأنه قد <strong style="color:#dc2626;">تم رفض طلبكم</strong> ذو العنوان:</p>
        <p style="background:${BRAND.mutedBg};padding:10px 14px;border-radius:8px;font-weight:bold;">${esc(ctx.request_title)}</p>
        ${ctx.rejection_reason ? `<p><strong>سبب الرفض:</strong> ${esc(ctx.rejection_reason)}</p>` : ""}
        <p>للمزيد من التوضيحات يمكنكم التواصل مع شؤون الطلاب.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: `تم رفض طلبكم: ${ctx.request_title}` };
    }
    case "receipt_approved": {
      const title = "تم اعتماد سند الدفع";
      const body = `${greet(ctx)}
        <p>تم <strong style="color:#059669;">اعتماد سند الدفع</strong> الخاص بكم.</p>
        <ul>
          <li>المبلغ: <strong>${esc(ctx.amount)}</strong></li>
          <li>تاريخ الدفع: ${esc(ctx.payment_date)}</li>
          ${ctx.fee_type ? `<li>نوع الرسوم: ${esc(ctx.fee_type)}</li>` : ""}
        </ul>
        <p>سيتم تحديث رصيدكم المالي خلال دقائق.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: `تم اعتماد سند الدفع بمبلغ ${ctx.amount}` };
    }
    case "receipt_rejected": {
      const title = "تم رفض سند الدفع";
      const body = `${greet(ctx)}
        <p>نأسف لإبلاغكم بأنه قد تم <strong style="color:#dc2626;">رفض سند الدفع</strong>.</p>
        <ul><li>المبلغ: ${esc(ctx.amount)}</li></ul>
        ${ctx.rejection_reason ? `<p><strong>سبب الرفض:</strong> ${esc(ctx.rejection_reason)}</p>` : ""}
        <p>يرجى مراجعة الشؤون المالية لإعادة رفع السند بشكل صحيح.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: `تم رفض سند الدفع` };
    }
    case "grade_approved": {
      const title = "تم اعتماد درجاتك";
      const body = `${greet(ctx)}
        <p>تم <strong style="color:#059669;">اعتماد درجاتكم</strong> في المقرر:</p>
        <p style="background:${BRAND.mutedBg};padding:10px 14px;border-radius:8px;font-weight:bold;">${esc(ctx.course_name)}</p>
        <p>يمكنكم الاطلاع على السجل الأكاديمي عبر بوابة الطالب.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: `تم اعتماد درجاتكم في ${ctx.course_name}` };
    }
    case "document_issued": {
      const title = "تم إصدار وثيقة رسمية";
      const body = `${greet(ctx)}
        <p>تم <strong style="color:#059669;">إصدار وثيقتكم الرسمية</strong>:</p>
        <ul>
          <li>نوع الوثيقة: <strong>${esc(ctx.document_type)}</strong></li>
          <li>رقم الوثيقة: <code style="background:${BRAND.mutedBg};padding:2px 6px;border-radius:4px;">${esc(ctx.document_number)}</code></li>
          <li>رمز التحقق: <code style="background:${BRAND.mutedBg};padding:2px 6px;border-radius:4px;">${esc(ctx.verification_code)}</code></li>
        </ul>
        ${ctx.document_url ? `<p><a href="${esc(ctx.document_url)}" style="color:${BRAND.primary};font-weight:bold;">عرض الوثيقة (طباعة / PDF + QR)</a></p>` : ""}
        ${ctx.verify_url ? `<p><a href="${esc(ctx.verify_url)}" style="color:${BRAND.primary};">التحقق من صحة الوثيقة</a></p>` : ""}
        <p>يمكنكم أيضاً الوصول للوثيقة من بوابة الطالب.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: `تم إصدار وثيقة ${ctx.document_type} رقم ${ctx.document_number}` };
    }
    case "password_reset": {
      const title = "إعادة تعيين كلمة المرور";
      const body = `${greet(ctx)}
        <p>قام أحد المسؤولين بإعادة تعيين كلمة المرور الخاصة بحسابكم.</p>
        ${ctx.temporary_password ? `<p>كلمة المرور المؤقتة: <code style="background:${BRAND.goldSoft};padding:4px 10px;border-radius:4px;font-size:15px;">${esc(ctx.temporary_password)}</code></p>` : ""}
        <p>يرجى تسجيل الدخول وتغيير كلمة المرور فوراً.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: "تم إعادة تعيين كلمة المرور" };
    }
    case "welcome": {
      const title = "مرحباً بكم في البوابة الإلكترونية";
      const body = `${greet(ctx)}
        <p>تم إنشاء حسابكم بنجاح في البوابة الإلكترونية لكلية تكنولوجيا المعلومات.</p>
        ${ctx.academic_number ? `<p>الرقم الأكاديمي: <strong>${esc(ctx.academic_number)}</strong></p>` : ""}
        <p>نتمنى لكم تجربة موفقة.</p>`;
      return { subject: title, html: shell(title, body, ctx), text: "مرحباً بكم في البوابة الإلكترونية" };
    }
  }
}
