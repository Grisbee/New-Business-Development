import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { requireMe } from "@/lib/me";
import { safeNext } from "@/lib/safeNext";

export const metadata = { title: "Welcome · SideQuest" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await requireMe();
  const then = safeNext((await searchParams).next);
  if (me.username && me.first_name) redirect(then);
  return (
    <AuthCard title="Welcome to SideQuest" sub="Tell us who you are. Your name shows in events and chats.">
      <ProfileForm userId={me.id} initial={me} submitLabel="Let’s go" then={then} />
    </AuthCard>
  );
}
