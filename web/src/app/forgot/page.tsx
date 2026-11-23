import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { VerifyForm } from "@/components/auth/forms";

export const metadata = { title: "Reset your password · SideQuest" };

export default function ForgotPage() {
  return (
    <AuthCard title="Reset your password" sub="We’ll email you a code, then you pick a new password.">
      <Suspense>
        <VerifyForm mode="recovery" />
      </Suspense>
    </AuthCard>
  );
}
