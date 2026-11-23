import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { requireMe } from "@/lib/me";

export const metadata = { title: "Welcome · SideQuest" };

export default async function OnboardingPage() {
  const me = await requireMe();
  if (me.username) redirect("/");
  return (
    <AuthCard title="Welcome to SideQuest" sub="Pick a username. It’s how people see you in events and chats.">
      <ProfileForm userId={me.id} initial={me} submitLabel="Let’s go" then="/" />
    </AuthCard>
  );
}
