import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

const FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";
const AI_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export class PauseError extends Error {}

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const fc = process.env["FIRECRAWL_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!fc) throw new Error("FIRECRAWL_API_KEY is not configured");
  return { lovable, fc };
}

async function firecrawl(path: string, body: unknown) {
  const { lovable, fc } = keys();
  const res = await fetch(`${FIRECRAWL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": fc,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 402 || (res.status === 403 && /credit/i.test(text)))
      throw new PauseError(`Web reader out of credits [${res.status}]: ${text.slice(0, 200)}`);
    throw new Error(`Web reader failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as any;
}

export async function findCareersUrl(name: string): Promise<string | null> {
  const r = await firecrawl("/search", { query: `${name} careers jobs India`, limit: 5 });
  const list: any[] = r?.data?.web ?? r?.data ?? [];
  const hit =
    list.find((x) => /career|jobs|lever\.co|greenhouse|workday/i.test(x.url ?? "")) ?? list[0];
  return hit?.url ?? null;
}

export type ExtractedJob = {
  title: string;
  url: string;
  location: string;
  experience: string;
  description: string;
};

export async function extractJobs(careersUrl: string, keywords: string[]): Promise<ExtractedJob[]> {
  const kw = keywords.join(", ");
  const r = await firecrawl("/scrape", {
    url: careersUrl,
    onlyMainContent: false,
    waitFor: 3000,
    formats: [
      {
        type: "json",
        prompt: `This is a company careers / job listings page. Return every OPEN job posting whose title matches or is closely related to any of these roles: ${kw}. Prefer postings located in India or remote. For each give title, the absolute link to the posting (url), location, required experience if shown, and a short description (responsibilities/skills, max 600 chars). If none match, return an empty list.`,
        schema: {
          type: "object",
          properties: {
            jobs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  url: { type: "string" },
                  location: { type: "string" },
                  experience: { type: "string" },
                  description: { type: "string" },
                },
                required: ["title"],
              },
            },
          },
          required: ["jobs"],
        },
      },
    ],
  });
  const json = r?.data?.json ?? r?.json ?? {};
  const jobs: any[] = Array.isArray(json.jobs) ? json.jobs : [];
  return jobs
    .filter((j) => j && typeof j.title === "string" && j.title.trim())
    .slice(0, 40)
    .map((j) => {
      let url = careersUrl;
      try {
        url = j.url ? new URL(j.url, careersUrl).toString() : careersUrl;
      } catch {}
      // Keep jobs without a dedicated link unique
      if (url === careersUrl) url = `${careersUrl}#${encodeURIComponent(j.title.trim())}`;
      return {
        title: j.title.trim().slice(0, 200),
        url,
        location: (j.location ?? "").slice(0, 120),
        experience: (j.experience ?? "").slice(0, 80),
        description: (j.description ?? "").slice(0, 1200),
      };
    });
}

/** Streams a strict-JSON Responses call and returns the parsed object. */
async function aiJson<T>(instructions: string, input: string, schema: object): Promise<T> {
  const { lovable } = keys();
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovable}`,
      "Lovable-API-Key": lovable,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions,
      input,
      text: { format: { type: "json_schema", name: "result", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    if (res.status === 402 || res.status === 403)
      throw new PauseError(`AI unavailable [${res.status}]: ${text.slice(0, 200)}`);
    throw new Error(`AI request failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        if (ev.type === "response.failed" || ev.type === "error")
          throw new Error(`AI error: ${JSON.stringify(ev).slice(0, 300)}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("AI error")) throw e;
      }
    }
  }
  if (!out) throw new Error("AI returned no answer");
  return JSON.parse(out) as T;
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
  const r = await aiJson<{ scores: Score[] }>(
    "You are an ATS resume screener. For each job, score 0-100 how well the resume fits the job description (skills, tools, experience level). Give a one-sentence summary, up to 6 matched skills and up to 6 missing skills.",
    `RESUME:\n${resume.slice(0, 8000)}\n\nJOBS:\n${list}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["scores"],
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["index", "score", "summary", "matched", "missing"],
            properties: {
              index: { type: "integer" },
              score: { type: "integer" },
              summary: { type: "string" },
              matched: { type: "array", items: { type: "string" } },
              missing: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  );
  return r.scores ?? [];
}

/** Scans one tracked company for a user. `db` may be the user's client or admin. */
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
  const keywords = settings?.role_keywords?.length ? settings.role_keywords : ["SDET"];
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
          if (e instanceof PauseError) throw e;
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
    // Roles we saw before that are no longer on the careers page are marked as closed.
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
