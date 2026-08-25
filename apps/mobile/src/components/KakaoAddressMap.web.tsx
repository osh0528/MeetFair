import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { appConfig } from "../config/env";
import { colors } from "../theme/colors";
import type { AddressSelection } from "../types/location";

export interface KakaoAddressMapProps {
  query: string;
  requestId: number;
  onResolved: (selection: AddressSelection) => void;
}

declare global {
  interface Window {
    kakao?: any;
    meetfairKakaoMapsLoader?: Promise<void>;
  }
}

function loadKakaoMaps(appKey: string): Promise<void> {
  if (window.kakao?.maps) return Promise.resolve();
  if (window.meetfairKakaoMapsLoader) return window.meetfairKakaoMapsLoader;

  window.meetfairKakaoMapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services`;
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        reject(new Error("카카오 지도 SDK가 정상적으로 로드되지 않았어요."));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => reject(new Error("카카오 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return window.meetfairKakaoMapsLoader;
}

export function KakaoAddressMap({ query, requestId, onResolved }: KakaoAddressMapProps) {
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!appConfig.kakaoMapJsKey) {
      setMessage(".env에 EXPO_PUBLIC_KAKAO_MAP_JS_KEY를 설정해주세요.");
      return;
    }

    let cancelled = false;
    loadKakaoMaps(appConfig.kakaoMapJsKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao?.maps) return;
        const element = containerRef.current as unknown as HTMLElement;
        const center = new window.kakao.maps.LatLng(37.56661, 126.97839);
        mapRef.current = new window.kakao.maps.Map(element, { center, level: 3 });
        markerRef.current = new window.kakao.maps.Marker({ map: mapRef.current, position: center });
        setReady(true);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "카카오 지도를 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !query.trim() || !window.kakao?.maps?.services) return;
    setMessage("주소를 검색하고 있어요.");

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(
      query.trim(),
      (results: any[], status: string) => {
        if (status !== window.kakao.maps.services.Status.OK || !results?.length) {
          setMessage("검색 결과가 없습니다. 도로명 주소로 다시 검색해주세요.");
          return;
        }

        const first = results[0];
        const selection: AddressSelection = {
          address: first.road_address?.address_name || first.address_name,
          latitude: Number(first.y),
          longitude: Number(first.x),
        };
        const position = new window.kakao.maps.LatLng(selection.latitude, selection.longitude);
        mapRef.current?.setCenter(position);
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
          {!message ? <ActivityIndicator color="#191600" /> : null}
          <Text style={styles.message}>{message || "카카오 지도를 불러오는 중이에요."}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, minHeight: 280, backgroundColor: "#F2EFEB" },
  map: { flex: 1, minHeight: 280 },
  overlay: { position: "absolute", left: 16, right: 16, bottom: 16, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#1B3125", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  message: { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center" },
});
