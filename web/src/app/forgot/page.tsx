import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotForm } from "@/components/auth/forms";

export const metadata = { title: "Reset your password · SideQuest" };

export default function ForgotPage() {
  return (
    <AuthCard title="Reset your password" sub="We’ll email you a link to pick a new password.">
      <ForgotForm />
    </AuthCard>
  );
}
