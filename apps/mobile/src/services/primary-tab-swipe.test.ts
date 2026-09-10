import { describe, expect, it } from "vitest";
import { getPrimaryTabSwipeTarget } from "./primary-tab-swipe";

describe("primary tab swipe navigation", () => {
  it("moves through tabs in the same order as the bottom navigation", () => {
    expect(getPrimaryTabSwipeTarget("UserPage", "LEFT")).toBe("Home");
    expect(getPrimaryTabSwipeTarget("Home", "LEFT")).toBe("Friends");
    expect(getPrimaryTabSwipeTarget("Friends", "LEFT")).toBe("Settings");
    expect(getPrimaryTabSwipeTarget("Settings", "RIGHT")).toBe("Friends");
  });

  it("does not wrap or swipe from a detail screen", () => {
    expect(getPrimaryTabSwipeTarget("UserPage", "RIGHT")).toBeNull();
    expect(getPrimaryTabSwipeTarget("Settings", "LEFT")).toBeNull();
    expect(getPrimaryTabSwipeTarget("Meeting", "LEFT")).toBeNull();
  });
});
