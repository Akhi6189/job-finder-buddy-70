import dns from "node:dns";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { computeATSScore, DEFAULT_SDET_RESUME } from "./ats-score";
import { isGenericSearchUrl } from "./validate-career-url.server";

// Force IPv4 first to prevent hanging on IPv6 in container environment
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // ignore in non-node envs
}

type DB = SupabaseClient<Database>;

const ai = new GoogleGenAI({
  apiKey: process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"],
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export class PauseError extends Error {}

export type ExtractedJob = {
  title: string;
  url: string;
  location: string;
  experience: string;
  description: string;
};

/** Directory of verified portals for major/popular tech employers to avoid unnecessary AI requests */
const KNOWN_COMPANY_PORTALS: Record<string, string> = {
  scopely: "https://job-boards.greenhouse.io/scopely",
  skillz: "https://job-boards.greenhouse.io/skillzinc",
  "skillz inc": "https://job-boards.greenhouse.io/skillzinc",
  zynga: "https://job-boards.greenhouse.io/zyngacareers?offices%5B%5D=4003581004",
  "zynga / take-two": "https://job-boards.greenhouse.io/zyngacareers?offices%5B%5D=4003581004",
  whatfix: "https://whatfix.com/careers/",
  "ola electric": "https://olaelectric.darwinbox.in/ms/candidate/careers",
  ola: "https://www.olacabs.com/careers",
  postman: "https://www.postman.com/company/careers/open-positions/",
  razorpay: "https://razorpay.com/jobs/",
  intuit: "https://jobs.intuit.com/search-jobs/India",
  browserstack: "https://www.browserstack.com/careers",
  swiggy: "https://careers.swiggy.com/",
  zomato: "https://www.zomato.com/careers",
  paytm: "https://jobs.lever.co/paytm",
  cred: "https://careers.cred.club/openings",
  meesho: "https://www.meesho.io/jobs",
  flipkart: "https://www.flipkartcareers.com/",
  inmobi: "https://job-boards.greenhouse.io/inmobi",
  freshworks: "https://careers.smartrecruiters.com/Freshworks",
  "tata consultancy services": "https://www.tcs.com/careers",
  tcs: "https://www.tcs.com/careers",
  infosys: "https://career.infosys.com/joblist",
  wipro: "https://careers.wipro.com/careers-home/jobs",
  google: "https://careers.google.com/jobs/results/?location=India",
  microsoft: "https://jobs.careers.microsoft.com/global/en/search?lc=India",
  amazon: "https://www.amazon.jobs/en/locations/india",
  apple: "https://jobs.apple.com/en-in/search?location=india-INDC",
  meta: "https://www.metacareers.com/jobs?offices[0]=Bangalore%2C%20India",
  nvidia: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
  atlassian: "https://www.atlassian.com/company/careers/all-jobs?location=India",
  salesforce: "https://careers.salesforce.com/en/jobs/?country=India",
  uber: "https://www.uber.com/in/en/careers/list/?location=IND",
  cisco: "https://jobs.cisco.com/",
  thoughtworks: "https://www.thoughtworks.com/careers/jobs?locations=India",
  accenture: "https://www.accenture.com/in-en/careers/jobsearch",
  capgemini: "https://www.capgemini.com/in-en/careers/job-search/",
  cognizant: "https://careers.cognizant.com/global-en/jobs/?location=India",
  adobe: "https://careers.adobe.com/us/en/search-results?keywords=india",
  oracle: "https://careers.oracle.com/jobs/#en/sites/jobsearch/requisitions?location=India",
  "rockstar games": "https://www.rockstargames.com/careers/openings/studio/india",
  "electronic arts": "https://jobs.ea.com/en_US/careers/Home/",
  qualcomm: "https://careers.qualcomm.com/careers?location=India",
  visa: "https://corporate.visa.com/en/jobs/?cities=Bangalore",
  paypal: "https://paypal.eightfold.ai/careers?location=India",
  juspay: "https://juspay.io/careers",
  hasura: "https://hasura.io/careers",
  chargebee: "https://www.chargebee.com/careers/",
  makemytrip: "https://careers.makemytrip.com/",
  nykaa: "https://www.nykaa.com/careers",
  dream11: "https://www.dreamsports.group/careers",
  groww: "https://groww.in/careers",
  zerodha: "https://careers.zerodha.com/",
};

/**
 * Uses verified directory or Gemini AI to locate genuine official careers portals.
 * Never throws, always returns a clean direct URL or empty string. Never returns search queries.
 */
export async function findCareersUrl(name: string, hint?: string): Promise<string> {
  const norm = name.trim().toLowerCase();
  if (KNOWN_COMPANY_PORTALS[norm]) {
    return KNOWN_COMPANY_PORTALS[norm]!;
  }

  // Try matching without punctuation
  const stripped = norm.replace(/[^a-z0-9]/g, "");
  for (const [key, val] of Object.entries(KNOWN_COMPANY_PORTALS)) {
    if (key.replace(/[^a-z0-9]/g, "") === stripped) {
      return val;
    }
  }

  const models = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
  const prompt = `You are a talent research specialist.
Find the exact official careers portal or ATS job board URL for company: "${name}"${hint ? ` (Hint: ${hint})` : ""}.
CRITICAL: Do NOT return a Google search link (e.g. google.com/search). Do NOT return job aggregators like indeed or glassdoor.
If they use an ATS like Greenhouse, Lever, Ashby, or Workday, return that exact ATS URL.
If not found with certainty, return null.

Return ONLY a valid JSON object:
{
  "careers_url": "https://..." or null
}`;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      const text = response.text;
      if (text) {
        let clean = text.trim();
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        }
        const parsed = JSON.parse(clean);
        if (
          parsed.careers_url &&
          /^https?:\/\//i.test(parsed.careers_url) &&
          !isGenericSearchUrl(parsed.careers_url)
        ) {
          return parsed.careers_url.trim();
        }
      }
    } catch {
      // try next model
    }
  }

  if (hint && /^https?:\/\//i.test(hint) && !isGenericSearchUrl(hint)) {
    return hint;
  }

  // Never return a Google search URL as a career portal
  return "";
}

