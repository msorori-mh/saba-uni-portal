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
    expect(sql).toContain("DROP POLICY IF EXISTS %I ON public.%I");
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
  it("contains no data mutation, activation, or financial fields",()=>{
    expect(sql).not.toMatch(/INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE|student_visible|fee_type|amount|currency|invoice|gateway|balance/i);
  });
});
