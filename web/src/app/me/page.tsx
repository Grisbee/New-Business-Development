import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { ProfileForm, SignOutButton } from "@/components/auth/ProfileForm";
import { requireMe } from "@/lib/me";

export const metadata = { title: "Profile · SideQuest" };

export default async function MePage() {
  const me = await requireMe();
  return (
    <AuthCard title="Your profile" back="/">
      <ProfileForm userId={me.id} initial={me} submitLabel="Save" then="/" />
      <h2>Venue</h2>
      <p className="auth-sub">
        {me.role === "venue" || me.role === "admin"
          ? `You can list public events${me.venue_name ? ` as ${me.venue_name}` : ""}: tap + on the Public tab.`
          : "Run a bar, club or venue? Ask to list public events."}
      </p>
      <Link className="btn lg" href="/venue">
        {me.role === "user" ? "Become a venue" : "Venue details"}
      </Link>
      {me.role === "admin" && (
        <>
          <h2>Admin</h2>
          <Link className="btn lg" href="/admin">
            Review venue requests
          </Link>
        </>
      )}
      <h2>Account</h2>
      <SignOutButton />
      <Link className="btn lg" href="/">
        Back to the app
      </Link>
    </AuthCard>
  );
}
