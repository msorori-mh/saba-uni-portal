import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const casesDir = join(process.cwd(), "scripts/b1-rpc-principal-harness-01/generated/cases");
const caseFiles = readdirSync(casesDir).filter(f => f.endsWith(".sql")).sort();

console.log(`Found ${caseFiles.length} case files to execute on local PG17 container...`);

let passed = 0;
let failed = 0;

for (let i = 0; i < caseFiles.length; i++) {
  const file = caseFiles[i];
  const casePath = join(casesDir, file);
  
  // Execute case file via docker exec psql
  const proc = Bun.spawnSync([
    "docker", "exec", "-e", "PGPASSWORD=postgres",
    "b1-migration-test-12",
    "psql", "-U", "b1_matrix_operator", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    "-f", `/tmp/b1-rpc-principal-harness-01/generated/cases/${file}`
  ]);

  const output = proc.stdout.toString() + proc.stderr.toString();
  if (proc.exitCode === 0 && !output.includes("ERROR:")) {
    passed++;
  } else {
    failed++;
    console.error(`FAILED Case [${file}]: exit code ${proc.exitCode}\nOutput: ${output.slice(0, 500)}`);
  }

  if ((i + 1) % 50 === 0 || i === caseFiles.length - 1) {
    console.log(`Progress: ${i + 1}/${caseFiles.length} (Passed: ${passed}, Failed: ${failed})`);
  }
}

if (failed === 0 && passed === 267) {
  console.log(`\n🎉 ALL 267 NEGATIVE EXECUTION CASES PASSED 100% ON PG17!`);
} else {
  console.error(`\n❌ HARNESS FAILED: ${failed} cases failed out of ${caseFiles.length}`);
  process.exit(1);
}
