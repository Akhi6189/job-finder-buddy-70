import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Briefcase, Building2, Settings, LogOut, Radar } from "lucide-react";
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
  { to: "/jobs", label: "Roles", icon: Briefcase },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

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
                key={n.to}
                to={n.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "rounded-md px-3 py-1.5 text-sm bg-accent text-accent-foreground font-medium" }}
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
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-card md:hidden">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground"
            activeProps={{ className: "flex flex-col items-center gap-1 py-2.5 text-xs text-primary font-medium" }}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
