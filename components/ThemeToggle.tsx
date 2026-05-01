"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

const STORAGE_KEY = "pure-aloha-theme";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const isDark = theme === "dark";

  useEffect(() => {
    const storedTheme = getStoredTheme();

    setTheme(storedTheme);
    applyTheme(storedTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";

    setTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
