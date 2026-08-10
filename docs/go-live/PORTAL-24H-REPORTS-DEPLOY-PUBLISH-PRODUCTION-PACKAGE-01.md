# PORTAL-24H-REPORTS-DEPLOY-PUBLISH-PRODUCTION-E2E-CLOSURE-01
# Complete production deployment package (SOURCE-ONLY — DO NOT DEPLOY EARLY)

**Mission:** `PORTAL-24H-REPORTS-DEPLOY-PUBLISH-PRODUCTION-E2E-CLOSURE-01`  
**Branch:** `prep/24h-reports-deploy-publish-e2e-01`  
**Exact main SHA (package base):** `fab94705443264ae5fe768c5091e25c7c729be1a`  
**Mode:** SOURCE preparation only until `DB_FULL_READY` **and** explicit Deploy/Publish authorization.  
**Decision (this package):** `HOLD_PORTAL_24H_PRODUCTION_DEPLOY_PUBLISH_E2E_WAITING_DB_FULL_READY`

---

## 1. Wait condition — DB_FULL_READY

```
DB_FULL_READY =
  Councils C9 production post-verifier PASS
  + GA1 foundation / GA2 completion / GA3 AUTH04 production post-verifiers PASS
```

| Gate | Production status (last proven) | Evidence |
|---|---|---|
| Councils C9 | **ABSENT** (ledger tip at C4) | `docs/reviews/PORTAL-GO-LIVE-PRODUCTION-READONLY-REALITY-CHECK-LONGRUN-01.md` |
| GA1–GA3 | **ABSENT** / PREPARED_NOT_EXECUTED | same + GA promotion package |
| Deploy/Publish auth | **NOT GRANTED** for execution (SOURCE-ONLY standing prep only) | `AGENTS.md` + Independent R2 `DEPLOY_READY=NO` |

**Do not Deploy or Publish while this table is red.**

Operator apply chain (when separately authorized):  
`docs/go-live/operator-packets/LOVABLE-C5V2-THROUGH-GA3-MASTER-SEQUENTIAL-EXECUTION.txt`

---

## 2. Release provenance

| Item | Value |
|---|---|
| Frozen main SHA | `fab94705443264ae5fe768c5091e25c7c729be1a` |
| Package branch | `prep/24h-reports-deploy-publish-e2e-01` |
| Deployed SHA proof | `GET /version.json` + `<meta name="build-sha">` must equal frozen SHA |
| Host | `https://quboolye.com` only |
| Reports hubs | `/student/reports`, `/faculty-portal/reports`, `/admin/department-reports`, `/admin/executive-reports`, `/admin/reports` |

---

## 3. DB prerequisite matrix (before publish)

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

## 4. Deploy command (EXECUTE ONLY AFTER DB_FULL_READY + OWNER GRANT)

```text
# 1) Freeze SHA on clean tree
git rev-parse HEAD          # must equal fab94705… or later owner-frozen tip
git status --porcelain      # must be empty

# 2) Lovable Deploy / build for that exact SHA
#    (use Lovable UI or MCP deploy_project ONLY with explicit human authorization)
#    Record Lovable deployment id + timestamp.
```

**STOP** if SHA dirty, wrong branch, or DB_FULL_READY false.

---

## 5. Publish command (EXECUTE ONLY AFTER DEPLOY SHA PROOF)

Packet: `docs/go-live/operator-packets/LOVABLE-FINAL-PUBLISH-AND-SHA-PROOF.txt`

```text
# Publish via Lovable for frozen SHA, then:
curl -s -i https://quboolye.com/version.json
# require: 200, Cache-Control: no-store, sha == $SOURCE_SHA

curl -s https://quboolye.com/ | grep -o 'name="build-sha" content="[^"]*"'
# require: content == $SOURCE_SHA
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

Also run: B1 five services, enrollment certificate, councils, GP, GA packets when DB_FULL_READY enables them.

---

## 9. Source work completed while waiting (this mission)

| Item | Change |
|---|---|
| KPI hierarchy | `ReportsPrimaryKpis` keeps Level-2 heading with honest empty copy |
| Logout/cache isolation | Admin/faculty/student logout clear RQ + `portal.reports.favorites.v1` |
| E2E packet | Five-hub routes + viewport/a11y/refresh/denial matrix |
| Tests | Five-hub readiness + logout/cache + empty KPI hierarchy contracts |

---

## 10. Target token

Full target `PASS_PORTAL_24H_PRODUCTION_DEPLOY_PUBLISH_E2E_CLOSED` requires:

1. This package merged  
2. `DB_FULL_READY` proven on production ledger  
3. Explicit Deploy + Publish authorization consumed  
4. SHA proof + five hubs browser E2E + B1/GP/GA/councils packets green  

Until then: **HOLD — package ready, waiting on DB lanes + owner grant.**
