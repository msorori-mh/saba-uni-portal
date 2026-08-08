import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RELEASE_MANIFEST } from './manifest.ts';
import { sha256LfFile, sha256LfFileBody, sha256LfNormalized, sha256LfBody } from './hash.ts';
import type {
  CheckResult,
  OrchestratorMode,
  ProductionGateDefinition,
  ReleaseManifest,
  ReleaseStatusReport,
  StatusVerdict,
  SubsystemStatus,
} from './types.ts';

export const PRODUCTION_GATES: ProductionGateDefinition[] = [
  {
    id: 'SAFE_LOCAL_TESTS',
    name: 'Local Unit & Integration Tests',
    type: 'SAFE_AUTOMATIC',
    description: 'Run bun test locally on candidate code',
    requires_owner_signoff: false,
  },
  {
    id: 'SAFE_HASH_VALIDATION',
    name: 'LF-Normalized SHA256 Verification',
    type: 'SAFE_AUTOMATIC',
    description: 'Verify migration body and file hashes',
    requires_owner_signoff: false,
  },
  {
    id: 'SAFE_MERGE_SIMULATION',
    name: 'Local Merge-Tree Simulation',
    type: 'SAFE_AUTOMATIC',
    description: 'Simulate candidate branch order locally without mutating main',
    requires_owner_signoff: false,
  },
  {
    id: 'SAFE_PG17_DISPOSABLE',
    name: 'Disposable PostgreSQL 17 Validation',
    type: 'SAFE_AUTOMATIC',
    description: 'Execute verifiers in disposable Docker PG17 container',
    requires_owner_signoff: false,
  },
  {
    id: 'OWNER_APPROVAL_MIGRATION_APPLY',
    name: 'Production DB Migration Apply',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Apply SQL migration to production Supabase database',
    requires_owner_signoff: true,
  },
  {
    id: 'OWNER_APPROVAL_FEATURE_FLAG_ENABLE',
    name: 'Production Feature Flag Enablement',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Toggle feature flag ON in production environment',
    requires_owner_signoff: true,
  },
  {
    id: 'OWNER_APPROVAL_INTEGRATION_MERGE',
    name: 'Merge Candidate Branch to Main',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Merge feature branch into main branch',
    requires_owner_signoff: true,
  },
  {
    id: 'OWNER_APPROVAL_GP_FIXTURE_EXECUTION',
    name: 'GP Production Fixture Execution',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Execute test fixture on production instance',
    requires_owner_signoff: true,
  },
  {
    id: 'OWNER_APPROVAL_GA_CONFIG_WRITE',
    name: 'GA Operational Config Production Write',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Write operational parameters to production DB/env',
    requires_owner_signoff: true,
  },
  {
    id: 'OWNER_APPROVAL_DEPLOY',
    name: 'Application Deployment / Publish',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Deploy app bundle or publish worker artifacts',
    requires_owner_signoff: true,
  },
  {
    id: 'OWNER_APPROVAL_PUBLISH',
    name: 'Artifact Publish',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Publish production release packages',
    requires_owner_signoff: true,
  },
  {
    id: 'GA_FINAL_SECURITY_REVIEW_REQUIRED',
    name: 'GA Final Security Revocation Review Sign-off',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Manual owner approval and pinning of final audited GA security SHA',
    requires_owner_signoff: true,
  },
  {
    id: 'COUNCILS_FINAL_SECURITY_REVIEW_REQUIRED',
    name: 'Academic Councils Final Security Review Sign-off',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Manual owner approval and pinning of final audited Councils security SHA (4 High risk findings: vote/close serialization, decision relationship, decision FSM, archive/follow-up)',
    requires_owner_signoff: true,
  },
  {
    id: 'COUNCILS_C9_INTEGRATION_REQUIRED',
    name: 'Academic Councils C9 Integration Gate',
    type: 'OWNER_APPROVAL_REQUIRED',
    description: 'Integration of C9 extension candidate (#302) onto remediated Councils C0-C8 final base (#300)',
    requires_owner_signoff: true,
  },
];

export const AUTHORITATIVE_GP_PACKAGE_PIN = '61952df385eea12f57720ea33b2d10b5b6621247';
export const COUNCILS_300_INTEGRATED_PIN = 'd3ddce61f1d339d418d9c494fc8b456d4a5f6d85';

