import { Platform } from "react-native";

function themed(name: string, fallback: string) {
  return Platform.OS === "web" ? `var(--meetfair-${name}, ${fallback})` : fallback;
}

export const colors = {
  background: themed("background", "#F5F5F5"),
  surface: themed("surface", "#FFFFFF"),
  text: themed("text", "#1C1C1C"),
  muted: themed("muted", "#707070"),
  subtle: themed("subtle", "#A3A3A3"),
  border: themed("border", "#E2E2E2"),
  primary: themed("primary", "#303030"),
  primaryPressed: themed("primary-pressed", "#151515"),
  primarySoft: themed("primary-soft", "#ECECEC"),
  mint: themed("mint", "#E8E8E8"),
  green: themed("green", "#525252"),
  online: themed("online", "#22C55E"),
  amber: themed("amber", "#686868"),
  amberSoft: themed("amber-soft", "#F0F0F0"),
  red: themed("red", "#B95058"),
  redSoft: themed("red-soft", "#F5EDEE"),
  blue: themed("blue", "#5D5D5D"),
  blueSoft: themed("blue-soft", "#EDEDED"),
  charcoal: themed("charcoal", "#242424"),
} as const;
