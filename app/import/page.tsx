import ImportUploadClient from "@/components/import/import-upload-client";

export default function ImportPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.05),_transparent_40%),linear-gradient(to_bottom,_rgba(248,250,252,0.95),_rgba(255,255,255,1))] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <ImportUploadClient
          title="Import Products"
          subtitle="Upload a CSV or spreadsheet to refresh product and menu data."
          endpoint="/api/import-products"
          actionLabel="Import Products"
          resultLabel="rows processed"
          mode="products"
        />
      </div>
    </main>
  );
}
