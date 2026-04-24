import NavBar from "./NavBar";

export default function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="dark min-h-screen bg-zinc-900 font-sans text-white">
      <NavBar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-blue-400">{title}</h1>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{subtitle}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-700 bg-zinc-800 p-4 shadow-sm sm:p-5">
          {children}
        </div>
      </div>
    </main>
  );
}
