"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const DISTRIBUTOR_OPTIONS = [
  "KSS",
  "Nabis",
  "Kindhouse",
  "UpNorth",
  "Big Oil",
  "Self Distro",
  "Other",
  "Unknown Distributor",
] as const

type SuggestedDistributorProps = {
  distributor: string
  onSelect?: (distributor: string) => void
  className?: string
  disabled?: boolean
  showDropdown?: boolean
  tone?: "dark" | "light"
}

export default function SuggestedDistributor({
  distributor,
  onSelect,
  className,
  disabled = false,
  showDropdown = true,
  tone = "dark",
}: SuggestedDistributorProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge
        variant="outline"
        className={cn(
          "h-auto rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
          tone === "dark"
            ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
            : "border-amber-300 bg-amber-100/80 text-amber-900"
        )}
      >
        Suggested Distributor: {distributor}
      </Badge>
      {showDropdown ? (
        <select
          defaultValue=""
          disabled={disabled}
          aria-label={`Choose distributor for suggested ${distributor}`}
          onChange={(event) => {
            if (event.target.value) {
              onSelect?.(event.target.value)
            }
          }}
          className={cn(
            "h-7 rounded-full border px-2.5 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            tone === "dark"
              ? "border-zinc-600 bg-zinc-900 text-zinc-100 hover:bg-zinc-700"
              : "border-amber-300 bg-white text-amber-950 hover:bg-amber-100",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <option value="">Choose distributor</option>
          {DISTRIBUTOR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