/** Expands keywords like "SDET" to cover related job titles */
function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set<string>();
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    expanded.add(k);

    const isQaKeyword =
      k === "qa" ||
      k.includes("sdet") ||
      k.includes("test") ||
      k.includes("quality") ||
      k.includes("automation") ||
      k === "manual";

    if (isQaKeyword) {
      for (const syn of [
        "sdet",
        "qa",
        "quality",
        "test",
        "tester",
        "testing",
        "automation",
        "software development engineer in test",
        "software engineer in test",
        "test engineer",
        "qa engineer",
        "quality assurance",
        "quality engineer",
        "qe",
        "validation",
        "qc",
      ]) {
        expanded.add(syn);
      }
    } else if (
      k.includes("software") ||
      k.includes("engineer") ||
      k.includes("developer") ||
      k === "sde"
    ) {
      for (const syn of [
        "software",
        "engineer",
        "developer",
        "sde",
        "swe",
        "frontend",
        "backend",
        "fullstack",
        "full stack",
        "platform",
      ]) {
        expanded.add(syn);
      }
    }

    if (k.includes("devops") || k.includes("sre")) {
      for (const syn of ["devops", "sre", "cloud", "reliability", "infrastructure"]) {
        expanded.add(syn);
      }
    }

    if (k.includes("data")) {
      for (const syn of ["data", "analytics", "pipeline", "etl", "machine learning", "ml", "ai"]) {
        expanded.add(syn);
      }
    }
  }
  return Array.from(expanded);
}

function cleanHtmlText(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>?/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

/** Direct fetch from Greenhouse Board API with nested department support */
async function fetchGreenhouseJobs(boardToken: string): Promise<ExtractedJob[] | null> {
  const jobsMap = new Map<string, ExtractedJob>();

  // 1. Direct jobs endpoint with content
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.jobs)) {
        for (const j of data.jobs) {
          const id = String(j.id || j.internal_job_id || j.absolute_url || j.title);
          jobsMap.set(id, {
            title: (j.title || "Open Role").trim(),
            url: j.absolute_url || `https://job-boards.greenhouse.io/${boardToken}/jobs/${j.id}`,
            location: j.location?.name ?? "",
            experience: "",
            description: cleanHtmlText(j.content),
          });
        }
      }
    }
  } catch (e) {
    console.warn("Greenhouse /jobs fetch error:", e);
  }

  // 2. Departments endpoint to capture all nested department and sub-department roles
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/departments`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.departments)) {
        function collectDepartmentJobs(dept: Record<string, unknown>, deptName: string) {
          if (!dept || typeof dept !== "object") return;
          const currentDeptName = (
            (typeof dept.name === "string" ? dept.name : deptName) || ""
          ).trim();
          if (Array.isArray(dept.jobs)) {
            for (const j of dept.jobs as Record<string, unknown>[]) {
              const id = String(j.id || j.internal_job_id || j.absolute_url || j.title);
              if (!jobsMap.has(id)) {
                jobsMap.set(id, {
                  title: String(j.title || "Open Role").trim(),
                  url:
                    (typeof j.absolute_url === "string" && j.absolute_url) ||
                    `https://job-boards.greenhouse.io/${boardToken}/jobs/${j.id}`,
                  location: (j.location as { name?: string } | undefined)?.name ?? "",
                  experience: currentDeptName,
                  description: `${String(j.title)} in ${currentDeptName}`,
                });
              } else {
                // Enrich existing job with department category if empty
                const existing = jobsMap.get(id)!;
                if (!existing.experience && currentDeptName) {
                  existing.experience = currentDeptName;
                }
              }
            }
          }
          if (Array.isArray(dept.departments)) {
            for (const sub of dept.departments as Record<string, unknown>[]) {
              collectDepartmentJobs(
                sub,
                currentDeptName || (typeof sub.name === "string" ? sub.name : ""),
              );
            }
          }
        }
        for (const dept of data.departments as Record<string, unknown>[]) {
          collectDepartmentJobs(dept, typeof dept.name === "string" ? dept.name : "");
        }
      }
    }
  } catch (e) {
    console.warn("Greenhouse /departments fetch error:", e);
  }

  if (jobsMap.size > 0) {
    return Array.from(jobsMap.values());
  }
  return null;
}

/** Direct fetch from Lever Postings API */
async function fetchLeverJobs(company: string): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const postings = await res.json();
    if (Array.isArray(postings) && postings.length > 0) {
      return postings.map(
        (j: {
          text: string;
          hostedUrl: string;
          categories?: { location?: string; commitment?: string };
          descriptionPlain?: string;
        }) => ({
          title: j.text || "Open Role",
          url: j.hostedUrl || `https://jobs.lever.co/${company}`,
          location: j.categories?.location ?? "",
          experience: j.categories?.commitment ?? "",
          description: j.descriptionPlain?.slice(0, 1200) ?? "",
        }),
      );
    }
  } catch (e) {
    console.warn("Lever fetch error:", e);
  }
  return null;
}

/** Direct fetch from SmartRecruiters Postings API */
async function fetchSmartRecruitersJobs(company: string): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=100`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.content) && data.content.length > 0) {
      return data.content.map(
        (j: {
          id: string;
          name: string;
          location?: { city?: string; country?: string };
          typeOfEmployment?: { label?: string };
        }) => {
          const loc = [j.location?.city, j.location?.country].filter(Boolean).join(", ");
          return {
            title: j.name || "Open Role",
            url: `https://jobs.smartrecruiters.com/${company}/${j.id}`,
            location: loc,
            experience: j.typeOfEmployment?.label ?? "",
            description: `${j.name} at ${company} in ${loc}`,
          };
        },
      );
    }
  } catch (e) {
    console.warn("SmartRecruiters fetch error:", e);
  }
  return null;
}

