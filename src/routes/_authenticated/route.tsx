import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Briefcase, Building2, Settings, LogOut, Radar, FileCheck2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: Shell,
});

const nav = [
  { to: "/jobs" as const, search: { tab: "open" }, label: "Roles", icon: Briefcase },
  { to: "/jobs" as const, search: { tab: "linkedin" }, label: "LinkedIn Match", icon: Sparkles },
  { to: "/applications" as const, search: undefined, label: "Applications", icon: FileCheck2 },
  { to: "/companies" as const, search: undefined, label: "Companies", icon: Building2 },
  { to: "/settings" as const, search: undefined, label: "Settings", icon: Settings },
];

function Shell() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/jobs" className="flex items-center gap-2 font-extrabold tracking-tight">
            <Radar className="h-5 w-5 text-primary" /> RoleRadar
          </Link>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.label}
                to={n.to}
                search={n.search}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{
                  className:
                    "rounded-md px-3 py-1.5 text-sm bg-accent text-accent-foreground font-medium",
                }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Sign out"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card md:hidden">
        {nav.map((n) => (
          <Link
            key={n.label}
            to={n.to}
            search={n.search}
            className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground"
            activeProps={{
              className:
                "flex flex-col items-center gap-1 py-2 text-[11px] text-primary font-medium",
            }}
          >
            <n.icon className="h-4 w-4" />
            <span className="truncate max-w-[64px]">{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
