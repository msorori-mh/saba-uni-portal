# PORTAL-24H-REPORTS-DEPLOY-PUBLISH-PRODUCTION-E2E-CLOSURE-01
# Final deploy source package (SOURCE reconciled — Deploy/Publish still owner-gated)

**Mission:** `PORTAL-PR335-FINAL-DEPLOY-SOURCE-RECONCILIATION-04`
**Branch:** `prep/24h-reports-deploy-publish-e2e-01`
**PR:** https://github.com/msorori-mh/saba-uni-portal/pull/335
**Reconciled main tip (pre-merge base):** `8c944b57534dda435afc7b600f590e85567e5103`
**Mode:** Final deploy SOURCE preparation. No Deploy / No Publish in this mission.
**Decision:** `PASS_PORTAL_PR335_FINAL_DEPLOY_SOURCE_RECONCILED_AND_MERGED` (after merge)

---

## 1. DB_FULL_READY — CURRENT TRUTH

```
DB_FULL_READY = YES
  Councils C0–C9 = PASS
  GA1 foundation = PASS
  GA2 completion = PASS
  GA3 AUTH04 = PASS
```

| Gate | Status | Notes |
|---|---|---|
| Councils C0–C9 | **PASS** | Stale “C9 absent” claim removed |
| GA1–GA3 | **PASS** | Stale “GA absent” claim removed |
| Deploy/Publish auth | Owner-gated | This package does **not** execute Deploy/Publish |

Stale pins removed: `DB_FULL_READY=false`, `C9 absent`, `GA absent`, deploy source `fab94705`.

Operator apply chain reference:
`docs/go-live/operator-packets/LOVABLE-C5V2-THROUGH-GA3-MASTER-SEQUENTIAL-EXECUTION.txt`

---

## 2. Release provenance

| Item | Value |
|---|---|
| Reconciled main tip | `8c944b57534dda435afc7b600f590e85567e5103` |
| Package branch | `prep/24h-reports-deploy-publish-e2e-01` |
| FINAL_DEPLOY_SOURCE_SHA | Set to exact `main` tip **after** PR335 merge |
| Deployed SHA proof | `GET /version.json` + `<meta name="build-sha">` must equal FINAL_DEPLOY_SOURCE_SHA |
| Host | `https://quboolye.com` only |
| Reports hubs | `/student/reports`, `/faculty-portal/reports`, `/admin/department-reports`, `/admin/executive-reports`, `/admin/reports` |

Preserved on reconciled tip:
- reports security hotfix (ops residual fail-closed + department containment)
- honest empty KPIs
- logout/cache isolation
- five canonical reporting hubs
- GA activation/source deltas from main

---

## 3. DB prerequisite matrix (satisfied)

| Step | Artifact | Required PASS token |
|---|---|---|
| C5V2 | `C5V2-LOVABLE-APPLY-ONE.txt` | C5 post-verifier |
| C6 | `C6-LOVABLE-APPLY-ONE.txt` | C6 post-verifier |
| C7 | `C7-LOVABLE-APPLY-ONE.txt` | C7 post-verifier |
| C8 | `C8-LOVABLE-APPLY-ONE.txt` | C8 post-verifier |
| **C9** | `C9-LOVABLE-APPLY-ONE.txt` | `COUNCILS_C9_PRODUCTION_POST_VERIFIER_PASS` |
| **GA1** | `GA1-LOVABLE-APPLY-ONE.txt` | foundation post-verifier |
| **GA2** | `GA2-LOVABLE-APPLY-ONE.txt` | completion post-verifier |
| **GA3** | `GA3-LOVABLE-APPLY-ONE.txt` | AUTH04 post-verifier |
| Ledger | `POST-GA3-LOVABLE-LEDGER-RECONCILIATION.txt` | mapping complete |

---

## 4. Deploy command (EXECUTE ONLY AFTER OWNER GRANT)

```text
# 1) Freeze SHA on clean tree (must equal FINAL_DEPLOY_SOURCE_SHA)
git rev-parse HEAD
git status --porcelain      # must be empty

# 2) Lovable Deploy / build for that exact SHA
#    (use Lovable UI or MCP deploy_project ONLY with explicit human authorization)
#    Record Lovable deployment id + timestamp.
```

**STOP** if SHA dirty or wrong branch. DB_FULL_READY is YES.

---

## 5. Publish command (EXECUTE ONLY AFTER DEPLOY SHA PROOF)

Packet: `docs/go-live/operator-packets/LOVABLE-FINAL-PUBLISH-AND-SHA-PROOF.txt`

```text
# Publish via Lovable for frozen SHA, then:
curl -s -i https://quboolye.com/version.json
# require: 200, Cache-Control: no-store, sha == $FINAL_DEPLOY_SOURCE_SHA

curl -s https://quboolye.com/ | grep -o 'name="build-sha" content="[^"]*"'
# require: content == $FINAL_DEPLOY_SOURCE_SHA
```

Abort on `STALE_BUILD_OR_UNVERIFIABLE_SHA_DETECTED` or `WRONG_ENVIRONMENT_ORIGIN`.

---

## 6. Rollback / safe-disable

| Lever | Action |
|---|---|
| App rollback | Re-publish previous known-good SHA; re-verify `/version.json` |
| GA surface | Keep `studentGraduatesAffairs` / `staffGraduatesAffairs` = `false` (already default) |
| Reports | Role/binding fail-closed — no feature flag; revoke assignments / bindings to shrink catalog |
| Councils | Do not roll back applied migrations; disable UI nav entries only if emergency |
| B1 finance | `adminFinance` remains false — no payment UI |

Never `db push`, never destructive reset, never delete production rows for rollback.

---

## 7. Production smoke (post-publish)

1. `/version.json` SHA match
2. Portal shells: `/portal-login`, `/admin`, `/student`, `/faculty-portal`, `/staff`
3. Five report hubs load RTL three-level workspace
4. Logout clears cache (admin/faculty/student)

---

## 8. Production browser E2E (post-publish)

Master runner: `docs/go-live/operator-packets/POST-DEPLOY-PRODUCTION-E2E-MASTER.txt`

Reports section: updated `PRODUCTION-E2E-REPORTS-MESSAGES-DOCUMENTS.txt` (five hubs).

Also run: B1 five services, enrollment certificate, councils, GP, GA packets.

---

## 9. Source work completed (PR335 + reconciliation)

| Item | Change |
|---|---|
| KPI hierarchy | `ReportsPrimaryKpis` keeps Level-2 heading with honest empty copy |
| Logout/cache isolation | Admin/faculty/student logout clear RQ + `portal.reports.favorites.v1` |
| E2E packet | Five-hub routes + viewport/a11y/refresh/denial matrix |
| Tests | Five-hub readiness + logout/cache + empty KPI hierarchy contracts |
| Main reconcile | Absorbed reports security hotfix PR336 + GA activation/source deltas + warroom docs |
| Stale claims | Removed `DB_FULL_READY=false`, `C9 absent`, `GA absent`, `fab94705` deploy pin |

---

## 10. Target tokens

- Source reconciliation: `PASS_PORTAL_PR335_FINAL_DEPLOY_SOURCE_RECONCILED_AND_MERGED`
- Full deploy/publish E2E closed still requires explicit Deploy + Publish authorization + SHA proof + browser packets