/** Direct fetch from Ashby API */
async function fetchAshbyJobs(company: string): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${company}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.jobs) && data.jobs.length > 0) {
      return data.jobs.map(
        (j: {
          title: string;
          jobUrl?: string;
          location?: string;
          descriptionPlain?: string;
          employmentType?: string;
        }) => ({
          title: j.title || "Open Role",
          url: j.jobUrl || `https://jobs.ashbyhq.com/${company}`,
          location: j.location ?? "",
          experience: j.employmentType ?? "",
          description: j.descriptionPlain?.slice(0, 1200) ?? "",
        }),
      );
    }
  } catch (e) {
    console.warn("Ashby fetch error:", e);
  }
  return null;
}

/** Direct fetch from Workday CXS API */
async function fetchWorkdayJobs(urlObj: URL): Promise<ExtractedJob[] | null> {
  try {
    const parts = urlObj.pathname.split("/").filter(Boolean);
    const site = parts[0];
    const hostParts = urlObj.hostname.split(".");
    const tenant = hostParts[0];
    if (!site || !tenant) return null;

    const res = await fetch(`https://${urlObj.host}/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ appliedFacets: {}, limit: 40, offset: 0, searchText: "" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.jobPostings) && data.jobPostings.length > 0) {
      return data.jobPostings.map(
        (j: { title: string; externalPath?: string; locationsText?: string }) => ({
          title: j.title || "Open Role",
          url: j.externalPath ? `https://${urlObj.host}${j.externalPath}` : urlObj.href,
          location: j.locationsText ?? "",
          experience: "",
          description: `${j.title} position in ${j.locationsText ?? "Various locations"}`,
        }),
      );
    }
  } catch (e) {
    console.warn("Workday fetch error:", e);
  }
  return null;
}

