# 02 — SEQ07-B B0 private bucket (Storage tool)

| Field | Value |
|---|---|
| Channel | Lovable Storage tool (non-migration) |
| Bucket | `student-request-secure-attachments` |
| public | `false` |
| file_size_limit | `5242880` |
| MIME | application/pdf, image/jpeg, image/png |
| Source SHA pin (package) | SEQ07-B package / addendum |
| Separate approval | YES — does not authorize B1 |

Pre-check: bucket absent OR already exact private contract.
Post-check: exact contract; no public URL; no broad policies; uploads table still absent.
Idempotency: re-assert exact private contract.
Stop: public=true, wrong MIME/size, broad policies, any SQL apply in same session.
Remediation: Storage tool only; forward-only; no SQL DELETE of production data.

PASS: `PASS_SEQ07B_B0_BUCKET`
