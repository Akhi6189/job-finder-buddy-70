import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scanTrackedCompany, scoreJobs } from "./scan.server";

export const scanCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ trackedId: z.string().uuid() }).parse(d))
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
  .inputValidator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: job } = await db.from("jobs").select("*").eq("id", data.jobId).single();
    const { data: s } = await db.from("user_settings").select("resume_text").eq("user_id", context.userId).maybeSingle();
    if (!job) throw new Error("Job not found");
    if (!s?.resume_text?.trim()) throw new Error("Add your resume in Settings first");
    const [r] = await scoreJobs(s.resume_text, [job]);
    if (!r) throw new Error("Could not score this job");
    await db
      .from("jobs")
      .update({ score: r.score, score_summary: r.summary, matched_skills: r.matched, missing_skills: r.missing })
      .eq("id", job.id);
    return r;
  });

const rowsSchema = z
  .array(z.object({ name: z.string().trim().min(1).max(120), careers_url: z.string().url().max(500).optional() }))
  .max(500);

async function importRows(db: any, userId: string, rows: z.infer<typeof rowsSchema>) {
  const { data: all } = await db.from("companies").select("id, name, careers_url");
  const byName = new Map<string, { id: string; careers_url: string | null }>(
    (all ?? []).map((c: any) => [c.name.toLowerCase(), c]),
  );
  let created = 0;
  const ids: string[] = [];
  for (const r of rows) {
    const key = r.name.toLowerCase();
    let c = byName.get(key);
    if (!c) {
      const { data: ins, error } = await db
        .from("companies")
        .insert({ name: r.name, careers_url: r.careers_url ?? null, category: "Added by me", created_by: userId })
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
  if (unique.length)
    await db
      .from("tracked_companies")
      .upsert(unique.map((company_id) => ({ user_id: userId, company_id })), {
        onConflict: "user_id,company_id",
        ignoreDuplicates: true,
      });
  return { tracked: unique.length, created };
}

export const importCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rows: rowsSchema }).parse(d))
  .handler(async ({ data, context }) => importRows(context.supabase, context.userId, data.rows));

export const importFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const m = data.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) throw new Error("That doesn't look like a Google Sheets link");
    const lovable = process.env["LOVABLE_API_KEY"];
    const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
    if (!lovable || !sheetsKey) throw new Error("Google Sheets is not connected");
    const headers = { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": sheetsKey };
    const base = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${m[1]}`;
    const meta = await fetch(`${base}?fields=sheets.properties.title`, { headers });
    if (!meta.ok) throw new Error(`Google Sheets error [${meta.status}]: ${(await meta.text()).slice(0, 200)}`);
    const title = ((await meta.json()) as any).sheets?.[0]?.properties?.title ?? "Sheet1";
    const range = `'${title.replace(/'/g, "''")}'!A1:Z1000`;
    const res = await fetch(`${base}/values/${range}`, { headers });
    if (!res.ok) throw new Error(`Google Sheets error [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    const values: string[][] = ((await res.json()) as any).values ?? [];
    if (!values.length) return { tracked: 0, created: 0 };
    const head = values[0].map((h) => String(h ?? "").toLowerCase());
    let nameCol = head.findIndex((h) => h.includes("company") || h === "name");
    const urlCol = head.findIndex((h) => /career|link|url|website/.test(h));
    const hasHeader = nameCol >= 0;
    if (nameCol < 0) nameCol = 0;
    const rows = values
      .slice(hasHeader ? 1 : 0)
      .map((r) => {
        const name = String(r[nameCol] ?? "").trim();
        const u = urlCol >= 0 ? String(r[urlCol] ?? "").trim() : "";
        return { name, careers_url: /^https?:\/\//.test(u) ? u : undefined };
      })
      .filter((r) => r.name);
    return importRows(context.supabase, context.userId, rowsSchema.parse(rows.slice(0, 500)));
  });