/** Tries to identify ATS type and fetch structured jobs */
async function tryDirectAtsFetch(careersUrl: string): Promise<ExtractedJob[] | null> {
  try {
    const urlObj = new URL(careersUrl);

    // 1. Greenhouse
    if (urlObj.hostname.includes("greenhouse.io")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      let boardToken = parts[0];
      if (boardToken === "embed" || boardToken === "v1" || !boardToken) {
        boardToken = urlObj.searchParams.get("for") || parts[1] || "";
      }
      if (boardToken) {
        const jobs = await fetchGreenhouseJobs(boardToken);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 2. Lever
    if (urlObj.hostname.includes("lever.co")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const company = parts[0];
      if (company) {
        const jobs = await fetchLeverJobs(company);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 3. SmartRecruiters
    if (urlObj.hostname.includes("smartrecruiters.com")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const company = parts[0];
      if (company) {
        const jobs = await fetchSmartRecruitersJobs(company);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 4. Ashby
    if (urlObj.hostname.includes("ashbyhq.com")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const company = parts[0];
      if (company) {
        const jobs = await fetchAshbyJobs(company);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 5. Workday
    if (urlObj.hostname.includes("myworkdayjobs.com")) {
      const jobs = await fetchWorkdayJobs(urlObj);
      if (jobs && jobs.length > 0) return jobs;
    }
  } catch (e) {
    console.warn("tryDirectAtsFetch error:", e);
  }
  return null;
}

/**
 * Builds an exact, direct posting URL for a role rather than returning a generic homepage or career profile.
 */
export function makeExactPostingUrl(
  companyName: string,
  title: string,
  careersUrl: string,
  location?: string,
): string {
  const cleanTitle = title.replace(new RegExp(`^${companyName}\\s*[—–-]\\s*`, "i"), "").trim();
  const rawUrl = (careersUrl || "").trim();

  // If already a direct ATS requisition URL
  if (
    /\/(jobs|job|posting|postings|requisition|requisitions|viewjob)\/[a-zA-Z0-9_\-.]{4,}/i.test(
      rawUrl,
    ) &&
    !rawUrl.includes("#job-")
  ) {
    return rawUrl;
  }

  // Workday: query parameter filters directly to the specific job
  if (rawUrl.includes(".myworkdayjobs.com")) {
    const base = rawUrl.split("#")[0].split("?")[0];
    return `${base}?q=${encodeURIComponent(cleanTitle)}`;
  }

  // Uber: query parameter filters directly to the specific job
  if (rawUrl.includes("uber.com/")) {
    return `https://www.uber.com/in/en/careers/list/?query=${encodeURIComponent(cleanTitle)}`;
  }

  // Amazon jobs: base_query
  if (rawUrl.includes("amazon.jobs")) {
    return `https://www.amazon.jobs/en/search?base_query=${encodeURIComponent(cleanTitle)}`;
  }

  // Google careers: q
  if (rawUrl.includes("careers.google.com")) {
    return `https://careers.google.com/jobs/results/?q=${encodeURIComponent(cleanTitle)}`;
  }

  // Microsoft careers: q
  if (rawUrl.includes("microsoft.com")) {
    return `https://jobs.careers.microsoft.com/global/en/search?q=${encodeURIComponent(cleanTitle)}`;
  }

  // TCS: keyword
  if (rawUrl.includes("tcs.com")) {
    return `https://www.tcs.com/careers/search-jobs?keyword=${encodeURIComponent(cleanTitle)}`;
  }

  // Infosys: keyword
  if (rawUrl.includes("infosys.com")) {
    return `https://career.infosys.com/joblist?keyword=${encodeURIComponent(cleanTitle)}`;
  }

  // Return the career home page where the job opening was found
  return rawUrl.replace(/#job-\d+/i, "").trim() || careersUrl;
}

/** Cleans and normalizes job titles extracted from HTML tags or JSON blobs */
function sanitizeTitle(raw: string, companyName: string): string {
  let title = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s•\-–—|:]+/, "")
    .replace(/[\s•\-–—|:]+$/, "")
    .trim();
  // Strip company name prefix e.g. "Scopely - Lead QA Engineer" -> "Lead QA Engineer"
  const compPrefix = new RegExp(`^${companyName}\\s*[-–—|:]\\s*`, "i");
  title = title.replace(compPrefix, "").trim();
  return title;
}

/** Determines if a string is a genuine job title and not navigational or promotional boilerplate */
function isValidJobTitle(title: string): boolean {
  if (!title || title.length < 3 || title.length > 130) return false;
  if (/^https?:\/\//i.test(title)) return false;
  const boilerplateRegex =
    /^(careers?|jobs?|all jobs|all roles|open positions|explore roles|search|apply|apply now|home|about|about us|contact|contact us|privacy|privacy policy|terms|terms of service|login|sign in|sign up|cookie|cookies|menu|navigation|back to top|filter|filter jobs|read more|learn more|view details|submit|newsletter|share|see all openings)$/i;
  if (boilerplateRegex.test(title.trim())) return false;
  if (!/[a-zA-Z]/.test(title)) return false;
  return true;
}

/**
 * Robust HTML parser extracting nested job listings, department accordions,
 * Schema.org JSON-LD, preloaded React/Next/Nuxt data, and table rows using Cheerio.
 */
export function parseJobsFromHtml(
  html: string,
  pageUrl: string,
  companyName: string,
): ExtractedJob[] {
  const jobsMap = new Map<string, ExtractedJob>();

  function addJob(job: ExtractedJob) {
    const cleanTitle = sanitizeTitle(job.title, companyName);
    if (!isValidJobTitle(cleanTitle)) return;

    let finalUrl = (job.url || "").trim();
    if (!finalUrl || finalUrl === "#" || finalUrl.startsWith("javascript:")) {
      finalUrl = makeExactPostingUrl(companyName, cleanTitle, pageUrl, job.location);
    } else {
      try {
        finalUrl = new URL(finalUrl, pageUrl).href;
      } catch {
        finalUrl = makeExactPostingUrl(companyName, cleanTitle, pageUrl, job.location);
      }
    }

    const cleanLocation = (job.location || "").trim();
    const cleanExperience = (job.experience || "").trim();
    const cleanDesc = cleanHtmlText(job.description);

    // Look for existing entry to enrich or deduplicate
    for (const [, existing] of jobsMap.entries()) {
      const sameUrl = Boolean(existing.url && finalUrl && existing.url === finalUrl);
      const sameTitle = existing.title.toLowerCase() === cleanTitle.toLowerCase();

      // If it's the exact same URL, or same title with compatible locations
      if (
        sameUrl ||
        (sameTitle &&
          (!existing.location ||
            !cleanLocation ||
            existing.location.toLowerCase() === cleanLocation.toLowerCase() ||
            /^(remote|hybrid|onsite|on-site)$/i.test(existing.location)))
      ) {
        if (
          (!existing.location || /^(remote|hybrid|onsite|on-site)$/i.test(existing.location)) &&
          cleanLocation
        ) {
          existing.location = cleanLocation;
        }
        if ((!existing.experience || existing.experience === "Technology") && cleanExperience) {
          existing.experience = cleanExperience;
        }
        if ((!existing.description || existing.description.length < 50) && cleanDesc) {
          existing.description = cleanDesc;
        }
        if (
          (!existing.url || existing.url.includes("google.com/search")) &&
          finalUrl &&
          !finalUrl.includes("google.com/search")
        ) {
          existing.url = finalUrl;
        }
        return;
      }
    }

    const normKey = `${cleanTitle.toLowerCase()}::${cleanLocation.toLowerCase().slice(0, 30)}::${finalUrl}`;
    jobsMap.set(normKey, {
      title: cleanTitle,
      url: finalUrl,
      location: cleanLocation,
      experience: cleanExperience,
      description: cleanDesc,
    });
  }

  // 1. Schema.org JSON-LD Extraction (Handles top-level, @graph, and itemListElement)
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[1] || "{}");
      function processJsonLdNode(node: unknown) {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(processJsonLdNode);
          return;
        }
        const obj = node as Record<string, unknown>;
        if (obj["@type"] === "JobPosting") {
          const locObj = (obj.jobLocation as Record<string, unknown> | undefined)?.address;
          const locStr =
            typeof locObj === "string"
              ? locObj
              : [
                  (locObj as Record<string, string> | undefined)?.addressLocality,
                  (locObj as Record<string, string> | undefined)?.addressRegion,
                  (locObj as Record<string, string> | undefined)?.addressCountry,
                ]
                  .filter(Boolean)
                  .join(", ");
          addJob({
            title: typeof obj.title === "string" ? obj.title : "",
            url: typeof obj.url === "string" ? obj.url : "",
            location: locStr || "",
            experience:
              typeof obj.experienceRequirements === "string" ? obj.experienceRequirements : "",
            description: typeof obj.description === "string" ? obj.description : "",
          });
        }
        if (obj["@graph"]) processJsonLdNode(obj["@graph"]);
        if (obj.itemListElement && Array.isArray(obj.itemListElement)) {
          for (const elem of obj.itemListElement) {
            if (elem && typeof elem === "object" && "item" in elem) {
              processJsonLdNode((elem as Record<string, unknown>).item);
            } else {
              processJsonLdNode(elem);
            }
          }
        }
      }
      processJsonLdNode(parsed);
    } catch {
      // ignore JSON parse error in script tag
    }
  }

  // 2. Preloaded State Extraction (__NEXT_DATA__, __NUXT_DATA__, inline window state)
  const stateRegex =
    /<script[^>]*id=["'](?:__NEXT_DATA__|__NUXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>|<script[^>]*>[\s\S]*?window\.(?:__INITIAL_STATE__|__PRELOADED_STATE__|careersData|jobsData)\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/gi;
  let stateMatch;
  while ((stateMatch = stateRegex.exec(html)) !== null) {
    try {
      const rawJson = stateMatch[1] || stateMatch[2];
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        function findJobsInObject(obj: unknown, depth = 0) {
          if (!obj || depth > 8 || typeof obj !== "object") return;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              if (item && typeof item === "object") {
                const o = item as Record<string, unknown>;
                const title = (o.title ||
                  o.jobTitle ||
                  o.roleTitle ||
                  o.name ||
                  o.positionTitle) as string | undefined;
                const url = (o.url ||
                  o.jobUrl ||
                  o.absolute_url ||
                  o.hostedUrl ||
                  o.applyUrl ||
                  o.externalPath) as string | undefined;
                if (
                  typeof title === "string" &&
                  isValidJobTitle(title) &&
                  (typeof url === "string" || o.id || o.requisitionId)
                ) {
                  const loc =
                    (o.location as { name?: string } | undefined)?.name ||
                    (typeof o.location === "string" ? o.location : "") ||
                    (typeof o.city === "string" ? o.city : "") ||
                    "";
                  addJob({
                    title,
                    url: typeof url === "string" ? url : "",
                    location: loc,
                    experience: (o.department as string) || (o.category as string) || "",
                    description:
                      (o.description as string) || (o.snippet as string) || `${title} position`,
                  });
                  continue;
                }
                findJobsInObject(item, depth + 1);
              }
            }
          } else {
            for (const k of Object.keys(obj as Record<string, unknown>)) {
              findJobsInObject((obj as Record<string, unknown>)[k], depth + 1);
            }
          }
        }
        findJobsInObject(parsed);
      }
    } catch {
      // ignore
    }
  }

  // 3. Cheerio DOM Tree Traversal
  try {
    const $ = cheerio.load(html);

    // Remove noisy elements that interfere with text extraction
    $("script, style, noscript, svg, nav, footer, header").remove();

    // Helper: Extract location from element, table cells, or parent container
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function extractLocation($el: cheerio.Cheerio<any>): string {
      const primaryLocSelector =
        '[class*="location"], [class*="loc"], [class*="city"], [class*="office"], [class*="region"], [class*="country"], [class*="geo"], [data-location], [data-city], [data-office]';

      let foundLoc = "";
      let foundModality = "";

      $el.find(primaryLocSelector).each((_, el) => {
        const txt = $(el).text().trim();
        if (!txt || /apply|view details|learn more/i.test(txt) || txt.length > 120) return;
        if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
          if (!foundModality) foundModality = txt;
          return;
        }
        foundLoc = txt;
        return false;
      });

      if (foundLoc) return foundLoc;

      // Check table cells if inside a table row or containing cells
      const isTr = $el.is("tr");
      const tds = isTr ? $el.find("td") : $el.find("tr td");
      if (tds.length > 0) {
        const $table = $el.closest("table");
        if ($table.length) {
          let locIdx = -1;
          $table.find("thead th, tr th").each((idx, th) => {
            if (/loc|city|office|region|country/i.test($(th).text())) {
              locIdx = idx;
              return false;
            }
          });
          if (locIdx >= 0) {
            const td = tds.eq(locIdx);
            if (td.length) {
              const txt = td.text().trim();
              if (txt && !/apply/i.test(txt)) {
                if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
                  if (!foundModality) foundModality = txt;
                } else {
                  return txt;
                }
              }
            }
          }
        }

        let cellLoc = "";
        tds.each((_, td) => {
          const $td = $(td);
          const cls = ($td.attr("class") || "").toLowerCase();
          const txt = $td.text().trim();
          if (/loc|city|office|region|country/i.test(cls) && txt && !/apply/i.test(txt)) {
            if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
              if (!foundModality) foundModality = txt;
              return;
            }
            cellLoc = txt;
            return false;
          }
          if (
            !cellLoc &&
            txt &&
            txt.length < 80 &&
            /,|remote|hybrid|onsite|on-site|india|usa|us|united states|uk|spain|germany|singapore|canada|london|bangalore|bengaluru/i.test(
              txt,
            ) &&
            !$td.find("a").length
          ) {
            if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
              if (!foundModality) foundModality = txt;
            } else {
              cellLoc = txt;
            }
          }
        });
        if (cellLoc) return cellLoc;
      }

      // Check closest parent container for real location tag first
      const parentContainer = $el.closest(
        'tr, li, [class*="job-card"], [class*="job-item"], [class*="job_item"], [class*="job-row"], [class*="job"], [class*="opening"], [class*="card"], [class*="item"]',
      );
      if (parentContainer.length && parentContainer[0] !== $el[0]) {
        const parentLoc = extractLocation(parentContainer);
        if (parentLoc) return parentLoc;
      }

      // Secondary fallback: workplace badge (e.g. Remote / Hybrid)
      if (foundModality) return foundModality;
      const workplaceEl = $el.find('[class*="workplace"], [data-workplace]').first();
      if (workplaceEl.length) {
        const txt = workplaceEl.text().trim();
        if (txt && !/apply/i.test(txt) && txt.length < 120) {
          return txt;
        }
      }

      return "";
    }

    // Helper: Extract department from element or table cells
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function extractDepartment($el: cheerio.Cheerio<any>, fallbackDept: string): string {
      const deptSelector =
        '[class*="department"], [class*="dept"], [class*="team"], [class*="category"], [class*="group"], [data-department]';
      const directEl = $el.find(deptSelector).first();
      if (directEl.length) {
        const txt = directEl.text().trim();
        if (txt && txt.length < 100) return txt;
      }

      const isTr = $el.is("tr");
      const tds = isTr ? $el.find("td") : $el.find("tr td");
      if (tds.length > 0) {
        const $table = $el.closest("table");
        if ($table.length) {
          let deptIdx = -1;
          $table.find("thead th, tr th").each((idx, th) => {
            if (/dept|team|category|function|business/i.test($(th).text())) {
              deptIdx = idx;
              return false;
            }
          });
          if (deptIdx >= 0) {
            const td = tds.eq(deptIdx);
            if (td.length) {
              const txt = td.text().trim();
              if (txt && !/apply/i.test(txt)) return txt;
            }
          }
        }

        let cellDept = "";
        tds.each((_, td) => {
          const $td = $(td);
          const cls = ($td.attr("class") || "").toLowerCase();
          if (/dept|team|category|function/i.test(cls)) {
            cellDept = $td.text().trim();
            return false;
          }
        });
        if (cellDept) return cellDept;
      }

      return fallbackDept;
    }

    // Strategy A: Nested Department / Team Accordions
    const deptContainers = $(
      'section, div[class*="department"], div[class*="team"], div[class*="category"], div[class*="group"], [data-department]',
    );
    deptContainers.each((_, deptEl) => {
      const $dept = $(deptEl);
      const deptName = $dept
        .find('h1, h2, h3, h4, [class*="dept-title"], [class*="category-title"]')
        .first()
        .text()
        .trim();

      let nestedItems = $dept.find(
        'li, tr, [class*="job-card"], [class*="job-item"], [class*="job_item"], [class*="job-row"], [class*="job-listing"], [class*="job-opening"], [class*="career-card"], [class*="career-item"], [class*="opening-card"], [class*="position-card"]',
      );
      if (nestedItems.length === 0) {
        nestedItems = $dept.find(
          'li, tr, [class*="job"], [class*="opening"], [class*="card"], [class*="role"], [class*="position"]',
        );
      }
      if (nestedItems.length === 0) {
        nestedItems = $dept.find("a[href]");
      }

      nestedItems.each((_, itemEl) => {
        const $item = $(itemEl);
        const $link = $item.is("a")
          ? $item
          : $item.find("a[href]").not('[class*="apply"], [href*="apply"]').first();
        const effectiveLink = $link.length ? $link : $item.find("a[href]").first();
        const titleEl = $item
          .find('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="role"], [class*="name"]')
          .first();
        const rawTitle = titleEl.length ? titleEl.text().trim() : effectiveLink.text().trim();

        if (isValidJobTitle(rawTitle)) {
          const href = effectiveLink.attr("href") || "";
          const loc = extractLocation($item);
          const dept = extractDepartment($item, deptName);
          addJob({
            title: rawTitle,
            url: href,
            location: loc,
            experience: dept,
            description: `${rawTitle}${dept ? ` in ${dept}` : ""}${loc ? ` - ${loc}` : ""}`,
          });
        }
      });
    });

    // Strategy B: General Job Card / Row Selectors
    const cardSelectors = [
      '[class*="job-item"]',
      '[class*="job-card"]',
      '[class*="job_item"]',
      '[class*="job-row"]',
      '[class*="job-listing"]',
      '[class*="job_listing"]',
      '[class*="job-post"]',
      '[class*="job-opening"]',
      '[class*="jobCard"]',
      '[class*="jobItem"]',
      '[class*="jobListing"]',
      '[class*="career-item"]',
      '[class*="career-card"]',
      '[class*="career-opening"]',
      '[class*="career-post"]',
      '[class*="careerCard"]',
      '[class*="opening-card"]',
      '[class*="opening-item"]',
      '[class*="position-card"]',
      '[class*="position-item"]',
      '[class*="position-row"]',
      "[data-job-id]",
      '[data-qa="job-card"]',
      '[data-testid*="job"]',
      '[role="listitem"]',
      "table tbody tr",
    ];

    $(cardSelectors.join(", ")).each((_, el) => {
      const $card = $(el);
      const $link = $card.is("a")
        ? $card
        : $card.find("a[href]").not('[class*="apply"], [href*="apply"]').first();
      const effectiveLink = $link.length ? $link : $card.find("a[href]").first();
      const titleEl = $card
        .find(
          'h1, h2, h3, h4, h5, h6, [class*="title"], [class*="role"], [class*="name"], [class*="position"]',
        )
        .first();
      const rawTitle = titleEl.length ? titleEl.text().trim() : effectiveLink.text().trim();

      if (isValidJobTitle(rawTitle)) {
        const href = effectiveLink.attr("href") || "";
        const loc = extractLocation($card);
        const dept = extractDepartment($card, "");
        const snippet = $card.text().slice(0, 300);

        addJob({
          title: rawTitle,
          url: href,
          location: loc,
          experience: dept,
          description: snippet,
        });
      }
    });

    // Strategy C: Anchor scanning for job-specific links (Fallback if cards were few)
    if (jobsMap.size < 5) {
      $("a[href]").each((_, aEl) => {
        const $a = $(aEl);
        const href = $a.attr("href") || "";
        const isJobUrl =
          /\/(jobs?|careers?|positions?|openings?|requisitions?|posting|viewjob|gh_jid)\/[a-zA-Z0-9_\-.~%]+/i.test(
            href,
          );

        if (isJobUrl) {
          const heading = $a.find("h1, h2, h3, h4, h5, h6").first();
          const rawTitle = heading.length ? heading.text().trim() : $a.text().trim();

          if (isValidJobTitle(rawTitle)) {
            const parentText = $a.parent().text().replace(rawTitle, "").trim();
            addJob({
              title: rawTitle,
              url: href,
              location: parentText.slice(0, 80),
              experience: "",
              description: `${rawTitle} position`,
            });
          }
        }
      });
    }
  } catch (e) {
    console.warn("Cheerio parse error:", e);
  }

  return Array.from(jobsMap.values());
}

