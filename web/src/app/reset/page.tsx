import { AuthCard } from "@/components/auth/AuthCard";
import { NewPasswordForm } from "@/components/auth/forms";
import { requireMe } from "@/lib/me";

export const metadata = { title: "New password · SideQuest" };

// Reached from the reset email's link, which signs the user in first.
export default async function ResetPage() {
  await requireMe();
  return (
    <AuthCard back="/" title="Pick a new password">
      <NewPasswordForm />
    </AuthCard>
  );
}
