import { describe, expect, it, beforeAll } from 'bun:test';
import { ReleaseOrchestrator, PRODUCTION_GATES, AUTHORITATIVE_GP_PACKAGE_PIN, COUNCILS_300_INTEGRATED_PIN } from '../../src/release/orchestrator.ts';
import { getManifest } from '../../src/release/manifest.ts';
import type { ReleaseManifest } from '../../src/release/types.ts';

describe('Portal Release Orchestrator Fail-Closed Safety Contract', () => {
  beforeAll(() => {
    // Warm static git object cache
    new ReleaseOrchestrator().checkReleaseReady();
  }, 60000);

  it('reports HOLD for release-ready when GA security review or C9 extension remains PENDING', () => {
    const orchestrator = new ReleaseOrchestrator();
    const result = orchestrator.checkReleaseReady();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GA final security review gate'))).toBe(true);
    expect(result.errors.some((e) => e.includes('C9 extension slot'))).toBe(true);
  }, 30000);

  it('evaluates release-ready to PASS when all pending gates are cleared and pins match', () => {
    const clearedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    clearedManifest.graduates_affairs.ga_final_security_review = 'APPROVED';
    clearedManifest.academic_councils.c9_extension_sha = 'c9_extension_approved_sha';
    clearedManifest.academic_councils.c9_status = 'COMPLETED';
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

  it('fails closed (HOLD) on GA final-security review pending', () => {
    const manifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    manifest.graduates_affairs.ga_final_security_review = 'PENDING';
    const orchestrator = new ReleaseOrchestrator(manifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GA_FINAL_SECURITY_REVIEW_REQUIRED'))).toBe(true);
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

  it('candidate-refresh mode reports drift but never auto-updates pins and requires owner approval', () => {
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

  it('generates a complete human-readable status report for GP, GA, Councils with detailed stages', () => {
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
  }, 30000);
});
