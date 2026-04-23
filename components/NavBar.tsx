"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Compass,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    async function loadRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      setRole(profile?.role ?? "");
    }

    loadRole();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const primaryLinks = [
    {
      href: "/dashboard",
      label: "Dashboard",
      description: "Home screen and workflow overview",
      icon: LayoutDashboard,
    },
    {
      href: "/import",
      label: "Product Import",
      description: "Upload product and menu files",
      icon: FileSpreadsheet,
    },
    {
      href: "/inventory-import",
      label: "Inventory Import",
      description: "Update counts and review unmatched rows",
      icon: Warehouse,
    },
  ];

  const secondaryLinks = [
    { href: "/inventory", label: "Inventory" },
    { href: "/orders", label: "Orders" },
    { href: "/order-history", label: "Order History" },
    ...(role === "manager" || role === "admin"
      ? [{ href: "/approvals", label: "Approvals" }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-3 rounded-full border border-border/80 bg-card/90 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-foreground uppercase shadow-sm transition hover:border-foreground/20 hover:bg-card"
            >
              <Compass className="size-4" />
              Pure Aloha Ordering
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              Dashboard, imports, inventory, and order review stay one click away.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            {role ? (
              <div className="inline-flex items-center rounded-full border border-border/80 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Role: {role}
              </div>
            ) : null}
            <button
              onClick={signOut}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-4" />
              Log Out
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-[1.75rem] border border-border/80 bg-card/75 p-3 shadow-sm sm:p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  Primary Navigation
                </p>
                <p className="text-sm text-muted-foreground">
                  Move between the dashboard and both import workspaces without getting stuck on a page.
                </p>
              </div>

              <nav
                className="grid gap-2 sm:grid-cols-3 lg:min-w-[620px]"
                aria-label="Primary navigation"
              >
                {primaryLinks.map((link) => {
                  const active = isActivePath(pathname, link.href);
                  const Icon = link.icon;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                        active
                          ? "border-foreground bg-foreground text-background shadow-lg shadow-foreground/10"
                          : "border-border bg-background/85 text-foreground hover:border-foreground/20 hover:bg-muted/60"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{link.label}</div>
                        <div
                          className={cn(
                            "text-xs",
                            active ? "text-background/80" : "text-muted-foreground"
                          )}
                        >
                          {link.description}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-xl border transition",
                          active
                            ? "border-background/20 bg-background/10 text-background"
                            : "border-border bg-card text-foreground group-hover:border-foreground/15"
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          <nav
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
            aria-label="Secondary navigation"
          >
            {secondaryLinks.map((link) => {
              const active = isActivePath(pathname, link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-2 py-1 transition",
                    active
                      ? "bg-muted/70 font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
