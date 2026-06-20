/**
 * Run pilot data cleanup in order: transactional → academic_sections → all_students
 *
 * Requires in .env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (from Lovable Cloud → Project Settings)
 *
 * Usage: bun run scripts/run-pilot-cleanup.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(import.meta.dir, "../.env");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* ignore */ }
}

loadEnv();

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY غير موجود في .env");
  console.error("   أضفه من Lovable Cloud → Settings → Service Role Key");
  console.error("   أو نفّذ التنظيف من الواجهة: /admin/operations?tab=cleanup");
  process.exit(1);
}

import {
  executeDataCleanup,
  getCleanupSnapshot,
} from "../src/lib/admin-data-cleanup.core.ts";
import type { CleanupScope } from "../src/lib/admin-data-cleanup.core.ts";

const STEPS: CleanupScope[] = ["transactional", "academic_sections", "all_students"];

console.log("📊 قبل التنظيف:");
console.log(JSON.stringify(await getCleanupSnapshot(), null, 2));

for (const scope of STEPS) {
  console.log(`\n🔄 تنفيذ: ${scope} ...`);
  const deleted = await executeDataCleanup(scope);
  const nonZero = Object.entries(deleted).filter(([, n]) => n > 0);
  if (nonZero.length === 0) {
    console.log("   (لا سجلات للحذف — تخطي)");
  } else {
    for (const [k, n] of nonZero) console.log(`   ${k}: ${n}`);
  }
}

console.log("\n📊 بعد التنظيف:");
console.log(JSON.stringify(await getCleanupSnapshot(), null, 2));
console.log("\n✅ اكتمل التنظيف. الخطوة التالية: إعداد الخطط والمجموعات ثم الاستيراد.");
