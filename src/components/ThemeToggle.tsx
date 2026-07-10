"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/hooks/useMe";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { me } = useMe();
  const [mounted, setMounted] = useState(false);
  // Apply the account-level preference exactly once per page load, so it
  // follows the user across devices without fighting in-session toggles.
  const appliedAccountPref = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!me?.themePreference || appliedAccountPref.current) return;
    appliedAccountPref.current = true;
    setTheme(me.themePreference);
  }, [me, setTheme]);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    // Persist on the user record — fire-and-forget; localStorage (via
    // next-themes) still covers this device if the request fails.
    fetch("/api/auth/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }

  if (!mounted) return <div className="h-5 w-5" />;

  return (
    <button
      data-component="themeToggle"
      onClick={toggle}
      className="text-zinc-400 hover:text-foreground transition-colors"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
