import dns from "node:dns";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scanTrackedCompany, scoreJobs, findCareersUrl } from "./scan.server";
import { computeATSScore } from "./ats-score";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // ignore
}

export const scanCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ trackedId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const r = await scanTrackedCompany(context.supabase, context.userId, data.trackedId);
      return { ok: true as const, ...r };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

const DEFAULT_SDET_RESUME = `Akhil Bhadran
Senior SDET / QA Automation Engineer | Bengaluru, India
Email: Akhird06@gmail.com

SUMMARY:
Results-driven Senior QA Automation Engineer / SDET with 6+ years of experience in designing, building, and maintaining scalable test automation frameworks for web, mobile, and distributed microservices. Expert in Java, Python, Selenium, Playwright, Cypress, RestAssured, and CI/CD pipelines.

TECHNICAL SKILLS:
- Languages: Java, Python, TypeScript, JavaScript, SQL
- Automation & Testing: Selenium WebDriver, Playwright, Cypress, RestAssured, Postman, Appium, Cucumber (BDD), TestNG, JUnit
- Architecture & APIs: REST APIs, Microservices, Distributed Systems, GraphQL, Kafka, JSON
- CI/CD & DevOps: Jenkins, GitHub Actions, GitLab CI, Docker, Kubernetes, AWS, Git, Linux
- Methodologies: Page Object Model (POM), BDD, TDD, Agile/Scrum, Performance Testing (JMeter), Root Cause Analysis, Regression Testing`;

export const rescoreJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: job } = await db.from("jobs").select("*").eq("id", data.jobId).single();
    const { data: s } = await db
      .from("user_settings")
      .select("resume_text")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!job) throw new Error("Job not found");

    const resumeToUse = s?.resume_text?.trim() || DEFAULT_SDET_RESUME;
    const r = computeATSScore(resumeToUse, job.title, job.description);
    const updatedScore = Math.max(0, Math.min(100, Math.round(r.score)));
    await db
      .from("jobs")
      .update({
        score: updatedScore,
        score_summary: r.summary,
        matched_skills: r.matched,
        missing_skills: r.missing,
      })
      .eq("id", job.id);
    return {
      score: updatedScore,
      summary: r.summary,
      matched: r.matched,
      missing: r.missing,
    };
  });

export const rescoreAllJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data: s } = await db
      .from("user_settings")
      .select("resume_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    const resumeToUse = s?.resume_text?.trim() || DEFAULT_SDET_RESUME;

    // Fetch all jobs in the database
    const { data: allJobs, error } = await db
      .from("jobs")
      .select("id, title, description")
      .order("first_seen_at", { ascending: false });

    if (error || !allJobs?.length) return { scored: 0, total: 0 };

    let updated = 0;
    const batchSize = 40;
    for (let i = 0; i < allJobs.length; i += batchSize) {
      const chunk = allJobs.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (j) => {
          const sc = computeATSScore(resumeToUse, j.title, j.description);
          await db
            .from("jobs")
            .update({
              score: sc.score,
              score_summary: sc.summary,
              matched_skills: sc.matched,
              missing_skills: sc.missing,
            })
            .eq("id", j.id);
          updated++;
        }),
      );
    }

    return { scored: updated, total: allJobs.length };
  });

