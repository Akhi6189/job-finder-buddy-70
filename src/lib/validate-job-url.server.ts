import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fetchAllRows, MAX_JOB_LIMIT } from "./supabase-pagination";

type DB = SupabaseClient<Database>;

export interface JobUrlStatus {
  active: boolean;
  statusCode?: number;
  reason?: string;
}

// In-memory validation cache (TTL: 10 minutes) to avoid redundant network pings
const validationCache = new Map<string, { result: JobUrlStatus; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Checks the status of a job URL via HTTP status codes, ATS API endpoints,
 * redirect analysis, and page content indicators.
 */
export async function checkJobUrlStatus(url: string): Promise<JobUrlStatus> {
  if (!url || typeof url !== "string") {
    return { active: false, reason: "Missing or invalid URL format" };
  }

  const cleanUrl = url.trim();
  const cached = validationCache.get(cleanUrl);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  let statusResult: JobUrlStatus;
  try {
    const urlObj = new URL(cleanUrl);

    // 1. Greenhouse Job ID check via official board API
    if (urlObj.hostname.includes("greenhouse.io")) {
      const match =
        urlObj.pathname.match(/\/(?:jobs|job)\/(\d+)/i) || cleanUrl.match(/[?&]gh_jid=(\d+)/i);
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const boardToken = parts[0] === "embed" ? urlObj.searchParams.get("for") : parts[0];

      if (match && boardToken) {
        try {
          const apiRes = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${match[1]}`,
            {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; RoleRadar/1.0)" },
              signal: AbortSignal.timeout(5000),
            },
          );
          if (apiRes.status === 404) {
            statusResult = {
              active: false,
              statusCode: 404,
              reason: "Greenhouse API returned 404 (Job closed or filled)",
            };
            cacheResult(cleanUrl, statusResult);
            return statusResult;
          }
          if (apiRes.ok) {
            statusResult = { active: true, statusCode: 200 };
            cacheResult(cleanUrl, statusResult);
            return statusResult;
          }
        } catch {
          // Fall through to standard web fetch check
        }
      }
    }

    // 2. Lever Job ID check via official postings API
    if (urlObj.hostname.includes("lever.co")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const company = parts[0];
        const jobId = parts[1];
        try {
          const apiRes = await fetch(
            `https://api.lever.co/v0/postings/${encodeURIComponent(company!)}/${encodeURIComponent(jobId!)}`,
            {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; RoleRadar/1.0)" },
              signal: AbortSignal.timeout(5000),
            },
          );
          if (apiRes.status === 404) {
            statusResult = {
              active: false,
              statusCode: 404,
              reason: "Lever API returned 404 (Job closed or filled)",
            };
            cacheResult(cleanUrl, statusResult);
            return statusResult;
          }
          if (apiRes.ok) {
            statusResult = { active: true, statusCode: 200 };
            cacheResult(cleanUrl, statusResult);
            return statusResult;
          }
        } catch {
          // Fall through to standard web fetch check
        }
      }
    }

    // 3. Web Fetch check (HTTP status code + redirect + body text)
    const res = await fetch(cleanUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });

    // Explicit HTTP error codes
    if (res.status === 404 || res.status === 410) {
      statusResult = {
        active: false,
        statusCode: res.status,
        reason: `HTTP ${res.status} (Resource not found / Gone)`,
      };
      cacheResult(cleanUrl, statusResult);
      return statusResult;
    }

    if (res.status >= 500) {
      statusResult = {
        active: false,
        statusCode: res.status,
        reason: `HTTP ${res.status} (Server error)`,
      };
      cacheResult(cleanUrl, statusResult);
      return statusResult;
    }

    // Check redirection to error page or deactivated board
    const finalUrl = res.url || "";
    if (
      finalUrl.includes("?error=true") ||
      finalUrl.includes("/404") ||
      finalUrl.includes("job-not-found") ||
      finalUrl.includes("job-closed") ||
      finalUrl.includes("page-not-found")
    ) {
      statusResult = {
        active: false,
        statusCode: res.status,
        reason: "Redirected to error/closed job landing page",
      };
      cacheResult(cleanUrl, statusResult);
      return statusResult;
    }

    // Inspect initial HTML content for unambiguous closed job phrases
    const html = (await res.text()).slice(0, 20000);
    const deadPhrases = [
      "The job board you were viewing is no longer active",
      "This job is no longer available",
      "This position has been filled",
      "This job posting has expired",
      "The job you are looking for is no longer open",
      "This requisition is closed",
      "Job posting has been closed",
      "The job posting is closed",
      "This opening is no longer accepting applications",
      "This position is no longer accepting applications",
      "Page not found",
    ];

    const lowerHtml = html.toLowerCase();
    for (const phrase of deadPhrases) {
      if (lowerHtml.includes(phrase.toLowerCase())) {
        statusResult = {
          active: false,
          statusCode: res.status,
          reason: `Portal notice: "${phrase}"`,
        };
        cacheResult(cleanUrl, statusResult);
        return statusResult;
      }
    }

    statusResult = { active: true, statusCode: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // DNS error or connection refusal means the page/domain is defunct
    if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
      statusResult = { active: false, reason: `Unreachable domain (${msg})` };
    } else if (msg.includes("timeout") || msg.includes("aborted")) {
      // Slow servers: default to active rather than aggressively purging on network lag
      statusResult = { active: true, reason: "Request timed out, assuming pending" };
    } else {
      statusResult = { active: true, reason: `Inspection skipped: ${msg}` };
    }
  }

  cacheResult(cleanUrl, statusResult);
  return statusResult;
}

