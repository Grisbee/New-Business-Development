import Link from "next/link";
import { Ic } from "@/components/Icons";

// The frame for sign-in, onboarding and settings pages: the app's top bar
// with the logo, then a centred card.
export function AuthCard({ title, sub, children, back }: { title: string; sub?: React.ReactNode; children: React.ReactNode; back?: string }) {
  return (
    <div className="screen auth-screen">
      <header className="topbar">
        {back && (
          <Link href={back} className="icon-btn" aria-label="Back" style={{ marginLeft: -8 }}>
            <Ic name="back" size={22} width={2.2} />
          </Link>
        )}
        <Link href={back ?? "/"} className="logo" style={{ color: "inherit", textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small inline brand mark */}
          <img src="/icons/sidequest-icon.svg" alt="" />
          <span>Side<span className="brand">Quest</span></span>
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