export const tailorResumeForJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: job } = await db
      .from("jobs")
      .select("*, companies(name)")
      .eq("id", data.jobId)
      .single();
    if (!job) throw new Error("Job not found");

    const { data: s } = await db
      .from("user_settings")
      .select("resume_text")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!s?.resume_text?.trim()) {
      throw new Error("Please upload or paste your resume in Settings first");
    }

    const { getGeminiClient, getValidGeminiApiKey } =
      await import("./canonical-career-search.server");
    if (!getValidGeminiApiKey()) {
      throw new Error(
        "A Gemini API key is required to tailor resumes with AI. Please configure your key in Settings > Secrets.",
      );
    }
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error(
        "Could not initialize AI client. Please ensure your Gemini API key is set in Settings > Secrets.",
      );
    }

    const companyName = (job.companies as { name?: string } | null)?.name || "Company";
    const missing = job.missing_skills?.length
      ? job.missing_skills.join(", ")
      : "relevant technical skills and frameworks";

    const prompt = `You are a principal technical recruiter and expert resume architect.

TARGET ROLE:
Title: ${job.title}
Company: ${companyName}
Location: ${job.location || "Remote/India"}
Job Description:
${job.description || "General technical responsibilities"}

MISSING ATS SKILLS & KEYWORDS DETECTED:
${missing}

CANDIDATE'S ACTUAL BASE RESUME:
${s.resume_text}

MISSION:
Rebuild and tailor this candidate's resume to achieve a 95%+ ATS match score specifically for this role at ${companyName}.

CRITICAL DEFENSE & AUTHENTICITY DIRECTIVES (USER REQUIREMENT - MUST STRICTLY OBEY):
1. REALISTIC & 100% INTERVIEW-DEFENSIBLE:
   - Base the tailored resume ONLY on the candidate's authentic career experience and actual roles.
   - Do NOT invent fake employers, fabricated titles, or fictitious degrees.
   - Do NOT make wild, exaggerated claims that the candidate cannot defend in a deep technical interview.
2. REFRAME REAL ADJACENT EXPERIENCE INTO TARGET KEYWORDS:
   - For missing keywords, highlight the candidate's genuine adjacent work (e.g. if the missing skill is RestAssured and they have API automation/HTTP testing, describe their API automation architecture and integration testing; if missing Python, highlight scripting/automation principles; if missing CI/CD, highlight their pipeline integration with Jenkins/GitLab).
3. EMBED MISSING KEYWORDS NATURALLY:
   - Weave the missing keywords (${missing}) into the candidate's summary, technical skill matrix, and project bullet points with realistic quantifiable achievements (e.g., test coverage, execution time, defect detection).
4. INTERVIEW DEFENSE TALKING POINTS:
   - Provide concrete, interview-ready scripts for every key skill or tool that was emphasized, explaining exactly how the candidate can truthfully answer in a technical interview without feeling awkward or exaggerating.

Return ONLY a valid JSON object matching this schema:
{
  "projected_score": 96,
  "summary_of_changes": "A concise 2-sentence explanation of how the resume was strengthened and tailored while staying 100% defensible based on their real background.",
  "missing_skills_addressed": ["skill1", "skill2"],
  "interview_talking_points": [
    {
      "topic": "Skill/Keyword (e.g. RestAssured / API Automation)",
      "defense": "Truthful, confident script for how candidate should explain their experience in the interview."
    }
  ],
  "tailored_resume": "The complete, polished, ready-to-use resume text formatted with clean headings, summary, skills, experience, and education."
}`;

    const models = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        });

        const raw = response.text?.trim() || "";
        let clean = raw;
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        }
        const parsed = JSON.parse(clean);
        return {
          ok: true as const,
          jobTitle: job.title,
          companyName,
          originalScore: job.score,
          projectedScore: Math.max(95, Math.min(99, parsed.projected_score || 96)),
          summaryOfChanges:
            parsed.summary_of_changes ||
            "Optimized keyword density and reframed project achievements for 100% interview defensibility.",
          missingSkillsAddressed: parsed.missing_skills_addressed || job.missing_skills || [],
          interviewTalkingPoints: (parsed.interview_talking_points || []) as {
            topic: string;
            defense: string;
          }[],
          tailoredResume: parsed.tailored_resume || s.resume_text,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("API key not valid") ||
          msg.includes("API_KEY_INVALID") ||
          msg.includes("400") ||
          msg.includes("403")
        ) {
          throw new Error(
            "Your Gemini API key is invalid or not authorized. Please check your key in Settings > Secrets.",
          );
        }
        console.warn(`Tailor resume model ${model} error:`, msg);
      }
    }

    throw new Error("Could not tailor resume at this time. Please try again.");
  });

// Helper to check if a URL is likely a specific career page vs just a main home page
function isCareerUrl(url: string | undefined): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  // Ignore naive /careers or /career appends that fail
  if (url.endsWith("/careers") || url.endsWith("/career") || url.endsWith("/carrer")) return false;
  return /\b(greenhouse|lever|ashby|smartrecruiters|workday)\b/i.test(url);
}

// Uses Gemini AI to locate genuine career pages instead of appending /careers
async function findCareerPage(
  companyName: string,
  domainUrl?: string,
): Promise<string | undefined> {
  const url = await findCareersUrl(companyName, domainUrl);
  return url || undefined;
}

export const locateCareersForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ companyId: z.string().uuid(), companyName: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { updateCompanyWithCanonicalUrl } = await import("./canonical-career-search.server");
    const res = await updateCompanyWithCanonicalUrl(
      context.supabase,
      data.companyId,
      data.companyName,
    );
    if (res.updated && res.newUrl) {
      return { ok: true as const, url: res.newUrl, reason: res.reason, source: res.source };
    }
    return {
      ok: false as const,
      error:
        res.reason ||
        `Could not locate a verified direct careers portal for "${data.companyName}". Please enter the direct URL manually.`,
    };
  });

