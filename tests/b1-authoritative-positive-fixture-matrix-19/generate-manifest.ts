import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FixtureCase {
  case_index: number;
  request_number: string;
  request_id: string;
  service_code: string;
  runtime_step_id: string;
  step_index: number;
  step_code: string;
  direct_assignee_principal_id: string;
  processing_role: string;
  processing_unit: string;
  department_scope: string | null;
  exact_configured_action: string;
  exact_rpc_signature: string;
  expected_predecessor_state: {
    request_status: string;
    step_status: string;
    prior_steps_completed: number;
  };
  expected_successor_state: {
    executed_step_status: string;
    next_step_status: string | null;
    request_status: string;
  };
  expected_workflow_event: {
    event_type: string;
    actor_id: string;
    action: string;
    creates_event_record: boolean;
  };
  expected_next_active_step: string | null;
  expected_business_effect: string;
  zero_mutation_scope: string[];
}

export interface AuthoritativeManifest {
  matrix_metadata: {
    name: string;
    fixture_migration: string;
    migration_head: string;
    baseline_head: string;
    total_requests: number;
    total_active_runtime_steps: number;
    active_steps_per_request: number;
    rejected_prefix: string;
    execution_authorization: boolean;
    production_connection: boolean;
  };
  cases: FixtureCase[];
}

const PRINCIPALS = {
  sa_spec: "c8a94548-4782-4252-86f9-23559d3b95bd",
  sa_mgr: "aac0e62d-4e8b-4440-b649-caa388d34837",
  registrar: "4c261c1c-97fb-42da-a544-e8a59853ebe3",
  dean: "b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0",
  finance: "79783c0f-8d95-4110-8239-0ac504d63a24",
  library: "e7a93314-bb06-4525-b412-5315198c668a",
  labs: "67b39ee4-4918-4b00-b4cc-0d5046ac8a5a",
  archive: "aec1303e-de6a-4580-94cf-7205c17b5535",
  head_it: "d4aaa5c9-72d1-4996-b0e8-d30c6327da6e",
  head_cs: "97acbe02-c59c-409c-8d51-7d4ef72e6db7",
};

const DEPTS = {
  it: "ce485c67-5f7c-498d-b120-4b1130a86ae8",
  cs: "11111111-1111-4111-8111-111111111111",
  cis: "22222222-2222-4222-8222-222222222222",
};

