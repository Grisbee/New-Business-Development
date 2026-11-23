import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { CheckEmail } from "@/components/auth/forms";

export const metadata = { title: "Confirm your email · SideQuest" };

export default function VerifyPage() {
  return (
    <AuthCard title="Check your email">
      <Suspense>
        <CheckEmail />
      </Suspense>
    </AuthCard>
  );
}