export const searchAndUpdateCompanyCareerUrlFn = locateCareersForCompany;

export const batchUpdateCompaniesFromSearchApiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        forceAll: z.boolean().optional(),
        companyIds: z.array(z.string().uuid()).optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { autoUpdateCompaniesWithGenericUrls } = await import("./canonical-career-search.server");
    return autoUpdateCompaniesWithGenericUrls(context.supabase, {
      forceAll: data?.forceAll,
      companyIds: data?.companyIds,
    });
  });

export const validateCompanyCareerUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ url: z.string().optional(), companyName: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { validateCareerUrl, resolveDirectCareerUrl } =
      await import("./validate-career-url.server");
    const result = await validateCareerUrl(data.url, data.companyName);
    let resolvedUrl: string | null = null;
    if ((result.isGenericSearch || !result.isValid) && data.companyName) {
      const res = await resolveDirectCareerUrl(data.companyName, null);
      if (res.isValid && res.url) {
        resolvedUrl = res.url;
      }
    }
    return {
      ...result,
      resolvedUrl,
    };
  });

export const auditAndCleanCompanyUrlsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { auditAndCleanCompanyUrls } = await import("./validate-career-url.server");
    return auditAndCleanCompanyUrls(context.supabase);
  });

const rowsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      careers_url: z.string().url().max(500).optional(),
    }),
  )
  .max(500);

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

async function importRows(db: DB, userId: string, rows: z.infer<typeof rowsSchema>) {
  const { validateCareerUrl, resolveDirectCareerUrl } =
    await import("./validate-career-url.server");
  const { data: all } = await db.from("companies").select("id, name, careers_url");
  const byName = new Map<string, { id: string; careers_url: string | null }>(
    (all ?? []).map((c: { id: string; name: string; careers_url: string | null }) => [
      c.name.toLowerCase(),
      c,
    ]),
  );
  let created = 0;
  const ids: string[] = [];

  for (const r of rows) {
    const key = r.name.toLowerCase();
    let validCareersUrl: string | null = null;

    if (r.careers_url) {
      const check = await validateCareerUrl(r.careers_url, r.name);
      if (check.isValid && !check.isGenericSearch && !check.isAggregator) {
        validCareersUrl = check.normalizedUrl;
      } else if (check.isGenericSearch) {
        // If user mistakenly provided a Google search link, attempt auto-resolution to genuine portal
        const resolved = await resolveDirectCareerUrl(r.name, null);
        validCareersUrl = resolved.isValid ? resolved.url : null;
      }
    }

    let c = byName.get(key);
    if (!c) {
      const { data: ins, error } = await db
        .from("companies")
        .insert({
          name: r.name,
          careers_url: validCareersUrl,
          category: "Added by me",
          created_by: userId,
        })
        .select("id, careers_url")
        .single();
      if (error) continue;
      c = ins;
      byName.set(key, ins);
      created++;
    } else if (validCareersUrl && !c.careers_url) {
      await db.from("companies").update({ careers_url: validCareersUrl }).eq("id", c.id);
    }
    if (c) ids.push(c.id);
  }

  const unique = [...new Set(ids)];
  if (unique.length) {
    await db.from("tracked_companies").upsert(
      unique.map((company_id) => ({ user_id: userId, company_id })),
      {
        onConflict: "user_id,company_id",
        ignoreDuplicates: true,
      },
    );
  }
  return { tracked: unique.length, created };
}

