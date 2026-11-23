import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/forms";

export const metadata = { title: "Create an account · SideQuest" };

export default function SignupPage() {
  return (
    <AuthCard title="Create an account" sub="We’ll email you a link to confirm it.">
      <SignupForm />
    </AuthCard>
  );
}