const RAW_CASES: Array<{
  ord: number;
  service: string;
  activeOrder: number;
  stepKey: string;
  unit: string;
  role: string;
  deptScope: string | null;
  principal: string;
  action: string;
  rpc: string;
  nextStep: string | null;
  terminal: boolean;
  effect: string;
}> = [
  {
    ord: 1,
    service: "department_transfer",
    activeOrder: 2,
    stepKey: "source_department_head_approval",
    unit: "department",
    role: "department_head",
    deptScope: DEPTS.it,
    principal: PRINCIPALS.head_it,
    action: "approve",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "target_department_head_approval",
    terminal: false,
    effect: "Source IT department head approves transfer to CS; workflow advances to step 3 (target_department_head_approval).",
  },
  {
    ord: 2,
    service: "department_transfer",
    activeOrder: 3,
    stepKey: "target_department_head_approval",
    unit: "department",
    role: "department_head",
    deptScope: DEPTS.cs,
    principal: PRINCIPALS.head_cs,
    action: "approve",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "dean_approval",
    terminal: false,
    effect: "Target CS department head approves transfer from IT; workflow advances to step 4 (dean_approval).",
  },
  {
    ord: 3,
    service: "department_transfer",
    activeOrder: 4,
    stepKey: "dean_approval",
    unit: "dean",
    role: "dean",
    deptScope: null,
    principal: PRINCIPALS.dean,
    action: "approve",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "payment_confirmation",
    terminal: false,
    effect: "Dean approves transfer request; workflow advances to step 5 (payment_confirmation).",
  },
  {
    ord: 4,
    service: "department_transfer",
    activeOrder: 5,
    stepKey: "payment_confirmation",
    unit: "finance",
    role: "revenue_finance_officer",
    deptScope: null,
    principal: PRINCIPALS.finance,
    action: "confirm_payment",
    rpc: "record_external_university_payment_confirmation",
    nextStep: "registrar_apply",
    terminal: false,
    effect: "Revenue finance officer confirms external payment confirmation receipt; workflow advances to step 6 (registrar_apply).",
  },
  {
    ord: 5,
    service: "department_transfer",
    activeOrder: 6,
    stepKey: "registrar_apply",
    unit: "registrar",
    role: "registrar_general",
    deptScope: null,
    principal: PRINCIPALS.registrar,
    action: "apply_decision",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: null,
    terminal: true,
    effect: "Registrar General applies decision: student department/program updated to CS in academic record, request status becomes approved.",
  },
  {
    ord: 6,
    service: "enrollment_suspension",
    activeOrder: 2,
    stepKey: "manager_approval",
    unit: "student_affairs",
    role: "student_affairs_manager",
    deptScope: null,
    principal: PRINCIPALS.sa_mgr,
    action: "approve",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "registrar_apply",
    terminal: false,
    effect: "Student Affairs Manager approves enrollment suspension; workflow advances to step 3 (registrar_apply).",
  },
  {
    ord: 7,
    service: "enrollment_suspension",
    activeOrder: 3,
    stepKey: "registrar_apply",
    unit: "registrar",
    role: "registrar_general",
    deptScope: null,
    principal: PRINCIPALS.registrar,
    action: "apply_decision",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: null,
    terminal: true,
    effect: "Registrar General applies suspension decision: student academic status updated to suspended, request status becomes approved.",
  },
  {
    ord: 8,
    service: "excused_absence",
    activeOrder: 2,
    stepKey: "manager_review",
    unit: "student_affairs",
    role: "student_affairs_manager",
    deptScope: null,
    principal: PRINCIPALS.sa_mgr,
    action: "approve",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "record_apply",
    terminal: false,
    effect: "Student Affairs Manager approves excused absence request; workflow advances to step 3 (record_apply).",
  },
  {
    ord: 9,
    service: "excused_absence",
    activeOrder: 3,
    stepKey: "record_apply",
    unit: "student_affairs",
    role: "student_affairs_specialist",
    deptScope: null,
    principal: PRINCIPALS.sa_spec,
    action: "apply_decision",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: null,
    terminal: true,
    effect: "Student Affairs Specialist records excused absence decision; request status becomes approved.",
  },
  {
    ord: 10,
    service: "file_withdrawal",
    activeOrder: 2,
    stepKey: "library_clearance",
    unit: "library",
    role: "library_officer",
    deptScope: null,
    principal: PRINCIPALS.library,
    action: "clear",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "labs_clearance",
    terminal: false,
    effect: "Library Officer confirms library clearance; workflow advances to step 3 (labs_clearance).",
  },
  {
    ord: 11,
    service: "file_withdrawal",
    activeOrder: 3,
    stepKey: "labs_clearance",
    unit: "labs",
    role: "labs_manager",
    deptScope: null,
    principal: PRINCIPALS.labs,
    action: "clear",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "activities_clearance",
    terminal: false,
    effect: "Labs Manager confirms laboratory clearance; workflow advances to step 4 (activities_clearance).",
  },
  {
    ord: 12,
    service: "file_withdrawal",
    activeOrder: 4,
    stepKey: "activities_clearance",
    unit: "student_affairs",
    role: "student_affairs_manager",
    deptScope: null,
    principal: PRINCIPALS.sa_mgr,
    action: "clear",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "finance_clearance",
    terminal: false,
    effect: "Student Affairs Manager confirms student activities clearance; workflow advances to step 5 (finance_clearance).",
  },
  {
    ord: 13,
    service: "file_withdrawal",
    activeOrder: 5,
    stepKey: "finance_clearance",
    unit: "finance",
    role: "revenue_finance_officer",
    deptScope: null,
    principal: PRINCIPALS.finance,
    action: "clear",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "registrar_apply",
    terminal: false,
    effect: "Revenue Finance Officer confirms financial clearance; workflow advances to step 6 (registrar_apply).",
  },
  {
    ord: 14,
    service: "file_withdrawal",
    activeOrder: 6,
    stepKey: "registrar_apply",
    unit: "registrar",
    role: "registrar_general",
    deptScope: null,
    principal: PRINCIPALS.registrar,
    action: "apply_decision",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "archive",
    terminal: false,
    effect: "Registrar General applies file withdrawal decision: student status updated to withdrawn; workflow advances to step 7 (archive).",
  },
  {
    ord: 15,
    service: "file_withdrawal",
    activeOrder: 7,
    stepKey: "archive",
    unit: "archive",
    role: "archive_officer",
    deptScope: null,
    principal: PRINCIPALS.archive,
    action: "archive",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: null,
    terminal: true,
    effect: "Archive Officer archives physical student file; request status becomes approved.",
  },
  {
    ord: 16,
    service: "final_chance",
    activeOrder: 2,
    stepKey: "manager_review",
    unit: "student_affairs",
    role: "student_affairs_manager",
    deptScope: null,
    principal: PRINCIPALS.sa_mgr,
    action: "approve",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "dean_decision",
    terminal: false,
    effect: "Student Affairs Manager reviews and approves final chance request; workflow advances to step 3 (dean_decision).",
  },
  {
    ord: 17,
    service: "final_chance",
    activeOrder: 3,
    stepKey: "dean_decision",
    unit: "dean",
    role: "dean",
    deptScope: null,
    principal: PRINCIPALS.dean,
    action: "approve",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: "payment_confirmation",
    terminal: false,
    effect: "Dean approves final chance request; workflow advances to step 4 (payment_confirmation).",
  },
  {
    ord: 18,
    service: "final_chance",
    activeOrder: 4,
    stepKey: "payment_confirmation",
    unit: "finance",
    role: "revenue_finance_officer",
    deptScope: null,
    principal: PRINCIPALS.finance,
    action: "confirm_payment",
    rpc: "record_external_university_payment_confirmation",
    nextStep: "registrar_apply",
    terminal: false,
    effect: "Revenue Finance Officer confirms external payment confirmation receipt; workflow advances to step 5 (registrar_apply).",
  },
  {
    ord: 19,
    service: "final_chance",
    activeOrder: 5,
    stepKey: "registrar_apply",
    unit: "registrar",
    role: "registrar_general",
    deptScope: null,
    principal: PRINCIPALS.registrar,
    action: "apply_decision",
    rpc: "act_on_b1_student_request_step_atomic",
    nextStep: null,
    terminal: true,
    effect: "Registrar General applies final chance decision: student academic record updated with extra attempt allowance, request status becomes approved.",
  },
];