export const importCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ url: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const sheetMatch = data.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetMatch) throw new Error("That doesn't look like a valid Google Sheets link");
    const spreadsheetId = sheetMatch[1];

    const gidMatch = data.url.match(/[?&#]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : "0";

    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;

    const res = await fetch(csvUrl);
    if (!res.ok) {
      throw new Error(
        "Could not fetch the sheet. Make sure sharing is set to 'Anyone with the link can view'.",
      );
    }

    const csvText = await res.text();

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const lines = csvText
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map(parseCsvLine);

    if (lines.length < 3) return { tracked: 0, created: 0 };

    // Explicitly target Row 3 onwards (index 2), Column A (index 0) for names, Column B (index 1) for links
    const dataRows = lines.slice(2);

    const parsedRows = await Promise.all(
      dataRows.map(async (r) => {
        const name = String(r[0] ?? "").trim();
        const rawLink = String(r[1] ?? "").trim();

        if (!name || name.length === 0) return null;

        let finalCareerUrl: string | undefined;

        if (isCareerUrl(rawLink)) {
          finalCareerUrl = rawLink;
        } else {
          finalCareerUrl = await findCareerPage(
            name,
            /^https?:\/\//i.test(rawLink) ? rawLink : undefined,
          );
        }

        return {
          name,
          careers_url:
            finalCareerUrl && /^https?:\/\//i.test(finalCareerUrl) ? finalCareerUrl : undefined,
        };
      }),
    );

    const validRows = parsedRows.filter(
      (r): r is { name: string; careers_url?: string } => r !== null,
    );

    return importRows(context.supabase, context.userId, rowsSchema.parse(validRows.slice(0, 500)));
  });

// Export aliases to satisfy both import naming conventions across files
export const importFromSheet = importCompanies;

/**
 * Server-side resume document parser.
 * Handles PDF fonts, Type 1/TrueType font tables, Word DOCX documents, and UTF-8 text.
 * Strips non-printable control characters, font stream glyph bytes, and binary artifacts
 * so resumes render crisply as human-readable text without icon symbols.
 */
export const parseUploadedResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        fileBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.fileBase64, "base64");
    const name = data.fileName.toLowerCase();
    let text = "";

    const isPdf = name.endsWith(".pdf") || buffer.slice(0, 4).toString() === "%PDF";
    const isDocx =
      name.endsWith(".docx") ||
      name.endsWith(".doc") ||
      buffer.slice(0, 4).toString() === "PK\x03\x04";

    if (isPdf) {
      try {
        const pdfModule = (await import("pdf-parse")) as {
          PDFParse?: new (opts: { data: Buffer }) => {
            getText: () => Promise<{ text?: string; pages?: { text?: string }[] } | string>;
          };
          default?: (b: Buffer) => Promise<{ text?: string }>;
        };
        const PDFParseClass = pdfModule.PDFParse;
        if (typeof PDFParseClass === "function") {
          const parser = new PDFParseClass({ data: buffer });
          const res = await parser.getText();
          if (typeof res === "string") {
            text = res;
          } else if (res && typeof res.text === "string") {
            text = res.text;
          } else if (res?.pages && Array.isArray(res.pages)) {
            text = res.pages.map((p) => p?.text || "").join("\n\n");
          }
        } else if (typeof pdfModule.default === "function") {
          const res = await pdfModule.default(buffer);
          text = res?.text || "";
        }
      } catch (err) {
        console.warn("PDF parser error:", err);
      }
    } else if (isDocx) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } catch (err) {
        console.warn("Mammoth parser error:", err);
      }
    }

    if (!text) {
      // Decode as utf-8 string for txt, md, etc.
      text = buffer.toString("utf-8");
    }

    // Clean font glyphs, binary artifacts, private use area icons (FontAwesome/Wingdings), non-printable control codes
    /* eslint-disable no-control-regex */
    const cleanText = text
      .replace(/[\uE000-\uF8FF]/g, " ")
      .replace(/[\uFFF0-\uFFFF]/g, " ")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
      .replace(/\uFB01/g, "fi")
      .replace(/\uFB02/g, "fl")
      .replace(/\uFB03/g, "ffi")
      .replace(/\uFB04/g, "ffl")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[\u2022\u25CF\u25CB\u25AA\u25AB\u2023]/g, "•")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    /* eslint-enable no-control-regex */

    return { text: cleanText, characterCount: cleanText.length };
  });

export const validateActiveJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { validateAndPruneJobsServer } = await import("./validate-job-url.server");
    const summary = await validateAndPruneJobsServer(context.supabase, {
      userId: context.userId,
      pruneImmediately: true,
    });
    return summary;
  });

export const searchLinkedInJobsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        roleQuery: z.string().default("SDET"),
        location: z.string().optional(),
        remoteOnly: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("user_settings")
      .select("resume_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { searchLinkedInJobs } = await import("./linkedin.server");
    return searchLinkedInJobs(s?.resume_text || "", {
      roleQuery: data.roleQuery,
      location: data.location,
      remoteOnly: data.remoteOnly,
    });
  });

