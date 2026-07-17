import { describe,expect,it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read=(name:string)=>readFileSync(join(process.cwd(),"docs","autopilot",name),"utf8");
const queue=read("TASK-QUEUE.md");
const workers=read("ACTIVE-WORKERS.md");

describe("dynamic agent queue 01",()=>{
  it("creates all five state files outside AGENTS.md",()=>{
    for(const file of ["TASK-QUEUE.md","ACTIVE-WORKERS.md","DEPENDENCY-GRAPH.md","COMPLETED-TASKS.md","BLOCKED-TASKS.md"])
      expect(read(file).length).toBeGreaterThan(20);
  });
  it("records every required task field and allowed lifecycle state",()=>{
    for(const field of ["task_id","title","domain","priority","dependencies","affected_files","required_agent_type","branch","worktree","owner","status","commit","PR","CI","review","blockers","production_impact"])
      expect(queue).toContain(field);
    for(const state of ["DISCOVERED","READY","ACTIVE","BLOCKED","REQUIRES_USER_APPROVAL"])
      expect(queue).toContain(state);
  });
  it("uses no more than three active nonconflicting workers",()=>{
    const activeRows=workers.split("\n").filter((line)=>/^\| [123] \|/.test(line));
    expect(activeRows).toHaveLength(3);
    expect(workers).toContain("No workers share an editable file or worktree");
  });
  it("keeps production gates and protected history fail closed",()=>{
    const blocked=read("BLOCKED-TASKS.md");
    expect(blocked).toContain("B1-PRODUCTION-MIGRATION-SEQUENCE");
    expect(blocked).toContain("B1-STUDENT-VISIBILITY-ACTIVATION");
    expect(blocked).toContain("PORTAL-DEPLOY-PUBLISH");
    expect(blocked).toContain("Protected request/user identifiers");
  });
});
