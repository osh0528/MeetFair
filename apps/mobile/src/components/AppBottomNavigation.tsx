import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

type Props = {
  currentRoute?: string;
  onSettings(): void;
  onMeetings(): void;
  onFriends(): void;
  onUserPage(): void;
};

type ItemProps = {
  active: boolean;
  icon: string;
  label: string;
  onPress(): void;
};

function NavigationItem({ active, icon, label, onPress }: ItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        pressed && styles.itemPressed,
      ]}
    >
      <View style={[styles.icon, active && styles.iconActive]}>
        <Text style={[styles.iconText, active && styles.iconTextActive]}>{icon}</Text>
      </View>
      <Text numberOfLines={1} style={styles.label}>{label}</Text>
    </Pressable>
  );
}

export function AppBottomNavigation({
  currentRoute,
  onSettings,
  onMeetings,
  onFriends,
  onUserPage,
}: Props) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <View style={styles.navigation}>
        <NavigationItem
          active={currentRoute === "UserPage"}
          icon="⌂"
          label="홈피"
          onPress={onUserPage}
        />
        <NavigationItem
          active={currentRoute === "Home"
            || currentRoute === "CreateMeeting"
            || currentRoute === "Meeting"
            || currentRoute === "MeetingInvitation"
            || currentRoute === "PublicMeetingRequest"
            || currentRoute === "Recommendations"}
          icon="▣"
          label="모임창"
          onPress={onMeetings}
        />
        <NavigationItem
          active={currentRoute === "Friends" || currentRoute === "FriendRequests"}
          icon="♧"
          label="친구"
          onPress={onFriends}
        />
        <NavigationItem
          active={currentRoute === "Settings" || currentRoute === "Profile"}
          icon="⚙"
          label="설정"
          onPress={onSettings}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: colors.charcoal,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  navigation: {
    minHeight: 70,
    paddingHorizontal: 6,
    paddingTop: 7,
    paddingBottom: 5,
    flexDirection: "row",
  },
  item: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  itemPressed: { opacity: 0.68 },
  icon: {
    width: 34,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  iconActive: { backgroundColor: colors.primary, transform: [{ scale: 1.08 }] },
  iconText: { color: colors.muted, fontSize: 18, fontWeight: "900", lineHeight: 20 },
  iconTextActive: { color: colors.surface },
  label: { color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: "center" },
});
