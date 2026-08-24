import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
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
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { MeetingInvitationScreen } from "./src/screens/MeetingInvitationScreen";
import { PublicMeetingRequestScreen } from "./src/screens/PublicMeetingRequestScreen";
import { VideoCallScreen } from "./src/screens/VideoCallScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SessionProvider } from "./src/services/session";
import type { MeetingInvitationSummary } from "@meetfair/shared";
import { colors } from "./src/theme/colors";
import type { AddressSelection } from "./src/types/location";

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
  Notifications: undefined;
  Settings: undefined;
  Profile: undefined;
  MeetingInvitation: { invitation: MeetingInvitationSummary };
  PublicMeetingRequest: { meetingId: string };
  VideoCall: { callId: string; meetingId: string };
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
    <SessionProvider>
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style="dark" />
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
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="MeetingInvitation" component={MeetingInvitationScreen} />
          <Stack.Screen name="PublicMeetingRequest" component={PublicMeetingRequestScreen} />
          <Stack.Screen name="VideoCall" component={VideoCallScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
    </SessionProvider>
  );
}
