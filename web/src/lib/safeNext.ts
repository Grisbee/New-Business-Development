// Where to go after signing in or onboarding: only a path inside this app.
// Parsed as a URL so tricks like "/\evil.com" or "/\t/evil.com" (which
// browsers read as another site) fall back to "/".
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  try {
    const base = "https://app.invalid";
    const u = new URL(next, base);
    return u.origin === base ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}
