import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scanTrackedCompany, scoreJobs, findCareersUrl } from "./scan.server";

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
    if (!s?.resume_text?.trim()) throw new Error("Add your resume in Settings first");
    const [r] = await scoreJobs(s.resume_text, [job]);
    if (!r) throw new Error("Could not score this job");
    await db
      .from("jobs")
      .update({
        score: r.score,
        score_summary: r.summary,
        matched_skills: r.matched,
        missing_skills: r.missing,
      })
      .eq("id", job.id);
    return r;
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
    const url = await findCareersUrl(data.companyName);
    if (url) {
      await context.supabase
        .from("companies")
        .update({ careers_url: url })
        .eq("id", data.companyId);
      return { ok: true as const, url };
    }
    return { ok: false as const, error: "Could not locate careers page" };
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
    let c = byName.get(key);
    if (!c) {
      const { data: ins, error } = await db
        .from("companies")
        .insert({
          name: r.name,
          careers_url: r.careers_url ?? null,
          category: "Added by me",
          created_by: userId,
        })
        .select("id, careers_url")
        .single();
      if (error) continue;
      c = ins;
      byName.set(key, ins);
      created++;
    } else if (r.careers_url && !c.careers_url) {
      await db.from("companies").update({ careers_url: r.careers_url }).eq("id", c.id);
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
