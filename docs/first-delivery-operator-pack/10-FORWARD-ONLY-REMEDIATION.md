# 10 — Forward-only remediation

| Forbidden | Allowed |
|---|---|
| migration repair | reviewed forward migration |
| manual schema_migrations insert | official runner history only |
| delete/reset/cleanup of production data | Storage-tool contract correction for B0 only |
| down migrations | replace/revoke via forward package |
| re-apply same version with different bytes | never |

Every remediation requires its own approval boundary.
