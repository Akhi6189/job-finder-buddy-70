import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Job = Database["public"]["Tables"]["jobs"]["Row"] & {
  companies: Pick<Company, "name"> | null;
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
 * SmartRecruiters /xyz, Workday /job/xyz), returns that.
 * If the role has a generic portal root or anchor (#job-1), generates a precision direct search/deep-link URL
 * (e.g. Workday ?q=..., Uber ?query=..., Amazon /search?base_query=..., or Google Jobs deep link &ibp=htl;jobs)
 * so clicking it takes the candidate straight to the exact posting rather than a generic career profile.
 */
export function getExactJobPostingUrl(j: {
  url: string;
  title: string;
  companies?: { name?: string } | null;
  location?: string | null;
}): string {
  if (!j || !j.url) return "#";
  const rawUrl = j.url.trim();
  const company = j.companies?.name?.trim() || "";
  // Strip company prefix from title if present (e.g., "Uber — Senior QA" -> "Senior QA")
  const cleanTitle = j.title.replace(new RegExp(`^${company}\\s*[—–-]\\s*`, "i"), "").trim();

  // 1. If it's already a direct ATS job requisition URL without placeholder anchors
  const hasDirectRequisitionPath =
    /\/(jobs|job|posting|postings|requisitions|requisition|viewjob)\/[a-zA-Z0-9_\-.]{4,}/i.test(
      rawUrl,
    ) || /[?&]gh_jid=\d+/i.test(rawUrl);

  if (hasDirectRequisitionPath && !rawUrl.includes("#job-")) {
    return rawUrl;
  }

  // 2. Workday: inject exact query to direct to the specific posting in their CXS portal
  if (rawUrl.includes(".myworkdayjobs.com")) {
    const cleanBase = rawUrl.split("#")[0].split("?")[0];
    return `${cleanBase}?q=${encodeURIComponent(cleanTitle)}`;
  }

  // 3. Uber careers: direct filter to exact role title
  if (rawUrl.includes("uber.com/")) {
    return `https://www.uber.com/in/en/careers/list/?query=${encodeURIComponent(cleanTitle)}`;
  }

  // 4. Amazon jobs: direct search for exact title
  if (rawUrl.includes("amazon.jobs")) {
    return `https://www.amazon.jobs/en/search?base_query=${encodeURIComponent(cleanTitle)}`;
  }

  // 5. Microsoft careers: direct query
  if (rawUrl.includes("microsoft.com/")) {
    return `https://jobs.careers.microsoft.com/global/en/search?q=${encodeURIComponent(cleanTitle)}`;
  }

  // 6. Google careers: direct query
  if (rawUrl.includes("careers.google.com")) {
    return `https://careers.google.com/jobs/results/?q=${encodeURIComponent(cleanTitle)}`;
  }

  // 7. TCS careers: direct query
  if (rawUrl.includes("tcs.com")) {
    return `https://www.tcs.com/careers/search-jobs?keyword=${encodeURIComponent(cleanTitle)}`;
  }

  // 8. Infosys careers: direct query
  if (rawUrl.includes("infosys.com")) {
    return `https://career.infosys.com/joblist?keyword=${encodeURIComponent(cleanTitle)}`;
  }

  // 9. If rawUrl contains an anchor like #job-1, check if base is already a direct path
  const noHash = rawUrl.split("#")[0];
  if (noHash && hasDirectRequisitionPath) {
    return noHash;
  }

  // 10. Precision Google Jobs deep link (&ibp=htl;jobs) - opens the direct job posting modal on Google Jobs
  // with company name, job details, and "Apply on Company Site"
  const searchQuery = [company, cleanTitle, j.location, "career job posting"]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&ibp=htl;jobs`;
}