/** Fallback to Gemini AI when webpage is heavily JS-rendered or non-standard */
async function extractJobsWithAiFallback(
  html: string,
  careersUrl: string,
  companyName: string,
): Promise<ExtractedJob[] | null> {
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, nav, footer, header").remove();
    const cleanText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);
    if (!cleanText || cleanText.length < 150) return null;

    const prompt = `You are an expert talent scraper.
Extract all open job opportunities from this career page text for company "${companyName}".
Ensure all roles, especially QA, SDET, Lead QA, QA Engineer, Tester, Quality Assurance, and Engineering roles are captured.

Webpage Careers URL: ${careersUrl}
Page text snippet:
${cleanText}

Return ONLY a valid JSON array of objects:
[
  {
    "title": "Exact Role Title",
    "url": "Direct link or posting URL if present, otherwise ${careersUrl}",
    "location": "Location if mentioned",
    "experience": "Experience/department if mentioned",
    "description": "Short 1-2 sentence description"
  }
]`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text;
    if (text) {
      let clean = text.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((j) => j && typeof j.title === "string" && isValidJobTitle(j.title))
          .map((j) => ({
            title: sanitizeTitle(j.title, companyName),
            url:
              j.url && /^https?:\/\//i.test(j.url)
                ? j.url
                : makeExactPostingUrl(companyName, j.title, careersUrl, j.location),
            location: j.location || "",
            experience: j.experience || "",
            description: cleanHtmlText(j.description) || `${j.title} at ${companyName}`,
          }));
      }
    }
  } catch (e) {
    console.warn("AI extraction fallback error:", e);
  }
  return null;
}

