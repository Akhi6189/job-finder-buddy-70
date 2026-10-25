/**
 * Standalone Server-Side Job URL Validation Script
 *
 * Runs status code and portal availability checks against all open jobs in the database.
 * Inactive / filled / dead job postings are pruned so the dashboard displays only active openings.
 *
 * Usage:
 *   npx tsx scripts/validate-jobs.ts
 *   npm run validate:jobs
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { validateAndPruneJobsServer } from "../src/lib/validate-job-url.server";

async function main() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

  console.log("=================================================");
  console.log("   RoleRadar Server-Side Job Validation Script   ");
  console.log("=================================================");
  console.log("Checking status of open job URLs in database...\n");

  const start = Date.now();
  const summary = await validateAndPruneJobsServer(supabase, { pruneImmediately: true });
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`Finished in ${duration}s.`);
  console.log(`- Total Open Roles Checked: ${summary.totalChecked}`);
  console.log(`- Active Roles Retained:    ${summary.activeCount}`);
  console.log(`- Inactive Roles Pruned:    ${summary.prunedCount}`);

  if (summary.inactiveJobs.length > 0) {
    console.log("\nPruned Inactive Openings:");
    for (const j of summary.inactiveJobs) {
      console.log(`  ✖ [${j.title ?? "Role"}] ${j.url}`);
      if (j.reason) console.log(`    ↳ Reason: ${j.reason}`);
    }
  } else {
    console.log("\n✓ All open job URLs are verified active!");
  }
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error("Validation script failed:", err);
  process.exit(1);
});
