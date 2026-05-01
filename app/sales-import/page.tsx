import Link from "next/link"
import { ArrowLeft, LayoutDashboard, Warehouse } from "lucide-react"
import NavBar from "@/components/NavBar"
import SalesImportClient from "@/components/sales/sales-import-client"

export default function SalesImportPage() {
  return (
    <div className="dark min-h-screen bg-zinc-900 text-white">
      <NavBar />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-[2rem] border border-border/80 bg-card/90 p-5 shadow-[0_20px_70px_-45px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center rounded-full border border-border/80 bg-background/80 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  Import Workspace
                </div>
                <div className="space-y-2">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground/20 hover:bg-muted/60"
                  >
                    <ArrowLeft className="size-4" />
                    Back to Dashboard
                  </Link>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Sales history import stays separate from product and inventory import.
                  </p>
                </div>
              </div>

              <nav
                className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]"
                aria-label="Sales import quick links"
              >
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/85 px-4 py-3 transition hover:border-foreground/20 hover:bg-muted/60"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">Dashboard</div>
                    <div className="text-xs text-muted-foreground">Return home</div>
                  </div>
                  <LayoutDashboard className="size-4 text-foreground" />
                </Link>
                <Link
                  href="/inventory"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/85 px-4 py-3 transition hover:border-foreground/20 hover:bg-muted/60"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">Inventory</div>
                    <div className="text-xs text-muted-foreground">Review current pars</div>
                  </div>
                  <Warehouse className="size-4 text-foreground" />
                </Link>
              </nav>
            </div>
          </section>

          <SalesImportClient endpoint="/api/import-sales" />
        </div>
      </main>
    </div>
  )
}
