import { createElement, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { AddressSelection, MapDisplayMarker } from "../types/location";
import { buildOpenStreetMapHtml } from "./openStreetMapHtml";

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
      {createElement("iframe", {
        title: "추천 장소 지도",
        srcDoc: html,
        style: { width: "100%", height: "100%", border: 0 },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 280, overflow: "hidden" },
});
