# PORTAL-GRADUATES-AFFAIRS-PRODUCTION-PROMOTION-LONGRUN-09
## Feature Flag Release Package

**Status:** flags remain OFF in source.  
**Source file:** `src/lib/portal-features.ts`  
**Flags:**
- `staffGraduatesAffairs: false`
- `studentGraduatesAffairs: false`

---

## Exact later activation sequence

1. **Set `staffGraduatesAffairs: true`** in `src/lib/portal-features.ts`.
2. **Build:** `bun run build`.
3. **Staff smoke / E2E:** run staff graduates-affairs flows against staging.
4. **Set `studentGraduatesAffairs: true`** in `src/lib/portal-features.ts`.
5. **Build/deploy:** `bun run build` and deploy through normal release channel.
6. **Student smoke:** run student graduates-affairs self-service flows against staging.

Do **not** enable either flag until:
- Foundation, Completion, and AUTH04 migrations are applied in production.
- The operational config runbook has been executed (manager + specialist assignments + continuity policy).
- Post-verifiers PASS in production/staging.

---

## Rollback

If either flag activation causes regression, revert `src/lib/portal-features.ts` to the previous flags-off artifact and redeploy:

```ts
export const portalFeatures = {
  studentRegisteredCourses: false,
  studentUnofficialTranscript: false,
  studentFinance: false,
  adminFinance: false,
  facultyCourseMaterials: false,
  studentCourseMaterials: false,
  studentGraduatesAffairs: false,
  staffGraduatesAffairs: false,
} as const;
```

Flag rollback is UI-only; backend tables/RPCs/RLS remain in place and are protected by their own authorization contracts.
