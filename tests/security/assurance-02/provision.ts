/**
 * TEST_ONLY_ASSURANCE_02 — provisioning core (pure, port-injected).
 *
 * Invariants:
 *  - dry run by default; writes only when mode === "apply"
 *  - FULL preflight (vault readiness, secrets, references, collisions) runs and
 *    must pass before the first Auth create
 *  - collision on ANY chosen auth email / business identifier / role mapping
 *    aborts BEFORE the first write (zero write calls)
 *  - every intent is durably flushed BEFORE its action and every created ID
 *    durably flushed immediately AFTER its action; a sink failure is fatal and
 *    prevents all later writes
 *  - never updateUserById / delete / upsert / reset / relink an existing record
 *  - stop on first partial failure, preserving every created ID (auth, faculty,
 *    profile, role) for diagnosis; never bulk-cleanup or roll back by deletion
 *  - only auth users + faculty rows for faculty identities + one minimal
 *    profile + exactly one canonical `user_roles` row. No requests, documents, certificates, storage,
 *    payments, emails or invites.
 */

import {
  ASSURANCE_02_FIXTURES,
  fixtureMetadata,
  type FixtureKey,
  type FixtureSpec,
} from "./fixtures";
import { SinkError, type CheckpointEvent, type CheckpointSink } from "./durable-sink";
import { generatePassword, redactError } from "./secret-vault";
import type { RunMode } from "./target-guard";

export type CollisionKind =
  | "auth_email"
  | "profile_identifier"
  | "faculty_employee_id"
  | "role_mapping";

export interface Collision {
  key: FixtureKey;
  kind: CollisionKind;
}

export interface CollisionProbe {
  /** Exact read-only lookup. Must never return or log existing emails. */
  authEmailExists(email: string): Promise<boolean>;
  profileIdentifierExists(spec: FixtureSpec): Promise<boolean>;
  facultyEmployeeIdExists(spec: FixtureSpec): Promise<boolean>;
  roleMappingExists(spec: FixtureSpec): Promise<boolean>;
}

export interface ReferencePreflight {
  /** Re-verifies live labels/IDs and the program -> department FK. */
  verify(): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export interface WritePort {
  createAuthUser(input: {
    email: string;
    password: string;
    email_confirm: true;
    user_metadata: Record<string, string>;
  }): Promise<{ userId: string }>;
  /** Only called for faculty identities; creates a NEW marked faculty row. */
  createFacultyRecord(spec: FixtureSpec): Promise<{ facultyId: string }>;
  createProfile(
    spec: FixtureSpec,
    userId: string,
    facultyId: string | null,
  ): Promise<{ profileId: string | null }>;
  /**
   * Creates the single canonical role row (`user_roles`) and returns its id so
   * the checkpoint records the exact object created.
   */
  createRole(spec: FixtureSpec, userId: string): Promise<{ roleId: string }>;
}

export interface CreatedRecord {
  key: FixtureKey;
  userId?: string;
  facultyId?: string;
  profileId?: string | null;
  roleId?: string;
  roleCreated: boolean;
}

export interface ProvisionResult {
  mode: RunMode;
  planned: FixtureKey[];
  collisions: Collision[];
  created: CreatedRecord[];
  incomplete: FixtureKey[];
  stoppedAt?: { key: FixtureKey | "__preflight__"; message: string };
  checkpoints: readonly CheckpointEvent[];
}

export class CollisionError extends Error {
  constructor(public readonly collisions: Collision[]) {
    super(
      `ASSURANCE_02_COLLISION: ${collisions.map((c) => `${c.key}:${c.kind}`).join(", ")} — failing closed, no writes performed.`,
    );
    this.name = "CollisionError";
  }
}

export class PreflightError extends Error {
  constructor(reason: string) {
    super(`ASSURANCE_02_PREFLIGHT_FAILED: ${reason}`);
    this.name = "PreflightError";
  }
}

/** Generate one independent random password per fixture. */
export function generateSecrets(
  fixtures: readonly FixtureSpec[] = ASSURANCE_02_FIXTURES,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of fixtures) out[spec.key] = generatePassword();
  return out;
}

export async function detectCollisions(
  probe: CollisionProbe,
  fixtures: readonly FixtureSpec[] = ASSURANCE_02_FIXTURES,
): Promise<Collision[]> {
  const found: Collision[] = [];
  for (const spec of fixtures) {
    if (await probe.authEmailExists(spec.email)) found.push({ key: spec.key, kind: "auth_email" });
    if (await probe.profileIdentifierExists(spec))
      found.push({ key: spec.key, kind: "profile_identifier" });
    if (spec.facultyEmployeeId && (await probe.facultyEmployeeIdExists(spec)))
      found.push({ key: spec.key, kind: "faculty_employee_id" });
    if (await probe.roleMappingExists(spec)) found.push({ key: spec.key, kind: "role_mapping" });
  }
  return found;
}

