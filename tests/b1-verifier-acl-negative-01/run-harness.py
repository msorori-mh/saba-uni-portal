#!/usr/bin/env python3
"""
B1 order-29 post-verifier ACL negative harness.

Proves that the FAIL-CLOSED ACL contract of the order-29 post-verifiers is
actually fail-closed: it must reject a NULL proacl, any PUBLIC / anon /
authenticated EXECUTE privilege, a wrong signature, a wrong owner and an
unpinned search_path, and it must accept ONLY the exact contract shape.

The checked SQL is EXTRACTED VERBATIM from both verifier files between the
markers

    -- >>> B1_ACL_CONTRACT_BEGIN
    -- <<< B1_ACL_CONTRACT_END

so drift between the proof and the verifiers is impossible.

Nothing here touches production: it creates a throwaway PostgreSQL cluster in a
temp directory, applies synthetic stubs with the exact order-29 signatures, and
removes the cluster afterwards. It applies no migration and runs no B1 RPC.

    python3 tests/b1-verifier-acl-negative-01/run-harness.py

Exit code 0 = every case behaved as required.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERIFIERS = [
    ROOT
    / "docs/migration-drafts/b1-backend-verifiers"
    / "29-B1_29_RUNTIME_ASSIGNEE_PROPAGATION_01-POST-VERIFIER.sql",
    ROOT
    / "docs/migration-drafts/b1-backend-verifiers"
    / "29-B1_29_RUNTIME_ASSIGNEE_PROPAGATION_01-POST-VERIFIER-STRUCTURAL-0-4.sql",
]

BEGIN = "-- >>> B1_ACL_CONTRACT_BEGIN"
END = "-- <<< B1_ACL_CONTRACT_END"

FIXTURE = (Path(__file__).parent / "pg" / "10-fixture.sql").read_text()


def extract(path: Path) -> str:
    text = path.read_text().replace("\r\n", "\n")
    if BEGIN not in text or END not in text:
        raise SystemExit(f"ACL contract markers missing in {path.name}")
    body = text.split(BEGIN, 1)[1].split("\n", 1)[1].split(END, 1)[0]
    # drop the trailing marker comment lines of the BEGIN marker itself
    lines = [ln for ln in body.split("\n") if not ln.strip().startswith("-- tests/")]
    return "\n".join(lines)


def wrap(body: str) -> str:
    return (
        "DO $harness$\nDECLARE\n"
        "  v_owner oid;\n  v_fn record;\n  v_role text;\nBEGIN\n"
        + body
        + "\nEND\n$harness$;\n"
    )


SANDBOX_UID = 1000  # postgres refuses to run as root; drop privileges when needed
PORT = 55447


def run_pg(cmd):
    if os.geteuid() == 0:
        cmd = [
            "setpriv", "--reuid", str(SANDBOX_UID), "--regid", str(SANDBOX_UID),
            "--clear-groups", "env", "HOME=/tmp",
        ] + cmd
    return subprocess.run(cmd, capture_output=True, text=True)


class Cluster:
    def __init__(self) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="b1-acl-neg-"))
        self.data = self.dir / "data"

    def start(self) -> None:
        if os.geteuid() == 0:
            os.chown(self.dir, SANDBOX_UID, SANDBOX_UID)
        r = run_pg(["initdb", "-D", str(self.data), "-U", "postgres", "-A", "trust"])
        if r.returncode != 0:
            raise SystemExit("initdb failed: " + r.stderr.strip())
        r = run_pg([
            "pg_ctl", "-D", str(self.data),
            "-o", f"-p {PORT} -k {self.dir} -c listen_addresses=127.0.0.1",
            "-l", str(self.dir / "log"), "-w", "start",
        ])
        if r.returncode != 0:
            raise SystemExit("pg_ctl start failed: " + r.stdout + r.stderr)

    def stop(self) -> None:
        run_pg(["pg_ctl", "-D", str(self.data), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(self.dir, ignore_errors=True)

    def psql(self, sql: str, db: str = "postgres") -> subprocess.CompletedProcess:
        return subprocess.run(
            ["psql", "-h", "127.0.0.1", "-p", str(PORT), "-U", "postgres", "-d", db,
             "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", "-"],
            input=sql, text=True, capture_output=True,
            env=dict(os.environ, PGSSLMODE="disable", PGPASSWORD=""),
        )


# (case id, description, setup SQL applied on top of the good fixture, expect_pass)
CASES = [
    ("A1", "exact contract shape is accepted", "", True),
    (
        "N1",
        "NULL proacl (no explicit REVOKE) is rejected",
        # recreating the function resets proacl to NULL
        "CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation()"
        " RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'"
        " AS $f$ BEGIN RETURN NEW; END $f$;",
        False,
    ),
    (
        "N2",
        "PUBLIC EXECUTE is rejected",
        "GRANT EXECUTE ON FUNCTION public.guard_b1_runtime_step_activation() TO PUBLIC;",
        False,
    ),
    (
        "N3",
        "anon EXECUTE is rejected",
        "GRANT EXECUTE ON FUNCTION public.b1_lock_assignment_identity_stmt() TO anon;",
        False,
    ),
    (
        "N4",
        "authenticated EXECUTE is rejected",
        "GRANT EXECUTE ON FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid)"
        " TO authenticated;",
        False,
    ),
    (
        "N5",
        "wrong signature is rejected",
        "DROP FUNCTION public.assert_b1_runtime_step_assignee_effective(uuid);"
        " CREATE FUNCTION public.assert_b1_runtime_step_assignee_effective(text)"
        " RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'"
        " AS $f$ BEGIN END $f$;"
        " REVOKE ALL ON FUNCTION public.assert_b1_runtime_step_assignee_effective(text)"
        " FROM PUBLIC, anon, authenticated;",
        False,
    ),
    (
        "N6",
        "wrong owner is rejected",
        "ALTER FUNCTION public.b1_assignment_identity_lock_key() OWNER TO other_owner;",
        False,
    ),
    (
        "N7",
        "unpinned search_path is rejected",
        "ALTER FUNCTION public.b1_lock_assignment_identity_boundary() RESET search_path;",
        False,
    ),
    (
        "N8",
        "PUBLIC EXECUTE inherited through a role grant is rejected",
        "GRANT EXECUTE ON FUNCTION public.b1_assignment_identity_lock_key() TO acl_holder;"
        " GRANT acl_holder TO anon;",
        False,
    ),
    (
        "N9",
        "missing SECURITY DEFINER is rejected",
        "CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_stmt()"
        " RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'"
        " AS $f$ BEGIN RETURN NULL; END $f$;"
        " REVOKE ALL ON FUNCTION public.b1_lock_assignment_identity_stmt()"
        " FROM PUBLIC, anon, authenticated;",
        False,
    ),
]


def main() -> int:
    bodies = {p.name: wrap(extract(p)) for p in VERIFIERS}
    cluster = Cluster()
    failures: list[str] = []
    try:
        cluster.start()
        for name, body in bodies.items():
            for cid, desc, setup, expect_pass in CASES:
                db = f"c_{cid.lower()}_{abs(hash(name)) % 9973}"
                cluster.psql(f'DROP DATABASE IF EXISTS "{db}";')
                r = cluster.psql(f'CREATE DATABASE "{db}";')
                if r.returncode != 0:
                    failures.append(f"{name} {cid}: create db failed: {r.stderr.strip()}")
                    continue
                env_sql = FIXTURE + "\n" + setup + "\n" + body
                r = cluster.psql(env_sql, db=db)
                passed = r.returncode == 0
                if passed != expect_pass:
                    failures.append(
                        f"{name} {cid} ({desc}): expected "
                        f"{'PASS' if expect_pass else 'POSTVERIFY_FAIL'}, got "
                        f"{'PASS' if passed else 'FAIL'} :: {r.stderr.strip()[:300]}"
                    )
                else:
                    verdict = "accepted" if passed else "rejected"
                    print(f"OK  {name} {cid}: {desc} ({verdict})")
                cluster.psql(f'DROP DATABASE IF EXISTS "{db}";')
    finally:
        cluster.stop()

    total = len(CASES) * len(bodies)
    print(f"\n{total - len(failures)}/{total} cases passed")
    for f in failures:
        print("FAIL " + f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
