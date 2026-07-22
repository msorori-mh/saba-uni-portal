#!/bin/sh
# B1 RPC authorization matrix - local PG harness runner (LOCAL ONLY).
# NEVER run against production. Requires: PG17 binaries, node + pg client.
#
# Steps (see harness pipeline.sh in the track workspace for the reference run):
#   1. Start a disposable local PG17 cluster.
#   2. CREATE DATABASE e_rpcmatrix;
#   3. Apply pg/10-minimal-schema.sql
#   4. Apply the 19 drafts from docs/migration-drafts/ in the order given by
#      pg/20-draft-apply-order.txt. seq06 must fail closed first; then apply a
#      harness-only variant with the v_commit placeholder replaced by the
#      approved base commit sha (see the note in 20-draft-apply-order.txt).
#   5. Apply pg/30-pre-activation-assert.sql  (gate H-01 must PASS)
#   6. Apply pg/35-activate-workflows-local-only.sql  (LOCAL ONLY)
#   7. Apply pg/40-verifier.sql and pg/45-acl-cases.sql
#   8. Read SELECT * FROM e_rpcmatrix.results  (every row must be PASS or STATIC)
set -e
echo "This script documents the procedure; run the steps with your local PG client."
echo "All matrix expectations live in docs/b1/B1-RPC-AUTHORIZATION-MATRIX-01.json."
