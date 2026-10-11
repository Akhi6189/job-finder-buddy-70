import { createFileRoute } from "@tanstack/react-router";

const MAX_COMPANIES_PER_RUN = 25;

/** Current hour in India + slot key for "most recent scheduled hour within the last 2h". */
function dueSlot(hours: number[], now: Date) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const h = ist.getUTCHours();
  const day = ist.toISOString().slice(0, 10);
  for (const back of [0, 1]) {
    const hh = (h - back + 24) % 24;
    if (hours.includes(hh) && h - back >= 0) {
      const slotStartUtc = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hh) - 5.5 * 3600_000);
      return { key: `${day}-${hh}`, start: slotStartUtc };
    }
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/scheduled-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!request.headers.get("authorization")?.startsWith("Bearer "))
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { scanTrackedCompany, PauseError } = await import("@/lib/scan.server");
        const now = new Date();
        const { data: users } = await supabaseAdmin
          .from("user_settings")
          .select("*")
          .eq("schedule_enabled", true)
          .is("paused_reason", null);

        const summary: Record<string, unknown> = {};
        for (const s of users ?? []) {
          const slot = dueSlot(s.schedule_hours ?? [], now);
          if (!slot) continue;
          if (s.running_until && new Date(s.running_until) > now) continue; // single-flight

          const { data: pending } = await supabaseAdmin
            .from("tracked_companies")
            .select("id")
            .eq("user_id", s.user_id)
            .or(`last_checked_at.is.null,last_checked_at.lt.${slot.start.toISOString()}`)
            .limit(MAX_COMPANIES_PER_RUN);
          if (!pending?.length) continue;

          await supabaseAdmin
            .from("user_settings")
            .update({ running_until: new Date(now.getTime() + 15 * 60_000).toISOString(), last_scheduled_slot: slot.key })
            .eq("user_id", s.user_id);

          let done = 0;
          for (const t of pending) {
            try {
              await scanTrackedCompany(supabaseAdmin, s.user_id, t.id);
              done++;
            } catch (e) {
              if (e instanceof PauseError) {
                await supabaseAdmin.from("user_settings").update({ paused_reason: e.message }).eq("user_id", s.user_id);
                break;
              }
            }
          }
          await supabaseAdmin.from("user_settings").update({ running_until: null }).eq("user_id", s.user_id);
          summary[s.user_id] = done;
        }
        return Response.json({ ok: true, summary });
      },
    },
  },
});
