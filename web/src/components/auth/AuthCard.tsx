import Link from "next/link";

// The frame for sign-in, onboarding and settings pages: the app's top bar
// with the logo, then a centred card.
export function AuthCard({ title, sub, children, back }: { title: string; sub?: React.ReactNode; children: React.ReactNode; back?: string }) {
  return (
    <div className="screen auth-screen">
      <header className="topbar">
        <Link href={back ?? "/"} className="logo" style={{ color: "inherit", textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small inline brand mark */}
          <img src="/icons/sidequest-icon.svg" alt="" />
          Side<span className="brand">Quest</span>
        </Link>
      </header>
      <main className="view">
        <div className="auth">
          <h1>{title}</h1>
          {sub && <p className="auth-sub">{sub}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
