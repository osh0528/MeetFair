import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

export type ThemeMode = "LIGHT" | "DARK";

const KEY = "meetfair.theme-mode";

const palettes = {
  LIGHT: {
    background: "#F5F5F5", surface: "#FFFFFF", text: "#1C1C1C", muted: "#707070",
    subtle: "#A3A3A3", border: "#E2E2E2", primary: "#303030", "primary-pressed": "#151515",
    "primary-soft": "#ECECEC", mint: "#E8E8E8", green: "#525252", amber: "#686868",
    "amber-soft": "#F0F0F0", red: "#B95058", "red-soft": "#F5EDEE", blue: "#5D5D5D",
    "blue-soft": "#EDEDED", charcoal: "#242424",
  },
  DARK: {
    background: "#111111", surface: "#1D1D1D", text: "#F4F4F4", muted: "#B0B0B0",
    subtle: "#858585", border: "#363636", primary: "#F0F0F0", "primary-pressed": "#D0D0D0",
    "primary-soft": "#2B2B2B", mint: "#292929", green: "#B8B8B8", amber: "#BDBDBD",
    "amber-soft": "#292929", red: "#E07A82", "red-soft": "#382528", blue: "#B5B5B5",
    "blue-soft": "#292929", charcoal: "#090909",
  },
};

interface Value {
  mode: ThemeMode;
  setMode(mode: ThemeMode): Promise<void>;
}

const Context = createContext<Value | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("LIGHT");

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
    document.documentElement.style.colorScheme = mode === "DARK" ? "dark" : "light";
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
