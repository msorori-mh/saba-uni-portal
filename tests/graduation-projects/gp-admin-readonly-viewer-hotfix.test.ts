/**
 * PORTAL-GP-ADMIN-READONLY-VIEWER-PRODUCTION-HOTFIX-01
 * Disposable PG17 before/after rehearsal + source contract checks.
 * NO production apply.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260811041600_de9e9a8e-741e-4415-9741-fd8a2e53d22d.sql",
);
const legacyOverviewMigrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260807001114_c22e6009-1472-43ef-9443-b002872bbba5.sql",
);
const verifierPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-admin-readonly-viewer-hotfix-verifier.sql",
);
const minimalSchemaPath = join(
  root,
  "tests",
  "graduation-projects",
  "postgres-minimal-schema.sql",
);
const a1Path = join(
  root,
  "supabase",
  "migrations",
  "20260806235348_8f36000d-c62c-416f-a84b-eeee7d400dd8.sql",
);
const a2Path = join(
  root,
  "supabase",
  "migrations",
  "20260807000230_a6771356-c3f3-4cba-9b90-e3f70afbb72b.sql",
);
const a3Path = legacyOverviewMigrationPath;

const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const adapter = readFileSync(join(root, "src/routes/-graduation-projects-adapter.ts"), "utf8");
const adminRoute = readFileSync(join(root, "src/routes/admin/graduation-projects.tsx"), "utf8");
const errors = readFileSync(join(root, "src/lib/graduation-projects/errors.ts"), "utf8");
const adminNav = readFileSync(join(root, "src/lib/admin-nav.ts"), "utf8");

const container = `gp-admin-viewer-hotfix-${Date.now()}`;

const dockerReady = (() => {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function teardownContainer() {
  try {
    execSync(`docker rm -f ${container}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function psql(sql: string): { ok: boolean; out: string } {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  return { ok: res.status === 0, out };
}

function psqlFile(filePath: string): { ok: boolean; out: string } {
  return psql(readFileSync(filePath, "utf8"));
}

async function waitReady(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (r.status === 0) {
      const probe = psql("select 1;");
      if (probe.ok) return true;
    }
    await Bun.sleep(500);
  }
  return false;
}

const AUTH_STUB = `
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'admin','editor','viewer','system_admin','dean','department_head','registrar',
      'student_affairs','finance_officer','faculty_member','student','graduate','hr_officer'
    );
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.roles_catalog (
  code text primary key,
  app_role_mapping public.app_role
);

create table if not exists public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null
);

create or replace function public.has_any_role(_user_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role::text = any(_roles)
  )
  or exists (
    select 1
    from public.user_role_assignments ura
    left join public.roles_catalog rc on rc.code = ura.role_code
    where ura.user_id = _user_id
      and (ura.role_code = any(_roles) or rc.app_role_mapping::text = any(_roles))
  );
$$;
`;

const BEFORE_PROOF = `
do $$ begin
  insert into auth.users(id) values ('10000000-0000-0000-0000-000000000080')
  on conflict do nothing;
  insert into public.user_roles(user_id, role)
  values ('10000000-0000-0000-0000-000000000080', 'admin'::public.app_role)
  on conflict do nothing;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000080', false);

do $$
declare
  failed boolean := false;
  err text;
begin
  begin
    perform public.list_administration_graduation_projects_overview();
  exception when others then
    failed := true;
    err := sqlerrm;
  end;
  if not failed then
    raise exception 'PG17_BEFORE expected denial for admin without coordinator';
  end if;
  if position('administration graduation-project viewer capability required' in err) = 0 then
    raise exception 'PG17_BEFORE unexpected error: %', err;
  end if;
  -- Prove prestate still coordinator-gated
  if position(
    'graduation_project_department_coordinators'
    in pg_get_functiondef('public.list_administration_graduation_projects_overview()'::regprocedure)
  ) = 0 then
    raise exception 'PG17_BEFORE missing coordinator gate in function body';
  end if;
  if position(
    'has_any_role'
    in pg_get_functiondef('public.list_administration_graduation_projects_overview()'::regprocedure)
  ) > 0 then
    raise exception 'PG17_BEFORE unexpectedly already uses has_any_role';
  end if;
  raise notice 'PG17_BEFORE_ADMIN_VIEWER_DENIED';
end $$;
`;

afterAll(() => {
  teardownContainer();
});

describe("GP admin readonly viewer hotfix (source contracts)", () => {
  it("does not edit the historical production overview migration", () => {
    const legacy = readFileSync(legacyOverviewMigrationPath, "utf8");
    expect(legacy).toContain("graduation_project_department_coordinators");
    expect(legacy).toContain("administration graduation-project viewer capability required");
    expect(legacy).not.toContain("has_any_role");
  });

  it("forward migration uses NAV viewer roles + coordinator union and stays read-only", () => {
    expect(migration).toContain("create or replace function public.list_administration_graduation_projects_overview()");
    expect(migration).toContain("has_any_role");
    expect(migration).toContain("system_admin");
    expect(migration).toContain("admin");
    expect(migration).toContain("dean");
    expect(migration).toContain("registrar");
    expect(migration).toContain("graduation_project_department_coordinators");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function public.list_administration_graduation_projects_overview() from public, anon");
    expect(migration).toContain("grant execute on function public.list_administration_graduation_projects_overview() to authenticated");
    expect(migration).not.toMatch(/create or replace function public\.(review|assign|schedule|conclude|archive)_graduation_project/i);
    expect(migration).toContain("No operational RPC / require_graduation_project_assignment changes");
    expect(migration).not.toMatch(/a\s*:=\s*public\.require_graduation_project_assignment/);
    expect(adminNav).toContain('"/admin/graduation-projects": ["system_admin", "admin", "dean", "registrar"]');
  });

  it("maps viewer-capability denial to Arabic and keeps read-only admin route marker", () => {
    expect(errors).toContain("administration graduation-project viewer capability required");
    expect(errors).toContain("عفواً، لا تملك الصلاحية الكافية لاستعراض النشرة الإدارية لمشاريع التخرج.");
    expect(adapter).toContain("viewer capability required");
    expect(adapter).toContain("عفواً، لا تملك الصلاحية الكافية لاستعراض النشرة الإدارية لمشاريع التخرج.");
    expect(adapter).toContain("retry: false");
    expect(adminRoute).toContain("administration-read-only");
    expect(adminRoute).toContain("readOnly");
    expect(adminRoute).toContain("query.refetch");
    expect(adminRoute).not.toMatch(/useGraduationProjectAction|onAction|mutate/);
  });

  it("records migration sha256 for the apply packet", () => {
    const sha = createHash("sha256").update(migration).digest("hex");
    expect(sha.length).toBe(64);
    expect(verifier).toContain("GP_ADMIN_READONLY_VIEWER_HOTFIX_VERIFIER_PASS");
    expect(verifier).toMatch(/^\s*begin;/im);
    expect(verifier).toMatch(/^\s*rollback;/im);
    expect(verifier).not.toMatch(/^\s*commit;/im);
  });
});

describe("GP admin readonly viewer hotfix (PG17 before/after)", () => {
  it("reproduces coordinator-only denial then passes after hotfix", async () => {
    if (!dockerReady) {
      throw new Error("docker is required for the PG17 disposable harness");
    }

    teardownContainer();
    execSync(
      `docker run -d --name ${container} -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`,
      { stdio: "ignore" },
    );

    try {
      expect(await waitReady()).toBe(true);
      await Bun.sleep(1000);
      expect(await waitReady()).toBe(true);

      let schemaOut = psqlFile(minimalSchemaPath);
      if (!schemaOut.ok && /No such file or directory|Connection refused/i.test(schemaOut.out)) {
        await Bun.sleep(1500);
        expect(await waitReady()).toBe(true);
        schemaOut = psqlFile(minimalSchemaPath);
      }
      expect(schemaOut.ok).toBe(true);

      const a1 = psqlFile(a1Path);
      expect(a1.ok).toBe(true);
      const a2 = psqlFile(a2Path);
      expect(a2.ok).toBe(true);
      const a3 = psqlFile(a3Path);
      expect(a3.ok).toBe(true);

      const authStub = psql(AUTH_STUB);
      expect(authStub.ok).toBe(true);

      const before = psql(BEFORE_PROOF);
      expect(before.ok).toBe(true);
      expect(before.out).toContain("PG17_BEFORE_ADMIN_VIEWER_DENIED");

      const hotfix = psqlFile(migrationPath);
      expect(hotfix.ok).toBe(true);

      const afterSrc = psql(`
select pg_get_functiondef('public.list_administration_graduation_projects_overview()'::regprocedure);
`);
      expect(afterSrc.ok).toBe(true);
      expect(afterSrc.out).toContain("has_any_role");
      expect(afterSrc.out).toContain("system_admin");

      const after = psqlFile(verifierPath);
      if (!after.ok) {
        throw new Error(`after verifier failed:\\n${after.out}`);
      }
      expect(after.out).toContain("PG17_AFTER_ADMIN_OVERVIEW_PASS");
      expect(after.out).toContain("GP_ADMIN_READONLY_VIEWER_HOTFIX_VERIFIER_PASS");
      expect(after.out).toContain("ADMIN_VIEWER_CAN_REVIEW_PROPOSAL=NO");
      expect(after.out).toContain("ADMIN_OVERVIEW_PII_EXPANSION=NO");
      expect(after.out).toContain("DIRECT_ASSIGNMENT_GUARDS=UNCHANGED");
    } finally {
      teardownContainer();
    }
  }, 300_000);
});
