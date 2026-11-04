import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

export type CareerUrlStatus =
  | "valid_ats"
  | "valid_company_portal"
  | "generic_search"
  | "generic_aggregator"
  | "invalid_protocol"
  | "unreachable"
  | "empty";

export interface CareerUrlValidationResult {
  isValid: boolean;
  status: CareerUrlStatus;
  isGenericSearch: boolean;
  isAggregator: boolean;
  originalUrl: string | null;
  normalizedUrl: string | null;
  detectedAts?: string;
  reason: string;
  suggestedUrl?: string | null;
}

/**
 * Common search engines and query patterns that users or AI models mistakenly provide as career links.
 */
const SEARCH_ENGINE_REGEXES = [
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?google\.[a-z.]+\/search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?google\.[a-z.]+\/url/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?bing\.com\/search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?search\.yahoo\.com/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?duckduckgo\.com/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?baidu\.com\/s/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?yandex\.[a-z.]+\/search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?ask\.com\/web/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?ecosia\.org\/search/i,
];

/**
 * Aggregator search queries that are not dedicated company job boards.
 */
const GENERIC_AGGREGATOR_REGEXES = [
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?indeed\.[a-z.]+\/(?:jobs|m\/jobs)\?/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?simplyhired\.[a-z.]+\/search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?monster\.[a-z.]+\/jobs\/search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?ziprecruiter\.[a-z.]+\/jobs-search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?glassdoor\.[a-z.]+\/(?:Job\/jobs\.htm|Jobs\/)/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?linkedin\.com\/jobs\/search\?/i,
];

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
  "brassring.com": "Kenexa BrassRing",
  "successfactors.com": "SAP SuccessFactors",
};

/**
 * Directory of verified portals for major/popular tech employers.
 */
