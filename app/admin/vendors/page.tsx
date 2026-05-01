import NavBar from "@/components/NavBar";
import VendorContactsManager from "@/components/VendorContactsManager";
import { createClient } from "@/lib/supabase/server";
import type { VendorContact } from "@/lib/vendor-contacts";

export default async function AdminVendorsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_contacts")
    .select("*")
    .order("distributor", { ascending: true })
    .order("vendor_name", { ascending: true })
    .order("rep_name", { ascending: true });

  return (
    <div className="dark min-h-screen bg-zinc-900 font-sans text-white">
      <NavBar />

      <main className="p-4 sm:p-6">
        <VendorContactsManager
          initialContacts={(data ?? []) as VendorContact[]}
          initialError={
            error
              ? `${error.message}. If this table has not been created yet, run the vendor_contacts SQL migration.`
              : undefined
          }
        />
      </main>
    </div>
  );
}
