export type PrimaryTab = "UserPage" | "Home" | "Friends" | "Settings";
export type SwipeDirection = "LEFT" | "RIGHT";

export const PRIMARY_TABS: PrimaryTab[] = ["UserPage", "Home", "Friends", "Settings"];

export function getPrimaryTabSwipeTarget(
  currentRoute: string,
  direction: SwipeDirection,
): PrimaryTab | null {
  const currentIndex = PRIMARY_TABS.findIndex((route) => route === currentRoute);
  if (currentIndex < 0) return null;
  const targetIndex = direction === "LEFT" ? currentIndex + 1 : currentIndex - 1;
  return PRIMARY_TABS[targetIndex] ?? null;
}