export const analyzeLinkedInProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        profileUrl: z.string().optional(),
        profileText: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("user_settings")
      .select("resume_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { analyzeLinkedInProfile } = await import("./linkedin.server");
    return analyzeLinkedInProfile({
      profileUrl: data.profileUrl,
      profileText: data.profileText,
      existingResume: s?.resume_text || "",
    });
  });

export const scrapeLinkedInProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        profileUrl: z.string().optional(),
        rawText: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("user_settings")
      .select("resume_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { scrapeAndParseLinkedInProfile } = await import("./linkedin-service");
    return scrapeAndParseLinkedInProfile({
      profileUrl: data.profileUrl,
      rawText: data.rawText,
      existingResume: s?.resume_text || "",
    });
  });

export const evaluateProfileAgainstJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        jobTitle: z.string(),
        companyName: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        profileUrl: z.string().optional(),
        rawText: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("user_settings")
      .select("resume_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { scrapeAndParseLinkedInProfile, evaluateProfileAgainstJob } =
      await import("./linkedin-service");
    const profile = await scrapeAndParseLinkedInProfile({
      profileUrl: data.profileUrl,
      rawText: data.rawText,
      existingResume: s?.resume_text || "",
    });

    return evaluateProfileAgainstJob(profile, {
      title: data.jobTitle,
      company: data.companyName,
      description: data.description,
      location: data.location,
    });
  });

export const importLinkedInJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        title: z.string(),
        company: z.string(),
        url: z.string(),
        location: z.string().optional(),
        score: z.number().optional(),
        scoreSummary: z.string().optional(),
        matchedSkills: z.array(z.string()).optional(),
        missingSkills: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const userId = context.userId;

    const compName = data.company.trim();
    let companyId: string | null = null;
    const { data: existingComp } = await db
      .from("companies")
      .select("id")
      .ilike("name", compName)
      .maybeSingle();

    if (existingComp) {
      companyId = existingComp.id;
    } else {
      const { data: newComp, error: compErr } = await db
        .from("companies")
        .insert({
          name: compName,
          category: "Discovered on LinkedIn",
          created_by: userId,
        })
        .select("id")
        .single();
      if (!compErr && newComp) {
        companyId = newComp.id;
      }
    }

    if (!companyId) throw new Error("Could not register company for job");

    await db
      .from("tracked_companies")
      .upsert(
        { user_id: userId, company_id: companyId },
        { onConflict: "user_id,company_id", ignoreDuplicates: true },
      );

    const now = new Date().toISOString();
    const { data: existingJob } = await db
      .from("jobs")
      .select("id")
      .eq("company_id", companyId)
      .eq("title", data.title)
      .maybeSingle();

    if (existingJob) {
      await db
        .from("jobs")
        .update({
          url: data.url,
          location: data.location || null,
          score: data.score ?? null,
          score_summary: data.scoreSummary ?? null,
          matched_skills: data.matchedSkills ?? null,
          missing_skills: data.missingSkills ?? null,
          last_seen_at: now,
          status: "open",
        })
        .eq("id", existingJob.id);
      return { ok: true, jobId: existingJob.id, updated: true };
    }

    const { data: newJob, error: jobErr } = await db
      .from("jobs")
      .insert({
        company_id: companyId,
        title: data.title,
        url: data.url,
        location: data.location || null,
        description: `${data.title} at ${data.company} discovered via LinkedIn`,
        score: data.score ?? null,
        score_summary: data.scoreSummary ?? null,
        matched_skills: data.matchedSkills ?? null,
        missing_skills: data.missingSkills ?? null,
        status: "open",
        applied: false,
        first_seen_at: now,
        last_seen_at: now,
      })
      .select("id")
      .single();

    if (jobErr) throw new Error(jobErr.message);

    return { ok: true, jobId: newJob.id, created: true };
  });

export const syncLinkedInToResumeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        formattedResume: z.string(),
        targetRoles: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const userId = context.userId;

    const updatePayload: { resume_text: string; updated_at: string; role_keywords?: string[] } = {
      resume_text: data.formattedResume.slice(0, 20000),
      updated_at: new Date().toISOString(),
    };

    if (data.targetRoles && data.targetRoles.length > 0) {
      const { data: currentSettings } = await db
        .from("user_settings")
        .select("role_keywords")
        .eq("user_id", userId)
        .maybeSingle();

      const existing = currentSettings?.role_keywords || [];
      const merged = Array.from(new Set([...existing, ...data.targetRoles]));
      updatePayload.role_keywords = merged;
    }

    const { error } = await db.from("user_settings").update(updatePayload).eq("user_id", userId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });
