import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { appConfig } from "../config/env";
import { colors } from "../theme/colors";
import type { AddressSelection } from "../types/location";

export interface NaverAddressMapProps {
  query: string;
  requestId: number;
  onResolved: (selection: AddressSelection) => void;
}

declare global {
  interface Window {
    naver?: any;
    meetfairNaverMapsLoader?: Promise<void>;
  }
}

function loadNaverMaps(keyId: string): Promise<void> {
  if (window.naver?.maps) return Promise.resolve();
  if (window.meetfairNaverMapsLoader) return window.meetfairNaverMapsLoader;

  window.meetfairNaverMapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(keyId)}&submodules=geocoder`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("네이버 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return window.meetfairNaverMapsLoader;
}

export function NaverAddressMap({ query, requestId, onResolved }: NaverAddressMapProps) {
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!appConfig.naverMapNcpKeyId) {
      setMessage(".env에 EXPO_PUBLIC_NAVER_MAP_NCP_KEY_ID를 설정해주세요.");
      return;
    }

    let cancelled = false;
    loadNaverMaps(appConfig.naverMapNcpKeyId)
      .then(() => {
        if (cancelled || !containerRef.current || !window.naver?.maps) return;
        const element = containerRef.current as unknown as HTMLElement;
        const center = new window.naver.maps.LatLng(37.56661, 126.97839);
        mapRef.current = new window.naver.maps.Map(element, { center, zoom: 15 });
        markerRef.current = new window.naver.maps.Marker({ map: mapRef.current, position: center });
        setReady(true);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "네이버 지도를 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !query.trim() || !window.naver?.maps?.Service) return;
    setMessage("주소를 검색하고 있어요.");

    window.naver.maps.Service.geocode(
      { query: query.trim() },
      (status: string, response: any) => {
        if (status !== window.naver.maps.Service.Status.OK || !response.v2.addresses.length) {
          setMessage("검색 결과가 없습니다. 도로명 주소로 다시 검색해주세요.");
          return;
        }

        const first = response.v2.addresses[0];
        const selection: AddressSelection = {
          address: first.roadAddress || first.jibunAddress,
          latitude: Number(first.y),
          longitude: Number(first.x),
        };
        const position = new window.naver.maps.LatLng(selection.latitude, selection.longitude);
        mapRef.current?.setCenter(position);
        mapRef.current?.setZoom(17);
        markerRef.current?.setPosition(position);
        setMessage("");
        onResolved(selection);
      },
    );
  }, [onResolved, query, ready, requestId]);

  return (
    <View style={styles.wrapper}>
      <View ref={containerRef} style={styles.map} />
      {!ready || message ? (
        <View style={styles.overlay} pointerEvents="none">
          {!message ? <ActivityIndicator color="#03A94D" /> : null}
          <Text style={styles.message}>{message || "네이버 지도를 불러오는 중이에요."}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, minHeight: 280, backgroundColor: "#E8EEE9" },
  map: { flex: 1, minHeight: 280 },
  overlay: { position: "absolute", left: 16, right: 16, bottom: 16, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#1B3125", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  message: { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center" },
});
