#!/usr/bin/env python3
"""PORTAL-B1-ISOLATED-NONPRODUCTION-AUTHORIZATION-ENVIRONMENT-65

Generates ISO-MATRIX.json for the isolated (non-production) cluster by
re-projecting the production authorization matrix classes onto the TEST_ONLY
fixtures, where EVERY one of the 24 B1 staff steps has an ACTIVE runtime step.

Reads: tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json (classes only)
       isodb (fixture ids, assignees, owners)
Writes: scripts/b1-isolated-authorization-env-65/ISO-MATRIX.json
        scripts/b1-isolated-authorization-env-65/41-negative-cases.sql
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "scripts", "b1-isolated-authorization-env-65")
PROD = json.load(open(os.path.join(ROOT, "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json"), encoding="utf-8"))

ISO_PRINCIPALS = {
    "student_affairs/student_affairs_specialist": "e5520000-0000-4000-8000-000000000001",
    "student_affairs/student_affairs_manager":    "e5520000-0000-4000-8000-000000000002",
    "library/library_officer":                    "e5520000-0000-4000-8000-000000000003",
    "labs/labs_manager":                          "e5520000-0000-4000-8000-000000000004",
    "finance/revenue_finance_officer":            "e5520000-0000-4000-8000-000000000005",
    "registrar/registrar_general":                "e5520000-0000-4000-8000-000000000006",
    "archive/archive_officer":                    "e5520000-0000-4000-8000-000000000007",
    "dean/dean":                                  "e5520000-0000-4000-8000-000000000008",
    "department/department_head@source":          "e5520000-0000-4000-8000-000000000009",
    "department/department_head@target":          "e5520000-0000-4000-8000-000000000010",
    "department/department_head@third":           "e5520000-0000-4000-8000-000000000011",
    "platform/admin":                             "e5520000-0000-4000-8000-000000000012",
    "platform/system_admin":                      "e5520000-0000-4000-8000-000000000013",
}
PROD_TO_KEY = {v: k for k, v in PROD["principals"].items()}


def psql(sql):
    env = dict(os.environ)
    for k in ("PGSSLMODE", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"):
        env.pop(k, None)
    out = subprocess.run(
        ["psql", "-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "isodb", "-tAF", "\x1f", "-c", sql],
        env=env, capture_output=True, text=True, check=True).stdout
    return [line.split("\x1f") for line in out.strip().splitlines() if line]


rows = psql("""
select r.request_number, r.request_type, (r.form_data->>'fixture_target_step_order')::int,
       sp.user_id::text, s.step_key, s.step_order, s.id::text, s.status,
       u.code, ro.code, s.metadata->>'action_type',
       coalesce(s.assigned_user_id,
                (select x.user_id from staff_profiles x where x.id=s.assigned_staff_profile_id),
                (select x.user_id from faculty_profiles x where x.id=s.assigned_faculty_profile_id),
                (select x.user_id from position_assignments x where x.id=s.assigned_position_assignment_id))::text
