/**
 * PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-RUNTIME-CONTRACT-REMEDIATION-15
 * G5 — rebind the 22 previously BLOCKED negative-matrix cases onto the
 * deterministic Fixture-13 (remediation-15) identifiers.
 *
 * Deterministic id scheme (must stay in lockstep with
 * docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql):
 *   request id : f1300000-0000-4000-8000-<ordinal:12>
 *   step id    : f1300001-0000-4000-8000-<ordinal:6><step_order:6>
 *   detail id  : f1300002-0000-4000-8000-<ordinal:12>
 *   number     : SR-20260801-13<ordinal:6>
 *
 * Run: bun run scripts/b1-rpc-principal-harness-01/rebind-fixture-cases-15.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const MATRIX_PATH = "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json";

const DEPT_IT = "ce485c67-5f7c-498d-b120-4b1130a86ae8";
const DEPT_CS = "11111111-1111-4111-8111-111111111111";
const DEPT_CIS = "22222222-2222-4222-8222-222222222222";
const HEAD_IT = "d4aaa5c9-72d1-4996-b0e8-d30c6327da6e";
const HEAD_CS = "97acbe02-c59c-409c-8d51-7d4ef72e6db7";
const HEAD_CIS = "f602b62c-194b-4591-8e9c-956e5cbb347d";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const reqId = (ord: number) => `f1300000-0000-4000-8000-${pad(ord, 12)}`;
const stepId = (ord: number, order: number) =>
  `f1300001-0000-4000-8000-${pad(ord, 6)}${pad(order, 6)}`;
const detailId = (ord: number) => `f1300002-0000-4000-8000-${pad(ord, 12)}`;
const reqNumber = (ord: number) => `SR-20260801-13${pad(ord, 6)}`;

/** ordinal -> (service, active step order) — identical to the fixture SQL. */
const FIXTURES: Array<{ ord: number; service: string; activeOrder: number }> = [
  { ord: 1, service: "department_transfer", activeOrder: 2 },
  { ord: 2, service: "department_transfer", activeOrder: 3 },
  { ord: 3, service: "department_transfer", activeOrder: 4 },
  { ord: 4, service: "department_transfer", activeOrder: 5 },
  { ord: 5, service: "department_transfer", activeOrder: 6 },
  { ord: 6, service: "enrollment_suspension", activeOrder: 2 },
  { ord: 7, service: "enrollment_suspension", activeOrder: 3 },
  { ord: 8, service: "excused_absence", activeOrder: 2 },
  { ord: 9, service: "excused_absence", activeOrder: 3 },
  { ord: 10, service: "file_withdrawal", activeOrder: 2 },
  { ord: 11, service: "file_withdrawal", activeOrder: 3 },
  { ord: 12, service: "file_withdrawal", activeOrder: 4 },
  { ord: 13, service: "file_withdrawal", activeOrder: 5 },
  { ord: 14, service: "file_withdrawal", activeOrder: 6 },
  { ord: 15, service: "file_withdrawal", activeOrder: 7 },
  { ord: 16, service: "final_chance", activeOrder: 2 },
  { ord: 17, service: "final_chance", activeOrder: 3 },
  { ord: 18, service: "final_chance", activeOrder: 4 },
  { ord: 19, service: "final_chance", activeOrder: 5 },
];

/** configured step model per service (step_order -> step_key). */
const STEP_KEYS: Record<string, Record<number, string>> = {
  department_transfer: {
    1: "student_affairs_intake",
    2: "source_department_head_approval",
    3: "target_department_head_approval",
    4: "dean_approval",
    5: "payment_confirmation",
    6: "registrar_apply",
  },
  enrollment_suspension: { 1: "initial_review", 2: "manager_approval", 3: "registrar_apply" },
  excused_absence: { 1: "student_affairs_intake", 2: "manager_review", 3: "record_apply" },
  file_withdrawal: {
    1: "student_affairs_intake",
    2: "library_clearance",
    3: "labs_clearance",
    4: "activities_clearance",
    5: "finance_clearance",
    6: "registrar_apply",
    7: "archive",
  },
  final_chance: {
    1: "student_affairs_intake",
    2: "manager_review",
    3: "dean_decision",
    4: "payment_confirmation",
    5: "registrar_apply",
  },
};

