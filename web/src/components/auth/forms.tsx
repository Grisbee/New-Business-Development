"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Supabase's messages are fine to show as they are ("Invalid login
// credentials", "Token has expired or is invalid").
function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<string | null | void>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
  }
  return { error, busy, run, setError };
}

export function LoginForm() {
  const params = useSearchParams();
  const { error, busy, run } = useSubmit();
  const linkError = params.get("error") === "link" ? "That link has expired or was already used. Sign in, or ask for a new one." : null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(async () => {
          const { error } = await createClient().auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("password")) });
          if (error) return error.message;
          // Replaced, so Back doesn't return to the form.
          window.location.replace("/");
        });
      }}
    >
      <label className="field">
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      {(error ?? linkError) && <p className="error">{error ?? linkError}</p>}
      <button className="btn primary lg" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="auth-sub">
        <Link href="/forgot">Forgot your password?</Link>
      </p>
      <p className="auth-sub">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const { error, busy, run } = useSubmit();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const email = String(f.get("email")).trim();
        const password = String(f.get("password"));
        void run(async () => {
          if (password.length < 8) return "Use at least 8 characters for the password.";
          const { error } = await createClient().auth.signUp({ email, password, options: { emailRedirectTo: callback("/onboarding") } });
          if (error) return error.message;
          router.push(`/verify?email=${encodeURIComponent(email)}`);
        });
      }}
    >
      <label className="field">
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary lg" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
      <p className="auth-sub">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}

const callback = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

// After sign-up: the confirmation email has a link; this page says so and
// can send it again.
export function CheckEmail() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const { error, busy, run } = useSubmit();
  const [info, setInfo] = useState<string | null>(null);
  return (
    <>
      <p className="auth-sub">
        We sent a link to <b>{email || "your email"}</b>. Open it on this device to confirm your account. It can take a minute; check spam too.
      </p>
      {error && <p className="error">{error}</p>}
      {info && <p className="ok">{info}</p>}
      <button
        type="button"
        className="btn lg"
        disabled={busy || !email}
        onClick={() =>
          void run(async () => {
            setInfo(null);
            const { error } = await createClient().auth.resend({ type: "signup", email, options: { emailRedirectTo: callback("/onboarding") } });
            if (error) return error.message;
            setInfo("Sent it again.");
          })
        }
      >
        Send the link again
      </button>
      <p className="auth-sub">
        <Link href="/login">Back to sign in</Link>
      </p>
    </>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const { error, busy, run } = useSubmit();
  if (sent)
    return (
      <>
        <p className="ok">If there’s an account with that email, a reset link is on its way. Open it on this device.</p>
        <p className="auth-sub">
          <Link href="/login">Back to sign in</Link>
        </p>
      </>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email")).trim();
        void run(async () => {
          const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: callback("/reset") });
          if (error) return error.message;
          setSent(true);
        });
      }}
    >
      <label className="field">
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary lg" disabled={busy}>
        Send a reset link
      </button>
      <p className="auth-sub">
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const { error, busy, run } = useSubmit();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const password = String(new FormData(e.currentTarget).get("password"));
        void run(async () => {
          if (password.length < 8) return "Use at least 8 characters.";
          const { error } = await createClient().auth.updateUser({ password });
          if (error) return error.message;
          window.location.replace("/");
        });
      }}
    >
      <label className="field">
        New password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary lg" disabled={busy}>
        Save password
      </button>
    </form>
  );
}
