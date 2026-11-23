"use client";

import { useEffect } from "react";

// Phones: when the keyboard opens, iOS slides the whole page up instead of
// shrinking it, so chats jump. This sizes the app to the part of the screen
// that's actually visible (--app-h) and keeps the page from scrolling, so
// the composer simply sits on top of the keyboard.
export function ViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty("--app-h", `${Math.round(vv.height)}px`);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}