/** Fetches webpage HTML, follows redirects, checks embedded ATS links, runs Cheerio HTML parser and AI fallback */
async function tryWebAndHtmlExtraction(
  careersUrl: string,
  companyName: string,
  keywords: string[],
): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(careersUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    if (res.url && res.url !== careersUrl) {
      const redirectedAtsJobs = await tryDirectAtsFetch(res.url);
      if (redirectedAtsJobs && redirectedAtsJobs.length > 0) {
        return redirectedAtsJobs;
      }
    }

    const html = await res.text();
    if (!html || html.length < 100) return null;

    // Check for ATS links or iframes in the page HTML
    const linkMatches = html.match(/https?:\/\/[^"'\s<>]+/gi) || [];
    for (const link of linkMatches) {
      if (
        link.includes("boards.greenhouse.io") ||
        link.includes("job-boards.greenhouse.io") ||
        link.includes("jobs.lever.co") ||
        link.includes("careers.smartrecruiters.com") ||
        link.includes("jobs.ashbyhq.com")
      ) {
        const atsJobs = await tryDirectAtsFetch(link);
        if (atsJobs && atsJobs.length > 0) return atsJobs;
      }
    }

    // Run Cheerio-powered robust HTML parser (handles nested accordions, cards, JSON-LD, preloaded state)
    const domJobs = parseJobsFromHtml(html, res.url || careersUrl, companyName);
    if (domJobs && domJobs.length > 0) {
      return domJobs;
    }

    // If static DOM extraction found nothing, fallback to AI extraction over text content
    const aiJobs = await extractJobsWithAiFallback(html, res.url || careersUrl, companyName);
    if (aiJobs && aiJobs.length > 0) {
      return aiJobs;
    }
  } catch (e) {
    console.warn("tryWebAndHtmlExtraction error:", e);
  }
  return null;
}

function computeJobRelevance(job: ExtractedJob, keywords: string[], expanded: string[]): number {
  let score = 0;
  const title = job.title.toLowerCase();
  const desc = (job.description || "").toLowerCase();

  // 1. Direct user keywords matching title (Highest Priority)
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRegex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, "i");
    if (wordRegex.test(title)) {
      score += 150;
    } else if (title.includes(k)) {
      score += 70;
    }
  }

  // 2. Specialized QA / SDET title detection (Guarantees QA roles always surface first)
  const isQaTitle =
    /\b(qa\b|sdet|test\b|tester|testing|test engineer|test lead|lead qa|qa lead|qa manager|quality assurance|quality engineer|quality analyst|automation engineer|automation tester|test automation|qc\b|qe\b|software development engineer in test|software engineer in test)\b/i.test(
      title,
    ) ||
    /software\s*(?:engineer|developer).*(?:in\s*test|,\s*test|[-–—|/]\s*test|\btest\b)/i.test(
      title,
    );
  if (isQaTitle) {
    score += 200;
  }

  // 2b. Explicit high-priority boost for 'lead qa' and 'qa engineer'
  if (/\b(lead\s*qa|qa\s*lead|test\s*lead|lead\s*test|lead\s*quality)\b/i.test(title)) {
    score += 150;
  }
  if (
    /\b(qa\s*engineer|quality\s*engineer|sdet|automation\s*engineer|test\s*engineer)\b/i.test(title)
  ) {
    score += 120;
  }

  // 3. Expanded keywords in title
  for (const exp of expanded) {
    const escaped = exp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRegex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, "i");
    if (wordRegex.test(title)) {
      score += 40;
    }
  }

  // 4. Core technical test automation tools in description
  const coreTools = [
    "selenium",
    "playwright",
    "cypress",
    "restassured",
    "postman",
    "appium",
    "junit",
    "testng",
    "cucumber",
    "automation framework",
    "test automation",
    "regression testing",
  ];
  for (const tool of coreTools) {
    if (desc.includes(tool)) {
      score += 20;
    }
  }

  // 5. Keyword presence in description with word boundaries
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRegex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, "i");
    if (wordRegex.test(desc)) {
      score += 10;
    }
  }

  return score;
}

