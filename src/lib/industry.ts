/**
 * Comprehensive Industry & Sector mapping for companies tracked in RoleRadar.
 * Classifies companies into recognizable tech industry verticals.
 */

export type Industry =
  | "All"
  | "Gaming & Entertainment"
  | "FinTech & Banking"
  | "Enterprise SaaS & Cloud"
  | "E-Commerce & Quick Commerce"
  | "AI, Big Tech & Hardware"
  | "HealthTech & Medical"
  | "Mobility & Auto Tech";

export const ALL_INDUSTRIES: Industry[] = [
  "All",
  "Gaming & Entertainment",
  "FinTech & Banking",
  "Enterprise SaaS & Cloud",
  "E-Commerce & Quick Commerce",
  "AI, Big Tech & Hardware",
  "HealthTech & Medical",
  "Mobility & Auto Tech",
];

const GAMING_COMPANIES = new Set([
  "rockstar games",
  "electronic arts",
  "ubisoft",
  "take-two",
  "take-two interactive",
  "playtika",
  "gameskraft",
  "games24x7",
  "mpl",
  "mobile premier league",
  "nazara",
  "nazara technologies",
  "dream11",
  "dream sports",
  "dream sports / dream11",
  "scopely",
  "kwalee",
  "zynga",
  "zynga / take-two",
  "skillz",
  "playsimple",
  "playsimple games",
  "arcade",
  "epic games",
  "riot games",
  "krafton",
  "unity",
  "supercell",
  "roblox",
  "sony",
  "playstation",
]);

const FINTECH_COMPANIES = new Set([
  "razorpay",
  "phonepe",
  "cred",
  "paytm",
  "zerodha",
  "groww",
  "stripe",
  "paypal",
  "mastercard",
  "visa",
  "jpmorgan chase",
  "jpmorgan",
  "goldman sachs",
  "cashfree payments",
  "cashfree",
  "bharatpe",
  "coinswitch",
  "coindcx",
  "slice",
  "setu",
  "pine labs",
  "khatabook",
  "d.e shaw india",
  "d.e shaw",
  "fiserv",
  "bloomberg",
  "highradius",
  "justpay",
  "juspay",
  "american express",
  "morgan stanley",
  "stockx",
  "intuit",
  "chargebee",
]);

const ECOMMERCE_COMPANIES = new Set([
  "amazon",
  "flipkart",
  "swiggy",
  "zomato",
  "blinkit",
  "zepto",
  "meesho",
  "nykaa",
  "myntra",
  "lenskart",
  "walmart",
  "walmart global tech",
  "target",
  "bigbasket",
  "tata 1mg",
  "tata neu",
  "inmobi",
  "sharechat",
  "glance",
]);

const SAAS_CLOUD_COMPANIES = new Set([
  "browserstack",
  "postman",
  "hasura",
  "media.net",
  "enterprisedb",
  "myoperator",
  "druva",
  "cloudsek",
  "netapp",
  "netradyne",
  "netskope",
  "gitlab",
  "canonical",
  "hotjar",
  "toggl",
  "adobe",
  "cisco",
  "oracle",
  "sap",
  "sap labs",
  "atlassian",
  "palo alto networks",
  "crowdstrike",
  "servicenow",
  "datadog",
  "whatfix",
  "moengage",
  "workday",
  "nutanix",
  "pega",
  "rubrik",
  "mongodb",
  "elastic",
  "thoughtspot",
  "freshworks",
  "sage",
  "ibm",
  "red hat",
  "ibm / red hat",
  "okta",
  "synopsys",
  "snowflake",
  "cloudflare",
  "confluent",
  "mindtickle",
  "clevertap",
  "veeam software",
  "broadcom",
  "zendesk",
  "zoho",
  "zscaler",
  "salesforce",
  "sapiens",
  "cadence",
]);

const AI_HARDWARE_COMPANIES = new Set([
  "google",
  "microsoft",
  "meta",
  "apple",
  "nvidia",
  "intel",
  "amd",
  "arm",
  "qualcomm",
  "juniper networks",
  "samsung",
  "samsung r&d",
  "openai",
  "anthropic",
  "applied materials",
  "lam research",
]);

const HEALTHTECH_COMPANIES = new Set([
  "practo",
  "ge healthcare",
  "healthifyme",
  "tricog",
  "innovaccer",
  "pharmeasy",
  "healthplix",
  "niramai",
  "philips",
  "medibuddy",
  "eka care",
  "healthedge",
]);

const MOBILITY_AUTO_COMPANIES = new Set([
  "uber",
  "ola",
  "ola electric",
  "ather energy",
  "mercedes-benz",
  "mercedes-benz r&d",
  "mercedes-benz research & development india",
  "bosch",
  "honeywell",
  "siemens",
  "siemens digital industries",
  "schneider electric",
  "boeing",
  "archer",
  "quest global",
  "booking.com",
  "expedia group",
  "american express global business travel",
]);

/**
 * Resolves the industry of a company by its name or category.
 */
export function getCompanyIndustry(
  companyName?: string | null,
  category?: string | null,
): Industry {
  const norm = (companyName || "").trim().toLowerCase();
  const cat = (category || "").trim().toLowerCase();

  if (
    GAMING_COMPANIES.has(norm) ||
    norm.includes("game") ||
    norm.includes("gaming") ||
    cat === "gaming"
  ) {
    return "Gaming & Entertainment";
  }

  if (
    FINTECH_COMPANIES.has(norm) ||
    norm.includes("pay") ||
    norm.includes("fintech") ||
    norm.includes("bank") ||
    cat === "fintech"
  ) {
    return "FinTech & Banking";
  }

  if (
    ECOMMERCE_COMPANIES.has(norm) ||
    norm.includes("commerce") ||
    norm.includes("kart") ||
    cat === "ecommerce" ||
    cat === "e-commerce"
  ) {
    return "E-Commerce & Quick Commerce";
  }

  if (
    SAAS_CLOUD_COMPANIES.has(norm) ||
    norm.includes("cloud") ||
    norm.includes("software") ||
    norm.includes("saas") ||
    cat === "saas"
  ) {
    return "Enterprise SaaS & Cloud";
  }

  if (AI_HARDWARE_COMPANIES.has(norm) || norm.includes("semiconductor") || norm.includes("micro")) {
    return "AI, Big Tech & Hardware";
  }

  if (
    HEALTHTECH_COMPANIES.has(norm) ||
    norm.includes("health") ||
    norm.includes("care") ||
    norm.includes("med") ||
    cat === "healthtech"
  ) {
    return "HealthTech & Medical";
  }

  if (
    MOBILITY_AUTO_COMPANIES.has(norm) ||
    norm.includes("auto") ||
    norm.includes("mobility") ||
    norm.includes("motors")
  ) {
    return "Mobility & Auto Tech";
  }

  return "Enterprise SaaS & Cloud";
}
