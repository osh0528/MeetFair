import { type ReactNode, useMemo, useRef } from "react";
import { PanResponder, Platform, StyleSheet, View } from "react-native";
import type { SwipeDirection } from "../services/primary-tab-swipe";

const MIN_SWIPE_DISTANCE = 72;
const MIN_SWIPE_VELOCITY = 0.25;
const HORIZONTAL_DOMINANCE = 1.5;

type Props = {
  children: ReactNode;
  enabled: boolean;
  onSwipe(direction: SwipeDirection): void;
};

export function SwipeNavigationShell({ children, enabled, onSwipe }: Props) {
  const gestureClaimed = useRef(false);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      if (Platform.OS !== "android" || !enabled || gestureClaimed.current) return false;
      const horizontalDistance = Math.abs(gesture.dx);
      const verticalDistance = Math.abs(gesture.dy);
      const shouldClaim = horizontalDistance >= 24
        && horizontalDistance > verticalDistance * HORIZONTAL_DOMINANCE;
      if (shouldClaim) gestureClaimed.current = true;
      return shouldClaim;
    },
    onPanResponderRelease: (_, gesture) => {
      gestureClaimed.current = false;
      const isHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * HORIZONTAL_DOMINANCE;
      const isLongEnough = Math.abs(gesture.dx) >= MIN_SWIPE_DISTANCE;
      const isFastEnough = Math.abs(gesture.vx) >= MIN_SWIPE_VELOCITY;
      if (isHorizontal && isLongEnough && isFastEnough) {
        onSwipe(gesture.dx < 0 ? "LEFT" : "RIGHT");
      }
    },
    onPanResponderTerminate: () => {
      gestureClaimed.current = false;
    },
    onPanResponderTerminationRequest: () => true,
  }), [enabled, onSwipe]);

  return <View {...responder.panHandlers} style={styles.shell}>{children}</View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, minWidth: 0 },
});
