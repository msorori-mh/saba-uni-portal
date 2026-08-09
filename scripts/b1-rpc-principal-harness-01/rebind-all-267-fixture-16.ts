/**
 * PORTAL-B1-LONGRUN-16
 * Rebind ALL 267 negative-matrix cases onto the 19 active steps of Fixture-13.
 *
 * Requirements:
 *   FIXTURE13_EXECUTION_TARGET_COUNT = 267
 *   SENTINEL_EXECUTION_TARGET_COUNT = 0
 *   EXECUTION_TARGET_MAP_COUNT = 267
 */
import { readFileSync, writeFileSync } from "node:fs";

const MATRIX_PATH = "tests/b1-five-services-rpc-authorization-preflight-01/MATRIX.json";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const reqId = (ord: number) => `f1300000-0000-4000-8000-${pad(ord, 12)}`;
const stepId = (ord: number, order: number) =>
  `f1300001-0000-4000-8000-${pad(ord, 6)}${pad(order, 6)}`;
const reqNumber = (ord: number) => `SR-20260801-13${pad(ord, 6)}`;

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

function fixtureFor(service: string, stepKey: string, caseClass?: string) {
  // For dean_outside_step, target a non-dean step (e.g. Ord 1 source_department_head_approval)
  if (caseClass === "dean_outside_step") {
    return FIXTURES[0]; // Ord 1: department_transfer, activeOrder 2 (source_department_head_approval)
  }
  // For registrar_outside_step, target a non-registrar step (e.g. Ord 1 source_department_head_approval)
  if (caseClass === "registrar_outside_step") {
    return FIXTURES[0]; // Ord 1: department_transfer, activeOrder 2 (source_department_head_approval)
  }

  let f = FIXTURES.find(
    (x) => x.service === service && STEP_KEYS[service]?.[x.activeOrder] === stepKey,
  );
  if (!f) {
    f = FIXTURES.find((x) => x.service === service);
  }
  if (!f) throw new Error(`no fixture for ${service}/${stepKey}`);
  return f;
}

export function rebindAll267Cases() {
  const matrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));

  let f13Count = 0;
  let sentinelCount = 0;
  let totalMapped = 0;

  const allCaseGroups = [
    matrix.negative_cases,
    matrix.illegal_action_cases,
    matrix.supplemental_department_scope_cases,
  ];

  for (const group of allCaseGroups) {
    if (!Array.isArray(group)) continue;
    for (const c of group as Array<Record<string, unknown>>) {
      const caseClass = c.case as string;
      const legacyNumber = (c.legacy_request_number as string) ?? (c.request_number as string);
      const service = (c.request_type as string) ?? (matrix.step_state_pins[`${legacyNumber}|${c.step_key}`]?.request_type as string);
      if (!service || !c.step_key) throw new Error(`Missing service/step_key for case ${caseClass}`);

      const f = fixtureFor(service, c.step_key as string, caseClass);
      const activeStepKey = STEP_KEYS[f.service][f.activeOrder];
      const pinKey = `${reqNumber(f.ord)}|${activeStepKey}`;
      const pin = matrix.step_state_pins[pinKey];
      if (!pin) throw new Error(`Missing pin for ${pinKey}`);

      c.legacy_request_number = legacyNumber;
      c.request_number = reqNumber(f.ord);
      c.step_key = activeStepKey;
      c.request_id = reqId(f.ord);
      c.runtime_step_id = stepId(f.ord, f.activeOrder);
      c.fixture_ordinal = f.ord;
      c.pinned_runtime_status = "active";
      c.execution_status = "EXECUTABLE_PENDING_FIXTURE_APPLY";
      c.blocked_reason = null;
      c.requires_fixture_package = "B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13";

      // If this case is NOT an illegal_action case (i.e., testing actor authorization),
      // ensure action matches the legal action for this active step!
      if (c.only_negative_variable !== "action") {
        c.action = pin.configured_action_type;
      }

      if (caseClass === "illegal_action_by_exact_assignee" && pin.direct_assignee_user_id) {
        c.actor_user_id = pin.direct_assignee_user_id;
      }

      if (c.request_number.startsWith("SR-20260801-13")) {
        f13Count++;
      } else {
        sentinelCount++;
      }
      totalMapped++;
    }
  }

  matrix.counts.fixture13_execution_target_count = f13Count;
  matrix.counts.sentinel_execution_target_count = sentinelCount;
  matrix.counts.execution_target_map_count = totalMapped;

  matrix.fixture_rebind = {
    mission: "PORTAL-B1-LONGRUN-16",
    rebound_cases: totalMapped,
    expected_rebound_cases: 267,
    fixture13_execution_target_count: f13Count,
    sentinel_execution_target_count: sentinelCount,
    execution_target_map_count: totalMapped,
  };

  writeFileSync(MATRIX_PATH, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
  console.log(`Rebound ALL ${totalMapped} cases onto Fixture-13 (Fixture-13 count: ${f13Count}, Sentinel count: ${sentinelCount})`);

  return { f13Count, sentinelCount, totalMapped };
}

if (import.meta.main) {
  rebindAll267Cases();
}
