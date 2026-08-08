import { describe, expect, it, beforeAll } from 'bun:test';
import { ReleaseOrchestrator, PRODUCTION_GATES, AUTHORITATIVE_GP_PACKAGE_PIN, COUNCILS_300_INTEGRATED_PIN } from '../../src/release/orchestrator.ts';
import { getManifest } from '../../src/release/manifest.ts';
import type { ReleaseManifest } from '../../src/release/types.ts';

describe('Portal Release Orchestrator Fail-Closed Safety Contract', () => {
  beforeAll(() => {
    // Warm static git object cache
    new ReleaseOrchestrator().checkReleaseReady();
  }, 60000);

  it('reports HOLD for release-ready when GA security review or Councils security review remains HOLD', () => {
    const orchestrator = new ReleaseOrchestrator();
    const result = orchestrator.checkReleaseReady();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GA_FINAL_SECURITY_REVIEW_REQUIRED'))).toBe(true);
    expect(result.errors.some((e) => e.includes('COUNCILS_FINAL_SECURITY_REVIEW_REQUIRED'))).toBe(true);
  }, 30000);

  it('evaluates release-ready to PASS when all pending gates are cleared and future reviewed heads are explicitly pinned', () => {
    const clearedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    clearedManifest.graduates_affairs.ga_final_security_review = 'APPROVED';
    clearedManifest.academic_councils.councils_final_security_review = 'APPROVED';
    clearedManifest.academic_councils.councils_final_security_sha = '8888888888888888888888888888888888888888';
    clearedManifest.academic_councils.c9_extension_sha = '7d5d607d610f4b319c06b3e1cf8a37d69e18517f';
    clearedManifest.academic_councils.c9_integrated_sha = '9999999999999999999999999999999999999999';
    clearedManifest.academic_councils.c9_status = 'INTEGRATED';
    const orchestrator = new ReleaseOrchestrator(clearedManifest);
    const result = orchestrator.checkReleaseReady();
    expect(result.verdict).toBe('PASS');
    expect(result.errors.length).toBe(0);
  }, 30000);

  it('fails closed (HOLD) on stale GP #293 operator package pin', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduation_projects.operator_package_sha = '30fbceecddb40ac8f123a97a84ffeebf624a5e48';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GP operator package pin is stale or incorrect'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on missing Councils #300 integrated candidate pin', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.academic_councils.eventual_final_integrated_sha = 'PENDING';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Missing Councils final integrated candidate PR #300 SHA pin'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on Councils #300 SHA drift', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.academic_councils.eventual_final_integrated_sha = '0000000000000000000000000000000000000000';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Councils candidate PR #300 SHA drift detected'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on GA final-security review HOLD (unreviewed GA candidate cannot auto-bless)', () => {
    const manifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    expect(manifest.graduates_affairs.ga_final_security_review).toBe('HOLD');
    const orchestrator = new ReleaseOrchestrator(manifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GA_FINAL_SECURITY_REVIEW_REQUIRED'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on Councils #300 final security review HOLD with 4 High findings', () => {
    const manifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    expect(manifest.academic_councils.councils_final_security_review).toBe('HOLD');
    const orchestrator = new ReleaseOrchestrator(manifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('COUNCILS_FINAL_SECURITY_REVIEW_REQUIRED'))).toBe(true);
  }, 30000);

  it('distinguishes C9_CANDIDATE_PRESENT from integrated status and rejects release readiness when C9 integrated SHA is PENDING', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.academic_councils.c9_status = 'C9_CANDIDATE_PRESENT';
    tamperedManifest.academic_councils.c9_extension_sha = '7d5d607d610f4b319c06b3e1cf8a37d69e18517f';
    tamperedManifest.academic_councils.c9_integrated_sha = 'PENDING';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('C9 extension candidate (#302: 7d5d607d610f4b319c06b3e1cf8a37d69e18517f) present but NOT integrated'))).toBe(true);
  }, 30000);

  it('rejects old AUTH04 migration hash when tampered back to legacy hash', () => {
    const defaultManifest: ReleaseManifest = getManifest();
    expect(defaultManifest.graduates_affairs.three_migration_sequence[2].body_hash).toBe('3a85f54dbe5bcf249349d16cdcef5a921e4d8be28a5099965691e65ce4c3dffd');
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(defaultManifest));
    tamperedManifest.graduates_affairs.three_migration_sequence[2].body_hash = '05e411a195a2ff079b2ffe7cb485993f69d1f46a06f1165dead45c547f32805d';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const report = orchestrator.getStatusReport();
    expect(report.subsystems.find((s) => s.subsystem === 'GA')?.details.some((d) => d.includes('05e411a195a2ff079b2ffe7cb485993f69d1f46a06f1165dead45c547f32805d'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on backwards migration ordering', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduation_projects.migration_sequence = [
      { path: 'supabase/migrations/20260808210000_ga_mvp_foundation_01.sql' },
      { path: 'supabase/migrations/20260808010000_gp_student_level4_only_eligibility_guard_01.sql' },
    ];
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkMigrationChain();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Backwards migration release ordering detected'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on wrong expected main SHA', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.current_main = '0000000000000000000000000000000000000000';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Main base moved or detached'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on changed/tampered migration body hash', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduation_projects.L4_migration.body_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GP L4 migration body hash mismatch'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on missing required file artifact', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduation_projects.required_tests.push('tests/nonexistent-test-file.test.ts');
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Missing required GP test file'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on duplicate migration timestamp in graph', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.academic_councils.migration_sequence.push({
      path: 'supabase/migrations/20260808120000_councils_duplicate_timestamp.sql',
    });
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkMigrationChain();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Duplicate migration timestamp detected'))).toBe(true);
  }, 30000);

  it('fails closed (HOLD) on missing post-verifier', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduates_affairs.post_verifiers.push('tests/graduates-affairs/missing-verifier.sql');
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkPostVerifiers();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Post-verifier missing'))).toBe(true);
  }, 30000);

  it('candidate-refresh mode reports candidate SHAs, security review gates, and requires owner approval', () => {
    const orchestrator = new ReleaseOrchestrator();
    const result = orchestrator.checkCandidateRefresh();
    expect(result.mode).toBe('candidate-refresh');
    expect(result.verdict).toBe('OWNER_APPROVAL_REQUIRED');
    expect(result.messages.some((m) => m.includes('candidate-refresh is READ-ONLY'))).toBe(true);
    expect(result.messages.some((m) => m.includes('Owner approval required'))).toBe(true);
  }, 30000);

  it('strictly enforces owner gates for production mutation and flags', () => {
    const ownerGates = PRODUCTION_GATES.filter((g) => g.type === 'OWNER_APPROVAL_REQUIRED');
    expect(ownerGates.length).toBeGreaterThan(0);
    for (const gate of ownerGates) {
      expect(gate.requires_owner_signoff).toBe(true);
    }
  }, 30000);

  it('generates a complete human-readable status report for GP, GA, Councils with detailed stages and blockers', () => {
    const orchestrator = new ReleaseOrchestrator();
    const report = orchestrator.getStatusReport();
    expect(report.subsystems.length).toBe(3);
    const names = report.subsystems.map((s) => s.subsystem);
    expect(names).toContain('GP');
    expect(names).toContain('GA');
    expect(names).toContain('Councils');

    for (const sub of report.subsystems) {
      expect(sub.stages).toBeDefined();
      expect(sub.production).toBe('WAITING');
    }
    expect(report.overall).toBe('HOLD');
    expect(report.blockers.length).toBeGreaterThan(0);
  }, 30000);
});
