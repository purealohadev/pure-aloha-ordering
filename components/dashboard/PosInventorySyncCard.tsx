"use client"

import { useState } from "react"
import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type SyncState = {
  status: "idle" | "syncing" | "success" | "error"
  source: "mock" | "pos" | null
  importedCount: number
  unmatchedCount: number
  errors: string[]
  message: string
}

const INITIAL_STATE: SyncState = {
  status: "idle",
  source: null,
  importedCount: 0,
  unmatchedCount: 0,
  errors: [],
  message: "",
}

export default function PosInventorySyncCard() {
  const [syncState, setSyncState] = useState<SyncState>(INITIAL_STATE)

  async function handleSync() {
    setSyncState({
      ...INITIAL_STATE,
      status: "syncing",
      message: "Syncing POS inventory...",
    })

    try {
      const response = await fetch("/api/sync-pos-inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      const data = (await response.json()) as Partial<SyncState> & {
        success?: boolean
        source?: "mock" | "pos"
        imported_count?: number
        unmatched_count?: number
        errors?: string[]
      }

      if (!response.ok || !data.success) {
        setSyncState({
          status: "error",
          source: data.source ?? null,
          importedCount: data.imported_count ?? 0,
          unmatchedCount: data.unmatched_count ?? 0,
          errors: data.errors ?? ["POS sync failed."],
          message: "POS inventory sync failed.",
        })
        return
      }

      setSyncState({
        status: "success",
        source: data.source ?? "mock",
        importedCount: data.imported_count ?? 0,
        unmatchedCount: data.unmatched_count ?? 0,
        errors: data.errors ?? [],
        message:
          data.source === "mock"
            ? "Mock POS inventory synced."
            : "POS inventory synced successfully.",
      })
    } catch (error) {
      setSyncState({
        status: "error",
        source: null,
        importedCount: 0,
        unmatchedCount: 0,
        errors: [error instanceof Error ? error.message : "POS sync failed."],
        message: "POS inventory sync failed.",
      })
    }
  }

  const isSyncing = syncState.status === "syncing"
  const hasError = syncState.status === "error"
  const hasResult = syncState.status === "success" || syncState.status === "error"

  return (
    <Card className="border border-border/80 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <RefreshCw className="size-4 text-muted-foreground" />
          POS Inventory Sync
        </CardTitle>
        <CardDescription className="text-sm">
          Manually sync POS inventory now. When POS is not configured, this uses mock sample data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSync} disabled={isSyncing} className="min-h-10">
            {isSyncing ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Syncing...
              </>
            ) : (
              "Sync POS Inventory"
            )}
          </Button>
          {syncState.source ? (
            <Badge variant="outline" className="text-xs">
              Source: {syncState.source === "pos" ? "POS" : "Mock"}
            </Badge>
          ) : null}
        </div>

        {hasResult ? (
          <div className={`rounded-lg border px-3 py-2 text-sm ${hasError ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
            <div className="font-semibold">{syncState.message}</div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              <span>Imported: {syncState.importedCount}</span>
              <span>Unmatched: {syncState.unmatchedCount}</span>
            </div>
            {syncState.errors.length > 0 ? (
              <div className="mt-2 flex items-start gap-2 text-xs">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{syncState.errors.join(" ")}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
            Use this button to sync inventory from the future POS API or the mock fallback.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
