-- FILE-WITHDRAWAL-SOURCE-01 (DRAFT ONLY; DO NOT APPLY)
-- Depends on REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql.
-- Creates no users, staff, assignments, money, payment rows, or documents.

CREATE TABLE IF NOT EXISTS public.file_withdrawal_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id) ON DELETE RESTRICT,
  withdrawal_reason text NOT NULL CHECK (length(btrim(withdrawal_reason)) >= 10),
  impact_ack boolean NOT NULL CHECK (impact_ack),
  library_cleared_at timestamptz,
  labs_cleared_at timestamptz,
  activities_cleared_at timestamptz,
  finance_cleared_at timestamptz,
  records_transferred_at timestamptz,
  notes text
);

-- Activation source must resolve these existing unit/role pairs and existing
-- direct assignments. Every step is required, sequential, and can_skip=false:
-- student_affairs_intake student_affairs/student_affairs_specialist review
-- library_clearance       library/library_officer                  clear
-- labs_clearance          labs/labs_manager                        clear
-- activities_clearance    student_affairs/student_affairs_manager  clear
-- finance_clearance       finance/revenue_finance_officer          clear
-- registrar_apply         registrar/registrar_general              apply_decision
-- archive                 archive/archive_officer                   archive

-- validate_file_withdrawal_request must run as the authenticated student and:
-- 1) require status active or suspended;
-- 2) reject an in-flight grade appeal or enrollment_certificate;
-- 3) require withdrawal_reason and impact_ack=true;
-- 4) create details without fee/payment fields;
-- 5) instantiate only the first runtime step with its resolved direct assignee.

-- act_on_file_withdrawal_step must additionally assert, before the generic RPC:
-- 1) auth.uid() equals the runtime step direct assignee;
-- 2) current_user_processing_assignments has the exact processing unit+role;
-- 3) the immediately preceding required step is completed;
-- 4) archive requires all clearances, registrar_apply, withdrawn academic status;
-- 5) completion updates status to withdrawn and records an auditable event.

-- Deliberately deferred: executable functions/workflow inserts require a shared
-- foundation migration and therefore are not emitted by this source-only agent.
