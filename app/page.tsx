import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  FileSpreadsheet,
  LayoutDashboard,
  PackageSearch,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const destinations = [
  {
    href: "/dashboard",
    title: "Dashboard",
    description: "Open the operational overview and current ordering metrics.",
    icon: LayoutDashboard,
  },
  {
    href: "/inventory",
    title: "Inventory",
    description: "Browse products, stock counts, par levels, and low-stock status.",
    icon: Boxes,
  },
  {
    href: "/orders",
    title: "Orders",
    description: "Build purchase orders from current inventory needs.",
    icon: ShoppingCart,
  },
  {
    href: "/import",
    title: "Product Import",
    description: "Refresh product, menu, SKU, and vendor catalog data.",
    icon: FileSpreadsheet,
  },
  {
    href: "/inventory-import",
    title: "Inventory Import",
    description: "Upload inventory counts after the product catalog is current.",
    icon: Warehouse,
  },
];

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="dark min-h-screen bg-zinc-900 font-sans text-white">
      <NavBar />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <section className="rounded-2xl border border-zinc-700 bg-zinc-800 px-6 py-8 shadow-sm sm:px-8 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-blue-400 uppercase">
                  Home
                </div>
                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    Pure Aloha Ordering
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-zinc-400">
                    Choose the workspace you need. Product imports, inventory updates, order
                    creation, and dashboard review are all available from this landing screen.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-blue-400">
                    <PackageSearch className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Start with the right screen</p>
                    <p className="text-sm text-zinc-400">Use imports first, then inventory and orders.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="Home destinations">
            {destinations.map((destination) => {
              const Icon = destination.icon;

              return (
                <Link
                  key={destination.href}
                  href={destination.href}
                  className="group flex min-h-[210px] flex-col justify-between rounded-2xl border border-zinc-700 bg-zinc-800 p-5 text-left shadow-sm transition hover:border-blue-500/50 hover:bg-zinc-800/80"
                >
                  <div className="space-y-4">
                    <div className="flex size-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 transition group-hover:text-blue-300">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-white">
                        {destination.title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        {destination.description}
                      </p>
                    </div>
                  </div>

                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-400">
                    Open
                    <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </section>
        </div>
      </main>
    </div>
  );
}