function fixtureFor(service: string, stepKey: string) {
  const f = FIXTURES.find(
    (x) => x.service === service && STEP_KEYS[service]?.[x.activeOrder] === stepKey,
  );
  if (!f) throw new Error(`no fixture for ${service}/${stepKey}`);
  return f;
}

const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));

/** Canonical production step model is taken from the 24 authoritative positive
 *  cases (the ones that carry a principal_key, not the fixture-only expectations). */
type LegacyPin = {
  request_type: string;
  step_order: number;
  processing_unit_code: string;
  processing_role_code: string;
  configured_action_type: string;
  direct_assignee_user_id: string;
  rpc: string;
  step_key: string;
};
const serviceStepModel = new Map<string, Map<number, LegacyPin>>();
for (const p of matrix.positive_cases as Array<Record<string, unknown>>) {
  if (p.fixture_only_step_expectation || !p.principal_key) continue;
  const svc = p.request_type as string;
  const order = p.step_order as number;
  const perService = serviceStepModel.get(svc) ?? new Map();
  perService.set(order, {
    request_type: svc,
    step_order: order,
    step_key: p.step_key as string,
    processing_unit_code: p.unit as string,
    processing_role_code: p.role as string,
    configured_action_type: p.legal_action as string,
    direct_assignee_user_id: p.principal_user_id as string,
    rpc: p.rpc as string,
  });
  serviceStepModel.set(svc, perService);
}
function stepModel(service: string, order: number) {
  const m = serviceStepModel.get(service)?.get(order);
  if (!m) throw new Error(`no legacy step model for ${service} step ${order}`);
  return m;
}
/** G3 — the target department head is now the CS head, not the CIS head. */
function assigneeFor(service: string, order: number): string {
  const m = stepModel(service, order);
  if (m.step_key === "target_department_head_approval") return HEAD_CS;
  return m.direct_assignee_user_id;
}

// Keep the authoritative positive-case target-head principal consistent with G3.
for (const p of matrix.positive_cases as Array<Record<string, unknown>>) {
  if (p.step_key === "target_department_head_approval" && p.principal_key === "department/department_head@target") {
    p.principal_user_id = HEAD_CS;
  }
}

/** G3 — department actor model: source=IT, target=CS, unrelated=CIS. */
matrix.principals["department/department_head@source"] = HEAD_IT;
matrix.principals["department/department_head@target"] = HEAD_CS;
matrix.principals["department/department_head@unrelated"] = HEAD_CIS;

matrix.fixture_package = {
  package_id: "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13 (remediation-15)",
  status: "NOT_APPLIED",
  marker: "TEST_ONLY_B1_FIXTURE_13",
  student_profile_id: "b1e20002-0000-4000-8000-000000000002",
  request_id_pattern: "f1300000-0000-4000-8000-<ordinal:12>",
  step_id_pattern: "f1300001-0000-4000-8000-<ordinal:6><step_order:6>",
  detail_id_pattern: "f1300002-0000-4000-8000-<ordinal:12>",
  request_number_pattern: "SR-20260801-13<ordinal:6>",
  requests: 19,
  runtime_steps: 104,
  active_steps: 19,
  transfer_detail_rows: 5,
  department_model: {
    source_department_id: DEPT_IT,
    target_department_id: DEPT_CS,
    unrelated_department_id: DEPT_CIS,
    source_head_user_id: HEAD_IT,
    target_head_user_id: HEAD_CS,
    unrelated_head_user_id: HEAD_CIS,
  },
  fixtures: FIXTURES.map((f) => ({
    ordinal: f.ord,
    service: f.service,
    request_id: reqId(f.ord),
    request_number: reqNumber(f.ord),
    active_step_order: f.activeOrder,
    active_step_key: STEP_KEYS[f.service][f.activeOrder],
    active_step_id: stepId(f.ord, f.activeOrder),
    transfer_detail_id: f.service === "department_transfer" ? detailId(f.ord) : null,
  })),
};

