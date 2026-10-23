import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Job = Database["public"]["Tables"]["jobs"]["Row"] & {
  companies: Pick<Company, "name" | "careers_url" | "category"> | null;
};
export type Tracked = Database["public"]["Tables"]["tracked_companies"]["Row"] & {
  companies: Company | null;
};
export type Settings = Database["public"]["Tables"]["user_settings"]["Row"];

export async function getUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function loadSettings(): Promise<Settings> {
  const uid = await getUserId();
  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabase
    .from("user_settings")
    .insert({ user_id: uid })
    .select("*")
    .single();
  if (error) throw error;
  return created;
}

export function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** A role counts as remote when its location or description mentions remote / work from home. */
export function isRemote(j: { location: string | null; description?: string | null }) {
  return /remote|work from home|\bwfh\b|anywhere/i.test(
    `${j.location ?? ""} ${j.description ?? ""}`,
  );
}

/**
 * Resolves the direct, exact job posting URL for a role.
 * If the role already has a direct ATS requisition URL (e.g. Greenhouse /jobs/123, Lever /xyz,
/**
 * Resolves the direct job posting or company career portal URL for a role.
 * If the role has a direct ATS requisition URL or career link, returns that.
 * If fallback is needed, directly takes the candidate to the company's verified career home page where the role was found.
 * Never redirects to Google Search.
 */
export function getExactJobPostingUrl(j: {
  url: string;
  title: string;
  companies?: { name?: string; careers_url?: string | null } | null;
  location?: string | null;
}): string {
  if (!j) return "#";
  const rawUrl = (j.url || "").trim();
  const companyCareersUrl =
    (j.companies as { careers_url?: string | null } | null)?.careers_url?.trim() || "";

  // 1. If rawUrl is a valid link (not a google search)
  if (rawUrl && /^https?:\/\//i.test(rawUrl) && !rawUrl.includes("google.com/search")) {
    const cleanUrl = rawUrl.replace(/#job-\d+/i, "").trim();
    if (cleanUrl) return cleanUrl;
  }

  // 2. Return the company career home page where the job opening was found
  if (companyCareersUrl && /^https?:\/\//i.test(companyCareersUrl)) {
    return companyCareersUrl;
  }

  return rawUrl || "#";
}
