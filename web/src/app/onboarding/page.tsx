import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { requireMe } from "@/lib/me";

export const metadata = { title: "Welcome · SideQuest" };

export default async function OnboardingPage() {
  const me = await requireMe();
  if (me.username && me.first_name) redirect("/");
  return (
    <AuthCard title="Welcome to SideQuest" sub="Tell us who you are. Your name shows in events and chats.">
      <ProfileForm userId={me.id} initial={me} submitLabel="Let’s go" then="/" />
    </AuthCard>
  );
}