export interface ProvisionOptions {
  mode: RunMode;
  probe: CollisionProbe;
  writer: WritePort;
  sink: CheckpointSink;
  secrets: Record<string, string>;
  references: ReferencePreflight;
  /** Confirms the credential vault already persisted every secret to disk. */
  vaultReady: boolean;
  fixtures?: readonly FixtureSpec[];
}

export async function provision(opts: ProvisionOptions): Promise<ProvisionResult> {
  const fixtures = opts.fixtures ?? ASSURANCE_02_FIXTURES;
  const planned = fixtures.map((f) => f.key);
  const created: CreatedRecord[] = [];
  const sink = opts.sink;

  const finish = (
    stoppedAt?: ProvisionResult["stoppedAt"],
    collisions: Collision[] = [],
  ): ProvisionResult => ({
    mode: opts.mode,
    planned,
    collisions,
    created,
    incomplete: created.filter((c) => !c.roleCreated).map((c) => c.key),
    stoppedAt,
    checkpoints: sink.events(),
  });

  sink.append({ key: "__run__", stage: "run-start", detail: opts.mode });

  // ---- preflight: everything verified before the first Auth create ---------
  if (!opts.vaultReady) throw new PreflightError("credential vault was not persisted before create");
  for (const spec of fixtures) {
    if (!opts.secrets[spec.key]) throw new PreflightError(`missing pre-generated secret for ${spec.key}`);
  }
  const refs = await opts.references.verify();
  if (!refs.ok) throw new PreflightError(refs.reason);

  const collisions = await detectCollisions(opts.probe, fixtures);
  if (collisions.length > 0) throw new CollisionError(collisions);

  sink.append({ key: "__run__", stage: "preflight-ok" });

  if (opts.mode !== "apply") {
    sink.append({ key: "__run__", stage: "run-end", detail: "dryrun" });
    return finish();
  }

  // ---- apply --------------------------------------------------------------
  for (const spec of fixtures) {
    const record: CreatedRecord = { key: spec.key, roleCreated: false };
    try {
      sink.append({ key: spec.key, stage: "intent" }); // durable BEFORE action

      const { userId } = await opts.writer.createAuthUser({
        email: spec.email,
        password: opts.secrets[spec.key]!,
        email_confirm: true,
        user_metadata: fixtureMetadata(spec),
      });
      record.userId = userId;
      created.push(record); // partial record is preserved from this point on
      sink.append({ key: spec.key, stage: "auth-created", userId });

      let facultyId: string | null = null;
      if (spec.facultyEmployeeId) {
        facultyId = (await opts.writer.createFacultyRecord(spec)).facultyId;
        record.facultyId = facultyId;
        sink.append({ key: spec.key, stage: "faculty-created", userId, facultyId });
      }

      const { profileId } = await opts.writer.createProfile(spec, userId, facultyId);
      record.profileId = profileId;
      sink.append({
        key: spec.key,
        stage: "profile-created",
        userId,
        facultyId: facultyId ?? undefined,
        profileId: profileId ?? undefined,
      });

      const { roleId } = await opts.writer.createRole(spec, userId);
      record.roleId = roleId;
      record.roleCreated = true;
      sink.append({ key: spec.key, stage: "role-created", userId, roleId });
    } catch (error) {
      if (!record.userId && !created.includes(record)) {
        // Failure before auth create: nothing exists for this fixture.
        created.push(record);
      }
      const message = redactError(error, Object.values(opts.secrets));
      if (error instanceof SinkError) {
        // Durability is broken: stop immediately, do not attempt further writes.
        return finish({ key: spec.key, message });
      }
      try {
        sink.append({ key: spec.key, stage: "failure", detail: message });
      } catch {
        /* already stopping */
      }
      return finish({ key: spec.key, message });
    }
  }

  sink.append({ key: "__run__", stage: "run-end", detail: "apply-complete" });
  return finish();
}

/** Public manifest — IDs only, no secrets, empty account list on dry run. */
export function publicManifest(result: ProvisionResult) {
  return {
    namespace: "TEST_ONLY_ASSURANCE_02",
    mode: result.mode,
    accounts: result.mode === "apply" ? result.created : [],
    incomplete: result.incomplete,
    stoppedAt: result.stoppedAt ?? null,
  };
}
