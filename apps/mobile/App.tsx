import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AddressSearchScreen } from "./src/screens/AddressSearchScreen";
import { CreateMeetingScreen } from "./src/screens/CreateMeetingScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MeetingScreen } from "./src/screens/MeetingScreen";
import { RecommendationsScreen } from "./src/screens/RecommendationsScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { TrackingScreen } from "./src/screens/TrackingScreen";
import { FriendsScreen } from "./src/screens/FriendsScreen";
import { FriendRequestsScreen } from "./src/screens/FriendRequestsScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { MeetingInvitationScreen } from "./src/screens/MeetingInvitationScreen";
import { PublicMeetingRequestScreen } from "./src/screens/PublicMeetingRequestScreen";
import { VideoCallScreen } from "./src/screens/VideoCallScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { UserPageScreen } from "./src/screens/UserPageScreen";
import { SessionProvider, useSession } from "./src/services/session";
import { PokeNotificationBridge } from "./src/components/PokeNotificationBridge";
import { AppBottomNavigation } from "./src/components/AppBottomNavigation";
import type { MeetingInvitationSummary } from "@meetfair/shared";
import { colors } from "./src/theme/colors";
import type { AddressSelection } from "./src/types/location";
import { ThemeProvider } from "./src/services/theme";
import { DirectMessagesScreen } from "./src/screens/DirectMessagesScreen";
import { MiniHomeSearchScreen } from "./src/screens/MiniHomeSearchScreen";

export type RootStackParamList = {
  Login: undefined;
  Register: { selectedAddress?: AddressSelection } | undefined;
  AddressSearch: undefined;
  Home: undefined;
  CreateMeeting: undefined;
  Recommendations: undefined;
  Meeting: { meetingId: string };
  Tracking: { meetingId: string };
  Friends: undefined;
  FriendRequests: undefined;
  Notifications: undefined;
  Settings: undefined;
  Profile: undefined;
  UserPage: { userId: string };
  MeetingInvitation: { invitation: MeetingInvitationSummary };
  PublicMeetingRequest: { meetingId: string };
  VideoCall: { callId: string; meetingId: string };
  DirectMessages: { friendId?: string } | undefined;
  MiniHomeSearch: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <PokeNotificationBridge />
        <SafeAreaProvider>
          <AppNavigator />
        </SafeAreaProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

function AppNavigator() {
  const { user } = useSession();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [currentRoute, setCurrentRoute] = useState<keyof RootStackParamList>("Login");
  const bottomNavHidden = currentRoute === "Login" || currentRoute === "Register" || currentRoute === "VideoCall";

  function updateCurrentRoute() {
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName) setCurrentRoute(routeName);
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={updateCurrentRoute}
      onStateChange={updateCurrentRoute}
    >
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="AddressSearch" component={AddressSearchScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="CreateMeeting" component={CreateMeetingScreen} />
          <Stack.Screen name="Recommendations" component={RecommendationsScreen} />
          <Stack.Screen name="Meeting" component={MeetingScreen} />
          <Stack.Screen name="Tracking" component={TrackingScreen} />
          <Stack.Screen name="Friends" component={FriendsScreen} />
          <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="UserPage" component={UserPageScreen} />
          <Stack.Screen name="MeetingInvitation" component={MeetingInvitationScreen} />
          <Stack.Screen name="PublicMeetingRequest" component={PublicMeetingRequestScreen} />
          <Stack.Screen name="VideoCall" component={VideoCallScreen} />
          <Stack.Screen name="DirectMessages" component={DirectMessagesScreen} />
          <Stack.Screen name="MiniHomeSearch" component={MiniHomeSearchScreen} />
        </Stack.Navigator>
        {user && !bottomNavHidden ? (
          <AppBottomNavigation
            currentRoute={currentRoute}
            onMeetings={() => navigationRef.navigate("Home")}
            onFriends={() => navigationRef.navigate("Friends")}
            onSettings={() => navigationRef.navigate("Settings")}
            onUserPage={() => navigationRef.navigate("UserPage", { userId: user.id })}
          />
        ) : null}
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  appShell: { flex: 1 },
});
