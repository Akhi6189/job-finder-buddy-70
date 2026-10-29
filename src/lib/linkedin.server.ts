import * as cheerio from "cheerio";
import { computeATSScore, DEFAULT_SDET_RESUME } from "./ats-score";
import {
  scrapeAndParseLinkedInProfile,
  searchLinkedInJobsWithProfile,
  evaluateProfileAgainstJob,
  extractSkillTaxonomy,
  parseExperienceFromText,
  calculateNetExperience,
  type ParsedLinkedInProfile,
  type JobMatchEvaluation,
  type LinkedInJobPosting,
  type LinkedInExperienceItem,
  type LinkedInSkillTaxonomy,
} from "./linkedin-service";

export * from "./linkedin-service";

export interface LinkedInProfileData {
  name: string;
  headline: string;
  location: string;
  currentTitle: string;
  currentCompany: string;
  yearsExperience: number;
  topSkills: string[];
  targetRoles: string[];
  summary: string;
  roleFitInsights: Array<{
    role: string;
    matchScore: number;
    strengths: string[];
    missingKeywords: string[];
    advice: string;
  }>;
  formattedResume: string;
  // Enhanced service properties
  experience?: LinkedInExperienceItem[];
  categorizedSkills?: LinkedInSkillTaxonomy;
}

export interface LinkedInJobResult {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  postedTime: string;
  score: number;
  scoreSummary: string;
  matchedSkills: string[];
  missingSkills: string[];
  scoreCategory?: "Strong Match" | "Moderate Match" | "Needs Alignment";
}

/**
 * Searches public LinkedIn job postings for a target role & location,
 * then scores each role against the candidate's resume/profile using enterprise ATS rubric.
 */
export async function searchLinkedInJobs(
  resumeText: string,
  options: {
    roleQuery: string;
    location?: string;
    remoteOnly?: boolean;
    limit?: number;
  },
): Promise<{
  jobs: LinkedInJobResult[];
  roleQuery: string;
  location: string;
  totalFound: number;
  directSearchUrl: string;
}> {
  const role = options.roleQuery.trim() || "SDET";
  const loc = options.location?.trim() || "Bengaluru, Karnataka, India";
  const limit = options.limit || 25;
  const effectiveResume = resumeText.trim() || DEFAULT_SDET_RESUME;

  // Direct web search URL on LinkedIn for users who want to view in browser
  const directSearchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
    role,
  )}&location=${encodeURIComponent(loc)}${options.remoteOnly ? "&f_WT=2" : ""}&f_TPR=r604800`;

  const results: LinkedInJobResult[] = [];

  try {
    const encodedRole = encodeURIComponent(role);
    const encodedLoc = encodeURIComponent(loc);
    let guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodedRole}&location=${encodedLoc}&start=0`;
    if (options.remoteOnly) {
      guestUrl += "&f_WT=2";
    }

    const res = await fetch(guestUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $("li").each((_, li) => {
        if (results.length >= limit) return false;
        const $li = $(li);
        const title = $li.find(".base-search-card__title").text().trim();
        const company = $li.find(".base-search-card__subtitle").text().trim();
        const location = $li.find(".job-search-card__location").text().trim();
        const rawLink = $li.find("a.base-card__full-link").attr("href") || "";
        const time =
          $li.find("time").attr("datetime") || $li.find("time").text().trim() || "Recently posted";

        if (title && company) {
          // Clean tracking params from LinkedIn URL
          const cleanLink = rawLink.split("?")[0] || rawLink;
          const id =
            $li.find(".base-card").attr("data-entity-urn")?.replace("urn:li:jobPosting:", "") ||
            Buffer.from(`${company}-${title}`).toString("hex").slice(0, 16);

          const ats = computeATSScore(
            effectiveResume,
            title,
            `${title} at ${company} in ${location}`,
          );

          results.push({
            id,
            title,
            company,
            location: location || loc,
            url: cleanLink || directSearchUrl,
            postedTime: time,
            score: Math.max(0, Math.min(100, Math.round(ats.score))),
            scoreSummary: ats.summary,
            matchedSkills: ats.matched,
            missingSkills: ats.missing,
          });
        }
      });
    }
  } catch (err) {
    console.warn("LinkedIn guest job search error:", err);
  }

  // Sort by ATS score descending
  results.sort((a, b) => b.score - a.score);

  return {
    jobs: results,
    roleQuery: role,
    location: loc,
    totalFound: results.length,
    directSearchUrl,
  };
}

/**
 * Analyzes candidate's LinkedIn profile and resume using AI and deterministic heuristics.
 * Identifies core skills, years of experience, target role alignment, and custom fit insights.
 */