export const VERIFIED_PORTAL_DIRECTORY: Record<string, string> = {
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
  veeam: "https://careers.veeam.com/",
  "veeam software": "https://careers.veeam.com/",
  zepto: "https://boards.greenhouse.io/zepto",
  phonepe: "https://phonepe.com/careers/",
  "urban company": "https://www.urbancompany.com/careers",
  "cult.fit": "https://cult.fit/careers",
  curefit: "https://cult.fit/careers",
  rapido: "https://rapido.workable.com/",
  licious: "https://licious.darwinbox.in/ms/candidate/careers",
  bharatpe: "https://bharatpe.com/careers",
  porter: "https://porter.in/careers",
  shadowfax: "https://shadowfax.in/careers",
  lenskart: "https://lenskart.darwinbox.in/ms/candidate/careers",
  delhivery: "https://www.delhivery.com/careers",
  spinny: "https://www.spinny.com/careers/",
  cars24: "https://careers.cars24.com/",
  stripe: "https://stripe.com/jobs/search",
  twilio: "https://www.twilio.com/en-us/company/jobs",
  datadog: "https://careers.datadoghq.com/",
  snowflake: "https://careers.snowflake.com/",
  databricks: "https://www.databricks.com/company/careers",
  mongodb: "https://www.mongodb.com/careers",
  elastic: "https://jobs.elastic.co/",
  splunk: "https://www.splunk.com/en_us/careers.html",
  servicenow: "https://careers.servicenow.com/",
  workday: "https://www.workday.com/en-us/company/careers.html",
  "palo alto networks": "https://jobs.paloaltonetworks.com/",
  "ge healthcare": "https://careers.gehealthcare.com/global/en",
  gehealthcare: "https://careers.gehealthcare.com/global/en",
  "ge healthcare india": "https://careers.gehealthcare.com/global/en",
  target: "https://corporate.target.com/careers",
  "target india": "https://corporate.target.com/careers",
  "applied materials": "https://jobs.appliedmaterials.com/search-jobs/India",
  "applied materials india": "https://jobs.appliedmaterials.com/search-jobs/India",
  "walmart global tech": "https://tech.walmart.com/content/walmart-global-tech/en_us/careers.html",
  "walmart global tech india":
    "https://tech.walmart.com/content/walmart-global-tech/en_us/careers.html",
  walmart: "https://tech.walmart.com/content/walmart-global-tech/en_us/careers.html",
  bosch: "https://jobs.bosch.com/en/",
  "bosch global": "https://jobs.bosch.com/en/",
  "robert bosch": "https://jobs.bosch.com/en/",
  broadcom: "https://www.broadcom.com/company/careers",
  zoho: "https://www.zoho.com/careers/",
  "zoho corporation": "https://www.zoho.com/careers/",
  "schneider electric": "https://careers.se.com/careers-at-schneider-electric",
  "sap labs": "https://jobs.sap.com/",
  "sap labs india": "https://jobs.sap.com/",
  sap: "https://jobs.sap.com/",
  philips: "https://careers.philips.com/",
  "philips india": "https://careers.philips.com/",
  "american express": "https://jobs.americanexpress.com/",
  "american express india": "https://jobs.americanexpress.com/",
  amex: "https://jobs.americanexpress.com/",
  "american express global business travel":
    "https://amexglobalbusinesstravel.wd1.myworkdayjobs.com/amexgbt",
  arm: "https://careers.arm.com/",
  "arm holding": "https://careers.arm.com/",
  "ather energy": "https://atherenergy.com/careers",
  ather: "https://atherenergy.com/careers",
  blinkit: "https://blinkit.com/careers",
  clevertap: "https://clevertap.com/careers/",
  coindcx: "https://coindcx.com/careers",
  coinswitch: "https://coinswitch.co/careers",
  "d.e shaw india": "https://www.deshawindia.com/careers",
  "d.e. shaw": "https://www.deshawindia.com/careers",
  "de shaw": "https://www.deshawindia.com/careers",
  chegg: "https://jobs.chegg.com/",
  cheggindia: "https://jobs.chegg.com/",
  healthedge: "https://www.healthedge.com/careers",
  honeywell: "https://careers.honeywell.com/us/en",
  "honeywell india": "https://careers.honeywell.com/us/en",
  crowdstrike: "https://www.crowdstrike.com/careers/",
  okta: "https://www.okta.com/company/careers/",
  zscaler: "https://www.zscaler.com/careers",
  rubrik: "https://www.rubrik.com/company/careers",
  cohesity: "https://www.cohesity.com/company/careers/",
  "pure storage": "https://www.purestorage.com/company/careers.html",
  nutanix: "https://www.nutanix.com/company/careers",
  netapp: "https://www.netapp.com/company/careers/",
  vmware: "https://careers.vmware.com/",
  dell: "https://jobs.dell.com/",
  hp: "https://jobs.hp.com/",
  ibm: "https://www.ibm.com/careers",
  intel: "https://jobs.intel.com/en",
  amd: "https://careers.amd.com/",
  "morgan stanley": "https://www.morganstanley.com/people-opportunities/careers",
  "goldman sachs": "https://www.goldmansachs.com/careers/",
  "jpmorgan chase": "https://careers.jpmorgan.com/",
  zerodha: "https://careers.zerodha.com/",
  "national instruments": "https://www.ni.com/en/about-ni/careers.html",
  "national instruments (ni)": "https://www.ni.com/en/about-ni/careers.html",
  "national instruments ni": "https://www.ni.com/en/about-ni/careers.html",
  ni: "https://www.ni.com/en/about-ni/careers.html",
  "emerson / ni": "https://www.ni.com/en/about-ni/careers.html",
  emerson: "https://www.emerson.com/en-us/careers",
  "tata consultancy services (tcs)": "https://www.tcs.com/careers",
  "hewlett packard (hp)": "https://jobs.hp.com/",
  "electronic arts (ea)": "https://jobs.ea.com/en_US/careers/Home/",
  "advanced micro devices (amd)": "https://careers.amd.com/",
  "advanced micro devices": "https://careers.amd.com/",
  siemens: "https://jobs.siemens.com/",
  "siemens digital industries": "https://jobs.siemens.com/",
  "siemens digital industries software": "https://jobs.siemens.com/",
  "siemens healthineers": "https://jobs.siemens-healthineers.com/",
  symplr: "https://www.symplr.com/careers",
};

/**
 * Mapping of dead, outdated or regional-broken career portal subdomains to their verified canonical entrypoints.
 */