function cacheResult(url: string, result: JobUrlStatus) {
  validationCache.set(url, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Validates a batch of jobs with concurrency throttling.
 */
export async function validateJobsBatch(
  jobs: { id: string; url: string; title?: string; status?: string }[],
  concurrency = 16,
): Promise<{
  activeJobs: { id: string; url: string }[];
  inactiveJobs: { id: string; url: string; title?: string; reason?: string }[];
}> {
  const activeJobs: { id: string; url: string }[] = [];
  const inactiveJobs: { id: string; url: string; title?: string; reason?: string }[] = [];

  for (let i = 0; i < jobs.length; i += concurrency) {
    const chunk = jobs.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (job) => {
        const check = await checkJobUrlStatus(job.url);
        if (check.active) {
          activeJobs.push({ id: job.id, url: job.url });
        } else {
          inactiveJobs.push({
            id: job.id,
            url: job.url,
            title: job.title,
            reason: check.reason,
          });
        }
      }),
    );
  }

  return { activeJobs, inactiveJobs };
}

/**
 * Server-side pruning script: checks status of open/unapplied jobs in the database,
 * updates or removes dead/inactive roles, and ensures only active roles remain open.
 */
export async function validateAndPruneJobsServer(
  db: DB,
  options?: { userId?: string; pruneImmediately?: boolean },
): Promise<{
  totalChecked: number;
  activeCount: number;
  prunedCount: number;
  inactiveJobs: { id: string; title?: string; url: string; reason?: string }[];
}> {
  // Select all non-applied jobs (up to MAX_JOB_LIMIT)
  let jobs: {
    id: string;
    title: string;
    url: string;
    status: string;
    company_id: string;
  }[] = [];
  try {
    jobs = await fetchAllRows<{
      id: string;
      title: string;
      url: string;
      status: string;
      company_id: string;
    }>(
      (from, to) =>
        db
          .from("jobs")
          .select("id, title, url, status, company_id")
          .neq("status", "applied")
          .order("id", { ascending: false })
          .range(from, to),
      MAX_JOB_LIMIT,
    );
  } catch {
    return {
      totalChecked: 0,
      activeCount: 0,
      prunedCount: 0,
      inactiveJobs: [],
    };
  }

  if (!jobs.length) {
    return {
      totalChecked: 0,
      activeCount: 0,
      prunedCount: 0,
      inactiveJobs: [],
    };
  }

  const { activeJobs, inactiveJobs } = await validateJobsBatch(jobs, 8);

  let prunedCount = 0;
  if (inactiveJobs.length > 0) {
    const inactiveIds = inactiveJobs.map((j) => j.id);

    if (options?.pruneImmediately !== false) {
      // Delete unapplied dead jobs so they immediately stop showing on the dashboard
      const { error: delErr } = await db
        .from("jobs")
        .delete()
        .in("id", inactiveIds)
        .neq("status", "applied");

      if (!delErr) {
        prunedCount = inactiveIds.length;
      }
    } else {
      // Alternatively flag them as inactive
      const { error: upErr } = await db
        .from("jobs")
        .update({ status: "inactive" })
        .in("id", inactiveIds)
        .neq("status", "applied");

      if (!upErr) {
        prunedCount = inactiveIds.length;
      }
    }
  }

  return {
    totalChecked: jobs.length,
    activeCount: activeJobs.length,
    prunedCount,
    inactiveJobs,
  };
}
