"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const supabase = createClient();
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
    { href: "/dashboard", label: "Dashboard" },
    { href: "/import", label: "Product Import" },
    { href: "/inventory-import", label: "Inventory Import" },
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
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-3 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm font-semibold tracking-[0.18em] text-foreground uppercase shadow-sm transition hover:border-foreground/20 hover:bg-card"
            >
              Pure Aloha
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              Navigate between the dashboard and import workflows without losing your place.
            </p>
          </div>

          <button
            onClick={signOut}
            className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Log Out
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <nav
            className="flex flex-wrap items-center gap-2"
            aria-label="Primary navigation"
          >
            {primaryLinks.map((link) => {
              const active = isActivePath(pathname, link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-foreground bg-foreground text-background shadow-lg shadow-foreground/10"
                      : "border-border bg-card text-foreground hover:border-foreground/20 hover:bg-muted/60"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

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
                    "transition",
                    active
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
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
