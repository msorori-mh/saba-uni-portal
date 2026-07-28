#!/usr/bin/env python3
"""
B1 runtime-assignee LOCK CONCURRENCY harness (local Postgres 17 only).

Boots a throwaway cluster, loads the minimal schema, applies the *unmodified*
migration draft docs/migration-drafts/B1-RUNTIME-ASSIGNEE-PROPAGATION-01.sql,
then runs real two-session concurrency cases against it.

Never point this at production. It only ever talks to the temp cluster it
creates under a temp directory.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PG = HERE / "pg"
ROOT = HERE.parents[1]
DRAFT = ROOT / "docs" / "migration-drafts" / "B1-RUNTIME-ASSIGNEE-PROPAGATION-01.sql"

DB = "b1lock"
os.environ["PGSSLMODE"] = "disable"
os.environ.pop("PGHOST", None)
os.environ.pop("PGUSER", None)
os.environ.pop("PGPASSWORD", None)
os.environ.pop("PGDATABASE", None)
results = []


SANDBOX_UID = 1000  # postgres refuses to run as root; drop privileges when needed


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def run_pg(cmd, **kw):
    """Run a server-side binary (initdb/pg_ctl) as a non-root uid when needed."""
    if os.geteuid() == 0:
        cmd = ["setpriv", "--reuid", str(SANDBOX_UID), "--regid", str(SANDBOX_UID),
               "--clear-groups", "env", "HOME=/tmp"] + cmd
    return run(cmd, **kw)


def psql(sql, port, expect_ok=True):
    p = run(["psql", "-h", "127.0.0.1", "-p", str(port), "-d", DB, "-v", "ON_ERROR_STOP=1",
             "-X", "-q", "-U", "postgres", "-c", sql])
    if expect_ok and p.returncode != 0:
        raise RuntimeError(p.stderr.strip())
    return p


def psql_file(path, port):
    p = run(["psql", "-h", "127.0.0.1", "-p", str(port), "-d", DB, "-v", "ON_ERROR_STOP=1",
             "-X", "-q", "-U", "postgres", "-f", str(path)])
    if p.returncode != 0:
        raise RuntimeError(f"{path}: {p.stderr.strip()}")


def scalar(sql, port):
    p = psql(f"SELECT ({sql})::text", port)
    return p.stdout.strip().splitlines()[2].strip() if len(p.stdout.strip().splitlines()) > 2 else ""


def session(sql, port, out, key):
    t0 = time.time()
    p = run(["psql", "-h", "127.0.0.1", "-p", str(port), "-d", DB, "-v", "ON_ERROR_STOP=1",
             "-X", "-q", "-U", "postgres", "-c", sql])
    out[key] = {"rc": p.returncode, "err": p.stderr.strip(), "elapsed": time.time() - t0}


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def main():
    tmp = tempfile.mkdtemp(prefix="b1lock-")
    data = os.path.join(tmp, "data")
    port = 55439
    try:
        if os.geteuid() == 0:
            os.chown(tmp, SANDBOX_UID, SANDBOX_UID)
        r = run_pg(["initdb", "-D", data, "-U", "postgres", "-A", "trust"])
        if r.returncode != 0:
            raise RuntimeError("initdb failed: " + r.stderr.strip())
        r = run_pg(["pg_ctl", "-D", data,
                    "-o", f"-p {port} -k {tmp} -c listen_addresses=127.0.0.1",
                    "-l", os.path.join(tmp, "log"), "-w", "start"])
        if r.returncode != 0:
            raise RuntimeError("pg_ctl start failed: " + r.stdout + r.stderr)
        r = run(["createdb", "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", DB])
        if r.returncode != 0:
            raise RuntimeError("createdb failed: " + r.stderr.strip())

        psql_file(PG / "10-minimal-schema.sql", port)
        psql_file(DRAFT, port)
        psql_file(PG / "20-fixtures.sql", port)
        check("draft applies cleanly on minimal schema", True)

        STEP2 = "eeeeeeee-0000-0000-0000-000000000002"
        STEP_TR = "eeeeeeee-0000-0000-0000-000000000003"
        STEP_EC = "eeeeeeee-0000-0000-0000-000000000009"
        ASSN = "bbbbbbbb-0000-0000-0000-000000000001"

        def reset():
            psql(f"UPDATE public.student_request_workflow_steps SET status='pending' "
                 f"WHERE id IN ('{STEP2}','{STEP_TR}','{STEP_EC}');", port)
            psql("UPDATE public.student_request_workflow_steps SET status='active' "
                 "WHERE id='eeeeeeee-0000-0000-0000-000000000001';", port)
            psql(f"UPDATE public.request_processing_assignments SET is_active=true "
                 f"WHERE id='{ASSN}';", port)
            psql("DELETE FROM public.request_processing_assignments "
                 "WHERE id='bbbbbbbb-0000-0000-0000-0000000000ff';", port)
            psql("UPDATE public.transfer_request_details "
                 "SET current_department_id='dddddddd-0000-0000-0000-000000000001' "
                 "WHERE request_id='cccccccc-0000-0000-0000-000000000002';", port)

        # ---- Case 1: activation holds the lock; concurrent deactivate must wait
        reset()
        out = {}
        act = (f"BEGIN; UPDATE public.student_request_workflow_steps SET status='completed' "
               f"WHERE id='eeeeeeee-0000-0000-0000-000000000001'; "
               f"UPDATE public.student_request_workflow_steps SET status='active' WHERE id='{STEP2}'; "
               f"SELECT pg_sleep(2); COMMIT;")
        mut = f"UPDATE public.request_processing_assignments SET is_active=false WHERE id='{ASSN}';"
        t1 = threading.Thread(target=session, args=(act, port, out, "act"))
        t1.start(); time.sleep(0.7)
        t2 = threading.Thread(target=session, args=(mut, port, out, "mut"))
        t2.start(); t1.join(); t2.join()
        check("C1 activation succeeds", out["act"]["rc"] == 0, out["act"]["err"][:120])
        check("C1 concurrent deactivate blocked until activation commit",
              out["mut"]["rc"] == 0 and out["mut"]["elapsed"] > 1.0,
              f"waited {out['mut']['elapsed']:.2f}s")
        check("C1 step ended active exactly once",
              scalar(f"SELECT count(*) FROM public.student_request_workflow_steps "
                     f"WHERE student_request_id='cccccccc-0000-0000-0000-000000000001' "
                     f"AND status='active'", port) == "1")

        # ---- Case 2: deactivate first -> activation blocks, then is rejected
        reset()
        out = {}
        mut = (f"BEGIN; UPDATE public.request_processing_assignments SET is_active=false "
               f"WHERE id='{ASSN}'; SELECT pg_sleep(2); COMMIT;")
        act = f"UPDATE public.student_request_workflow_steps SET status='active' WHERE id='{STEP2}';"
        t1 = threading.Thread(target=session, args=(mut, port, out, "mut")); t1.start()
        time.sleep(0.7)
        t2 = threading.Thread(target=session, args=(act, port, out, "act")); t2.start()
        t1.join(); t2.join()
        check("C2 activation waited for the mutation (no stale read)",
              out["act"]["elapsed"] > 1.0, f"waited {out['act']['elapsed']:.2f}s")
        check("C2 activation rejected fail-closed",
              out["act"]["rc"] != 0 and "B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE" in out["act"]["err"],
              out["act"]["err"].splitlines()[0][:120] if out["act"]["err"] else "")
        check("C2 no partial activation persisted",
              scalar(f"SELECT status FROM public.student_request_workflow_steps WHERE id='{STEP2}'", port)
              == "pending")

        # ---- Case 3: concurrent phantom second assignment
        reset()
        out = {}
        mut = ("BEGIN; INSERT INTO public.request_processing_assignments "
               "(id,unit_id,role_id,assignment_type,staff_profile_id,is_active) VALUES "
               "('bbbbbbbb-0000-0000-0000-0000000000ff','f1000000-0000-0000-0000-000000000001',"
               "'f2000000-0000-0000-0000-000000000001','staff_profile',"
               "'22222222-0000-0000-0000-000000000002',true); SELECT pg_sleep(2); COMMIT;")
        t1 = threading.Thread(target=session, args=(mut, port, out, "mut")); t1.start()
        time.sleep(0.7)
        t2 = threading.Thread(target=session, args=(act, port, out, "act")); t2.start()
        t1.join(); t2.join()
        check("C3 activation waited for the phantom insert",
              out["act"]["elapsed"] > 1.0, f"waited {out['act']['elapsed']:.2f}s")
        check("C3 activation rejected with count 2",
              out["act"]["rc"] != 0 and "MUST_RESOLVE_ONCE" in out["act"]["err"]
              and ":registrar_review:2" in out["act"]["err"],
              out["act"]["err"].splitlines()[0][:140] if out["act"]["err"] else "")
        check("C3 no active step created",
              scalar(f"SELECT status FROM public.student_request_workflow_steps WHERE id='{STEP2}'", port)
              == "pending")

        # ---- Case 4: department scope change vs transfer head activation
        reset()
        out = {}
        mut = ("BEGIN; UPDATE public.transfer_request_details "
               "SET current_department_id='dddddddd-0000-0000-0000-000000000002' "
               "WHERE request_id='cccccccc-0000-0000-0000-000000000002'; "
               "SELECT pg_sleep(2); COMMIT;")
        act_tr = f"UPDATE public.student_request_workflow_steps SET status='active' WHERE id='{STEP_TR}';"
        t1 = threading.Thread(target=session, args=(mut, port, out, "mut")); t1.start()
        time.sleep(0.7)
        t2 = threading.Thread(target=session, args=(act_tr, port, out, "act")); t2.start()
        t1.join(); t2.join()
        check("C4 head activation waited for the department re-scope",
              out["act"]["elapsed"] > 1.0, f"waited {out['act']['elapsed']:.2f}s")
        check("C4 head activation rejected after re-scope",
              out["act"]["rc"] != 0 and "B1_RUNTIME_ASSIGNEE" in out["act"]["err"],
              out["act"]["err"].splitlines()[0][:140] if out["act"]["err"] else "")

        # ---- Case 5: safe retry after the data is corrected
        reset()
        p = psql(act, port, expect_ok=False)
        check("C5 retry after correction activates exactly once",
              p.returncode == 0 and
              scalar(f"SELECT status FROM public.student_request_workflow_steps WHERE id='{STEP2}'", port)
              == "active")

        # ---- Case 6: no deadlock under the lock contract
        # 6a. one multi-scope call with reversed key arrays: the shared entry
        #     point sorts the keys, so the acquisition order is global.
        reset()
        out = {}
        k1 = "public.b1_assignment_scope_lock_key('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001')"
        k2 = "public.b1_assignment_scope_lock_key('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002')"
        a = f"BEGIN; SELECT public.b1_lock_assignment_scopes(ARRAY[{k1},{k2}]); SELECT pg_sleep(1.5); COMMIT;"
        b = f"BEGIN; SELECT pg_sleep(0.3); SELECT public.b1_lock_assignment_scopes(ARRAY[{k2},{k1}]); COMMIT;"
        t1 = threading.Thread(target=session, args=(a, port, out, "a")); t1.start()
        t2 = threading.Thread(target=session, args=(b, port, out, "b")); t2.start()
        t1.join(); t2.join()
        check("C6a multi-scope call sorts keys: no deadlock",
              out["a"]["rc"] == 0 and out["b"]["rc"] == 0 and
              "deadlock" not in (out["a"]["err"] + out["b"]["err"]).lower(),
              (out["a"]["err"] + out["b"]["err"])[:120])

        # 6b. natural production ordering: each transaction touches exactly one
        #     scope (one activation, or one assignment statement), crossed.
        reset()
        out = {}
        a = (f"BEGIN; UPDATE public.student_request_workflow_steps SET status='completed' "
             f"WHERE id='eeeeeeee-0000-0000-0000-000000000001'; "
             f"UPDATE public.student_request_workflow_steps SET status='active' WHERE id='{STEP2}'; "
             f"SELECT pg_sleep(1); COMMIT;")
        b = ("BEGIN; UPDATE public.request_processing_assignments SET is_active=is_active "
             "WHERE id='bbbbbbbb-0000-0000-0000-000000000002'; SELECT pg_sleep(1); "
             "UPDATE public.request_processing_assignments SET is_active=is_active "
             "WHERE id='bbbbbbbb-0000-0000-0000-000000000003'; COMMIT;")
        t1 = threading.Thread(target=session, args=(a, port, out, "a")); t1.start()
        t2 = threading.Thread(target=session, args=(b, port, out, "b")); t2.start()
        t1.join(); t2.join()
        check("C6b crossed activation/mutation on distinct scopes: no deadlock",
              out["a"]["rc"] == 0 and out["b"]["rc"] == 0 and
              "deadlock" not in (out["a"]["err"] + out["b"]["err"]).lower(),
              (out["a"]["err"] + out["b"]["err"])[:120])

        # ---- Case 7: legacy (non-B1) activation takes no lock and is unaffected
        reset()
        out = {}
        hold = (f"BEGIN; UPDATE public.request_processing_assignments SET is_active=is_active "
                f"WHERE id='{ASSN}'; SELECT pg_sleep(2); COMMIT;")
        legacy = f"UPDATE public.student_request_workflow_steps SET status='active' WHERE id='{STEP_EC}';"
        t1 = threading.Thread(target=session, args=(hold, port, out, "hold")); t1.start()
        time.sleep(0.5)
        t2 = threading.Thread(target=session, args=(legacy, port, out, "legacy")); t2.start()
        t1.join(); t2.join()
        check("C7 enrollment_certificate activation is not blocked and not guarded",
              out["legacy"]["rc"] == 0 and out["legacy"]["elapsed"] < 1.0,
              f"{out['legacy']['elapsed']:.2f}s")

        failed = [n for n, ok, _ in results if not ok]
        print("\nSUMMARY:", len(results) - len(failed), "passed,", len(failed), "failed")
        return 1 if failed else 0
    finally:
        run_pg(["pg_ctl", "-D", data, "-m", "immediate", "-w", "stop"])
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
