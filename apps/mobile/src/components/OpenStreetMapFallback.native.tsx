import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import RNCWebView, { type WebViewProps } from "react-native-webview";
import type { AddressSelection, MapDisplayMarker } from "../types/location";
import { buildOpenStreetMapHtml } from "./openStreetMapHtml";

const WebView = RNCWebView as unknown as React.ComponentType<WebViewProps>;

export function OpenStreetMapFallback({
  focusTarget,
  mapMarkers,
}: {
  focusTarget?: AddressSelection | null;
  mapMarkers: MapDisplayMarker[];
}) {
  const html = useMemo(() => buildOpenStreetMapHtml(
    mapMarkers.length
      ? mapMarkers.map((marker) => ({
          latitude: marker.latitude,
          longitude: marker.longitude,
          label: marker.label,
        }))
      : focusTarget
        ? [{ latitude: focusTarget.latitude, longitude: focusTarget.longitude, label: focusTarget.address }]
        : [],
  ), [focusTarget, mapMarkers]);

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://localhost" }}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 280, overflow: "hidden" },
  webView: { flex: 1, backgroundColor: "#F5F5F5" },
});
