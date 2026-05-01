"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Box,
  Compass,
  FileSpreadsheet,
  Home,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";

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

  const canAccessImports = role === "manager" || role === "admin";

  const navigationLinks = [
    {
      href: "/",
      label: "Home",
      icon: Home,
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      href: "/inventory",
      label: "Inventory",
      icon: Box,
    },
    {
      href: "/orders",
      label: "Orders",
      icon: ShoppingCart,
    },
    ...(canAccessImports
      ? [
          {
            href: "/import",
            label: "Product Import",
            icon: FileSpreadsheet,
          },
          {
            href: "/inventory-import",
            label: "Inventory Import",
            icon: Warehouse,
          },
        ]
      : []),
  ];

  const utilityLinks = [
    { href: "/order-history", label: "Order History" },
    ...(canAccessImports
      ? [
          { href: "/approvals", label: "Approvals" },
          { href: "/admin/vendors", label: "Vendors" },
          { href: "/admin/credits-returns", label: "Credits & Returns" },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 text-card-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-3 rounded-full border border-border bg-muted px-4 py-2 text-sm font-semibold tracking-[0.08em] text-blue-600 uppercase shadow-sm transition hover:bg-accent dark:text-blue-400"
            >
              <Compass className="size-4" />
              Pure Aloha Ordering
            </Link>

            <nav
              className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted p-1.5"
              aria-label="Global navigation"
            >
              {navigationLinks.map((link) => {
                const active = isActivePath(pathname, link.href);
                const Icon = link.icon;

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-300 dark:ring-blue-500/40"
                        : "text-muted-foreground hover:bg-background hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <nav
              className="flex flex-wrap items-center gap-2 text-sm"
              aria-label="Additional navigation"
            >
              {utilityLinks.map((link) => {
                const active = isActivePath(pathname, link.href);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-full px-3 py-1.5 transition",
                      active
                        ? "bg-muted font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <ThemeToggle />

            {role ? (
              <div className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Role: {role}
              </div>
            ) : null}
            <button
              onClick={signOut}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-4" />
              Log Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
