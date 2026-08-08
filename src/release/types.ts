export type StatusVerdict = 'PASS' | 'HOLD' | 'WAITING' | 'OWNER_APPROVAL_REQUIRED';

export interface MigrationArtifactSpec {
  path: string;
  body_hash?: string;
  full_hash?: string;
}

export interface ComponentSpec {
  name: string;
  expected_base: string;
  candidate_shas: Record<string, string>;
  migration_sequence: MigrationArtifactSpec[];
  required_tests: string[];
  required_reviewers: string[];
  production_gates: string[];
  feature_flags: string[];
  post_verifiers: string[];
  rollback_references: string[];
}

export interface GraduationProjectsManifestSpec extends ComponentSpec {
  L4_migration: MigrationArtifactSpec;
  operator_package_sha: string;
}

export interface GraduatesAffairsManifestSpec extends ComponentSpec {
  source_sha: string;
  promotion_package_sha: string;
  three_migration_sequence: MigrationArtifactSpec[];
  ga_final_security_review: string;
}

export interface AcademicCouncilsManifestSpec extends ComponentSpec {
  c0_c3_sha: string;
  c4_c8_sha: string;
  eventual_final_integrated_sha: string;
  councils_final_security_review: string;
  councils_final_security_sha: string;
  c9_integrated_sha: string;
  c9_extension_sha: string;
  c9_status: string;
  security_review_findings?: string[];
  required_verifications: string[];
}

export interface ReleaseManifest {
  current_main: string;
  graduation_projects: GraduationProjectsManifestSpec;
  graduates_affairs: GraduatesAffairsManifestSpec;
  academic_councils: AcademicCouncilsManifestSpec;
}

export interface SubsystemStatus {
  subsystem: 'GP' | 'GA' | 'Councils';
  source: StatusVerdict;
  review: StatusVerdict;
  migration: StatusVerdict;
  preflight: StatusVerdict;
  e2e: StatusVerdict;
  production: StatusVerdict;
  flags_deploy: StatusVerdict;
  stages?: Record<string, StatusVerdict>;
  details: string[];
}

export interface ReleaseStatusReport {
  timestamp: string;
  overall: StatusVerdict;
  current_main: string;
  subsystems: SubsystemStatus[];
  blockers: string[];
}

export type OrchestratorMode =
  | 'status'
  | 'source-check'
  | 'candidate-refresh'
  | 'merge-simulation'
  | 'migration-chain'
  | 'preflight-package-check'
  | 'post-verifier-check'
  | 'e2e-package-check'
  | 'release-ready';

export interface CheckResult {
  mode: OrchestratorMode;
  verdict: StatusVerdict;
  subsystem?: string;
  messages: string[];
  errors: string[];
}

export interface ProductionGateDefinition {
  id: string;
  name: string;
  type: 'SAFE_AUTOMATIC' | 'OWNER_APPROVAL_REQUIRED';
  description: string;
  requires_owner_signoff: boolean;
}
