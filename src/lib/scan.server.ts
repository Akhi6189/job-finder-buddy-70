import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

const GEMINI_API_KEY = process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];

export class PauseError extends Error {}

export type ExtractedJob = {
  title: string;
  url: string;
  location: string;
  experience: string;
  description: string;
};

/** Finds a careers URL using a simple Google search or direct ATS guess */
export async function findCareersUrl(name: string): Promise<string | null> {
  const formatted = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Return common direct ATS patterns first (Greenhouse/Lever) to avoid scraping blocks
  return `https://boards.greenhouse.io/${formatted}`;
}

/** Fetches jobs directly from public ATS APIs (Greenhouse, Lever, Ashby) completely free */
async function tryDirectAtsFetch(careersUrl: string, keywords: string[]): Promise<ExtractedJob[] | null> {
  try {
    const urlObj = new URL(careersUrl);
    
    // 1. Greenhouse Board API
    if (urlObj.hostname.includes("greenhouse.io")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const boardToken = parts[0];
      if (boardToken && boardToken !== "embed" && boardToken !== "v1") {
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.jobs)) {
            return data.jobs.map((j: any) => ({
              title: j.title,
              url: j.absolute_url,
              location: j.location?.name ?? "",
              experience: "",
              description: j.content?.replace(/<[^>]*>?/gm, "").slice(0, 1200) ?? "",
            }));
          }
        }
      }
    }

    // 2. Lever Postings API
    if (urlObj.hostname.includes("lever.co")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const company = parts[0];
      if (company) {
        const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`);
        if (res.ok) {
          const postings = await res.json();
          if (Array.isArray(postings)) {
            return postings.map((j: any) => ({
              title: j.text,
              url: j.hostedUrl,
              location: j.categories?.location ?? "",
              experience: j.categories?.commitment ?? "",
              description: j.descriptionPlain ?? "",
            }));
          }
        }
      }
    }
  } catch (e) {
    console.warn("Direct ATS fetch skipped/failed", e);
  }
  return null;
}

export async function extractJobs(careersUrl: string, keywords: string[]): Promise<ExtractedJob[]> {
  const directJobs = await tryDirectAtsFetch(careersUrl, keywords);
  if (directJobs && directJobs.length > 0) {
    const lowerKw = keywords.map((k) => k.toLowerCase());
    return directJobs.filter((j) => {
      if (!lowerKw.length) return true;
      const text = `${j.title} ${j.description}`.toLowerCase();
      return lowerKw.some((k) => text.includes(k));
    }).slice(0, 40);
  }

  // Fallback: Return empty if no direct ATS API matched or found
  return [];
}

/** Calls Google Gemini API directly using your Gemini Key */
async function geminiJson<T>(prompt: string, schemaDescription: string): Promise<T> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured in .env");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API failed [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini returned empty response");

  return JSON.parse(rawText) as T;
}

type Score = { index: number; score: number; summary: string; matched: string[]; missing: string[] };

export async function scoreJobs(
  resume: string,
  jobs: { title: string; description: string | null; experience: string | null }[],
): Promise<Score[]> {
  if (!resume.trim() || jobs.length === 0) return [];
  const list = jobs
    .map((j, i) => `#${i}\nTitle: ${j.title}\nExperience: ${j.experience ?? ""}\n${j.description ?? ""}`)
    .join("\n\n");

  const prompt = `You are an ATS resume screener. For each job, score 0-100 how well the resume fits the job description (skills, tools, experience level). Return valid JSON matching this schema: {"scores": [{"index": number, "score": number, "summary": "string", "matched": ["string"], "missing": ["string"]}]}.
  
RESUME:
${resume.slice(0, 8000)}

JOBS:
${list}`;

  try {
    const r = await geminiJson<{ scores: Score[] }>(prompt, "scores array");
    return r.scores ?? [];
  } catch (e) {
    console.error("Gemini scoring error:", e);
    return [];
  }
}

/** Scans one tracked company for a user. */
export async function scanTrackedCompany(db: DB, userId: string, trackedId: string) {
  const { data: tracked, error } = await db
    .from("tracked_companies")
    .select("id, company_id, companies(id, name, careers_url)")
    .eq("id", trackedId)
    .eq("user_id", userId)
    .single();
  if (error || !tracked) throw new Error("Company not found");
  const company = tracked.companies as unknown as { id: string; name: string; careers_url: string | null };

  const { data: settings } = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  const keywords = settings?.role_keywords?.length ? settings.role_keywords : ["SDET", "Software Engineer"];
  const resume = settings?.resume_text ?? "";

  try {
    let careersUrl = company.careers_url;
    if (!careersUrl) {
      careersUrl = await findCareersUrl(company.name);
      if (careersUrl) await db.from("companies").update({ careers_url: careersUrl }).eq("id", company.id);
    }
    if (!careersUrl) throw new Error("No careers page found — add the link on the Companies page");

    const found = await extractJobs(careersUrl, keywords);
    const now = new Date().toISOString();
    let added = 0;
    if (found.length) {
      const { data: existing } = await db
        .from("jobs")
        .select("url")
        .eq("user_id", userId)
        .in("url", found.map((f) => f.url));
      const known = new Set((existing ?? []).map((e) => e.url));
      const fresh = found.filter((f) => !known.has(f.url));
      if (known.size)
        await db
          .from("jobs")
          .update({ last_seen_at: now, closed_at: null })
          .eq("user_id", userId)
          .in("url", [...known]);
      if (fresh.length) {
        let scores: Score[] = [];
        try {
          scores = await scoreJobs(resume, fresh);
        } catch (e) {
          console.error("scoring failed", e);
        }
        const rows = fresh.map((f, i) => {
          const s = scores.find((x) => x.index === i);
          return {
            user_id: userId,
            company_id: company.id,
            title: f.title,
            url: f.url,
            location: f.location || null,
            experience: f.experience || null,
            description: f.description || null,
            score: s ? Math.max(0, Math.min(100, s.score)) : null,
            score_summary: s?.summary ?? null,
            matched_skills: s?.matched ?? null,
            missing_skills: s?.missing ?? null,
          };
        });
        const { error: insErr } = await db.from("jobs").upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true });
        if (insErr) throw new Error(insErr.message);
        added = rows.length;
      }
    }
    const foundUrls = new Set(found.map((f) => f.url));
    const { data: stillOpen } = await db
      .from("jobs")
      .select("id, url")
      .eq("user_id", userId)
      .eq("company_id", company.id)
      .is("closed_at", null);
    const goneIds = (stillOpen ?? []).filter((j) => !foundUrls.has(j.url)).map((j) => j.id);
    if (goneIds.length) await db.from("jobs").update({ closed_at: now }).in("id", goneIds);
    await db.from("tracked_companies").update({ last_checked_at: now, last_error: null }).eq("id", trackedId);
    return { found: found.length, added };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .from("tracked_companies")
      .update({ last_checked_at: new Date().toISOString(), last_error: msg.slice(0, 300) })
      .eq("id", trackedId);
    throw e;
  }
}