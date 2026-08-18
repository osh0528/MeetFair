import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MeetingScreen } from "./src/screens/MeetingScreen";
import { TrackingScreen } from "./src/screens/TrackingScreen";

export type RootStackParamList = {
  Home: undefined;
  Meeting: undefined;
  Tracking: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "#F4F8FC" },
          headerTintColor: "#15314B",
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "MeetFair" }} />
        <Stack.Screen
          name="Meeting"
          component={MeetingScreen}
          options={{ title: "약속 상세" }}
        />
        <Stack.Screen
          name="Tracking"
          component={TrackingScreen}
          options={{ title: "실시간 위치" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
