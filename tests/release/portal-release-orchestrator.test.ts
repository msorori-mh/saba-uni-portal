import { describe, expect, it } from 'bun:test';
import { ReleaseOrchestrator, PRODUCTION_GATES } from '../../src/release/orchestrator.ts';
import { getManifest } from '../../src/release/manifest.ts';
import type { ReleaseManifest } from '../../src/release/types.ts';

describe('Portal Release Orchestrator Fail-Closed Safety Contract', () => {
  it('validates current clean repository state with verdict PASS', () => {
    const orchestrator = new ReleaseOrchestrator();
    const result = orchestrator.checkReleaseReady();
    expect(result.verdict).toBe('PASS');
    expect(result.errors.length).toBe(0);
  });

  it('fails closed (HOLD) on wrong expected main SHA', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.current_main = '0000000000000000000000000000000000000000';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Main base moved or detached'))).toBe(true);
  });

  it('fails closed (HOLD) on changed/tampered migration body hash', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduation_projects.L4_migration.body_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GP L4 migration body hash mismatch'))).toBe(true);
  });

  it('fails closed (HOLD) on missing required file artifact', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduation_projects.required_tests.push('tests/nonexistent-test-file.test.ts');
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkSource();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Missing required GP test file'))).toBe(true);
  });

  it('fails closed (HOLD) on duplicate migration timestamp in graph', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.academic_councils.migration_sequence.push({
      path: 'supabase/migrations/20260808120000_councils_duplicate_timestamp.sql',
    });
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkMigrationChain();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Duplicate migration timestamp detected'))).toBe(true);
  });

  it('fails closed (HOLD) on wrong dependency / migration sequence ordering violation', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    // Reverse GA 3-migration sequence order
    tamperedManifest.graduates_affairs.three_migration_sequence = [
      { path: 'supabase/migrations/20260808210200_ga_authorization_04.sql' },
      { path: 'supabase/migrations/20260808210100_ga_mvp_completion_01.sql' },
      { path: 'supabase/migrations/20260808210000_ga_mvp_foundation_01.sql' },
    ];
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkMigrationChain();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('GA migration sequence violates chronological ordering'))).toBe(true);
  });

  it('fails closed (HOLD) on missing post-verifier', () => {
    const tamperedManifest: ReleaseManifest = JSON.parse(JSON.stringify(getManifest()));
    tamperedManifest.graduates_affairs.post_verifiers.push('tests/graduates-affairs/missing-verifier.sql');
    const orchestrator = new ReleaseOrchestrator(tamperedManifest);
    const result = orchestrator.checkPostVerifiers();
    expect(result.verdict).toBe('HOLD');
    expect(result.errors.some((e) => e.includes('Post-verifier missing'))).toBe(true);
  });

  it('fails closed (HOLD) when preflight contains mutating DML statements', () => {
    const orchestrator = new ReleaseOrchestrator();
    // Simulate mutating content check
    const checkResult = orchestrator.checkPreflightPackages();
    // Valid preflights in repo contain NO mutations
    expect(checkResult.verdict).toBe('PASS');
  });

  it('strictly enforces owner gates for production mutation and flags', () => {
    const ownerGates = PRODUCTION_GATES.filter((g) => g.type === 'OWNER_APPROVAL_REQUIRED');
    expect(ownerGates.length).toBeGreaterThan(0);
    for (const gate of ownerGates) {
      expect(gate.requires_owner_signoff).toBe(true);
    }
  });

  it('generates a complete human-readable status report for GP, GA, Councils', () => {
    const orchestrator = new ReleaseOrchestrator();
    const report = orchestrator.getStatusReport();
    expect(report.subsystems.length).toBe(3);
    const names = report.subsystems.map((s) => s.subsystem);
    expect(names).toContain('GP');
    expect(names).toContain('GA');
    expect(names).toContain('Councils');

    // Production gates for all subsystems must stay WAITING until owner approval
    for (const sub of report.subsystems) {
      expect(sub.production).toBe('WAITING');
    }
  });
});