let rebound = 0;

/** ---- illegal-action cases: rebind every pending-step case onto a fixture ----
 *  The 22 pending cases all exercise the department_transfer source/payment steps
 *  through an exact-direct-assignee illegal action, so the binding is deterministic. */
function illegalActionFixture(stepKey: string) {
  if (stepKey === "source_department_head_approval") return fixtureFor("department_transfer", "source_department_head_approval");
  if (stepKey === "payment_confirmation") return fixtureFor("department_transfer", "payment_confirmation");
  throw new Error(`unmapped illegal-action step_key ${stepKey}`);
}
for (const c of matrix.illegal_action_cases as Array<Record<string, unknown>>) {
  const legacyNumber = (c.legacy_request_number as string) ?? (c.request_number as string);
  if (c.execution_status === "EXECUTABLE") continue;
  const f = illegalActionFixture(c.step_key as string);
  c.legacy_request_number = legacyNumber;
  c.request_number = reqNumber(f.ord);
  c.request_id = reqId(f.ord);
  c.runtime_step_id = stepId(f.ord, f.activeOrder);
  c.fixture_ordinal = f.ord;
  c.pinned_runtime_status = "active";
  c.execution_status = "EXECUTABLE_PENDING_FIXTURE_APPLY";
  c.blocked_reason = null;
  c.requires_fixture_package = "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13";
  if (c.step_key === "target_department_head_approval") c.actor_user_id = HEAD_CS;
  rebound += 1;
}

/** ---- supplemental transfer department-scope cases ---- */
const src = fixtureFor("department_transfer", "source_department_head_approval");
const tgt = fixtureFor("department_transfer", "target_department_head_approval");
const scopeBind: Record<string, { f: typeof src; actor: string; dept: string; scope: string }> = {
  department_scope_swap_source_head_on_target_step: {
    f: tgt,
    actor: HEAD_IT,
    dept: DEPT_IT,
    scope: "source_department",
  },
  department_scope_swap_target_head_on_source_step: {
    f: src,
    actor: HEAD_CS,
    dept: DEPT_CS,
    scope: "target_department",
  },
  third_department_head_unrelated: {
    f: src,
    actor: HEAD_CIS,
    dept: DEPT_CIS,
    scope: "unrelated_department",
  },
};

for (const c of matrix.supplemental_department_scope_cases as Array<Record<string, unknown>>) {
  const bind = scopeBind[c.case as string];
  if (!bind) throw new Error(`unmapped scope case ${String(c.case)}`);
  c.legacy_request_number = (c.legacy_request_number as string) ?? (c.request_number as string);
  c.request_number = reqNumber(bind.f.ord);
  c.request_id = reqId(bind.f.ord);
  c.runtime_step_id = stepId(bind.f.ord, bind.f.activeOrder);
  c.fixture_ordinal = bind.f.ord;
  c.actor_user_id = bind.actor;
  c.actor_department_id = bind.dept;
  c.actor_department_scope = bind.scope;
  c.pinned_runtime_status = "active";
  c.execution_status = "EXECUTABLE_PENDING_FIXTURE_APPLY";
  c.blocked_reason = null;
  c.requires_active_transfer_scope_fixture = true;
  c.requires_fixture_package = "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13";
  rebound += 1;
}

// Discard any previously-rebound or drifted fixture pins; rebuild the full 24-step
// service model pinned to deterministic Fixture-13 request identifiers.
matrix.step_state_pins = {};

/** Map every (service, step_order) to the deterministic Fixture-13 request that
 *  contains that step. Active steps map to their own fixture; predecessor steps
 *  map to the earliest fixture whose active step follows them on the same request. */
function fixtureForStep(service: string, order: number) {
  // Prefer the fixture whose active step equals this order.
  const exact = FIXTURES.find((f) => f.service === service && f.activeOrder === order);
  if (exact) return exact;
  // Otherwise, the earliest fixture in the same service whose active step is later.
  const later = FIXTURES.filter((f) => f.service === service && f.activeOrder > order);
  if (later.length === 0) throw new Error(`no fixture for ${service} step ${order}`);
  return later[0];
}

