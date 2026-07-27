import { describe,expect,it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sql=readFileSync(join(process.cwd(),"docs","migration-drafts","REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql"),"utf8");

describe("B1 detail RPC-write boundaries 05A",()=>{
  it("covers exactly the three remaining existing B1 detail relations",()=>{
    for(const table of ["enrollment_suspension_details","transfer_request_details","extra_chance_details"])
      expect(sql).toContain(`('${table}'`);
    expect(sql.match(/\('(?:enrollment_suspension_details|transfer_request_details|extra_chance_details)'/g)).toHaveLength(3);
  });
  it("fails closed on unknown policies before replacing only the approved inventory",()=>{
    expect(sql).toContain("B1_DETAIL_UNEXPECTED_POLICY");
    expect(sql).toContain("policyname<>ALL(ARRAY[v_prefix||'_select'");
    expect(sql).toContain("format('%s POLICY IF EXISTS %I ON public.%I','DROP',v_policy,v_table)");
    expect(sql).not.toMatch(/DROP\s+POLICY/i);
    expect(sql).toContain("FOR SELECT TO authenticated USING (public.is_owner_of_request(auth.uid(),request_id))");
    expect(sql).toContain("B1_DETAIL_POLICY_INVENTORY_MISMATCH");
  });
  it("installs a locked primitive that cannot independently perform cutover",()=>{
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.apply_b1_detail_rpc_write_boundaries()")
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.apply_b1_detail_rpc_write_boundaries() FROM PUBLIC, anon, authenticated, service_role")
    expect(sql).not.toMatch(/SELECT\s+public\.apply_b1_detail_rpc_write_boundaries\s*\(/i)
    expect(sql).not.toMatch(/^\s*BEGIN\s*;|^\s*COMMIT\s*;/im)
  });
  it("the cutover primitive rejects a missing or stub dispatcher",()=>{
    expect(sql).toContain("B1_DETAIL_DISPATCHER_NOT_INSTALLED");
    expect(sql).toContain("B1_SERVICE_PERSISTENCE_NOT_INSTALLED");
  });
  it("closes direct mutation ACL and force-RLS ambiguity",()=>{
    expect(sql).toContain("REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("GRANT SELECT ON TABLE public.%I TO authenticated,service_role");
    expect(sql).toContain("aclexplode");
    expect(sql).toContain("B1_DETAIL_ACL_INVENTORY_MISMATCH");
    expect(sql).toContain("NO FORCE ROW LEVEL SECURITY");
  });
  it("fail-safe revokes sandbox_exec per table when present and never allowlists it",()=>{
    const migration=readFileSync(join(process.cwd(),"supabase","migrations","20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql"),"utf8");
    for(const body of [sql,migration]){
      expect(body).toContain("EXECUTE format('REVOKE ALL ON TABLE public.%I FROM sandbox_exec', v_table)");
      expect(body).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')");
      expect(body).toMatch(/rolname IN \('authenticated','service_role'\)/);
      expect(body).not.toMatch(/rolname IN \('[^']*'sandbox_exec[^']*'\)/);
    }
  });
  it("contains no data mutation, activation, or financial fields",()=>{
    expect(sql).not.toMatch(/INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE|student_visible|fee_type|amount|currency|invoice|gateway|balance/i);
  });
});
