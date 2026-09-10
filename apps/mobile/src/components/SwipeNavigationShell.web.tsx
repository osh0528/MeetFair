import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { SwipeDirection } from "../services/primary-tab-swipe";

type Props = {
  children: ReactNode;
  enabled: boolean;
  onSwipe(direction: SwipeDirection): void;
};

export function SwipeNavigationShell({ children }: Props) {
  return <View style={styles.shell}>{children}</View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, minWidth: 0 },
});
