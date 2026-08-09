# TLS CA bundle for verify-full operator runs
#
# Place the production CA chain at:
#   scripts/b1-rpc-principal-harness-01/tls/prod-ca.crt
#
# This file is intentionally untracked (.gitignore). Absence of the CA causes
# the launcher to stop with HOLD_NEEDS_VERIFIED_TLS_ENDPOINT.