export async function extractJobs(
  careersUrl: string,
  keywords: string[],
  companyName: string = "Company",
): Promise<ExtractedJob[]> {
  try {
    // Step 1: Direct public ATS API
    let candidateJobs = await tryDirectAtsFetch(careersUrl);

    // Step 2: Web fetch + link inspection + Schema.org + page text
    if (!candidateJobs || candidateJobs.length === 0) {
      candidateJobs = await tryWebAndHtmlExtraction(careersUrl, companyName, keywords);
    }

    // Step 3: If jobs were retrieved from ATS or HTML, filter and rank by relevance
    if (candidateJobs && candidateJobs.length > 0) {
      const expanded = expandKeywords(keywords);

      const scoredJobs = candidateJobs.map((j) => ({
        job: j,
        relevance: computeJobRelevance(j, keywords, expanded),
      }));

      // Sort by relevance score descending so direct QA/SDET/Target matches are ALWAYS first
      scoredJobs.sort((a, b) => b.relevance - a.relevance);

      const topMatches = scoredJobs.filter((s) => s.relevance > 0);
      if (topMatches.length > 0) {
        return topMatches.slice(0, 100).map((s) => s.job);
      }

      // If no explicit keyword matches, return candidate jobs
      return candidateJobs.slice(0, 60);
    }
  } catch (e) {
    console.warn(`Extraction error for ${companyName}:`, e);
  }

  // When no authentic openings exist, return empty array so stale or closed roles do not display
  return [];
}

