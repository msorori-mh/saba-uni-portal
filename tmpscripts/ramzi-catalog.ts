import { REPORT_CATALOG_ENTRIES } from "../src/lib/reports/catalog/entries";
import { visibleReportsForViewer } from "../src/lib/reports/catalog/visibility";
import { emptyCatalogViewer } from "../src/lib/reports/catalog/viewer-scope";

const viewer = emptyCatalogViewer({
  roles: ["faculty_member", "department_head"],
  facultyProfileId: "f6c78fc6-0000-0000-0000-000000000000",
  departmentId: "ce485c67-0000-0000-0000-000000000000",
  denied: false,
  denyReasonAr: null,
});
const vis = visibleReportsForViewer(REPORT_CATALOG_ENTRIES, viewer);
console.log("VISIBLE", vis.length, "of", REPORT_CATALOG_ENTRIES.length);
for (const e of vis) console.log([e.report_code, e.status, e.data_scope, e.route ?? "-", e.beneficiaries.join("|")].join("  ::  "));
