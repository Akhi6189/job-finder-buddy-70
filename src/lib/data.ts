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
