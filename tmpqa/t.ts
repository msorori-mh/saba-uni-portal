import { buildCouncilMinutesPdf } from "../src/lib/documents/council-minutes-pdf.server";
const bytes = await buildCouncilMinutesPdf({
  councilName: "مجلس قسم نظم المعلومات الحاسوبية",
  meetingTitle: "TEST_ONLY_COUNCILS_E2E_02 — اجتماع مجلس قسم نظم المعلومات",
  meetingNumber: 1,
  scheduledAt: "2026-08-12T07:00:00Z",
  location: "TEST_ONLY قاعة المجلس",
  approvedAt: "2026-08-11T00:10:00Z",
  lockedAt: "2026-08-11T00:10:00Z",
  body: "تمت مناقشة البند الأول والموافقة عليه بالإجماع 3/3.\nالقرار: اعتماد الخطة المقترحة.\n\nملاحظات إضافية حول آلية التنفيذ ومتابعة القرارات الصادرة عن المجلس خلال الفصل الدراسي القادم.",
  fingerprint: "abc123def456",
});
await Bun.write("/tmp/pdfqa/out.pdf", bytes);
console.log("ok", bytes.length);
