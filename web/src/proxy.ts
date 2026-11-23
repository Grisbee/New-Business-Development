import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Not for static files, images or the service worker.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|demo/|icons/|sw.js|manifest.webmanifest).*)"],
};
