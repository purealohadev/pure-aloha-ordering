"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  LayoutDashboard,
  Box,
  ShoppingCart,
  FileSpreadsheet,
  Warehouse,
  TrendingUp,
  Moon,
  Sun,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Props = {
  canAccessImports?: boolean
}

type Theme = "dark" | "light"

export default function NavBar({ canAccessImports = true }: Props) {
  const pathname = usePathname()
  const [supabase] = useState(() => createClient())
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    setMounted(true)

    try {
      const storedTheme = window.localStorage.getItem("pure-aloha-theme")
      const nextTheme: Theme = storedTheme === "light" ? "light" : "dark"
      setTheme(nextTheme)
      applyTheme(nextTheme)
    } catch {
      setTheme("dark")
      applyTheme("dark")
    }

    let active = true

    async function loadUser() {
      const { data } = await supabase.auth.getUser()

      if (!active) return

      setUserEmail(data.user?.email ?? null)
      setAuthLoading(false)
    }

    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return

      setUserEmail(session?.user?.email ?? null)
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  function applyTheme(nextTheme: Theme) {
    const root = document.documentElement

    root.classList.toggle("dark", nextTheme === "dark")
    root.classList.toggle("light", nextTheme === "light")
    root.style.colorScheme = nextTheme
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark"

    setTheme(nextTheme)
    try {
      window.localStorage.setItem("pure-aloha-theme", nextTheme)
    } catch {
      // Ignore storage failures and keep the in-memory theme.
    }

    applyTheme(nextTheme)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

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
    // ✅ ADDED HERE
    {
      href: "/price-alerts",
      label: "Price Alerts",
      icon: TrendingUp,
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
          {
            href: "/sales-import",
            label: "Sales Import",
            icon: TrendingUp,
          },
        ]
      : []),
  ]

  const utilityLinks = [
    { href: "/order-history", label: "Order History" },
    ...(canAccessImports
      ? [
          { href: "/price-history", label: "Price History" },
          { href: "/approvals", label: "Approvals" },
          { href: "/admin/vendors", label: "Vendors" },
          { href: "/admin/credits-returns", label: "Credits & Returns" },
        ]
      : []),
  ]

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          {navigationLinks.map((link) => {
            const isActive = pathname === link.href
            const Icon = link.icon

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          {utilityLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:underline"
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {mounted && theme === "dark" ? (
              <>
                <Sun className="h-4 w-4" />
                Light Mode
              </>
            ) : mounted ? (
              <>
                <Moon className="h-4 w-4" />
                Dark Mode
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" />
                Dark Mode
              </>
            )}
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            {authLoading ? (
              <span className="text-xs text-muted-foreground">Checking auth...</span>
            ) : userEmail ? (
              <>
                <span className="max-w-[10rem] truncate text-xs text-muted-foreground">
                  {userEmail}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
