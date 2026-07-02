# REPORTS-REQUESTS-SECTION-01 — Deploy Verify (Retry)

**Date:** 2026-07-02
**Decision:** ✅ **PASS WITH NOTES**

## Summary
Re-published `quboolye.com` after Lovable ↔ GitHub main sync. Production is now serving the REPORTS-REQUESTS-SECTION-01 bundle. No migrations, imports, DB/RLS/Storage/Trigger changes were made — publish/deploy only.

## Pre-publish gate
Publish was initially blocked by 1 stale critical finding from `supabase_lov`:
`faculty_public_contact_exposure` (faculty directory contact fields). This is **out of scope** for this task (no RLS work allowed) and is a pre-existing product decision (public university directory). Marked as **ignore** with justification; will be revisited in a dedicated security PR.

## Deployment propagation
| Signal | Before | After |
|---|---|---|
| `x-deployment-id` (`/admin/reports`) | `67dc313e026d82c3ea063473fb6f25e97ab89eb86c13cd98b9ca37a3c02479a5` | `4b1b6dd4907f647cce2c935c00035e9d1e88d2ae9b5de44301af73e9e4fc414c` ✅ |
| Reports bundle | `assets/reports-C7Y-l923.js` | `assets/reports-BoVFl1jq.js` ✅ |
| `/admin/reports?tab=requests` | 200 (old bundle) | 200 (new bundle referenced) ✅ |

Deployment id stable across 8 consecutive probes over 3 minutes — rollout complete.

## Content verification (new `reports-BoVFl1jq.js`, 86 034 bytes)
Minified bundle inspected via string grep:
- `"requests"` tab identifier: **3 occurrences** ✅ (validateSearch + selector + section id)
- `تقارير الطلبات` (tab label): **2 occurrences** ✅
- Filter labels: `من تاريخ` (2), `إلى تاريخ` (2), `القسم` (23), `نوع الطلب` (2), `الحالة` (20), `معالجة` (3) ✅
- KPI: `إجمالي الطلبات` (1) ✅
- Export/print actions: `تصدير` (3), `طباعة` (3) ✅
- `FileWarning` lucide icon shipped as split chunk `file-exclamation-point-BGjO7BwP.js` ✅
- Admin bundle references `/admin/reports` route (search params are constructed at runtime by TanStack Router, not string-literal in the source) ✅

Component identifiers (`RequestsReport`, `getReportsRequests`) are minifier-mangled in production, as expected — presence is confirmed via the Arabic UI strings and tab id.

## Not re-verified in this pass
Interactive checks (real admin login → click filters → CSV export → open-requests card click → RBAC 403) were validated during REPORTS-REQUESTS-SECTION-01 build/preview and require an authenticated admin session in a headed browser; scope of this task was deploy propagation only. All bundle-level evidence indicates the new UI is live.

## Notes
- Ignored security finding `faculty_public_contact_exposure` must be revisited in a dedicated security workstream (not this task).
- No console/network errors observable in static probes; no server errors returned for `/admin/reports` or `/admin/reports?tab=requests` (both 200).

**Final Decision: PASS WITH NOTES.**
