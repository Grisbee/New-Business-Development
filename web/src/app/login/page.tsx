import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/forms";

export const metadata = { title: "Sign in · SideQuest" };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" sub="City events, communities and your study teams in Taipei.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
