/**
 * TEST_ONLY_ASSURANCE_02 — durable append+fsync JSONL checkpoint sink.
 *
 * Every intent is written and flushed to disk BEFORE the corresponding action,
 * and every created ID is written and flushed immediately after its action.
 * A sink failure is fatal: the caller must stop before any further write.
 * Files are created exclusively (`wx`, mode 0600) inside the ignored 0700
 * private directory, so a previous run's file is never overwritten.
 */

import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";

import type { FixtureKey } from "./fixtures";

export type CheckpointStage =
  | "run-start"
  | "preflight-ok"
  | "intent"
  | "auth-created"
  | "faculty-created"
  | "profile-created"
  | "role-created"
  | "failure"
  | "run-end";

export interface CheckpointEvent {
  seq: number;
  at: string;
  key: FixtureKey | "__run__";
  stage: CheckpointStage;
  userId?: string;
  facultyId?: string;
  profileId?: string;
  roleId?: string;
  detail?: string;
}

export class SinkError extends Error {
  constructor(message: string) {
    super(`ASSURANCE_02_SINK: ${message}`);
    this.name = "SinkError";
  }
}

export interface CheckpointSink {
  append(event: Omit<CheckpointEvent, "seq" | "at">): void;
  events(): readonly CheckpointEvent[];
  close(): void;
}

/** In-memory sink for unit tests; mirrors the durable ordering contract. */
export class MemoryCheckpointSink implements CheckpointSink {
  private seq = 0;
  private readonly log: CheckpointEvent[] = [];
  constructor(private readonly onAppend?: (e: CheckpointEvent) => void) {}

  append(event: Omit<CheckpointEvent, "seq" | "at">): void {
    const full: CheckpointEvent = { seq: ++this.seq, at: new Date().toISOString(), ...event };
    this.onAppend?.(full); // may throw -> simulates a durable-write failure
    this.log.push(full);
  }
  events(): readonly CheckpointEvent[] {
    return this.log;
  }
  close(): void {}
}

/** Real durable sink: exclusive create, append + fsync per event. */
export class JsonlCheckpointSink implements CheckpointSink {
  private seq = 0;
  private readonly log: CheckpointEvent[] = [];
  private readonly fd: number;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try {
      this.fd = openSync(path, "wx", 0o600); // exclusive: never overwrite
    } catch (error) {
      throw new SinkError(
        `cannot exclusively create checkpoint file at ${path}: ${(error as NodeJS.ErrnoException).code ?? "error"}`,
      );
    }
  }

  append(event: Omit<CheckpointEvent, "seq" | "at">): void {
    const full: CheckpointEvent = { seq: ++this.seq, at: new Date().toISOString(), ...event };
    try {
      writeSync(this.fd, `${JSON.stringify(full)}\n`);
      fsyncSync(this.fd);
    } catch (error) {
      throw new SinkError(
        `durable append failed at seq ${full.seq}: ${(error as NodeJS.ErrnoException).code ?? "error"}`,
      );
    }
    this.log.push(full);
  }

  events(): readonly CheckpointEvent[] {
    return this.log;
  }

  close(): void {
    try {
      closeSync(this.fd);
    } catch {
      /* closing is best-effort; data was already fsynced per event */
    }
  }
}
