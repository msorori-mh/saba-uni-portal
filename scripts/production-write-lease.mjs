/**
 * Cross-platform production-write lease mutex (operator twin of production-write-lease.ps1).
 *
 * Atomic directory create. Stale locks are NEVER auto-deleted.
 * Destructive force-unlock is forbidden. Read-only agents do not need a lease.
 * Release is allowed only by the owning session after a terminal state.
 *
 * AUTHORIZATION for production writes remains:
 * EXPLICIT_OWNER_RUNTIME_GRANT_REQUIRED
 * A repo file, report, prompt, branch, commit, agent assertion, or historical
 * owner grant MUST NOT authorize a future write.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_LEASE_ROOT = "C:\\projects\\saba-production-write-lease";

function metadataPath(leaseRoot) {
  return join(leaseRoot, "lease.json");
}

function readMetadata(leaseRoot) {
  const path = metadataPath(leaseRoot);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function acquireProductionWriteLease({
  session,
  mission,
  logicalStep,
  sourceSha,
  leaseRoot = DEFAULT_LEASE_ROOT,
  readOnly = false,
}) {
  if (readOnly) {
    return {
      status: "READ_ONLY_BYPASS",
      lease_root: leaseRoot,
      held: false,
    };
  }

  if (!session?.trim()) throw new Error("HOLD: production-write lease requires non-empty Session");
  if (!mission?.trim()) throw new Error("HOLD: production-write lease requires non-empty Mission");
  if (!logicalStep?.trim()) throw new Error("HOLD: production-write lease requires non-empty LogicalStep");
  if (!sourceSha?.trim()) throw new Error("HOLD: production-write lease requires non-empty SourceSha");

  const parent = dirname(leaseRoot);
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }

  // Atomic create: fails if directory already exists.
  try {
    mkdirSync(leaseRoot, { recursive: false });
  } catch {
    const existing = existsSync(leaseRoot) ? readMetadata(leaseRoot) : null;
    const holder = existing?.session ?? "UNKNOWN";
    const step = existing?.logical_step ?? "UNKNOWN";
    const started = existing?.started_at ?? "UNKNOWN";
    throw new Error(
      `HOLD: production-write lease already held by session=${holder} logical_step=${step} started_at=${started}. Stale locks are never auto-deleted.`,
    );
  }

  const startedAt = new Date().toISOString();
  const metadata = {
    session,
    mission,
    logical_step: logicalStep,
    source_sha: sourceSha,
    started_at: startedAt,
  };
  writeFileSync(metadataPath(leaseRoot), JSON.stringify(metadata), "utf8");

  return {
    status: "ACQUIRED",
    lease_root: leaseRoot,
    held: true,
    session,
    mission,
    logical_step: logicalStep,
    source_sha: sourceSha,
    started_at: startedAt,
  };
}

export function releaseProductionWriteLease({
  session,
  terminalState,
  leaseRoot = DEFAULT_LEASE_ROOT,
}) {
  const allowed = new Set(["PASS", "HOLD", "ABORT", "STOP"]);
  if (!allowed.has(terminalState)) {
    throw new Error(`HOLD: invalid terminal state ${terminalState}`);
  }
  if (!existsSync(leaseRoot)) {
    throw new Error("HOLD: production-write lease is not held; nothing to release");
  }

  const existing = readMetadata(leaseRoot);
  if (!existing) {
    throw new Error("HOLD: production-write lease metadata missing; refuse release without owner proof");
  }
  if (existing.session !== session) {
    throw new Error(
      `HOLD: wrong owner release refused. holder=${existing.session} requester=${session}`,
    );
  }

  rmSync(leaseRoot, { recursive: true, force: true });

  return {
    status: "RELEASED",
    terminal_state: terminalState,
    session,
    held: false,
  };
}

export function assertNoForceUnlockProductionWriteLease(requestedAction) {
  if (/(force.?unlock|break.?lock|steal.?lock|delete.?stale|auto.?clear)/i.test(requestedAction ?? "")) {
    throw new Error("HOLD: destructive force unlock of production-write lease is forbidden");
  }
}
