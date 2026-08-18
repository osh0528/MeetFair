import * as Location from "expo-location";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

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
  const [message, setMessage] = useState("버튼을 눌러 위치 공유를 시작하세요.");

  const showMyLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setMessage("위치 권한이 허용되지 않았습니다.");
      return;
    }

    const current = await Location.getCurrentPositionAsync({});
    setCoordinate({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    });
    setMessage("현재 위치를 표시하고 있습니다.");
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={{
          ...coordinate,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
      >
        <Marker coordinate={coordinate} title="내 위치" />
      </MapView>
      <View style={styles.panel}>
        <Text style={styles.title}>출발 체크인</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable style={styles.button} onPress={showMyLocation}>
          <Text style={styles.buttonText}>내 위치 표시</Text>
        </Pressable>
        <Pressable style={styles.pokeButton}>
          <Text style={styles.pokeButtonText}>친구 찌르기 👉</Text>
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