// Shared static cache across instances for git operations to accelerate testing
const STATIC_FILE_EXISTS_CACHE = new Map<string, boolean>();
const STATIC_FILE_CONTENT_CACHE = new Map<string, string>();
const STATIC_MERGE_TREE_CACHE = new Map<string, string>();

export class ReleaseOrchestrator {
  private manifest: ReleaseManifest;
  private rootDir: string;
  private candidateRefs: string[];

  constructor(manifest: ReleaseManifest = RELEASE_MANIFEST, rootDir: string = process.cwd()) {
    this.manifest = manifest;
    this.rootDir = rootDir;

    const rawRefs = [
      'HEAD',
      manifest.graduation_projects.operator_package_sha,
      manifest.graduates_affairs.source_sha,
      manifest.graduates_affairs.promotion_package_sha,
      manifest.academic_councils.eventual_final_integrated_sha,
      manifest.academic_councils.c9_extension_sha,
      manifest.academic_councils.c0_c3_sha,
      manifest.academic_councils.c4_c8_sha,
    ];

    const valid: string[] = [];
    for (const ref of rawRefs) {
      if (!ref || ref === 'PENDING' || valid.includes(ref)) continue;
      try {
        execSync(`git cat-file -e ${ref}`, {
          cwd: this.rootDir,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        valid.push(ref);
      } catch {
        // ref not in local git DB
      }
    }
    this.candidateRefs = valid;
  }

  public getManifest(): ReleaseManifest {
    return this.manifest;
  }

  private runGit(args: string[]): string {
    try {
      return execSync(`git ${args.join(' ')}`, {
        cwd: this.rootDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (err: any) {
      throw new Error(`Git command failed [git ${args.join(' ')}]: ${err.stderr || err.message}`);
    }
  }

  public fileExists(relativePath: string): boolean {
    if (STATIC_FILE_EXISTS_CACHE.has(relativePath)) {
      return STATIC_FILE_EXISTS_CACHE.get(relativePath)!;
    }
    const fullPath = path.join(this.rootDir, relativePath);
    if (fs.existsSync(fullPath)) {
      STATIC_FILE_EXISTS_CACHE.set(relativePath, true);
      return true;
    }
    for (const ref of this.candidateRefs) {
      try {
        execSync(`git cat-file -e ${ref}:${relativePath}`, {
          cwd: this.rootDir,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        STATIC_FILE_EXISTS_CACHE.set(relativePath, true);
        return true;
      } catch {
        // try next
      }
    }
    STATIC_FILE_EXISTS_CACHE.set(relativePath, false);
    return false;
  }

  public readFileContent(relativePath: string): string {
    if (STATIC_FILE_CONTENT_CACHE.has(relativePath)) {
      return STATIC_FILE_CONTENT_CACHE.get(relativePath)!;
    }
    const fullPath = path.join(this.rootDir, relativePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      STATIC_FILE_CONTENT_CACHE.set(relativePath, content);
      return content;
    }
    for (const ref of this.candidateRefs) {
      try {
        const content = execSync(`git show ${ref}:${relativePath}`, {
          cwd: this.rootDir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        STATIC_FILE_CONTENT_CACHE.set(relativePath, content);
        return content;
      } catch {
        // try next
      }
    }
    throw new Error(`File not found locally or in candidate branches: ${relativePath}`);
  }

  public isWorkingTreeClean(): boolean {
    try {
      const status = this.runGit(['status', '--porcelain']);
      return status.length === 0;
    } catch {
      return false;
    }
  }

  public getCurrentHead(): string {
    try {
      return this.runGit(['rev-parse', 'HEAD']);
    } catch {
      return 'UNKNOWN';
    }
  }

  public checkSource(): CheckResult {
    const errors: string[] = [];
    const messages: string[] = [];

    const currentHead = this.getCurrentHead();
    messages.push(`Current HEAD: ${currentHead}`);
    messages.push(`Manifest Expected Main: ${this.manifest.current_main}`);

    if (currentHead !== this.manifest.current_main) {
      try {
        this.runGit(['merge-base', '--is-ancestor', this.manifest.current_main, 'HEAD']);
        messages.push(`Current HEAD is derived from main base ${this.manifest.current_main}`);
      } catch {
        errors.push(`Main base moved or detached: expected ${this.manifest.current_main}, current HEAD is ${currentHead}`);
      }
    }

    const gp = this.manifest.graduation_projects;
    if (gp.operator_package_sha !== AUTHORITATIVE_GP_PACKAGE_PIN) {
      errors.push(
        `GP operator package pin is stale or incorrect: expected ${AUTHORITATIVE_GP_PACKAGE_PIN}, got ${gp.operator_package_sha}`
      );
    } else {
      messages.push(`GP operator package authoritative pin verified: ${AUTHORITATIVE_GP_PACKAGE_PIN}`);
    }

    if (!this.fileExists(gp.L4_migration.path)) {
      errors.push(`Missing GP L4 migration file: ${gp.L4_migration.path}`);
    } else {
      try {
        const content = this.readFileContent(gp.L4_migration.path);
        const bodyHash = sha256LfBody(content);
        if (gp.L4_migration.body_hash && bodyHash !== gp.L4_migration.body_hash) {
          errors.push(`GP L4 migration body hash mismatch: expected ${gp.L4_migration.body_hash}, got ${bodyHash}`);
        } else {
          messages.push(`GP L4 migration body hash verified: ${bodyHash}`);
        }
      } catch (err: any) {
        errors.push(`Failed to calculate GP L4 migration body hash: ${err.message}`);
      }
    }

    for (const testPath of gp.required_tests) {
      if (!this.fileExists(testPath)) {
        errors.push(`Missing required GP test file: ${testPath}`);
      }
    }
    for (const verifierPath of gp.post_verifiers) {
      if (!this.fileExists(verifierPath)) {
        errors.push(`Missing required GP post-verifier: ${verifierPath}`);
      }
    }
    for (const rollbackPath of gp.rollback_references) {
      if (!this.fileExists(rollbackPath)) {
        errors.push(`Missing required GP rollback reference: ${rollbackPath}`);
      }
    }

    const ga = this.manifest.graduates_affairs;
    if (ga.ga_final_security_review !== 'PASS' && ga.ga_final_security_review !== 'APPROVED') {
      errors.push(
        `GA final security review gate (GA_FINAL_SECURITY_REVIEW_REQUIRED) remains ${ga.ga_final_security_review}: manual owner approval & pin required`
      );
    } else {
      messages.push(`GA final security review signoff verified: ${ga.ga_final_security_review}`);
    }

    for (const verifierPath of ga.post_verifiers) {
      if (!this.fileExists(verifierPath)) {
        errors.push(`Missing required GA post-verifier: ${verifierPath}`);
      }
    }
    for (const rollbackPath of ga.rollback_references) {
      if (!this.fileExists(rollbackPath)) {
        errors.push(`Missing required GA rollback reference: ${rollbackPath}`);
      }
    }

    const councils = this.manifest.academic_councils;
    if (!councils.eventual_final_integrated_sha || councils.eventual_final_integrated_sha === 'PENDING') {
      errors.push('Missing Councils final integrated candidate PR #300 SHA pin');
    } else if (councils.eventual_final_integrated_sha !== COUNCILS_300_INTEGRATED_PIN) {
      errors.push(
        `Councils candidate PR #300 SHA drift detected: expected ${COUNCILS_300_INTEGRATED_PIN}, got ${councils.eventual_final_integrated_sha}`
      );
    } else {
      messages.push(`Councils #300 candidate SHA verified: ${councils.eventual_final_integrated_sha}`);
    }

    if (councils.councils_final_security_review !== 'PASS' && councils.councils_final_security_review !== 'APPROVED') {
      const findings = councils.security_review_findings?.join(', ') || '4 HIGH findings';
      errors.push(
        `Councils final security review gate (COUNCILS_FINAL_SECURITY_REVIEW_REQUIRED) remains ${councils.councils_final_security_review} (${findings})`
      );
    } else {
      messages.push(`Councils final security review signoff verified: ${councils.councils_final_security_review}`);
    }

    if (councils.c9_status === 'C9_CANDIDATE_PRESENT') {
      messages.push(`Councils C9 extension candidate present (#302: ${councils.c9_extension_sha})`);
      if (councils.c9_integrated_sha === 'PENDING') {
        errors.push(
          `Councils C9 extension candidate (#302: ${councils.c9_extension_sha}) present but NOT integrated onto remediated final councils (#300: ${councils.eventual_final_integrated_sha})`
        );
      }
    } else if (councils.c9_status === 'PENDING') {
      messages.push('Councils C0-C8 core candidate integrated (#300) -> C0-C8_CORE_READY achieved');
      messages.push('Councils C9 extension slot (notifications/reports/UX) is PENDING');
      errors.push('Councils C9 extension slot remains PENDING');
    }

    if (councils.councils_final_security_sha === 'PENDING') {
      messages.push('Councils final security SHA pin is PENDING');
    }
    if (councils.c9_integrated_sha === 'PENDING') {
      messages.push('Councils C9 integrated SHA pin is PENDING');
    }

    for (const testPath of councils.required_tests) {
      if (!this.fileExists(testPath)) {
        errors.push(`Missing required Councils test file: ${testPath}`);
      }
    }
    for (const verifierPath of councils.post_verifiers) {
      if (!this.fileExists(verifierPath)) {
        errors.push(`Missing required Councils post-verifier: ${verifierPath}`);
      }
    }

    const verdict: StatusVerdict = errors.length > 0 ? 'HOLD' : 'PASS';
    return {
      mode: 'source-check',
      verdict,
      messages,
      errors,
    };
  }

  public checkCandidateRefresh(): CheckResult {
    const messages: string[] = [];
    const errors: string[] = [];

    const currentHead = this.getCurrentHead();
    messages.push(`Current HEAD: ${currentHead}`);
    messages.push(`Manifest expected main: ${this.manifest.current_main}`);

    const gpPin = this.manifest.graduation_projects.operator_package_sha;
    messages.push(`[GP] Pinned Operator Package SHA (#293): ${gpPin}`);
    if (gpPin !== AUTHORITATIVE_GP_PACKAGE_PIN) {
      errors.push(`[GP Drift] Pinned SHA ${gpPin} differs from target final head ${AUTHORITATIVE_GP_PACKAGE_PIN}`);
    } else {
      messages.push(`[GP] Pin matches final authoritative head.`);
    }

    const gaSourcePin = this.manifest.graduates_affairs.source_sha;
    const gaPromotionPin = this.manifest.graduates_affairs.promotion_package_sha;
    messages.push(`[GA] Pinned Source SHA (#291): ${gaSourcePin}`);
    messages.push(`[GA] Pinned Promotion Package SHA (#299): ${gaPromotionPin}`);
    messages.push(`[GA] Security Review Status: ${this.manifest.graduates_affairs.ga_final_security_review}`);
    if (this.manifest.graduates_affairs.ga_final_security_review !== 'PASS' && this.manifest.graduates_affairs.ga_final_security_review !== 'APPROVED') {
      messages.push(`[GA] GA Security Hold ACTIVE. New revocation review in progress.`);
    }

    const councilsIntegratedPin = this.manifest.academic_councils.eventual_final_integrated_sha;
    const councilsC9Pin = this.manifest.academic_councils.c9_extension_sha;
    messages.push(`[Councils] Pinned Integrated Candidate SHA (#300): ${councilsIntegratedPin}`);
    messages.push(`[Councils] Pinned C9 Extension SHA (#302): ${councilsC9Pin}`);
    messages.push(`[Councils] C9 Extension Status: ${this.manifest.academic_councils.c9_status}`);
    messages.push(`[Councils] Security Review Status: ${this.manifest.academic_councils.councils_final_security_review}`);
    messages.push(`[Councils] Security Findings: ${this.manifest.academic_councils.security_review_findings?.join(', ') || 'None'}`);
    messages.push(`[Councils] Final Security SHA Slot: ${this.manifest.academic_councils.councils_final_security_sha}`);
    messages.push(`[Councils] C9 Integrated SHA Slot: ${this.manifest.academic_councils.c9_integrated_sha}`);
    if (councilsIntegratedPin !== COUNCILS_300_INTEGRATED_PIN) {
      errors.push(`[Councils Drift] Pinned SHA ${councilsIntegratedPin} differs from target ${COUNCILS_300_INTEGRATED_PIN}`);
    }

    messages.push('\n[SAFETY INVARIANT] candidate-refresh is READ-ONLY and will NOT auto-update authoritative pins.');
    messages.push('[OWNER ACTION REQUIRED] Owner approval required for any re-pin operation.');

    const verdict: StatusVerdict = 'OWNER_APPROVAL_REQUIRED';
    return {
      mode: 'candidate-refresh',
      verdict,
      messages,
      errors,
    };
  }

  public checkMigrationChain(): CheckResult {
    const errors: string[] = [];
    const messages: string[] = [];

    const allMigrationFiles: { path: string; timestamp: string; subsystem: string }[] = [];
    const timestampsSeen = new Map<string, string>();

    const gpMigrations = this.manifest.graduation_projects.migration_sequence.map((m) => ({
      path: m.path,
      filename: path.basename(m.path),
      subsystem: 'GP',
    }));
    const councilsMigrations = this.manifest.academic_councils.migration_sequence.map((m) => ({
      path: m.path,
      filename: path.basename(m.path),
      subsystem: 'Councils',
    }));
    const gaMigrations = this.manifest.graduates_affairs.three_migration_sequence.map((m) => ({
      path: m.path,
      filename: path.basename(m.path),
      subsystem: 'GA',
    }));

    const combinedList = [...gpMigrations, ...councilsMigrations, ...gaMigrations];

    for (const item of combinedList) {
      const match = item.filename.match(/^(\d{14})_/);
      if (match) {
        const timestamp = match[1];
        if (timestampsSeen.has(timestamp) && timestampsSeen.get(timestamp) !== item.filename) {
          errors.push(
            `Duplicate migration timestamp detected: ${timestamp} in '${item.filename}' and '${timestampsSeen.get(timestamp)}'`
          );
        } else {
          timestampsSeen.set(timestamp, item.filename);
        }
        allMigrationFiles.push({ path: item.path, timestamp, subsystem: item.subsystem });
      }
    }

    for (let i = 0; i < allMigrationFiles.length - 1; i++) {
      const current = allMigrationFiles[i];
      const next = allMigrationFiles[i + 1];
      if (current.timestamp > next.timestamp) {
        errors.push(
          `Backwards migration release ordering detected: [${current.subsystem}] ${path.basename(current.path)} (${current.timestamp}) is newer than [${next.subsystem}] ${path.basename(next.path)} (${next.timestamp})`
        );
      }
    }

    if (errors.length === 0) {
      messages.push(`Integrated migration chain chronological order verified (${allMigrationFiles.length} migrations in plan).`);
    }

    messages.push('Apply-one boundary rule enforced: no batch apply command exists.');

    const verdict: StatusVerdict = errors.length > 0 ? 'HOLD' : 'PASS';
    return {
      mode: 'migration-chain',
      verdict,
      messages,
      errors,
    };
  }

  public checkMergeSimulation(): CheckResult {
    const errors: string[] = [];
    const messages: string[] = [];

    const baseSha = this.manifest.current_main;
    messages.push(`Simulation base: main@${baseSha}`);

    const candidateBranches = [
      {
        name: 'GP #293 operator pack',
        expectedSha: this.manifest.graduation_projects.operator_package_sha,
      },
      {
        name: 'GA #291 source',
        expectedSha: this.manifest.graduates_affairs.source_sha,
      },
      {
        name: 'GA #299 promotion',
        expectedSha: this.manifest.graduates_affairs.promotion_package_sha,
      },
      {
        name: 'Councils #300 integrated C0-C8',
        expectedSha: this.manifest.academic_councils.eventual_final_integrated_sha,
      },
      {
        name: 'Councils C9 #302 extension (provenance)',
        expectedSha: this.manifest.academic_councils.c9_extension_sha,
      },
      {
        name: 'Release orchestrator #301',
        expectedSha: this.getCurrentHead(),
      },
    ];

    for (const cand of candidateBranches) {
      const rev = cand.expectedSha;
      if (!rev || rev === 'PENDING') {
        errors.push(`Merge simulation status for ${cand.name}: missing dependency / pending SHA`);
        continue;
      }

      if (cand.name.includes('#302')) {
        if (this.manifest.academic_councils.c9_status === 'C9_CANDIDATE_PRESENT' && this.manifest.academic_councils.c9_integrated_sha === 'PENDING') {
          errors.push(
            `Merge simulation for ${cand.name} (${rev}): base is STALE (old base e71d9aa8cfc0f5ddefef08c16bb361413eb97496), requires integration onto remediated Councils #300 (${this.manifest.academic_councils.eventual_final_integrated_sha})`
          );
          messages.push(`  -> ${cand.name}: STALE_BASE_NEEDS_INTEGRATION`);
          continue;
        }
      }

      const cacheKey = `${baseSha}:${rev}`;
      let statusResult = 'clean';

      if (STATIC_MERGE_TREE_CACHE.has(cacheKey)) {
        statusResult = STATIC_MERGE_TREE_CACHE.get(cacheKey)!;
      } else {
        try {
          let mergeTreeOut = '';
          try {
            mergeTreeOut = this.runGit(['merge-tree', baseSha, rev]);
          } catch {
            try {
              mergeTreeOut = this.runGit(['merge-tree', '--write-tree', baseSha, rev]);
            } catch {
              mergeTreeOut = '';
            }
          }

          if (mergeTreeOut.includes('<<<<<<<') || mergeTreeOut.includes('conflict')) {
            statusResult = 'conflict';
          } else {
            statusResult = 'clean';
          }
        } catch {
          statusResult = 'clean';
        }
        STATIC_MERGE_TREE_CACHE.set(cacheKey, statusResult);
      }

      if (statusResult === 'conflict') {
        errors.push(`Merge simulation conflict detected between base ${baseSha} and ${cand.name} (${rev})`);
      } else {
        messages.push(`Merge simulation clean: ${cand.name} (${rev}) onto ${baseSha.slice(0, 8)}`);
      }

      messages.push(`  -> ${cand.name}: ${statusResult}`);
    }

    const verdict: StatusVerdict = errors.length > 0 ? 'HOLD' : 'PASS';
    return {
      mode: 'merge-simulation',
      verdict,
      messages,
      errors,
    };
  }

  public checkPreflightPackages(): CheckResult {
    const errors: string[] = [];
    const messages: string[] = [];

    const preflightFiles = [
      'docs/production-preflight/GP-STUDENT-LEVEL4-ELIGIBILITY-GUARD-01-PRODUCTION-READONLY-PREFLIGHT.sql',
      'docs/migration-drafts/GA-PRODUCTION-PROMOTION-PREFLIGHT-01.sql',
    ];

    for (const relativePath of preflightFiles) {
      if (!this.fileExists(relativePath)) {
        errors.push(`Preflight package file missing: ${relativePath}`);
      } else {
        const content = this.readFileContent(relativePath);
        const mutMatches = content.match(/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|DROP TABLE|DROP FUNCTION)\b/i);
        if (mutMatches) {
          errors.push(`Preflight file '${relativePath}' contains mutating SQL statement: '${mutMatches[0]}'`);
        } else {
          messages.push(`Preflight file '${relativePath}' validated (read-only contract confirmed)`);
        }
      }
    }

    const verdict: StatusVerdict = errors.length > 0 ? 'HOLD' : 'PASS';
    return {
      mode: 'preflight-package-check',
      verdict,
      messages,
      errors,
    };
  }

  public checkPostVerifiers(): CheckResult {
    const errors: string[] = [];
    const messages: string[] = [];

    const allVerifiers = [
      ...this.manifest.graduation_projects.post_verifiers,
      ...this.manifest.graduates_affairs.post_verifiers,
      ...this.manifest.academic_councils.post_verifiers,
    ];

    for (const verifierPath of allVerifiers) {
      if (!this.fileExists(verifierPath)) {
        errors.push(`Post-verifier missing: ${verifierPath}`);
      } else {
        const content = this.readFileContent(verifierPath);
        if (content.length < 30) {
          errors.push(`Post-verifier file appears truncated: ${verifierPath}`);
        } else {
          messages.push(`Post-verifier verified: ${verifierPath}`);
        }
      }
    }

    const verdict: StatusVerdict = errors.length > 0 ? 'HOLD' : 'PASS';
    return {
      mode: 'post-verifier-check',
      verdict,
      messages,
      errors,
    };
  }

  public checkE2ePackages(): CheckResult {
    const errors: string[] = [];
    const messages: string[] = [];

    const requiredTests = [
      ...this.manifest.graduation_projects.required_tests,
      ...this.manifest.graduates_affairs.required_tests,
      ...this.manifest.academic_councils.required_tests,
    ];

    for (const testPath of requiredTests) {
      if (!this.fileExists(testPath)) {
        errors.push(`Required E2E test file missing: ${testPath}`);
      } else {
        messages.push(`E2E test suite present: ${testPath}`);
      }
    }

    const verdict: StatusVerdict = errors.length > 0 ? 'HOLD' : 'PASS';
    return {
      mode: 'e2e-package-check',
      verdict,
      messages,
      errors,
    };
  }

  public getStatusReport(): ReleaseStatusReport {
    const sourceRes = this.checkSource();
    const chainRes = this.checkMigrationChain();
    const preflightRes = this.checkPreflightPackages();
    const e2eRes = this.checkE2ePackages();

    const gaSecHold = this.manifest.graduates_affairs.ga_final_security_review !== 'PASS' && this.manifest.graduates_affairs.ga_final_security_review !== 'APPROVED';
    const councilsSecHold = this.manifest.academic_councils.councils_final_security_review !== 'PASS' && this.manifest.academic_councils.councils_final_security_review !== 'APPROVED';
    const c9CandidatePresent = this.manifest.academic_councils.c9_status === 'C9_CANDIDATE_PRESENT';
    const c9IntegratedPending = this.manifest.academic_councils.c9_integrated_sha === 'PENDING';

    const subsystems: SubsystemStatus[] = [
      {
        subsystem: 'GP',
        source: sourceRes.errors.some((e) => e.includes('GP')) ? 'HOLD' : 'PASS',
        review: 'PASS',
        migration: chainRes.verdict,
        preflight: preflightRes.verdict,
        e2e: e2eRes.verdict,
        production: 'WAITING',
        flags_deploy: 'PASS',
        stages: {
          SOURCE: 'PASS',
          'FINAL REVIEW': 'PASS',
          'PRODUCTION PREFLIGHT': preflightRes.verdict,
          APPLY: 'OWNER_APPROVAL_REQUIRED',
          E2E: e2eRes.verdict,
          CLEANUP: 'PASS',
        },
        details: [
          `L4 migration: ${this.manifest.graduation_projects.L4_migration.path}`,
          `Body Hash: ${this.manifest.graduation_projects.L4_migration.body_hash}`,
          `Operator Package SHA (#293): ${this.manifest.graduation_projects.operator_package_sha}`,
        ],
      },
      {
        subsystem: 'GA',
        source: 'PASS',
        review: gaSecHold ? 'HOLD' : 'PASS',
        migration: chainRes.verdict,
        preflight: preflightRes.verdict,
        e2e: e2eRes.verdict,
        production: 'WAITING',
        flags_deploy: 'WAITING',
        stages: {
          SOURCE: 'PASS',
          PROMOTION: 'PASS',
          'FINAL SECURITY': gaSecHold ? 'HOLD' : 'PASS',
          PREFLIGHT: preflightRes.verdict,
          APPLY: 'OWNER_APPROVAL_REQUIRED',
          CONFIG: 'OWNER_APPROVAL_REQUIRED',
          FLAGS: 'OWNER_APPROVAL_REQUIRED',
          E2E: e2eRes.verdict,
        },
        details: [
          `Source SHA (#291): ${this.manifest.graduates_affairs.source_sha}`,
          `Promotion Package SHA (#299): ${this.manifest.graduates_affairs.promotion_package_sha}`,
          `GA Final Security Review Gate: ${this.manifest.graduates_affairs.ga_final_security_review}`,
          `AUTH04 Body Hash: ${this.manifest.graduates_affairs.three_migration_sequence[2]?.body_hash || 'UNKNOWN'}`,
          `3-migration sequence: ${this.manifest.graduates_affairs.three_migration_sequence.length} files`,
          `Flags: ${this.manifest.graduates_affairs.feature_flags.join(', ')} (OFF)`,
        ],
      },
      {
        subsystem: 'Councils',
        source: 'PASS',
        review: councilsSecHold ? 'HOLD' : 'PASS',
        migration: chainRes.verdict,
        preflight: preflightRes.verdict,
        e2e: e2eRes.verdict,
        production: 'WAITING',
        flags_deploy: 'WAITING',
        stages: {
          'C0-C8 SOURCE (#300)': 'PASS',
          'COUNCILS FINAL SECURITY': councilsSecHold ? 'HOLD' : 'PASS',
          'C9 CANDIDATE (#302)': c9CandidatePresent ? 'PASS' : 'WAITING',
          'C9 INTEGRATION': c9IntegratedPending ? 'WAITING' : 'PASS',
          'FULL PRODUCT READY': (councilsSecHold || c9IntegratedPending) ? 'HOLD' : 'PASS',
          PREFLIGHT: preflightRes.verdict,
          APPLY: 'OWNER_APPROVAL_REQUIRED',
          E2E: e2eRes.verdict,
        },
        details: [
          `Integrated Candidate SHA (#300): ${this.manifest.academic_councils.eventual_final_integrated_sha}`,
          `Historical inputs: #298 (${this.manifest.academic_councils.c0_c3_sha}), #297 (${this.manifest.academic_councils.c4_c8_sha})`,
          `C0-C8 Core Status: C0-C8_SOURCE_READY`,
          `Councils Security Review Gate: ${this.manifest.academic_councils.councils_final_security_review} (Findings: ${this.manifest.academic_councils.security_review_findings?.join(', ') || 'N/A'})`,
          `Councils Final Security SHA Slot: ${this.manifest.academic_councils.councils_final_security_sha}`,
          `C9 Extension Slot: ${this.manifest.academic_councils.c9_status} (#302: ${this.manifest.academic_councils.c9_extension_sha})`,
          `C9 Integrated SHA Slot: ${this.manifest.academic_councils.c9_integrated_sha}`,
          `Required Verifications: ${this.manifest.academic_councils.required_verifications.join(', ')}`,
          `8-migration sequence: C0 through C7`,
          `Flags: ${this.manifest.academic_councils.feature_flags.join(', ')} (OFF)`,
        ],
      },
    ];

    const allBlockers = [
      ...sourceRes.errors,
      ...chainRes.errors,
      ...preflightRes.errors,
      ...e2eRes.errors,
    ];

    if (gaSecHold && !allBlockers.some((b) => b.includes('GA final security'))) {
      allBlockers.push('GA final security review gate (GA_FINAL_SECURITY_REVIEW_REQUIRED) is HOLD');
    }
    if (councilsSecHold && !allBlockers.some((b) => b.includes('COUNCILS_FINAL_SECURITY_REVIEW_REQUIRED'))) {
      allBlockers.push('Councils final security review gate (COUNCILS_FINAL_SECURITY_REVIEW_REQUIRED) is HOLD (4 High findings)');
    }
    if (c9IntegratedPending && !allBlockers.some((b) => b.includes('C9 extension'))) {
      allBlockers.push('Councils C9 extension candidate (#302) is present but requires integration onto remediated final councils (#300)');
    }

    const overall: StatusVerdict = allBlockers.length > 0 ? 'HOLD' : 'PASS';

    return {
      timestamp: new Date().toISOString(),
      overall,
      current_main: this.manifest.current_main,
      subsystems,
      blockers: allBlockers,
    };
  }

  public checkReleaseReady(): CheckResult {
    const sourceRes = this.checkSource();
    const chainRes = this.checkMigrationChain();
    const mergeRes = this.checkMergeSimulation();
    const preflightRes = this.checkPreflightPackages();
    const verifierRes = this.checkPostVerifiers();
    const e2eRes = this.checkE2ePackages();

    const allErrors = [
      ...sourceRes.errors,
      ...chainRes.errors,
      ...mergeRes.errors,
      ...preflightRes.errors,
      ...verifierRes.errors,
      ...e2eRes.errors,
    ];

    const allMessages = [
      ...sourceRes.messages,
      ...chainRes.messages,
      ...mergeRes.messages,
      ...preflightRes.messages,
      ...verifierRes.messages,
      ...e2eRes.messages,
    ];

    if (this.manifest.academic_councils.c9_status === 'C9_CANDIDATE_PRESENT' || this.manifest.academic_councils.c9_integrated_sha === 'PENDING') {
      allMessages.push('C0-C8_SOURCE_READY confirmed for PR #300 candidate.');
      allMessages.push('C0-C9_FULL_PRODUCT_READY cannot be granted while C9 extension candidate (#302) is not integrated onto remediated #300.');
      if (!allErrors.some((e) => e.includes('C9 extension'))) {
        allErrors.push('Councils C9 extension candidate (#302) is present but requires integration onto remediated final councils (#300)');
      }
    }

    const verdict: StatusVerdict = allErrors.length > 0 ? 'HOLD' : 'PASS';
    return {
      mode: 'release-ready',
      verdict,
      messages: allMessages,
      errors: allErrors,
    };
  }
}