type Score = {
  index: number;
  score: number;
  summary: string;
  matched: string[];
  missing: string[];
};

export async function scoreJobs(
  resume: string,
  jobs: { title: string; description: string | null }[],
): Promise<Score[]> {
  const resumeText = resume.trim() || DEFAULT_SDET_RESUME;
  if (jobs.length === 0) return [];

  // Compute baseline using enterprise ATS rubric immediately
  const scores: Score[] = jobs.map((j, i) => {
    const res = computeATSScore(resumeText, j.title, j.description);
    return {
      index: i,
      score: res.score,
      summary: res.summary,
      matched: res.matched,
      missing: res.missing,
    };
  });

  return scores;
}

/** Scans one tracked company for a user using verified database schema. */
export async function scanTrackedCompany(db: DB, userId: string, trackedId: string) {
  const { data: tracked, error } = await db
    .from("tracked_companies")
    .select("id, company_id, companies(id, name, careers_url)")
    .eq("id", trackedId)
    .eq("user_id", userId)
    .single();
  if (error || !tracked) throw new Error("Company not found");
  const company = tracked.companies as unknown as {
    id: string;
    name: string;
    careers_url: string | null;
  };

  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const keywords = settings?.role_keywords?.length
    ? settings.role_keywords
    : ["SDET", "Software Engineer"];
  const resume = settings?.resume_text?.trim() || DEFAULT_SDET_RESUME;

  try {
    let careersUrl = company.careers_url;

    // Check if URL is suspicious or a naive /careers append or a 404 greenhouse guess
    const normName = company.name.trim().toLowerCase();
    const hasKnownPortal = Boolean(KNOWN_COMPANY_PORTALS[normName]);
    const isSearchUrl = Boolean(careersUrl && isGenericSearchUrl(careersUrl));
    const isSuspiciousUrl =
      !careersUrl ||
      isSearchUrl ||
      careersUrl.endsWith("/careers") ||
      careersUrl.endsWith("/career") ||
      careersUrl.endsWith("/carrer") ||
      !/^https?:\/\//i.test(careersUrl) ||
      (hasKnownPortal && KNOWN_COMPANY_PORTALS[normName] !== careersUrl);

    if (isSuspiciousUrl) {
      const { updateCompanyWithCanonicalUrl } = await import("./canonical-career-search.server");
      const updated = await updateCompanyWithCanonicalUrl(db, company.id, company.name);
      if (updated.updated && updated.newUrl && !isGenericSearchUrl(updated.newUrl)) {
        careersUrl = updated.newUrl;
      } else {
        const verifiedUrl = await findCareersUrl(company.name, careersUrl || undefined);
        if (verifiedUrl && !isGenericSearchUrl(verifiedUrl)) {
          careersUrl = verifiedUrl;
          await db.from("companies").update({ careers_url: verifiedUrl }).eq("id", company.id);
        } else if (isSearchUrl) {
          // Clear corrupted search URL so database stays clean
          careersUrl = null;
          await db.from("companies").update({ careers_url: null }).eq("id", company.id);
        }
      }
    }

    if (!careersUrl || isGenericSearchUrl(careersUrl)) {
      await db
        .from("tracked_companies")
        .update({
          last_checked_at: new Date().toISOString(),
          last_error:
            "Missing direct careers portal link. Generic search results cannot be scanned for jobs.",
        })
        .eq("id", trackedId);
      return { added: 0, checked: company.name, status: "needs_direct_careers_url" };
    }

    const found = await extractJobs(careersUrl, keywords, company.name);
    const now = new Date().toISOString();
    let added = 0;

    // Always remove previous unapplied jobs for this company so stale/closed roles are purged
    await db.from("jobs").delete().eq("company_id", company.id).neq("status", "applied");

    if (found.length) {
      let scores: Score[] = [];
      try {
        scores = await scoreJobs(resume, found);
      } catch {
        // scoring is non-fatal
      }

      const rows = found.map((f, i) => {
        const s = scores.find((x) => x.index === i);
        return {
          company_id: company.id,
          title: f.title,
          url: f.url,
          location: f.location || null,
          description: f.description || null,
          score: s ? Math.max(0, Math.min(100, s.score)) : null,
          score_summary: s?.summary ?? null,
          matched_skills: s?.matched ?? null,
          missing_skills: s?.missing ?? null,
          status: "open",
          applied: false,
          first_seen_at: now,
          last_seen_at: now,
        };
      });

      const { error: insErr } = await db.from("jobs").insert(rows);
      if (insErr) {
        console.warn("Error inserting jobs:", insErr.message);
      } else {
        added = rows.length;
      }
    }

    await db
      .from("tracked_companies")
      .update({ last_checked_at: now, last_error: null })
      .eq("id", trackedId);

    return { found: found.length, added };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Scan error for ${company.name}:`, msg);
    await db
      .from("tracked_companies")
      .update({ last_checked_at: new Date().toISOString(), last_error: msg.slice(0, 300) })
      .eq("id", trackedId);
    return { found: 0, added: 0 };
  }
}
