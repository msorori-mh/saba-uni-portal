/**
 * Local HTTP fixture SPA for the five B1 services (synthetic data only).
 * Served over http://127.0.0.1 — never file:// and never Production.
 */

export const SERVICES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

export type ServiceCode = (typeof SERVICES)[number];

const SERVICE_TITLES: Record<ServiceCode, string> = {
  enrollment_suspension: "إيقاف قيد",
  excused_absence: "غياب بعذر",
  department_transfer: "تحويل قسم",
  final_chance: "فرصة أخيرة",
  file_withdrawal: "سحب ملف",
};

/** Single-page harness: client-side router + mock state over real HTTP. */
export function harnessIndexHtml(): string {
  const servicesJson = JSON.stringify(SERVICES);
  const titlesJson = JSON.stringify(SERVICE_TITLES);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>B1 HTTP Harness — بوابة الكلية</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Tahoma, "Segoe UI", sans-serif; background: #f7f4ef; color: #1a1a1a; }
    #root { min-height: 100vh; }
    main { max-width: 48rem; margin: 0 auto; padding: 1rem; overflow-wrap: anywhere; }
    h1,h2 { margin: 0 0 .75rem; font-size: 1.25rem; }
    .row { border: 1px solid #cfc6b8; background: #fff; padding: .75rem; margin: .5rem 0; border-radius: .25rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
    button, a.btn { appearance: none; border: 1px solid #334; background: #1f3a5f; color: #fff; padding: .5rem .75rem; text-decoration: none; cursor: pointer; font: inherit; }
    button.secondary { background: #fff; color: #1f3a5f; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    label { display: block; margin: .5rem 0; }
    textarea, input[type=text] { width: 100%; padding: .5rem; font: inherit; }
    .muted { color: #555; font-size: .9rem; }
    [data-testid="violation-banner"] { display: none; background: #7a1f1f; color: #fff; padding: .5rem .75rem; }
    body.show-violation [data-testid="violation-banner"] { display: block; }
    .deny { color: #7a1f1f; font-weight: 700; }
  </style>
</head>
<body>
  <div data-testid="violation-banner" role="alert">تحذير مخالفة</div>
  <div id="root" data-reactroot="1"></div>
  <script>
(function () {
  const SERVICES = ${servicesJson};
  const TITLES = ${titlesJson};
  const state = {
    role: "student",
    drafts: {},
    submitted: {},
    assignedStaffId: "staff-assigned",
    currentStaffId: "staff-assigned",
  };

  function path() {
    const h = location.hash.replace(/^#/, "") || "/";
    return h.startsWith("/") ? h : "/" + h;
  }
  function go(p) {
    location.hash = p;
    render();
  }
  function qs(sel, el) { return (el || document).querySelector(sel); }

  function studentList() {
    return \`
      <main dir="rtl" data-testid="student-list">
        <h1>الخدمات الطلابية</h1>
        <p class="muted" data-testid="user-message">اختر خدمة لبدء طلب جديد.</p>
        <ul data-testid="b1-student-service-list" style="list-style:none;padding:0;margin:0;display:grid;gap:.5rem">
          \${SERVICES.map((code) => \`
            <li class="row" data-service="\${code}">
              <strong>\${TITLES[code]}</strong>
              <div class="actions">
                <a class="btn" href="#/student/form/\${code}" data-testid="start-\${code}">بدء الطلب</a>
              </div>
            </li>\`).join("")}
        </ul>
        <div class="actions">
          <a class="btn secondary" href="#/student/detail/demo">تفاصيل طلب</a>
          <a class="btn secondary" href="#/staff/inbox">صندوق الموظف</a>
        </div>
      </main>\`;
  }

  function studentForm(code) {
    const draft = state.drafts[code] || { notes: "", saved: false, submitted: false };
    return \`
      <main dir="rtl" data-testid="b1-student-request-form" data-service="\${code}">
        <h1>طلب \${TITLES[code] || code}</h1>
        <form data-testid="b1-form" onsubmit="return false">
          <label>ملاحظات
            <textarea name="notes" data-testid="notes" rows="3">\${draft.notes || ""}</textarea>
          </label>
          <label>مرفق آمن
            <input type="file" name="attachment" accept=".pdf,image/png,image/jpeg" data-testid="attachment"/>
          </label>
          <p class="muted" data-testid="user-message">\${
            draft.submitted ? "تم الإرسال بنجاح." : draft.saved ? "تم حفظ المسودة بنجاح." : "عدّل المسودة ثم احفظ أو أرسل."
          }</p>
          <div class="actions">
            <button type="button" data-testid="save-draft">حفظ مسودة</button>
            <button type="button" data-testid="submit" \${draft.submitted ? "disabled" : ""}>إرسال</button>
            <a class="btn secondary" href="#/">القائمة</a>
          </div>
        </form>
      </main>\`;
  }

  function studentDetail() {
    return \`
      <main dir="rtl" data-testid="student-detail">
        <h1>تفاصيل الطلب</h1>
        <p data-testid="request-number">B1-MOCK-0001</p>
        <p data-testid="status">قيد المراجعة</p>
        <ol data-testid="b1-workflow-timeline"><li>استلام</li><li>مراجعة</li></ol>
        <p class="muted" data-testid="user-message">لا توجد مخالفة مسجّلة.</p>
        <div class="actions"><a class="btn secondary" href="#/">رجوع</a></div>
      </main>\`;
  }

  function staffInbox() {
    // Route owns assignment so viewports stay independent.
    if (path() === "/staff/inbox") state.currentStaffId = state.assignedStaffId;
    if (path() === "/staff/unassigned") state.currentStaffId = "staff-other";
    const assigned = state.currentStaffId === state.assignedStaffId;
    return \`
      <main dir="rtl" data-testid="b1-staff-workspace">
        <h1>الطلبات المعيّنة</h1>
        <p class="muted">الموظف الحالي: <span data-testid="staff-id">\${state.currentStaffId}</span></p>
        <section class="row" data-testid="assigned-row" data-service="department_transfer">
          <span>B1-MOCK-0001 — تحويل قسم</span>
          <div class="actions" data-testid="staff-actions">
            \${assigned
              ? \`<button data-testid="action-review">مراجعة</button>
                 <button data-testid="action-return">إعادة</button>
                 <button data-testid="action-reject">رفض</button>\`
              : \`<p class="deny" data-testid="access-denied">غير مصرح لك باتخاذ إجراء على هذا الطلب.</p>\`}
          </div>
        </section>
        <div class="actions">
          <button type="button" class="secondary" data-testid="switch-unassigned">تبديل إلى غير معيّن</button>
          <button type="button" class="secondary" data-testid="switch-assigned">تبديل إلى معيّن</button>
          <a class="btn secondary" href="#/">القائمة</a>
        </div>
      </main>\`;
  }

  function bind(main) {
    const p = path();
    if (p.startsWith("/student/form/")) {
      const code = p.split("/").pop();
      const notes = qs('[data-testid="notes"]', main);
      qs('[data-testid="save-draft"]', main)?.addEventListener("click", () => {
        state.drafts[code] = { notes: notes?.value || "", saved: true, submitted: false };
        render();
      });
      qs('[data-testid="submit"]', main)?.addEventListener("click", () => {
        const d = state.drafts[code] || { notes: notes?.value || "", saved: true };
        state.drafts[code] = { ...d, notes: notes?.value || d.notes, saved: true, submitted: true };
        state.submitted[code] = true;
        render();
      });
    }
    if (p === "/staff/inbox" || p === "/staff/unassigned") {
      qs('[data-testid="switch-unassigned"]', main)?.addEventListener("click", () => {
        state.currentStaffId = "staff-other";
        go("/staff/unassigned");
      });
      qs('[data-testid="switch-assigned"]', main)?.addEventListener("click", () => {
        state.currentStaffId = state.assignedStaffId;
        go("/staff/inbox");
      });
    }
  }

  function render() {
    const root = document.getElementById("root");
    const p = path();
    let html = "";
    if (p === "/" || p === "/student") html = studentList();
    else if (p.startsWith("/student/form/")) html = studentForm(p.split("/").pop());
    else if (p.startsWith("/student/detail")) html = studentDetail();
    else if (p === "/staff/inbox" || p === "/staff/unassigned") html = staffInbox();
    else html = \`<main dir="rtl"><h1>غير موجود</h1><a href="#/">رجوع</a></main>\`;
    root.innerHTML = html;
    window.__B1_HARNESS_READY__ = true;
    bind(root);
  }

  window.addEventListener("hashchange", render);
  render();
})();
  </script>
</body>
</html>`;
}
