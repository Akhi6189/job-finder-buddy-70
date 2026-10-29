/**
 * Client-safe career URL analysis and classification helpers.
 */

export type CareerUrlKind =
  "canonical_ats" | "canonical_portal" | "generic_search" | "aggregator" | "missing" | "invalid";

export interface CareerUrlStatusInfo {
  kind: CareerUrlKind;
  isCanonical: boolean;
  isSearch: boolean;
  isAggregator: boolean;
  isMissing: boolean;
  label: string;
  badgeLabel: string;
  detectedAts?: string;
  tooltip: string;
}

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

const AGGREGATOR_REGEXES = [
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?indeed\.[a-z.]+\/(?:jobs|m\/jobs)\?/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?simplyhired\.[a-z.]+\/search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?monster\.[a-z.]+\/jobs\/search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?ziprecruiter\.[a-z.]+\/jobs-search/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?glassdoor\.[a-z.]+\/(?:Job\/jobs\.htm|Jobs\/)/i,
  /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?linkedin\.com\/jobs\/search\?/i,
];

const KNOWN_ATS_MAP: Record<string, string> = {
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
  "taleo.net": "Taleo",
  "icims.com": "iCIMS",
  "jobvite.com": "Jobvite",
  "successfactors.com": "SAP",
};

/**
 * Analyzes a URL and classifies whether it has been verified as canonical or is a generic search query.
 */
export function getCareerUrlStatus(url: string | null | undefined): CareerUrlStatusInfo {
  if (!url || typeof url !== "string" || !url.trim()) {
    return {
      kind: "missing",
      isCanonical: false,
      isSearch: false,
      isAggregator: false,
      isMissing: true,
      label: "No careers URL set",
      badgeLabel: "No URL",
      tooltip: "No careers page provided. Click ✨ to auto-locate via Search API.",
    };
  }

  const clean = url.trim();

  // 1. Generic Search Engine Detection
  for (const rx of SEARCH_ENGINE_REGEXES) {
    if (rx.test(clean)) {
      return {
        kind: "generic_search",
        isCanonical: false,
        isSearch: true,
        isAggregator: false,
        isMissing: false,
        label: "Generic search query link (Google/Bing)",
        badgeLabel: "Generic Search Link",
        tooltip:
          "This is a generic search query URL. Scrapers cannot extract active jobs from search engine pages. Click ✨ to auto-update with canonical URL.",
      };
    }
  }

  // 2. Generic Aggregator Detection
  for (const rx of AGGREGATOR_REGEXES) {
    if (rx.test(clean)) {
      return {
        kind: "aggregator",
        isCanonical: false,
        isSearch: true,
        isAggregator: true,
        isMissing: false,
        label: "Job aggregator search query",
        badgeLabel: "Aggregator Query",
        tooltip:
          "Points to a third-party aggregator search instead of the employer's direct portal.",
      };
    }
  }

  // 3. Protocol check
  if (!/^https?:\/\//i.test(clean)) {
    return {
      kind: "invalid",
      isCanonical: false,
      isSearch: false,
      isAggregator: false,
      isMissing: false,
      label: "Invalid link protocol",
      badgeLabel: "Invalid URL",
      tooltip: "URL must begin with http:// or https://",
    };
  }

  // 4. ATS Signature check
  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase();
    for (const [domain, name] of Object.entries(KNOWN_ATS_MAP)) {
      if (host.includes(domain)) {
        return {
          kind: "canonical_ats",
          isCanonical: true,
          isSearch: false,
          isAggregator: false,
          isMissing: false,
          detectedAts: name,
          label: `Verified Canonical (${name} ATS)`,
          badgeLabel: `${name} · Canonical`,
          tooltip: `Verified official ${name} ATS portal. Job scraping supported.`,
        };
      }
    }
  } catch {
    return {
      kind: "invalid",
      isCanonical: false,
      isSearch: false,
      isAggregator: false,
      isMissing: false,
      label: "Malformed URL",
      badgeLabel: "Malformed URL",
      tooltip: "Could not parse URL structure.",
    };
  }

  // 5. Canonical direct company careers portal
  return {
    kind: "canonical_portal",
    isCanonical: true,
    isSearch: false,
    isAggregator: false,
    isMissing: false,
    label: "Verified Canonical Portal",
    badgeLabel: "Verified Canonical",
    tooltip: "Verified direct official career portal. Direct scraping supported.",
  };
}
