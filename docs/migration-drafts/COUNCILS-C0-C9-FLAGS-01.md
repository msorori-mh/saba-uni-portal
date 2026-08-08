# Academic Councils C0–C9 — Feature Flag Package

**Mission:** `ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09`  
**Status:** flags remain **OFF** / **NOT ENABLED** by this package.  
**Source file:** `src/lib/portal-features.ts`

---

## Current contract (as of PR #304 base)

| Item | State |
|---|---|
| `adminAcademicCouncils` | **ABSENT** from `portalFeatures` |
| `facultyAcademicCouncils` | **ABSENT** from `portalFeatures` |
| Admin nav `/admin/academic-councils` | **UNGATED** (always linked in `AdminShell`) |
| Faculty nav `/faculty-portal/academic-councils` | **UNGATED** (always linked in `FacultyPortalShell`) |
| Activation performed by this package | **NO** |

Interpretation: there is **no** kill-switch today. Backend authorization remains RPC/RLS-bound; UI visibility is not feature-flagged.

This readiness package **does not** add or flip flags (avoids hiding the existing MVP pilot UI as a side effect of a stacked readiness PR).

---

## Later activation sequence (DO NOT RUN NOW)

Only after:

1. C0→C9 apply-one chain PASS in the target environment  
2. Production post-verifiers PASS  
3. Observability RO PASS  
4. Optional TEST_ONLY E2E (separate approval) PASS + cleanup + zero residue  

### Proposed future keys (not present yet)

```ts
export const portalFeatures = {
  // …existing…
  adminAcademicCouncils: false,
  facultyAcademicCouncils: false,
} as const;
```

### Exact later sequence

1. **Separate PR:** introduce `adminAcademicCouncils` / `facultyAcademicCouncils` as `false` and gate shells (temporary hide while migrations settle if required by ops).  
2. Confirm C0–C9 ledger + post-verifiers green.  
3. Set `adminAcademicCouncils: true` → build → admin smoke.  
4. Set `facultyAcademicCouncils: true` → build → faculty smoke (chair/secretary/member/viewer/responsible).  
5. Record activation SHA; keep backend contracts authoritative.

### Rollback (UI-only)

Redeploy with both keys `false` (or remove gates). Tables/RPCs/RLS remain; no DROP.

---

## Explicit non-actions for this package

- DO NOT enable any councils feature flag  
- DO NOT deploy  
- DO NOT merge activation into this readiness PR
