"use client"

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
} from "lucide-react"

type Props = {
  canAccessImports?: boolean
}

export default function NavBar({ canAccessImports = true }: Props) {
  const pathname = usePathname()

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
        </div>
      </div>
    </nav>
  )
}