from student_requests r
join student_profiles sp on sp.id=r.student_profile_id
join student_request_workflow_steps s on s.student_request_id=r.id
join request_processing_units u on u.id=s.processing_unit_id
join request_processing_roles ro on ro.id=s.processing_role_id
where r.request_number like 'ISO-TESTONLY-%'
order by r.request_number, s.step_order
""")

fixtures = {}
for (rn, rtype, target, owner, step_key, order, sid, status, unit, role, action, assignee) in rows:
    f = fixtures.setdefault(rn, {"request_number": rn, "request_type": rtype,
                                 "target_step_order": int(target), "owner_user_id": owner, "steps": []})
    f["steps"].append({"step_key": step_key, "step_order": int(order), "runtime_step_id": sid,
                       "status": status, "unit": unit, "role": role, "action_type": action,
                       "assignee_user_id": assignee})

ILLEGAL_ACTION = {"review": "approve", "approve": "review", "clear": "approve",
                  "apply_decision": "approve", "archive": "approve", "confirm_payment": "approve"}

cases, supplemental = [], []
for rn, f in sorted(fixtures.items()):
    target = next(s for s in f["steps"] if s["step_order"] == f["target_step_order"])
    assert target["status"] == "active", f"{rn}: target step is not active"
    nxt = next((s for s in f["steps"] if s["step_order"] == target["step_order"] + 1), None)
    prev = next((s for s in f["steps"] if s["step_order"] == target["step_order"] - 1), None)
    unit, role, action, sid = target["unit"], target["role"], target["action_type"], target["runtime_step_id"]
    assignee = target["assignee_user_id"]

    def other(*keys):
        for k in keys:
            uid = ISO_PRINCIPALS[k]
            if uid != assignee:
                return uid
        raise AssertionError("no substitute principal")

    peer = other("student_affairs/student_affairs_manager", "student_affairs/student_affairs_specialist",
                 "library/library_officer")
    wrong_unit = other("labs/labs_manager", "archive/archive_officer", "library/library_officer")

    plan = [
        ("anonymous_no_jwt", None, action),
        ("request_owner_student", f["owner_user_id"], action),
        ("unassigned_admin", ISO_PRINCIPALS["platform/admin"], action),
        ("unassigned_system_admin", ISO_PRINCIPALS["platform/system_admin"], action),
        ("registrar_outside_step", other("registrar/registrar_general", "platform/admin"), action),
        ("dean_outside_step", other("dean/dean", "platform/system_admin"), action),
        ("wrong_role_same_unit_or_peer", peer, action),
        ("wrong_unit_principal", wrong_unit, action),
        ("next_step_assignee_early",
         (nxt or {}).get("assignee_user_id") or ISO_PRINCIPALS["department/department_head@third"], action),
        ("previous_step_assignee_replay",
         (prev or {}).get("assignee_user_id") or ISO_PRINCIPALS["department/department_head@third"], action),
    ]
    for name, actor, act in plan:
        if actor is not None and actor == assignee:
            actor = ISO_PRINCIPALS["department/department_head@third"]
            if actor == assignee:
                actor = ISO_PRINCIPALS["platform/admin"]
        cases.append({"case": name, "request_number": rn, "request_type": f["request_type"],
                      "step_key": target["step_key"], "runtime_step_id": sid, "unit": unit, "role": role,
                      "actor_user_id": actor, "action": act, "expect": "DENY",
                      "zero_mutation": True, "execution_status": "EXECUTABLE"})

    cases.append({"case": "illegal_action_by_exact_assignee", "request_number": rn,
                  "request_type": f["request_type"], "step_key": target["step_key"], "runtime_step_id": sid,
                  "unit": unit, "role": role, "actor_user_id": assignee,
                  "action": ILLEGAL_ACTION[action], "expect": "DENY", "zero_mutation": True,
                  "execution_status": "EXECUTABLE"})

# Supplemental transfer department-scope swaps, now on ACTIVE fixtures.
src_fix = next(f for f in fixtures.values()
               if f["request_type"] == "department_transfer"
               and next(s for s in f["steps"] if s["step_order"] == f["target_step_order"])["step_key"]
               == "source_department_head_approval")
tgt_fix = next(f for f in fixtures.values()
               if f["request_type"] == "department_transfer"
               and next(s for s in f["steps"] if s["step_order"] == f["target_step_order"])["step_key"]
               == "target_department_head_approval")
for label, fix, step_key, actor in [
    ("department_scope_swap_target_head_on_source_step", src_fix, "source_department_head_approval",
     ISO_PRINCIPALS["department/department_head@target"]),
    ("department_scope_swap_source_head_on_target_step", tgt_fix, "target_department_head_approval",
     ISO_PRINCIPALS["department/department_head@source"]),
    ("third_department_head_unrelated", tgt_fix, "target_department_head_approval",
     ISO_PRINCIPALS["department/department_head@third"]),
]:
    step = next(s for s in fix["steps"] if s["step_key"] == step_key)
    supplemental.append({"case": label, "request_number": fix["request_number"],
                         "request_type": "department_transfer", "step_key": step_key,
                         "runtime_step_id": step["runtime_step_id"], "unit": step["unit"],
                         "role": step["role"], "actor_user_id": actor, "action": step["action_type"],
                         "expect": "DENY", "zero_mutation": True, "execution_status": "EXECUTABLE"})

core = [c for c in cases if c["case"] != "illegal_action_by_exact_assignee"]
illegal = [c for c in cases if c["case"] == "illegal_action_by_exact_assignee"]
matrix = {
    "matrix_id": "PORTAL-B1-ISOLATED-NONPRODUCTION-AUTHORIZATION-ENVIRONMENT-65",
    "environment": {"kind": "ISOLATED_NON_PRODUCTION", "database": "isodb", "host": "127.0.0.1",
                    "port": 54329, "production_ref": None, "staging_ref": None,
                    "data_policy": "TEST_ONLY_ONLY"},
    "derived_from": PROD["matrix_id"],
    "denial_class_contract": PROD["denial_class_contract"],
    "principals": ISO_PRINCIPALS,
    "fixtures": fixtures,
    "negative_cases": core,
    "illegal_action_cases": illegal,
    "supplemental_department_scope_cases": supplemental,
    "counts": {"negative_core": len(core), "illegal_action": len(illegal),
               "supplemental_department_scope": len(supplemental),
               "total": len(core) + len(illegal) + len(supplemental),
               "executable": len(core) + len(illegal) + len(supplemental), "blocked": 0},
}
with open(os.path.join(OUT, "ISO-MATRIX.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump(matrix, fh, ensure_ascii=False, indent=2)
    fh.write("\n")

lines = []
for c in core + illegal + supplemental:
    actor = "NULL" if c["actor_user_id"] is None else "'%s'" % c["actor_user_id"]
    lines.append("SELECT pg_temp.iso_neg_case('%s','%s','%s',%s,'%s');" %
                 (c["case"], c["request_number"], c["step_key"], actor, c["action"]))
with open(os.path.join(OUT, "41-negative-cases.sql"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write("-- GENERATED by 40-generate-iso-matrix.py — do not edit by hand.\n")
    fh.write("\n".join(lines) + "\n")

print(json.dumps(matrix["counts"], indent=2))