export function generateManifest(): AuthoritativeManifest {
  const cases: FixtureCase[] = RAW_CASES.map((c) => {
    const reqUuid = `f1300000-0000-4000-8000-${c.ord.toString().padStart(12, "0")}`;
    const reqNum = `SR-20260801-13${c.ord.toString().padStart(6, "0")}`;
    const stepUuid = `f1300001-0000-4000-8000-${c.ord.toString().padStart(6, "0")}${c.activeOrder.toString().padStart(6, "0")}`;

    return {
      case_index: c.ord,
      request_number: reqNum,
      request_id: reqUuid,
      service_code: c.service,
      runtime_step_id: stepUuid,
      step_index: c.activeOrder,
      step_code: c.stepKey,
      direct_assignee_principal_id: c.principal,
      processing_role: c.role,
      processing_unit: c.unit,
      department_scope: c.deptScope,
      exact_configured_action: c.action,
      exact_rpc_signature: c.rpc,
      expected_predecessor_state: {
        request_status: "in_review",
        step_status: "active",
        prior_steps_completed: c.activeOrder - 1,
      },
      expected_successor_state: {
        executed_step_status: "completed",
        next_step_status: c.terminal ? null : "active",
        request_status: c.terminal ? "approved" : "in_review",
      },
      expected_workflow_event: {
        event_type: `${c.stepKey}_${c.action}`,
        actor_id: c.principal,
        action: c.action,
        creates_event_record: true,
      },
      expected_next_active_step: c.nextStep,
      expected_business_effect: c.effect,
      zero_mutation_scope: [
        "student_requests_unrelated",
        "enrollment_certificates",
        "official_documents",
        "fee_assessments",
        "payment_receipts_unrelated",
        "student_profiles_unrelated",
      ],
    };
  });

  return {
    matrix_metadata: {
      name: "PORTAL-B1-AUTHORITATIVE-POSITIVE-FIXTURE-MATRIX-19-MINIMAL-36",
      fixture_migration: "20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql",
      migration_head: "20260801021541",
      baseline_head: "20260731203030",
      total_requests: 19,
      total_active_runtime_steps: 19,
      active_steps_per_request: 1,
      rejected_prefix: "SR-20260727-",
      execution_authorization: false,
      production_connection: false,
    },
    cases,
  };
}

if (import.meta.main) {
  const manifest = generateManifest();
  const manifestPath = join(
    process.cwd(),
    "tests",
    "b1-authoritative-positive-fixture-matrix-19",
    "MANIFEST.json"
  );
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Generated manifest at ${manifestPath} with ${manifest.cases.length} cases.`);
}
