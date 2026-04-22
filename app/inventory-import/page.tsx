import NavBar from "@/components/NavBar";
import ImportUploadClient from "@/components/import/import-upload-client";

export default function InventoryImportPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(120,53,15,0.08),_transparent_38%),linear-gradient(to_bottom,_rgba(255,251,235,0.35),_rgba(255,255,255,1))]">
      <NavBar />
      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <ImportUploadClient
            title="Import Inventory"
            subtitle="Upload a CSV or spreadsheet to update inventory counts."
            endpoint="/api/import-inventory"
            actionLabel="Import Inventory"
            resultLabel="inventory rows updated"
            mode="inventory"
            backHref="/dashboard"
            backLabel="Back to Dashboard"
          />
        </div>
      </main>
    </div>
  );
}
