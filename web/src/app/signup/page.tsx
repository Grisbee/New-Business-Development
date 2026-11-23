import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/forms";

export const metadata = { title: "Create an account · SideQuest" };

export default function SignupPage() {
  return (
    <AuthCard back="/login" title="Create an account" sub="We’ll email you a link to confirm it.">
      <Suspense>
        <SignupForm />
      </Suspense>
      <p className="auth-sub">Had an account on Sidequest? Sign up with the same email and your events and chats come along.</p>
    </AuthCard>
  );
}
