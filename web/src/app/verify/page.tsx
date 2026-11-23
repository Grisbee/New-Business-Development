import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { VerifyForm } from "@/components/auth/forms";

export const metadata = { title: "Confirm your email · SideQuest" };

export default function VerifyPage() {
  return (
    <AuthCard title="Confirm your email">
      <Suspense>
        <VerifyForm mode="signup" />
      </Suspense>
    </AuthCard>
  );
}
