#!/usr/bin/env bun
import { ReleaseOrchestrator, PRODUCTION_GATES } from '../src/release/orchestrator.ts';
import type { OrchestratorMode } from '../src/release/types.ts';

function printBanner() {
  console.log('======================================================================');
  console.log('   PORTAL GP/GA/COUNCILS LOCAL RELEASE ORCHESTRATOR (FAIL-CLOSED)   ');
  console.log('======================================================================');
}

function parseMode(args: string[]): OrchestratorMode {
  for (const arg of args) {
    if (arg.startsWith('--mode=')) {
      return arg.split('=')[1] as OrchestratorMode;
    }
    const clean = arg.replace(/^--/, '');
    if (
      [
        'status',
        'source-check',
        'merge-simulation',
        'migration-chain',
        'preflight-package-check',
        'post-verifier-check',
        'e2e-package-check',
        'release-ready',
      ].includes(clean)
    ) {
      return clean as OrchestratorMode;
    }
  }
  return 'release-ready';
}

async function main() {
  printBanner();
  const args = process.argv.slice(2);
  const mode = parseMode(args);

  console.log(`Execution Mode: [${mode}]`);
  console.log(`Safety Contract: READ ONLY / LOCAL ONLY — ZERO Production Write\n`);

  const orchestrator = new ReleaseOrchestrator();

  if (mode === 'status') {
    const report = orchestrator.getStatusReport();
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Current Main: ${report.current_main}`);
    console.log(`Overall Status: [ ${report.overall} ]\n`);

    console.log('----------------------------------------------------------------------');
    console.log('Subsystem Status Matrix:');
    console.log('----------------------------------------------------------------------');
    console.log(
      'Subsystem | Source | Review | Migration | Preflight | E2E  | Prod Gate | Flags/Deploy'
    );
    console.log(
      '----------+--------+--------+-----------+-----------+------+-----------+-------------'
    );
    for (const sub of report.subsystems) {
      const pad = (s: string, len: number) => s.padEnd(len, ' ');
      console.log(
        `${pad(sub.subsystem, 9)} | ${pad(sub.source, 6)} | ${pad(sub.review, 6)} | ${pad(
          sub.migration,
          9
        )} | ${pad(sub.preflight, 9)} | ${pad(sub.e2e, 4)} | ${pad(
          sub.production,
          9
        )} | ${pad(sub.flags_deploy, 12)}`
      );
    }
    console.log('----------------------------------------------------------------------\n');

    console.log('Subsystem Details:');
    for (const sub of report.subsystems) {
      console.log(`\n[${sub.subsystem}]`);
      for (const d of sub.details) {
        console.log(`  - ${d}`);
      }
    }

    console.log('\n----------------------------------------------------------------------');
    console.log('Production Gate Boundaries:');
    console.log('----------------------------------------------------------------------');
    for (const gate of PRODUCTION_GATES) {
      const typeTag =
        gate.type === 'SAFE_AUTOMATIC'
          ? '[SAFE AUTOMATIC]'
          : '[OWNER APPROVAL REQUIRED]';
      console.log(` - ${gate.id} ${typeTag}: ${gate.name}`);
    }

    if (report.blockers.length > 0) {
      console.log('\n[!] BLOCKERS DETECTED:');
      for (const b of report.blockers) {
        console.log(`  - ${b}`);
      }
      process.exit(1);
    } else {
      console.log('\nPASS_PORTAL_GP_GA_COUNCILS_RELEASE_ORCHESTRATOR_LOCAL_STATUS_READY');
      process.exit(0);
    }
  }

  let result;
  switch (mode) {
    case 'source-check':
      result = orchestrator.checkSource();
      break;
    case 'migration-chain':
      result = orchestrator.checkMigrationChain();
      break;
    case 'merge-simulation':
      result = orchestrator.checkMergeSimulation();
      break;
    case 'preflight-package-check':
      result = orchestrator.checkPreflightPackages();
      break;
    case 'post-verifier-check':
      result = orchestrator.checkPostVerifiers();
      break;
    case 'e2e-package-check':
      result = orchestrator.checkE2ePackages();
      break;
    case 'release-ready':
    default:
      result = orchestrator.checkReleaseReady();
      break;
  }

  console.log(`Check Mode: ${result.mode}`);
  console.log(`Verdict: [ ${result.verdict} ]\n`);

  if (result.messages.length > 0) {
    console.log('Messages:');
    for (const m of result.messages) {
      console.log(`  - ${m}`);
    }
  }

  if (result.errors.length > 0) {
    console.log('\nErrors / Failures:');
    for (const e of result.errors) {
      console.log(`  - ${e}`);
    }
    console.log('\nResult: HOLD (Safety invariant broken or missing prerequisite)');
    process.exit(1);
  }

  // Always output human readable status summary for release-ready
  if (mode === 'release-ready') {
    const report = orchestrator.getStatusReport();
    console.log('\n----------------------------------------------------------------------');
    console.log('RELEASE STATUS MATRIX SUMMARY:');
    console.log('----------------------------------------------------------------------');
    for (const sub of report.subsystems) {
      console.log(
        `${sub.subsystem.padEnd(10)} | SOURCE: ${sub.source} | MIGRATION: ${
          sub.migration
        } | PREFLIGHT: ${sub.preflight} | E2E: ${sub.e2e} | PROD GATE: ${sub.production}`
      );
    }
    console.log('----------------------------------------------------------------------');
    console.log('PASS_PORTAL_GP_GA_COUNCILS_RELEASE_ORCHESTRATOR_READY');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Orchestrator Fatal Error:', err);
  process.exit(1);
});
