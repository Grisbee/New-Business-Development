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
  const { error, busy, run } = useSubmit();
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
      {error && <p className="error">{error}</p>}
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
          const { error } = await createClient().auth.signUp({ email, password });
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

// The code from the confirmation email (sign-up) or the reset email.
export function VerifyForm({ mode }: { mode: "signup" | "recovery" }) {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [sent, setSent] = useState(mode === "signup");
  const { error, busy, run, setError } = useSubmit();
  const [info, setInfo] = useState<string | null>(null);
  const supabase = createClient();

  if (mode === "recovery" && !sent) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
            if (error) return error.message;
            setSent(true);
          });
        }}
      >
        <label className="field">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary lg" disabled={busy}>
          Send a code
        </button>
        <p className="auth-sub">
          <Link href="/login">Back to sign in</Link>
        </p>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const token = String(f.get("code")).replace(/\s/g, "");
        void run(async () => {
          const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: mode });
          if (error) return error.message;
          if (mode === "recovery") {
            const password = String(f.get("password"));
            if (password.length < 8) return "Use at least 8 characters for the password.";
            const { error: pwError } = await supabase.auth.updateUser({ password });
            if (pwError) return pwError.message;
          }
          window.location.replace(mode === "signup" ? "/onboarding" : "/");
        });
      }}
    >
      <p className="auth-sub">
        We sent a code to <b>{email || "your email"}</b>. It can take a minute; check spam too.
      </p>
      {!params.get("email") && (
        <label className="field">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}
      <label className="field">
        Code
        <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,10}" maxLength={10} />
      </label>
      {mode === "recovery" && (
        <label className="field">
          New password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {info && <p className="ok">{info}</p>}
      <button className="btn primary lg" disabled={busy}>
        {mode === "signup" ? "Confirm" : "Set new password"}
      </button>
      <button
        type="button"
        className="btn"
        disabled={busy || !email}
        onClick={() =>
          void run(async () => {
            setInfo(null);
            const { error } =
              mode === "signup"
                ? await supabase.auth.resend({ type: "signup", email: email.trim() })
                : await supabase.auth.resetPasswordForEmail(email.trim());
            if (error) return error.message;
            setError(null);
            setInfo("Sent a new code.");
          })
        }
      >
        Send the code again
      </button>
    </form>
  );
}
