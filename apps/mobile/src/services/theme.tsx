import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

export type ThemeMode = "LIGHT" | "DARK";

const KEY = "meetfair.theme-mode";

const palettes = {
  LIGHT: {
    background: "#F7F8FC", surface: "#FFFFFF", "surface-subtle": "#F1F3F9", "surface-hover": "#FAFAFF",
    text: "#171923", "text-secondary": "#3F4350", muted: "#697080", subtle: "#A0A5B1", icon: "#626978",
    border: "#EAECF2", "border-strong": "#C7D2FE", input: "#FFFFFF",
    primary: "#5B5FEA", "primary-hover": "#4F46E5", "primary-pressed": "#4338CA", "primary-soft": "#EEF2FF", "primary-contrast": "#FFFFFF",
    mint: "#ECFDF3", green: "#16794A", online: "#22C55E", success: "#16794A", "success-soft": "#ECFDF3", "success-border": "#BBF7D0",
    amber: "#A15C07", "amber-soft": "#FFF7E8", warning: "#A15C07", "warning-soft": "#FFF7E8", "warning-border": "#FDE3AE",
    red: "#BE123C", "red-soft": "#FFF1F2", danger: "#BE123C", "danger-soft": "#FFF1F2", "danger-border": "#FECDD3",
    blue: "#4338CA", "blue-soft": "#EEF2FF", charcoal: "#171923", header: "rgba(255,255,255,0.92)", "nav-active": "#EEF2FF",
    "focus-ring": "rgba(99,102,241,0.28)", disabled: "#A0A5B1", "shadow-card": "rgba(31,35,48,0.10)", "shadow-floating": "rgba(31,35,48,0.16)",
  },
  DARK: {
    background: "#101116", surface: "#1A1C24", "surface-subtle": "#20232D", "surface-hover": "#232631",
    text: "#F4F5F8", "text-secondary": "#D1D4DC", muted: "#9CA2B1", subtle: "#707685", icon: "#AEB3C0",
    border: "#303440", "border-strong": "#5B5FEA", input: "#171920",
    primary: "#818CF8", "primary-hover": "#A5B4FC", "primary-pressed": "#5B5FEA", "primary-soft": "rgba(99,102,241,0.16)", "primary-contrast": "#11131A",
    mint: "rgba(34,197,94,0.14)", green: "#86EFAC", online: "#4ADE80", success: "#86EFAC", "success-soft": "rgba(34,197,94,0.14)", "success-border": "rgba(74,222,128,0.28)",
    amber: "#FCD34D", "amber-soft": "rgba(245,158,11,0.14)", warning: "#FCD34D", "warning-soft": "rgba(245,158,11,0.14)", "warning-border": "rgba(251,191,36,0.28)",
    red: "#FDA4AF", "red-soft": "rgba(244,63,94,0.14)", danger: "#FDA4AF", "danger-soft": "rgba(244,63,94,0.14)", "danger-border": "rgba(251,113,133,0.28)",
    blue: "#C7D2FE", "blue-soft": "rgba(99,102,241,0.18)", charcoal: "#0B0C10", header: "rgba(21,23,30,0.94)", "nav-active": "rgba(99,102,241,0.18)",
    "focus-ring": "rgba(129,140,248,0.34)", disabled: "#707685", "shadow-card": "rgba(0,0,0,0.22)", "shadow-floating": "rgba(0,0,0,0.34)",
  },
};
interface Value {
  mode: ThemeMode;
  setMode(mode: ThemeMode): Promise<void>;
}

const Context = createContext<Value | null>(null);

function initialThemeMode(): ThemeMode {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "LIGHT" || stored === "DARK") return stored;
  }
  return "LIGHT";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialThemeMode);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const styleId = "meetfair-theme-interactions";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      html, body, #root { min-height: 100%; min-height: 100dvh; background: var(--meetfair-background); color: var(--meetfair-text); }
      body { margin: 0; }
      button, input, textarea, [role="button"] {
        transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, opacity 180ms ease, transform 180ms ease;
      }
      input:focus-visible, textarea:focus-visible, [role="button"]:focus-visible {
        outline: 3px solid var(--meetfair-focus-ring);
        outline-offset: 2px;
      }
      input::placeholder, textarea::placeholder { color: var(--meetfair-subtle); opacity: 1; }
      @media (max-width: 767px) {
        input, textarea { font-size: 16px !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        button, input, textarea, [role="button"] { transition-duration: 0.01ms !important; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((storedMode) => {
      if (storedMode === "LIGHT" || storedMode === "DARK") {
        setModeState(storedMode);
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    for (const [name, value] of Object.entries(palettes[mode])) {
      document.documentElement.style.setProperty(`--meetfair-${name}`, value);
    }
    document.documentElement.dataset.theme = mode === "DARK" ? "dark" : "light";
    document.documentElement.style.colorScheme = mode === "DARK" ? "dark" : "light";
    document.documentElement.style.backgroundColor = palettes[mode].background;
  }, [mode]);

  const value = useMemo<Value>(() => ({
    mode,
    async setMode(nextMode) {
      setModeState(nextMode);
      await AsyncStorage.setItem(KEY, nextMode);
    },
  }), [mode]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppTheme() {
  const value = useContext(Context);
  if (!value) throw new Error("useAppTheme must be used inside ThemeProvider");
  return value;
}
