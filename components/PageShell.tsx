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
    <main style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "sans-serif" }}>
      <NavBar />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>{title}</h1>
          {subtitle ? (
            <p style={{ marginTop: 8, color: "#475569" }}>{subtitle}</p>
          ) : null}
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          {children}
        </div>
      </div>
    </main>
  );
}

