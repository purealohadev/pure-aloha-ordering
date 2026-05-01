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
    <main className="min-h-screen bg-background font-sans text-foreground">
      <NavBar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{title}</h1>
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5">
          {children}
        </div>
      </div>
    </main>
  );
}
