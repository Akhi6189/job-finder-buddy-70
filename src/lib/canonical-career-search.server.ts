import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  isGenericSearchUrl,
  isJobAggregatorUrl,
  validateCareerUrl,
  getVerifiedPortalForName,
  VERIFIED_PORTAL_DIRECTORY,
} from "./validate-career-url.server";

type DB = SupabaseClient<Database>;

export interface CanonicalSearchResult {
  companyName: string;
  canonicalUrl: string | null;
  status: "verified_canonical" | "not_found" | "error";
  source: "search_api_grounding" | "search_api_model" | "directory" | "none";
  detectedAts?: string;
  reason: string;
  searchResultsChecked?: number;
  allCandidateUrls?: string[];
}

export interface CompanyUpdateResult {
  companyId: string;
  companyName: string;
  oldUrl: string | null;
  newUrl: string | null;
  wasGenericSearch: boolean;
  updated: boolean;
  reason: string;
  source: string;
}

const ai = new GoogleGenAI({
  apiKey: process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"],
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

/**
 * Known ATS platforms and their signature domains.
 */
const KNOWN_ATS_SIGNATURES: Record<string, string> = {
  "greenhouse.io": "Greenhouse",
  "lever.co": "Lever",
  "myworkdayjobs.com": "Workday",
  "workday.com": "Workday",
  "ashbyhq.com": "Ashby",
  "smartrecruiters.com": "SmartRecruiters",
  "darwinbox.in": "Darwinbox",
  "darwinbox.com": "Darwinbox",
  "eightfold.ai": "Eightfold",
  "bamboohr.com": "BambooHR",
  "breezy.hr": "Breezy HR",
  "recruitee.com": "Recruitee",
  "pinpointhq.com": "Pinpoint",
  "workable.com": "Workable",
  "taleo.net": "Oracle Taleo",
  "icims.com": "iCIMS",
  "jobvite.com": "Jobvite",
  "successfactors.com": "SAP SuccessFactors",
};

/**
 * Scores a candidate URL based on whether it is a direct ATS board,
 * an official company careers subdomain/path, or a root domain.
 * Strictly penalizes or rejects generic search results and aggregators.
 */
function scoreCandidateUrl(
  url: string,
  companyName: string,
): { score: number; detectedAts?: string } {
  if (!url || typeof url !== "string") return { score: -1 };
  const clean = url.trim();

  // Hard rejection of search engines and aggregators
  if (isGenericSearchUrl(clean) || isJobAggregatorUrl(clean)) {
    return { score: -1 };
  }

  let urlObj: URL;
  try {
    urlObj = new URL(clean);
  } catch {
    return { score: -1 };
  }

  const hostname = urlObj.hostname.toLowerCase();
  const pathname = urlObj.pathname.toLowerCase();

  // 1. Check for ATS platform signature (Highest priority: 100-110 points)
  for (const [sigDomain, atsName] of Object.entries(KNOWN_ATS_SIGNATURES)) {
    if (hostname.includes(sigDomain)) {
      return { score: 100, detectedAts: atsName };
    }
  }

  let score = 40;

  // 2. Company name match in hostname (e.g. veeam.com, scopely.com)
  const normComp = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normHost = hostname.replace(/[^a-z0-9]/g, "");
  if (normHost.includes(normComp) || normComp.includes(normHost)) {
    score += 25;
  }

  // 3. Dedicated careers subdomain (e.g. careers.company.com, jobs.company.com)
  if (
    hostname.startsWith("careers.") ||
    hostname.startsWith("jobs.") ||
    hostname.startsWith("talent.")
  ) {
    score += 30;
  }

  // 4. Careers path in URL (e.g. /careers, /jobs, /open-positions)
  if (
    pathname.includes("career") ||
    pathname.includes("jobs") ||
    pathname.includes("openings") ||
    pathname.includes("positions") ||
    pathname.includes("join-us") ||
    pathname.includes("work-with-us")
  ) {
    score += 25;
  }

  return { score };
}

/**
 * Uses a search API to query '[Company Name] career page' and extracts the
 * verified official canonical career URL, bypassing generic search results.
 */
export async function querySearchApiForCanonicalUrl(
  companyName: string,
): Promise<CanonicalSearchResult> {
  const norm = companyName.trim();
  if (!norm) {
    return {
      companyName,
      canonicalUrl: null,
      status: "not_found",
      source: "none",
      reason: "Company name is required",
    };
  }

  // 1. Check curated directory of known verified portals for instant canonical mapping
  const directoryUrl = getVerifiedPortalForName(norm);
  if (directoryUrl) {
    return {
      companyName: norm,
      canonicalUrl: directoryUrl,
      status: "verified_canonical",
      source: "directory",
      reason: "Matched curated directory of verified company portals",
    };
  }

  // 2. Execute live search API query: "[Company Name] career page" with Google Search Grounding
  const apiKey = process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
  const candidateUrls: string[] = [];

  if (apiKey) {
    try {
      const searchQuery = `${norm} career page`;
      const prompt = `You are a talent research specialist.
Perform a live web search for: "${searchQuery}".
Find the EXACT official, direct career site or ATS job board URL for company: "${norm}".
CRITICAL CONSTRAINTS:
1. Do NOT return a Google or Bing search query link (e.g. google.com/search, bing.com/search).
2. Do NOT return generic job search aggregators (e.g. indeed.com, glassdoor.com, linkedin.com/jobs/search).
3. If they use an ATS like Greenhouse, Lever, Workday, Ashby, SmartRecruiters, or Darwinbox, return that exact ATS URL.
4. If their direct careers site is known (e.g. https://company.com/careers or https://jobs.company.com), return that.
5. Provide the exact canonical URL in your answer.`;

      const response = await Promise.race([
        ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Search API timeout")), 6000),
        ),
      ]);

      // Extract search URLs from live Google Search grounding chunks
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      for (const chunk of chunks) {
        const uri = chunk.web?.uri;
        if (uri && typeof uri === "string" && /^https?:\/\//i.test(uri)) {
          if (!isGenericSearchUrl(uri) && !isJobAggregatorUrl(uri)) {
            candidateUrls.push(uri.trim());
          }
        }
      }

      // Also extract any direct URL returned in the model's textual synthesis
      const text = response.text || "";
      const textUrls = text.match(/https?:\/\/[^\s"'<>()[\]{}]+/gi) || [];
      for (const u of textUrls) {
        const clean = u.replace(/[.,;:]$/, "").trim();
        if (
          clean &&
          !isGenericSearchUrl(clean) &&
          !isJobAggregatorUrl(clean) &&
          !candidateUrls.includes(clean)
        ) {
          candidateUrls.push(clean);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Search API query failed for "${norm}": ${msg}`);
    }
  }

  // 3. Fallback: If live search returned no candidates, query Gemini Flash Lite without grounding
  if (candidateUrls.length === 0 && apiKey) {
    try {
      const prompt = `Return ONLY a valid JSON object with the official career page or ATS link for company "${norm}".
CRITICAL: Do NOT return a search query link (google.com/search) or aggregator.
{"careers_url": "https://..." or null}`;

      const res = await Promise.race([
        ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: prompt,
          config: { responseMimeType: "application/json" },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Fallback timeout")), 2500),
        ),
      ]);

      const raw = res.text?.trim() || "";
      let clean = raw;
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(clean);
      if (
        parsed?.careers_url &&
        typeof parsed.careers_url === "string" &&
        /^https?:\/\//i.test(parsed.careers_url) &&
        !isGenericSearchUrl(parsed.careers_url) &&
        !isJobAggregatorUrl(parsed.careers_url)
      ) {
        candidateUrls.push(parsed.careers_url.trim());
      }
    } catch {
      // Fallback failed
    }
  }

  // 4. Evaluate and select the best canonical career URL
  if (candidateUrls.length > 0) {
    let bestUrl: string | null = null;
    let bestScore = -1;
    let detectedAts: string | undefined;

    for (const url of candidateUrls) {
      const { score, detectedAts: ats } = scoreCandidateUrl(url, norm);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
        detectedAts = ats;
      }
    }

    if (bestUrl && bestScore > 0) {
      const val = await validateCareerUrl(bestUrl, norm);
      if (val.isValid && !val.isGenericSearch && !val.isAggregator) {
        return {
          companyName: norm,
          canonicalUrl: val.normalizedUrl,
          status: "verified_canonical",
          source: "search_api_grounding",
          detectedAts: detectedAts || val.detectedAts,
          reason: detectedAts
            ? `Verified official ${detectedAts} ATS portal via Search API`
            : "Verified canonical career portal via Search API",
          searchResultsChecked: candidateUrls.length,
          allCandidateUrls: candidateUrls,
        };
      }
    }
  }

  return {
    companyName: norm,
    canonicalUrl: null,
    status: "not_found",
    source: "none",
    reason: `No verified canonical career portal found for "${norm}". Generic search results were filtered out.`,
    searchResultsChecked: candidateUrls.length,
    allCandidateUrls: candidateUrls,
  };
}

/**
 * Updates a company record in the database with the verified official canonical URL,
 * replacing any generic search result URLs (like google.com/search).
 */
export async function updateCompanyWithCanonicalUrl(
  db: DB,
  companyId: string,
  providedName?: string,
): Promise<CompanyUpdateResult> {
  // 1. Fetch current company data
  const { data: comp, error } = await db
    .from("companies")
    .select("id, name, careers_url")
    .eq("id", companyId)
    .single();

  if (error || !comp) {
    throw new Error(`Company with id "${companyId}" not found`);
  }

  const companyName = (providedName || comp.name).trim();
  const oldUrl = comp.careers_url;
  const wasGenericSearch = Boolean(oldUrl && isGenericSearchUrl(oldUrl));

  // 2. Query Search API for canonical career page
  const searchResult = await querySearchApiForCanonicalUrl(companyName);

  // 3. If a verified canonical URL was resolved, update the database
  if (searchResult.status === "verified_canonical" && searchResult.canonicalUrl) {
    const newUrl = searchResult.canonicalUrl;

    const { error: updateErr } = await db
      .from("companies")
      .update({ careers_url: newUrl })
      .eq("id", companyId);

    if (updateErr) {
      throw new Error(`Failed to update company "${companyName}": ${updateErr.message}`);
    }

    // Clear any previous error in tracked_companies regarding bad URLs
    await db.from("tracked_companies").update({ last_error: null }).eq("company_id", companyId);

    return {
      companyId,
      companyName,
      oldUrl,
      newUrl,
      wasGenericSearch,
      updated: true,
      reason: searchResult.reason,
      source: searchResult.source,
    };
  }

  // 4. If old URL was a generic search URL and no canonical URL could be resolved,
  // clear the corrupt search URL so scrapers do not waste queries on Google search pages.
  if (wasGenericSearch) {
    await db.from("companies").update({ careers_url: null }).eq("id", companyId);

    return {
      companyId,
      companyName,
      oldUrl,
      newUrl: null,
      wasGenericSearch: true,
      updated: true,
      reason: "Corrupted Google search URL removed from database. No direct portal found yet.",
      source: "cleanup",
    };
  }

  return {
    companyId,
    companyName,
    oldUrl,
    newUrl: oldUrl,
    wasGenericSearch: false,
    updated: false,
    reason: searchResult.reason,
    source: "none",
  };
}

/**
 * Backend batch service that scans companies in the database, queries the search API
 * for '[Company Name] career page', and automatically updates company records with
 * verified official canonical URLs, replacing any generic search result URLs.
 */
export async function autoUpdateCompaniesWithGenericUrls(
  db: DB,
  options?: {
    forceAll?: boolean;
    companyIds?: string[];
  },
): Promise<{
  totalProcessed: number;
  updatedCount: number;
  skippedCount: number;
  updates: CompanyUpdateResult[];
}> {
  let query = db.from("companies").select("id, name, careers_url");

  if (options?.companyIds?.length) {
    query = query.in("id", options.companyIds);
  }

  const { data: companies, error } = await query;
  if (error || !companies?.length) {
    return {
      totalProcessed: 0,
      updatedCount: 0,
      skippedCount: 0,
      updates: [],
    };
  }

  const updates: CompanyUpdateResult[] = [];
  let updatedCount = 0;
  let skippedCount = 0;

  for (const comp of companies) {
    const isSearch = Boolean(comp.careers_url && isGenericSearchUrl(comp.careers_url));
    const isAggregator = Boolean(comp.careers_url && isJobAggregatorUrl(comp.careers_url));
    const isMissing = !comp.careers_url;

    // Process if forceAll, or if the URL is a generic search URL, aggregator, or missing
    if (options?.forceAll || isSearch || isAggregator || isMissing) {
      try {
        const res = await updateCompanyWithCanonicalUrl(db, comp.id, comp.name);
        if (res.updated) {
          updatedCount++;
          updates.push(res);
        } else {
          skippedCount++;
        }
      } catch (err) {
        console.warn(`Error updating canonical URL for company ${comp.name}:`, err);
        skippedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  return {
    totalProcessed: companies.length,
    updatedCount,
    skippedCount,
    updates,
  };
}
