import * as Location from "expo-location";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NaverMapMarkerOverlay, NaverMapView } from "@mj-studio/react-native-naver-map";

interface Coordinate {
  latitude: number;
  longitude: number;
}

const initialCoordinate: Coordinate = {
  latitude: 37.5446,
  longitude: 127.0559,
};

export function TrackingScreen() {
  const [coordinate, setCoordinate] = useState(initialCoordinate);
  const [message, setMessage] = useState("Tap the button to update your current location.");

  const showMyLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setMessage("Location permission is required.");
      return;
    }

    const current = await Location.getCurrentPositionAsync({});
    setCoordinate({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    });
    setMessage("Current location has been updated.");
  };

  return (
    <View style={styles.container}>
      <NaverMapView
        style={styles.map}
        initialCamera={{ ...coordinate, zoom: 16 }}
        isShowLocationButton
      >
        <NaverMapMarkerOverlay
          latitude={coordinate.latitude}
          longitude={coordinate.longitude}
          image={{ symbol: "blue" }}
          anchor={{ x: 0.5, y: 1 }}
          caption={{ text: "Current location" }}
        />
      </NaverMapView>
      <View style={styles.panel}>
        <Text style={styles.title}>Tracking</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable style={styles.button} onPress={showMyLocation}>
          <Text style={styles.buttonText}>Show my location</Text>
        </Pressable>
        <Pressable style={styles.pokeButton}>
          <Text style={styles.pokeButtonText}>Send a poke</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8FC" },
  map: { flex: 1 },
  panel: { backgroundColor: "#FFFFFF", padding: 20, gap: 10 },
  title: { color: "#15314B", fontSize: 22, fontWeight: "800" },
  message: { color: "#5E7184" },
  button: {
    backgroundColor: "#2474E5",
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
  pokeButton: {
    backgroundColor: "#E2F7F3",
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
  },
  pokeButtonText: { color: "#087F72", fontWeight: "700" },
});