export async function analyzeLinkedInProfile(params: {
  profileUrl?: string;
  profileText?: string;
  existingResume?: string;
}): Promise<LinkedInProfileData> {
  const profileUrl = (params.profileUrl || "").trim();
  const rawText = (params.profileText || "").trim();
  const existingResume = (params.existingResume || "").trim();
  const combinedContext =
    [rawText, existingResume].filter(Boolean).join("\n\n") || DEFAULT_SDET_RESUME;

  // Attempt AI extraction via Gemini if key is available
  const apiKey = process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
  if (apiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });

      const prompt = `You are an elite executive talent recruiter and career architect.
Analyze this candidate's LinkedIn profile and resume data to evaluate their career profile and match them to open roles.

Candidate LinkedIn URL: ${profileUrl || "Not provided"}
Profile & Resume Data:
${combinedContext.slice(0, 10000)}

Perform a deep analysis:
1. Extract candidate's authentic Name, Headline, Location, Current/Most Recent Title, Current Company, and estimated total Years of Experience.
2. Identify their Top Technical Skills & Frameworks (e.g. Java, Python, Selenium, Playwright, RestAssured, CI/CD, etc.).
3. Identify 4-5 Target Roles they are ideally qualified to look for (e.g. "Senior SDET", "QA Automation Engineer", "Lead QA", "Automation Architect").
4. For their top 3 target roles, calculate estimated match score (70-98%), list exact strengths, missing keywords, and strategic interview advice.
5. Provide a polished, high-impact Formatted Resume (Markdown format) that seamlessly incorporates their LinkedIn headline, experience highlights, and technical skill matrix.

Return ONLY a valid JSON object matching this exact schema:
{
  "name": "string",
  "headline": "string",
  "location": "string",
  "currentTitle": "string",
  "currentCompany": "string",
  "yearsExperience": number,
  "topSkills": ["string"],
  "targetRoles": ["string"],
  "summary": "string",
  "roleFitInsights": [
    {
      "role": "string",
      "matchScore": number,
      "strengths": ["string"],
      "missingKeywords": ["string"],
      "advice": "string"
    }
  ],
  "formattedResume": "string"
}`;

      const models = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
      for (const m of models) {
        try {
          const resp = await Promise.race([
            ai.models.generateContent({
              model: m,
              contents: prompt,
              config: { responseMimeType: "application/json" },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("AI call timeout")), 4000),
            ),
          ]);
          const raw = resp.text?.trim() || "";
          let clean = raw;
          if (clean.startsWith("```")) {
            clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          }
          const parsed = JSON.parse(clean);
          if (parsed && parsed.name && Array.isArray(parsed.topSkills)) {
            return {
              name: parsed.name,
              headline: parsed.headline || "Senior QA Automation Engineer / SDET",
              location: parsed.location || "Bengaluru, India",
              currentTitle: parsed.currentTitle || "Senior SDET",
              currentCompany: parsed.currentCompany || "",
              yearsExperience: Number(parsed.yearsExperience) || 6,
              topSkills: parsed.topSkills,
              targetRoles: parsed.targetRoles?.length
                ? parsed.targetRoles
                : ["SDET", "QA Automation", "Lead QA"],
              summary: parsed.summary || "",
              roleFitInsights: Array.isArray(parsed.roleFitInsights) ? parsed.roleFitInsights : [],
              formattedResume: parsed.formattedResume || combinedContext,
            };
          }
        } catch {
          // try next model or fallback
        }
      }
    } catch (e) {
      console.warn("AI LinkedIn analysis error:", e);
    }
  }

  // Deterministic fallback
  const skillsDetected = [
    "Java",
    "Python",
    "Selenium",
    "Playwright",
    "Cypress",
    "RestAssured",
    "Postman",
    "Appium",
    "Cucumber",
    "TestNG",
    "JUnit",
    "CI/CD",
    "Jenkins",
    "Docker",
    "Kubernetes",
    "AWS",
    "Git",
    "SQL",
  ].filter((s) => new RegExp(`\\b${s}\\b`, "i").test(combinedContext));

  const targetRoles = ["SDET", "QA Automation Engineer", "Lead QA", "Senior Quality Engineer"];

  const roleFitInsights = targetRoles.slice(0, 3).map((role) => {
    const sc = computeATSScore(combinedContext, role, `${role} test automation framework lead`);
    return {
      role,
      matchScore: Math.max(75, Math.min(96, Math.round(sc.score))),
      strengths: sc.matched.slice(0, 5),
      missingKeywords: sc.missing.slice(0, 3),
      advice: `Emphasize hands-on experience in ${sc.matched.slice(0, 3).join(", ")} and architecture design for ${role}.`,
    };
  });

  // Extract structured experience & skill taxonomy via LinkedIn service
  const serviceProfile = await scrapeAndParseLinkedInProfile({
    profileUrl,
    rawText,
    existingResume,
  });

  return {
    name: serviceProfile.name || "Akhil Bhadran",
    headline: serviceProfile.headline || "Senior SDET / QA Automation Engineer | Bengaluru, India",
    location: serviceProfile.location || "Bengaluru, Karnataka, India",
    currentTitle: serviceProfile.currentTitle || "Senior SDET",
    currentCompany: serviceProfile.currentCompany || "",
    yearsExperience: serviceProfile.totalExperienceYears || 6,
    topSkills: serviceProfile.skills.all.length
      ? serviceProfile.skills.all.slice(0, 18)
      : skillsDetected,
    targetRoles: serviceProfile.suggestedTargetRoles.map((r) => r.role),
    summary:
      serviceProfile.about ||
      "Results-driven Senior QA Automation Engineer / SDET with extensive experience in automated framework architecture, web & mobile testing, API automation, and CI/CD pipelines.",
    roleFitInsights: serviceProfile.suggestedTargetRoles.map((r) => ({
      role: r.role,
      matchScore: r.fitScore,
      strengths: r.matchedSkills,
      missingKeywords: r.missingSkills,
      advice: r.recommendedAdvice,
    })),
    formattedResume: serviceProfile.formattedResume || combinedContext,
    experience: serviceProfile.experience,
    categorizedSkills: serviceProfile.skills,
  };
}