export const KNOWN_DEAD_PORTAL_REDIRECTS: Record<string, string> = {
  "job-boards.greenhouse.io/gehealthcare": "https://careers.gehealthcare.com/global/en",
  "boards.greenhouse.io/gehealthcare": "https://careers.gehealthcare.com/global/en",
  "job-boards.greenhouse.io/target": "https://corporate.target.com/careers",
  "boards.greenhouse.io/target": "https://corporate.target.com/careers",
  "job-boards.greenhouse.io/appliedmaterials":
    "https://jobs.appliedmaterials.com/search-jobs/India",
  "careers.appliedmaterials.com": "https://jobs.appliedmaterials.com/search-jobs/India",
  "job-boards.greenhouse.io/walmartglobaltech":
    "https://tech.walmart.com/content/walmart-global-tech/en_us/careers.html",
  "job-boards.greenhouse.io/americanexpress": "https://jobs.americanexpress.com/",
  "job-boards.greenhouse.io/americanexpressglobalbusinesstravel":
    "https://amexglobalbusinesstravel.wd1.myworkdayjobs.com/amexgbt",
  "job-boards.greenhouse.io/arm": "https://careers.arm.com/",
  "job-boards.greenhouse.io/atherenergy": "https://atherenergy.com/careers",
  "job-boards.greenhouse.io/blinkit": "https://blinkit.com/careers",
  "job-boards.greenhouse.io/bosch": "https://jobs.bosch.com/en/",
  "job-boards.greenhouse.io/broadcom": "https://www.broadcom.com/company/careers",
  "job-boards.greenhouse.io/chegg": "https://jobs.chegg.com/",
  "job-boards.greenhouse.io/clevertap": "https://clevertap.com/careers/",
  "job-boards.greenhouse.io/coindcx": "https://coindcx.com/careers",
  "job-boards.greenhouse.io/coinswitch": "https://coinswitch.co/careers",
  "job-boards.greenhouse.io/deshawindia": "https://www.deshawindia.com/careers",
  "job-boards.greenhouse.io/zoho": "https://www.zoho.com/careers/",
  "job-boards.greenhouse.io/schneiderelectric":
    "https://careers.se.com/careers-at-schneider-electric",
  "job-boards.greenhouse.io/saplabs": "https://jobs.sap.com/",
  "job-boards.greenhouse.io/philips": "https://careers.philips.com/",
  "careers.sw.siemens.com": "https://jobs.siemens.com/",
  "jobs.amd.com": "https://careers.amd.com/",
  "www.symplr.com/careers/india": "https://www.symplr.com/careers",
  "symplr.com/careers/india": "https://www.symplr.com/careers",
};

/**
 * Checks if a URL matches any known dead portal and returns its canonical replacement.
 */
export function getRedirectForDeadPortal(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const clean = url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  for (const [deadPattern, canonical] of Object.entries(KNOWN_DEAD_PORTAL_REDIRECTS)) {
    const cleanPattern = deadPattern
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    if (
      clean === cleanPattern ||
      clean.startsWith(cleanPattern + "/") ||
      clean.includes(cleanPattern)
    ) {
      return canonical;
    }
  }
  return null;
}

/**
 * Fast live probe of a career URL to detect 404s, domain drops, or unreachable servers.
 */
export async function probeCareerUrlLive(url: string): Promise<{
  isAlive: boolean;
  statusCode?: number;
  finalUrl?: string;
}> {
  if (!url || !/^https?:\/\//i.test(url.trim())) {
    return { isAlive: false, statusCode: 400 };
  }
  try {
    const res = await fetch(url.trim(), {
      method: "GET",
      signal: AbortSignal.timeout(4000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.status === 404 || res.status === 410) {
      return { isAlive: false, statusCode: res.status };
    }
    // Greenhouse returns 404 status when board does not exist
    if (url.includes("greenhouse.io") && res.status >= 400) {
      return { isAlive: false, statusCode: res.status };
    }
    return {
      isAlive: res.status < 400,
      statusCode: res.status,
      finalUrl: res.url || url,
    };
  } catch {
    return { isAlive: false, statusCode: 0 };
  }
}

/**
 * Checks if a given URL is a search engine result page.
 */
export function isGenericSearchUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim();
  for (const rx of SEARCH_ENGINE_REGEXES) {
    if (rx.test(clean)) return true;
  }
  try {
    const obj = new URL(clean);
    const host = obj.hostname.toLowerCase();
    if (
      host.includes("google.") &&
      (obj.pathname.includes("/search") || obj.pathname.includes("/url"))
    ) {
      return true;
    }
    if (host.includes("bing.com") && obj.pathname.includes("/search")) {
      return true;
    }
  } catch {
    // ignore URL parse errors
  }
  return false;
}

/**
 * Checks if a given URL is a third-party job aggregator query rather than a direct company portal.
 */
export function isJobAggregatorUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim();
  for (const rx of GENERIC_AGGREGATOR_REGEXES) {
    if (rx.test(clean)) return true;
  }
  return false;
}

/**
 * Validates a company career page URL, flagging search results and non-career links.
 */
