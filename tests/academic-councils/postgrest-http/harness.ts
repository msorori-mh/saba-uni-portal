/**
 * Disposable PostgREST HTTP harness for Academic Councils C0–C9 auth matrix.
 * True HTTP authorization via JWT + PostgREST (NOT SQL role switching).
 * Windows-safe: spawnSync + input piping (no bash-only syntax).
 */

import { createServer } from "node:net";
import { createHmac, createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const JWT_SECRET =
  "super-secret-jwt-for-local-councils-tests-only-32b";

export type JwtDbRole = "anon" | "authenticated" | "service_role";

/** Actor UUID constants matching TEST_ONLY fixture + a100 roster. */
export const ACTORS = {
  chair: "c0c90000-0000-4000-8000-000000000101",
  secretary: "c0c90000-0000-4000-8000-000000000102",
  memberA: "c0c90000-0000-4000-8000-000000000103",
  memberB: "c0c90000-0000-4000-8000-000000000104",
  viewer: "c0c90000-0000-4000-8000-000000000105",
  responsible: "c0c90000-0000-4000-8000-000000000106",
  systemAdmin: "a1000000-0000-0000-0000-000000000001",
  admin: "a1000000-0000-0000-0000-000000000002",
  dean: "a1000000-0000-0000-0000-000000000003",
  otherChair: "a1000000-0000-0000-0000-000000000012",
  student: "a1000000-0000-0000-0000-000000000017",
} as const;

export const IDS = {
  testCouncil: "c0c90000-0000-4000-8000-000000000001",
  otherCouncil: "c1000000-0000-0000-0000-000000000002",
  otherMembership: "11000000-0000-0000-0000-000000000012",
  forgedMeeting: "b1000000-0000-0000-0000-000000000099",
  forgedAgenda: "b1000000-0000-0000-0000-000000000098",
  forgedNotification: "ffffffff-ffff-4000-8000-000000000099",
} as const;

export const predecessors = [
  "tests/academic-councils/postgres-minimal-schema.sql",
  "supabase/migrations/20260703192337_3ef2f7b2-cf46-4407-9f1a-60c25b46c211.sql",
  "supabase/migrations/20260703194033_cccf45a9-50ed-4a72-bb11-7e5d1627b5a2.sql",
  "supabase/migrations/20260704200326_b0736829-500e-456c-aa9b-6dc7ccd10012.sql",
  "supabase/migrations/20260705232119_84b04a88-50be-4c5c-b9c3-11aeb54fa119.sql",
] as const;

export const c0c9Chain = [
  "supabase/migrations/20260808120000_councils_c0_write_surface_hardening_01.sql",
  "supabase/migrations/20260808121000_councils_c1_meeting_state_machine_01.sql",
  "supabase/migrations/20260808122000_councils_c2_topic_intake_review_01.sql",
  "supabase/migrations/20260808130000_councils_c3_attendance_quorum_01.sql",
  "supabase/migrations/20260808140000_councils_c4_session_voting_01.sql",
  "supabase/migrations/20260808150000_councils_c5_minutes_lifecycle_01.sql",
  "supabase/migrations/20260808160000_councils_c6_decisions_followup_01.sql",
  "supabase/migrations/20260808170000_councils_c7_audit_archive_01.sql",
  "supabase/migrations/20260808171000_councils_c0_c8_final_security_closure_01.sql",
  "supabase/migrations/20260808180000_councils_c9_notifications_reporting_01.sql",
] as const;

export type HttpResult = {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
};

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function mintJwt(sub: string | null, role: JwtDbRole): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    role,
    iat: now,
    exp: now + 2 * 60 * 60,
  };
  if (sub) {
    payload.sub = sub;
    payload.aud = "authenticated";
  }
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64url(sig)}`;
}

function assertDockerAvailable(): void {
  try {
    execSync("docker --version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "docker is required for PostgREST HTTP auth matrix (do not skip)",
    );
  }
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("failed to allocate free host port"));
        return;
      }
      const port = addr.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

const FINGERPRINT_SQL = `
SELECT md5(
  coalesce((SELECT count(*)::text FROM public.academic_council_meetings), '0') || '|' ||
  coalesce((SELECT string_agg(id::text || ':' || status::text, ',' ORDER BY id)
            FROM public.academic_council_meetings), '') || '|' ||
  coalesce((SELECT count(*)::text FROM public.academic_council_topics), '0') || '|' ||
  coalesce((SELECT string_agg(id::text || ':' || status::text, ',' ORDER BY id)
            FROM public.academic_council_topics), '') || '|' ||
  coalesce((SELECT count(*)::text FROM public.academic_council_agenda_items), '0') || '|' ||
  coalesce((SELECT string_agg(id::text || ':' || coalesce(session_status::text,''), ',' ORDER BY id)
            FROM public.academic_council_agenda_items), '') || '|' ||
  coalesce((SELECT count(*)::text FROM public.academic_council_votes), '0') || '|' ||
  coalesce((SELECT string_agg(id::text || ':' || vote_value::text || ':' || voter_user_id::text, ',' ORDER BY id)
            FROM public.academic_council_votes), '') || '|' ||
  coalesce((SELECT count(*)::text FROM public.academic_council_minutes), '0') || '|' ||
  coalesce((SELECT string_agg(id::text || ':' || is_locked::text, ',' ORDER BY id)
            FROM public.academic_council_minutes), '') || '|' ||
  coalesce((SELECT count(*)::text FROM public.academic_council_decisions), '0') || '|' ||
  coalesce((SELECT string_agg(id::text || ':' || status::text, ',' ORDER BY id)
            FROM public.academic_council_decisions), '') || '|' ||
  coalesce((SELECT count(*)::text FROM public.academic_council_notifications), '0') || '|' ||
  coalesce((SELECT string_agg(id::text || ':' || user_id::text || ':' || is_read::text, ',' ORDER BY id)
            FROM public.academic_council_notifications), '') || '|' ||
  coalesce((SELECT count(*)::text FROM public.academic_council_meeting_attendance), '0')
) AS fp;
`;

export class PostgrestHttpHarness {
  readonly root: string;
  readonly stamp: number;
  readonly network: string;
  readonly pgContainer: string;
  readonly pgrstContainer: string;
  port = 0;
  started = false;

  constructor(root = process.cwd()) {
    this.root = root;
    this.stamp = Date.now();
    this.network = `councils-pgrst-net-${this.stamp}`;
    this.pgContainer = `councils-pgrst-pg-${this.stamp}`;
    this.pgrstContainer = `councils-pgrst-api-${this.stamp}`;
  }

  baseUrl(): string {
    if (!this.port) throw new Error("PostgREST port not allocated");
    return `http://127.0.0.1:${this.port}`;
  }

  psql(sql: string, extraArgs: string[] = []): { ok: boolean; out: string } {
    const args = [
      "exec",
      "-i",
      this.pgContainer,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      ...extraArgs,
      "-U",
      "postgres",
      "-d",
      "postgres",
    ];
    const res = spawnSync("docker", args, {
      input: sql,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    return { ok: res.status === 0, out: `${res.stdout || ""}\n${res.stderr || ""}` };
  }

  applySqlFile(relOrAbs: string): { ok: boolean; out: string } {
    const path = relOrAbs.includes(":") || relOrAbs.startsWith("/") || relOrAbs.startsWith("\\")
      ? relOrAbs
      : join(this.root, relOrAbs);
    if (!existsSync(path)) {
      return { ok: false, out: `missing SQL file: ${path}` };
    }
    return this.psql(readFileSync(path, "utf8"));
  }

  async waitPgReady(attempts = 90): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      const r = spawnSync(
        "docker",
        ["exec", this.pgContainer, "pg_isready", "-U", "postgres"],
        { encoding: "utf8" },
      );
      if (r.status === 0 && this.psql("select 1;").ok) return true;
      await Bun.sleep(500);
    }
    return false;
  }

  async waitPostgrestReady(attempts = 90): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(this.baseUrl() + "/", {
          headers: { Accept: "application/openapi+json" },
        });
        // PostgREST serves OpenAPI / root once schema is loaded.
        if (res.status === 200 || res.status === 401 || res.status === 503) {
          if (res.status !== 503) return true;
        }
      } catch {
        /* retry */
      }
      await Bun.sleep(500);
    }
    return false;
  }

  bootstrapAuthenticator(): void {
    const r = this.applySqlFile(
      "tests/academic-councils/postgrest-http/00-authenticator.sql",
    );
    if (!r.ok) {
      throw new Error(`authenticator bootstrap failed:\n${r.out}`);
    }
  }

  seedOtherCouncilTopology(): void {
    const sql = `
INSERT INTO public.academic_councils (id, name, council_type, created_by, settings)
VALUES (
  '${IDS.otherCouncil}'::uuid,
  'OTHER_COUNCIL Cross-Tenant Chair Topology',
  'college',
  '${ACTORS.admin}'::uuid,
  '{"test_only": true, "cross_council": true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.academic_council_members (
  id, council_id, user_id, member_role, is_active, active_from, created_by
) VALUES (
  '${IDS.otherMembership}'::uuid,
  '${IDS.otherCouncil}'::uuid,
  '${ACTORS.otherChair}'::uuid,
  'chair',
  true,
  CURRENT_DATE,
  '${ACTORS.admin}'::uuid
)
ON CONFLICT DO NOTHING;

-- Ensure at least one notification row exists for JWT spoof / acknowledge denials.
INSERT INTO public.academic_council_notifications (
  id, user_id, event_type, council_id, meeting_id, title, body, is_read, payload
)
SELECT
  'c0c90000-0000-4000-8000-000000000901'::uuid,
  '${ACTORS.chair}'::uuid,
  'meeting_archived',
  m.council_id,
  m.id,
  'seed acknowledge target',
  'TEST_ONLY harness notification for HTTP matrix',
  false,
  '{}'::jsonb
FROM public.academic_council_meetings m
WHERE m.council_id = '${IDS.testCouncil}'::uuid
ORDER BY m.created_at DESC
LIMIT 1
ON CONFLICT (id) DO NOTHING;
`;
    const r = this.psql(sql);
    if (!r.ok) {
      throw new Error(`other-council seed failed:\n${r.out}`);
    }
  }

  executeTestOnlyFixture(): void {
    const fixturePath = join(
      this.root,
      "docs/migration-drafts/COUNCILS-C0-C9-TESTONLY-E2E-FIXTURE-01.sql",
    );
    const body = readFileSync(fixturePath, "utf8");
    const sql = `
SELECT set_config('councils.pkg_dry_run','false',false);
SELECT set_config('councils.test_only.execute','true',false);
SELECT set_config('councils.test_only_execute','I_ACKNOWLEDGE_TEST_ONLY',false);
${body}
`;
    const r = this.psql(sql);
    if (!r.ok) {
      throw new Error(`TEST_ONLY fixture execute failed:\n${r.out}`);
    }
    if (!r.out.includes("COUNCILS_TESTONLY_E2E_FIXTURE_EXECUTE_COMPLETE")) {
      throw new Error(
        `fixture execute did not complete:\n${r.out.slice(-4000)}`,
      );
    }
  }

  fingerprintSensitiveTables(): string {
    const r = this.psql(FINGERPRINT_SQL, ["-t", "-A"]);
    if (!r.ok) throw new Error(`fingerprint failed:\n${r.out}`);
    const m = r.out.match(/([0-9a-f]{32})/i);
    if (!m) throw new Error(`fingerprint md5 missing:\n${r.out}`);
    return m[1]!.toLowerCase();
  }

  queryScalar(sql: string): string | null {
    const r = this.psql(sql, ["-t", "-A"]);
    if (!r.ok) throw new Error(`query failed:\n${r.out}`);
    const line = r.out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("NOTICE") && !l.startsWith("SET"));
    return line ?? null;
  }

  loadFixtureEntityIds(): {
    meetingId: string;
    topicId: string;
    agendaItemId: string;
    voteId: string | null;
    minutesId: string | null;
    decisionId: string;
    notificationId: string;
    notificationUserId: string;
    attendanceId: string | null;
  } {
    const meetingId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_meetings
       WHERE council_id = '${IDS.testCouncil}'::uuid
       ORDER BY created_at DESC LIMIT 1;`,
    );
    if (!meetingId) throw new Error("fixture meeting id missing");

    const topicId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_topics
       WHERE council_id = '${IDS.testCouncil}'::uuid
       ORDER BY created_at DESC LIMIT 1;`,
    );
    if (!topicId) throw new Error("fixture topic id missing");

    const agendaItemId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_agenda_items
       WHERE meeting_id = '${meetingId}'::uuid
       ORDER BY order_index NULLS LAST, created_at LIMIT 1;`,
    );
    if (!agendaItemId) throw new Error("fixture agenda item id missing");

    const decisionId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_decisions
       WHERE meeting_id = '${meetingId}'::uuid
       ORDER BY created_at DESC LIMIT 1;`,
    );
    if (!decisionId) throw new Error("fixture decision id missing");

    const notificationId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_notifications
       WHERE council_id = '${IDS.testCouncil}'::uuid
       ORDER BY created_at DESC LIMIT 1;`,
    );
    if (!notificationId) throw new Error("notification id missing after seed");

    const notificationUserId = this.queryScalar(
      `SELECT user_id::text FROM public.academic_council_notifications
       WHERE id = '${notificationId}'::uuid;`,
    );
    if (!notificationUserId) throw new Error("notification user_id missing");

    const voteId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_votes
       WHERE meeting_id = '${meetingId}'::uuid
       ORDER BY cast_at LIMIT 1;`,
    );
    const minutesId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_minutes
       WHERE meeting_id = '${meetingId}'::uuid
       ORDER BY created_at LIMIT 1;`,
    );
    const attendanceId = this.queryScalar(
      `SELECT id::text FROM public.academic_council_meeting_attendance
       WHERE meeting_id = '${meetingId}'::uuid
       ORDER BY created_at LIMIT 1;`,
    );

    return {
      meetingId,
      topicId,
      agendaItemId,
      voteId,
      minutesId,
      decisionId,
      notificationId,
      notificationUserId,
      attendanceId,
    };
  }

  async http(
    method: string,
    path: string,
    opts: {
      token?: string | null;
      body?: unknown;
      prefer?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<HttpResult> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.headers || {}),
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (opts.prefer) headers.Prefer = opts.prefer;

    const res = await fetch(this.baseUrl() + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, headers: res.headers, text, json };
  }

  async startPostgres(): Promise<void> {
    assertDockerAvailable();
    this.teardown(false);

    const net = spawnSync("docker", ["network", "create", this.network], {
      encoding: "utf8",
    });
    if (net.status !== 0) {
      throw new Error(`docker network create failed:\n${net.stderr || net.stdout}`);
    }

    const run = spawnSync(
      "docker",
      [
        "run",
        "-d",
        "--name",
        this.pgContainer,
        "--network",
        this.network,
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "postgres:17",
      ],
      { encoding: "utf8" },
    );
    if (run.status !== 0) {
      throw new Error(`postgres container start failed:\n${run.stderr || run.stdout}`);
    }

    if (!(await this.waitPgReady())) {
      throw new Error("postgres did not become ready");
    }
    await Bun.sleep(800);
    if (!(await this.waitPgReady())) {
      throw new Error("postgres readiness unstable");
    }
  }

  async startPostgrest(): Promise<void> {
    this.port = await findFreePort();
    const uri = `postgres://authenticator:testsecret@${this.pgContainer}:5432/postgres`;
    const run = spawnSync(
      "docker",
      [
        "run",
        "-d",
        "--name",
        this.pgrstContainer,
        "--network",
        this.network,
        "-p",
        `127.0.0.1:${this.port}:3000`,
        "-e",
        `PGRST_DB_URI=${uri}`,
        "-e",
        "PGRST_DB_SCHEMAS=public",
        "-e",
        "PGRST_DB_ANON_ROLE=anon",
        "-e",
        `PGRST_JWT_SECRET=${JWT_SECRET}`,
        "-e",
        "PGRST_DB_EXTRA_SEARCH_PATH=public",
        "postgrest/postgrest:v12.2.3",
      ],
      { encoding: "utf8" },
    );
    if (run.status !== 0) {
      throw new Error(
        `postgrest container start failed:\n${run.stderr || run.stdout}`,
      );
    }
    if (!(await this.waitPostgrestReady())) {
      const logs = spawnSync("docker", ["logs", this.pgrstContainer], {
        encoding: "utf8",
        maxBuffer: 5 * 1024 * 1024,
      });
      throw new Error(
        `PostgREST did not become ready on port ${this.port}\n${logs.stdout || ""}\n${logs.stderr || ""}`,
      );
    }
    this.started = true;
  }

  /**
   * Full disposable lifecycle: PG → predecessors → C0-C9 → fixture → seed → authenticator → PostgREST.
   */
  async bootstrapFullStack(): Promise<void> {
    await this.startPostgres();

    for (const pred of predecessors) {
      const r = this.applySqlFile(pred);
      if (!r.ok) throw new Error(`predecessor ${pred} failed:\n${r.out}`);
    }
    for (const mig of c0c9Chain) {
      const r = this.applySqlFile(mig);
      if (!r.ok) throw new Error(`migration ${mig} failed:\n${r.out}`);
    }

    this.executeTestOnlyFixture();
    this.seedOtherCouncilTopology();
    this.bootstrapAuthenticator();
    await this.startPostgrest();
  }

  teardown(silent = true): void {
    for (const name of [this.pgrstContainer, this.pgContainer]) {
      try {
        execSync(`docker rm -f ${name}`, { stdio: "ignore" });
      } catch {
        if (!silent) {
          /* ignore */
        }
      }
    }
    try {
      execSync(`docker network rm ${this.network}`, { stdio: "ignore" });
    } catch {
      /* ignore */
    }
    this.started = false;
  }
}

export function sha256LfFile(path: string): string {
  const raw = readFileSync(path);
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i]!;
    if (b === 0x0d) {
      if (i + 1 < raw.length && raw[i + 1] === 0x0a) i++;
      out.push(0x0a);
    } else {
      out.push(b);
    }
  }
  return createHash("sha256").update(Buffer.from(out)).digest("hex");
}