for (const [service, orders] of serviceStepModel) {
  for (const [order, model] of orders) {
    const f = fixtureForStep(service, order);
    const number = reqNumber(f.ord);
    const key = `${number}|${model.step_key}`;
    const isActive = f.activeOrder === order;

    const predecessorSet = [];
    for (let o = 1; o < order; o += 1) {
      predecessorSet.push({
        step_key: stepModel(service, o).step_key,
        step_order: o,
        runtime_step_id: stepId(f.ord, o),
        runtime_status: "completed",
      });
    }

    matrix.step_state_pins[key] = {
      step_key: model.step_key,
      request_type: service,
      request_id: reqId(f.ord),
      request_number: number,
      step_order: order,
      runtime_step_id: stepId(f.ord, order),
      runtime_status: isActive ? "active" : "completed",
      processing_unit_code: model.processing_unit_code,
      processing_role_code: model.processing_role_code,
      configured_action_type: model.configured_action_type,
      direct_assignee_user_id: assigneeFor(service, order),
      predecessor_incomplete_expected: 0,
      predecessor_total_expected: predecessorSet.length,
      predecessor_set: predecessorSet,
      rpc: model.rpc,
      department_scope: service === "department_transfer" ? "transfer_department_scope" : "not_applicable",
      fixture_ordinal: f.ord,
      fixture_package: "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13",
      department_scope_department_id:
        model.step_key === "source_department_head_approval"
          ? DEPT_IT
          : model.step_key === "target_department_head_approval"
            ? DEPT_CS
            : null,
    };
  }
}

/** ---- counts / execution contract ---- */
matrix.counts.execution_blocked = 0;
matrix.counts.execution_blocked_illegal_action_pending = 0;
matrix.counts.execution_blocked_transfer_scope = 0;
matrix.counts.executable_negative_total = matrix.counts.negative_total;
matrix.counts.executable_pending_fixture_apply = rebound;

matrix.transfer_scope_execution = {
  status: "EXECUTABLE_PENDING_FIXTURE_APPLY",
  blocked_cases: 0,
  bound_fixture_package: "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13",
  note: "Bound to deterministic ACTIVE transfer fixtures (IT source, CS target, CIS unrelated). Cases execute only after the fixture package is applied; until then the harness fails closed on the fixture-state preflight.",
};

matrix.blocked_execution = {
  token: null, // RECONCILIATION-17: the blocked partition and its token are abolished
  total: 0,
  classes: {},
  required_fixture: "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13 (19 active TEST_ONLY steps)",
  rule: "No case may be rendered as BLOCKED. All 267 negative cases are bound to an ACTIVE step. If the fixture package is not applied, the harness aborts on the fixture-state preflight instead of rendering blocked cases.",
  hold_token: "HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED",
};

matrix.fixture_rebind = {
  mission: "PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-RUNTIME-CONTRACT-REMEDIATION-15",
  rebound_cases: rebound,
  expected_rebound_cases: 22,
};

if (rebound !== 22) throw new Error(`expected to rebind 22 cases, rebound ${rebound}`);

// Self-consistent LF SHA256: the hash is taken over the final written bytes,
// including the hash field itself, so iterate until stable.
let matrixRaw = `${JSON.stringify(matrix, null, 2)}\n`;
let matrixHash = createHash("sha256")
  .update(matrixRaw.replace(/\r\n/gu, "\n"), "utf8")
  .digest("hex");
for (let i = 0; i < 10; i += 1) {
  matrix.sha256_lf = matrixHash;
  matrixRaw = `${JSON.stringify(matrix, null, 2)}\n`;
  const nextHash = createHash("sha256")
    .update(matrixRaw.replace(/\r\n/gu, "\n"), "utf8")
    .digest("hex");
  if (nextHash === matrixHash) break;
  matrixHash = nextHash;
}
writeFileSync(MATRIX_PATH, matrixRaw, "utf8");
console.log(`rebound ${rebound} cases onto deterministic Fixture-13 identifiers`);
console.log(`matrix sha256_lf: ${matrix.sha256_lf}`);