export async function validateCareerUrl(
  rawUrl: string | null | undefined,
  companyName?: string,
): Promise<CareerUrlValidationResult> {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      isValid: false,
      status: "empty",
      isGenericSearch: false,
      isAggregator: false,
      originalUrl: rawUrl || null,
      normalizedUrl: null,
      reason: "No careers URL provided",
      suggestedUrl: companyName ? getVerifiedPortalForName(companyName) : null,
    };
  }

  const clean = rawUrl.trim();

  // 1. Protocol check
  if (!/^https?:\/\//i.test(clean)) {
    return {
      isValid: false,
      status: "invalid_protocol",
      isGenericSearch: false,
      isAggregator: false,
      originalUrl: clean,
      normalizedUrl: null,
      reason: "Link must start with http:// or https://",
      suggestedUrl: companyName ? getVerifiedPortalForName(companyName) : `https://${clean}`,
    };
  }

  // 2. Generic Search Engine Detection (CRITICAL USER REQUIREMENT)
  if (isGenericSearchUrl(clean)) {
    const suggested = companyName ? getVerifiedPortalForName(companyName) : null;
    return {
      isValid: false,
      status: "generic_search",
      isGenericSearch: true,
      isAggregator: false,
      originalUrl: clean,
      normalizedUrl: null,
      reason:
        "Flagged: URL is a generic Google search result, not a direct company career site. The job scraper cannot extract authentic jobs from search query pages.",
      suggestedUrl: suggested,
    };
  }

  // 3. Generic Job Aggregator Detection
  if (isJobAggregatorUrl(clean)) {
    const suggested = companyName ? getVerifiedPortalForName(companyName) : null;
    return {
      isValid: false,
      status: "generic_aggregator",
      isGenericSearch: false,
      isAggregator: true,
      originalUrl: clean,
      normalizedUrl: null,
      reason:
        "Flagged: URL points to a third-party job aggregator query instead of the employer's direct hiring portal.",
      suggestedUrl: suggested,
    };
  }

  // Check if URL matches a known dead portal with a canonical replacement
  const deadRedirect = getRedirectForDeadPortal(clean);
  if (deadRedirect) {
    const verifiedAts = deadRedirect.includes("workday") ? "Workday" : undefined;
    return {
      isValid: true,
      status: "valid_company_portal",
      isGenericSearch: false,
      isAggregator: false,
      originalUrl: clean,
      normalizedUrl: deadRedirect,
      detectedAts: verifiedAts,
      reason: `Redirected known outdated link to verified portal (${deadRedirect})`,
      suggestedUrl: deadRedirect,
    };
  }

  // 4. URL Parse & Normalization
  let urlObj: URL;
  try {
    urlObj = new URL(clean);
  } catch {
    return {
      isValid: false,
      status: "invalid_protocol",
      isGenericSearch: false,
      isAggregator: false,
      originalUrl: clean,
      normalizedUrl: null,
      reason: "Invalid URL structure",
      suggestedUrl: null,
    };
  }

  // Remove common marketing/tracking noise (utm_*, fbclid, gclid, etc.)
  const cleanObj = new URL(clean);
  const paramsToStrip = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "trk",
    "ref",
  ];
  for (const param of paramsToStrip) {
    cleanObj.searchParams.delete(param);
  }
  const normalizedUrl = cleanObj.toString();

  // 5. Detect ATS Platform
  const hostname = urlObj.hostname.toLowerCase();
  let detectedAts: string | undefined;
  for (const [sigDomain, name] of Object.entries(KNOWN_ATS_SIGNATURES)) {
    if (hostname.includes(sigDomain)) {
      detectedAts = name;
      break;
    }
  }

  if (detectedAts) {
    return {
      isValid: true,
      status: "valid_ats",
      isGenericSearch: false,
      isAggregator: false,
      originalUrl: clean,
      normalizedUrl,
      detectedAts,
      reason: `Verified official ATS job board (${detectedAts})`,
    };
  }

  // 6. Direct company career portal heuristic
  const pathname = urlObj.pathname.toLowerCase();
  const hasCareerPath =
    pathname.includes("career") ||
    pathname.includes("job") ||
    pathname.includes("work-with-us") ||
    pathname.includes("openings") ||
    pathname.includes("join-us") ||
    pathname.includes("positions") ||
    hostname.startsWith("careers.") ||
    hostname.startsWith("jobs.");

  return {
    isValid: true,
    status: hasCareerPath ? "valid_company_portal" : "valid_company_portal",
    isGenericSearch: false,
    isAggregator: false,
    originalUrl: clean,
    normalizedUrl,
    reason: hasCareerPath
      ? "Direct company careers portal"
      : "Company website domain (will scan for career links upon crawling)",
  };
}

