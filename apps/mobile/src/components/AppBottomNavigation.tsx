import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

type Layout = "bottom" | "sidebar";
type Props = {
  currentRoute?: string;
  layout?: Layout;
  onSettings(): void;
  onMeetings(): void;
  onFriends(): void;
  onUserPage(): void;
};
type ItemProps = { active: boolean; icon: string; label: string; layout: Layout; onPress(): void };

function NavigationItem({ active, icon, label, layout, onPress }: ItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        layout === "sidebar" && styles.sidebarItem,
        active && styles.itemActive,
        pressed && styles.itemPressed,
      ]}
    >
      <View style={[styles.icon, active && styles.iconActive]}>
        <Text style={[styles.iconText, active && styles.iconTextActive]}>{icon}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.label, layout === "sidebar" && styles.sidebarLabel, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

export function AppBottomNavigation({ currentRoute, layout = "bottom", onSettings, onMeetings, onFriends, onUserPage }: Props) {
  const items = [
    { label: "홈피", icon: "⌂", active: currentRoute === "UserPage", onPress: onUserPage },
    {
      label: "모임창",
      icon: "◎",
      active: currentRoute === "Home" || currentRoute === "CreateMeeting" || currentRoute === "Meeting" || currentRoute === "MeetingInvitation" || currentRoute === "PublicMeetingRequest" || currentRoute === "Recommendations",
      onPress: onMeetings,
    },
    { label: "친구", icon: "♧", active: currentRoute === "Friends" || currentRoute === "FriendRequests", onPress: onFriends },
    { label: "설정", icon: "⚙", active: currentRoute === "Settings" || currentRoute === "Profile", onPress: onSettings },
  ];

  return (
    <SafeAreaView edges={layout === "sidebar" ? ["top", "bottom", "left"] : ["bottom"]} style={[styles.safeArea, layout === "sidebar" && styles.sidebarSafeArea]}>
      <View style={[styles.navigation, layout === "sidebar" && styles.sidebarNavigation]}>
        {items.map((item) => <NavigationItem key={item.label} {...item} layout={layout} />)}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.header,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: colors.charcoal,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 12,
  },
  navigation: { minHeight: 70, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 5, flexDirection: "row", gap: 4 },
  sidebarSafeArea: {
    width: 104,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    shadowOffset: { width: 4, height: 0 },
    zIndex: 2,
  },
  sidebarNavigation: { flex: 1, minHeight: 0, paddingHorizontal: 10, paddingVertical: 18, flexDirection: "column", gap: 10 },
  item: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 4, gap: 4, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  sidebarItem: { flex: 0, width: "100%", minHeight: 68, paddingHorizontal: 6, paddingVertical: 8 },
  itemActive: { backgroundColor: colors.navActive },
  itemPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  icon: { width: 38, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "transparent" },
  iconActive: { backgroundColor: colors.primarySoft, transform: [{ scale: 1.04 }] },
  iconText: { color: colors.icon, fontSize: 20, fontWeight: "900", lineHeight: 22 },
  iconTextActive: { color: colors.primary },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: "center" },
  sidebarLabel: { fontSize: 12 },
  labelActive: { color: colors.primary },
});
