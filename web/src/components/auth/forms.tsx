"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safeNext";

// Supabase's messages are mostly fine to show as they are ("Invalid login
// credentials"); the email limit one doesn't say what to do.
function friendly(err: string) {
  return /rate limit/i.test(err) ? "We’ve sent a lot of emails in the last hour. Please try again in a few minutes." : err;
}

function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<string | null | void>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    // On success the page usually navigates away; staying busy until then
    // keeps the spinner up. Forms that stay put clear it via `done`.
    if (err) {
      setBusy(false);
      setError(friendly(err));
    }
  }
  return { error, busy, run, setError, done: () => setBusy(false) };
}

export function LoginForm() {
  const params = useSearchParams();
  const { error, busy, run } = useSubmit();
  // The link can confirm the email yet fail to sign in (opened in another
  // browser or the mail app's), so the likely next step is just signing in.
  const linkError =
    params.get("error") === "link" ? "That link has already been used or was opened in another browser. If you confirmed your email, just sign in." : null;
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(async () => {
          const email = String(f.get("email")).trim();
          const { error } = await createClient().auth.signInWithPassword({ email, password: String(f.get("password")) });
          if (error?.code === "email_not_confirmed") {
            setUnconfirmed(email);
            return "Confirm your email first: open the link we sent you.";
          }
          if (error) return error.message;
          // Replaced, so Back doesn't return to the form. `next` only ever
          // points inside the app.
          window.location.replace(safeNext(params.get("next")));
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
      {unconfirmed && (
        <button
          type="button"
          className="btn lg"
          disabled={resent}
          onClick={async () => {
            const { error } = await createClient().auth.resend({ type: "signup", email: unconfirmed, options: { emailRedirectTo: callback("/onboarding") } });
            if (!error) setResent(true);
          }}
        >
          {resent ? "Sent · check your inbox" : "Send the confirmation link again"}
        </button>
      )}
      <button className="btn primary lg" disabled={busy}>
        {busy && <span className="spinner" aria-hidden />}
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="auth-sub">
        <Link href="/forgot">Forgot your password?</Link>
      </p>
      <p className="auth-sub">
        New here? <Link href={params.get("next") ? `/signup?next=${encodeURIComponent(params.get("next")!)}` : "/signup"}>Create an account</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  // A shared link someone followed before signing up opens after onboarding.
  const next = safeNext(useSearchParams().get("next"));
  const after = next === "/" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(next)}`;
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
          const { data, error } = await createClient().auth.signUp({ email, password, options: { emailRedirectTo: callback(after) } });
          if (error) return error.message;
          // Supabase answers "ok" for an address that already has an account
          // (and sends nothing); it shows as a user without identities.
          if (data.user && data.user.identities?.length === 0) return "There’s already an account with this email. Sign in, or reset your password.";
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
        {busy && <span className="spinner" aria-hidden />}
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
  const { error, busy, run, done } = useSubmit();
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
            done();
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
  const expired = useSearchParams().get("error") === "link";
  const [sent, setSent] = useState(false);
  const { error, busy, run, done } = useSubmit();
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
          done();
        });
      }}
    >
      {expired && <p className="error">That reset link has expired or was opened in another browser. Ask for a new one below.</p>}
      <label className="field">
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary lg" disabled={busy}>
        {busy && <span className="spinner" aria-hidden />}
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
        {busy && <span className="spinner" aria-hidden />}
        Save password
      </button>
    </form>
  );
}