/**
 * Looks up verified portal directory for a company name.
 */
export function getVerifiedPortalForName(companyName: string): string | null {
  const norm = companyName.trim().toLowerCase();
  if (VERIFIED_PORTAL_DIRECTORY[norm]) {
    return VERIFIED_PORTAL_DIRECTORY[norm]!;
  }
  const cleanNoParens = norm.replace(/\s*\([^)]*\)/g, "").trim();
  if (cleanNoParens && VERIFIED_PORTAL_DIRECTORY[cleanNoParens]) {
    return VERIFIED_PORTAL_DIRECTORY[cleanNoParens]!;
  }
  const matchInParens = norm
    .match(/\(([^)]+)\)/)?.[1]
    ?.trim()
    .toLowerCase();
  if (matchInParens && VERIFIED_PORTAL_DIRECTORY[matchInParens]) {
    return VERIFIED_PORTAL_DIRECTORY[matchInParens]!;
  }
  const stripped = norm.replace(/[^a-z0-9]/g, "");
  for (const [key, val] of Object.entries(VERIFIED_PORTAL_DIRECTORY)) {
    if (key.replace(/[^a-z0-9]/g, "") === stripped) {
      return val;
    }
  }
  if (cleanNoParens) {
    const strippedClean = cleanNoParens.replace(/[^a-z0-9]/g, "");
    for (const [key, val] of Object.entries(VERIFIED_PORTAL_DIRECTORY)) {
      if (key.replace(/[^a-z0-9]/g, "") === strippedClean) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Resolves a genuine, direct career page for a company.
 * Never returns a Google search URL.
 */
export async function resolveDirectCareerUrl(
  companyName: string,
  candidateUrl?: string | null,
): Promise<{
  url: string | null;
  isValid: boolean;
  source: "directory" | "ai" | "user" | "none";
  reason: string;
}> {
  const norm = companyName.trim();

  // 1. If candidate URL is provided and already valid (not search, not aggregator)
  if (candidateUrl) {
    const val = await validateCareerUrl(candidateUrl, norm);
    if (val.isValid && !val.isGenericSearch && !val.isAggregator) {
      return {
        url: val.normalizedUrl,
        isValid: true,
        source: "user",
        reason: val.reason,
      };
    }
  }

  // 2. Check curated verified portal directory
  const directoryUrl = getVerifiedPortalForName(norm);
  if (directoryUrl) {
    return {
      url: directoryUrl,
      isValid: true,
      source: "directory",
      reason: "Matched official portal directory",
    };
  }

  // 3. Use live Search API with Google Search Grounding to query '[Company Name] career page'
  const { querySearchApiForCanonicalUrl } = await import("./canonical-career-search.server");
  const searchResult = await querySearchApiForCanonicalUrl(norm);
  if (searchResult.status === "verified_canonical" && searchResult.canonicalUrl) {
    return {
      url: searchResult.canonicalUrl,
      isValid: true,
      source: searchResult.source === "directory" ? "directory" : "ai",
      reason: searchResult.reason,
    };
  }

  // Never return a Google search URL!
  return {
    url: null,
    isValid: false,
    source: "none",
    reason:
      searchResult.reason || "No authentic direct career portal could be verified via Search API.",
  };
}

/**
 * Audits all companies in the database, cleans any corrupted Google search URLs,
 * and automatically updates company records with verified official canonical career URLs via Search API.
 */
export async function auditAndCleanCompanyUrls(db: DB): Promise<{
  totalChecked: number;
  cleanedCount: number;
  fixedCompanies: Array<{
    id: string;
    name: string;
    oldUrl: string;
    newUrl: string | null;
    reason: string;
  }>;
}> {
  const { autoUpdateCompaniesWithGenericUrls } = await import("./canonical-career-search.server");
  const result = await autoUpdateCompaniesWithGenericUrls(db);

  return {
    totalChecked: result.totalProcessed,
    cleanedCount: result.updatedCount,
    fixedCompanies: result.updates.map((u) => ({
      id: u.companyId,
      name: u.companyName,
      oldUrl: u.oldUrl ?? "",
      newUrl: u.newUrl,
      reason: u.reason,
    })),
  };
}
