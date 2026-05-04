import type { SupabaseClient } from "@supabase/supabase-js"

export async function loadPublicTableColumns(supabase: SupabaseClient, tableName: string) {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", tableName)

  if (error) {
    return new Set<string>()
  }

  return new Set(
    (data ?? [])
      .map((row) => String((row as { column_name?: unknown }).column_name ?? "").trim())
      .filter(Boolean)
  )
}
