import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { appConfig } from "../config/env";
import { colors } from "../theme/colors";
import type { AddressCandidate, AddressSelection, MapDisplayMarker } from "../types/location";

export interface KakaoAddressMapProps {
  query: string;
  requestId: number;
  focusTarget?: AddressSelection | null;
  onResults?: (candidates: AddressCandidate[]) => void;
  onResolved?: (selection: AddressSelection) => void;
  interactive?: boolean;
  mapMarkers?: MapDisplayMarker[];
}

declare global {
  interface Window {
    kakao?: any;
    meetfairKakaoMapsLoader?: Promise<void>;
  }
}

function dedupeCandidates(items: AddressCandidate[]): AddressCandidate[] {
  const seen = new Set<string>();
  const unique: AddressCandidate[] = [];
  for (const item of items) {
    const key = `${item.latitude.toFixed(6)}|${item.longitude.toFixed(6)}|${item.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.slice(0, 5);
}

function currentOrigin(): string {
  try {
    return window.location.origin;
  } catch {
    return "(unknown origin)";
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
        reject(
          new Error(
            `카카오 지도 SDK가 정상적으로 로드되지 않았어요. (origin=${currentOrigin()}) — Kakao Developers 콘솔 > 내 애플리케이션 > 플랫폼 > Web에 ${currentOrigin()} 도메인이 등록되어 있는지 확인하세요.`,
          ),
        );
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () =>
      reject(
        new Error(
          `카카오 지도 스크립트를 불러오지 못했습니다. (origin=${currentOrigin()}) — Vercel/배포 환경변수에 EXPO_PUBLIC_KAKAO_MAP_JS_KEY가 설정되어 있고, Kakao Developers 콘솔에 ${currentOrigin()} 도메인이 등록되어 있는지 확인하세요.`,
        ),
      );
    document.head.appendChild(script);
  });

  return window.meetfairKakaoMapsLoader;
}

export function KakaoAddressMap({ query, requestId, focusTarget = null, onResults, onResolved, interactive = false, mapMarkers = [] }: KakaoAddressMapProps) {
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const displayMarkersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  const emitResults = useCallback((items: AddressCandidate[]) => {
    const candidates = dedupeCandidates(items);
    const first = candidates[0];
    if (!first) {
      setMessage("검색 결과가 없습니다. 주소 또는 장소 이름으로 다시 검색해주세요.");
      onResults?.([]);
      return;
    }
    const kakao = window.kakao;
    if (!kakao?.maps) {
      onResults?.(candidates);
      return;
    }
    const position = new kakao.maps.LatLng(first.latitude, first.longitude);
    mapRef.current?.setCenter(position);
    markerRef.current?.setPosition(position);
    setMessage("");
    onResults?.(candidates);
  }, [onResults]);

  useEffect(() => {
    if (!appConfig.kakaoMapJsKey) {
      setMessage(
        `카카오 지도 키가 없어요. 배포 환경(Vercel 등) 환경변수에 EXPO_PUBLIC_KAKAO_MAP_JS_KEY를 설정하고 재배포하세요. (현재 origin=${currentOrigin()})`,
      );
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
        if (interactive) {
          window.kakao.maps.event.addListener(mapRef.current, "click", (mouseEvent: any) => {
            const latlng = mouseEvent.latLng;
            markerRef.current?.setPosition(latlng);
            const geocoder = new window.kakao.maps.services.Geocoder();
            geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (results: any[], status: string) => {
              const first = results?.[0];
              const address = status === window.kakao.maps.services.Status.OK && first
                ? first.road_address?.address_name || first.address?.address_name
                : "지도에서 선택한 위치";
              onResolved?.({ address, latitude: latlng.getLat(), longitude: latlng.getLng() });
            });
          });
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "카카오 지도를 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [interactive, onResolved]);

  useEffect(() => {
    if (!ready || !query.trim() || !window.kakao?.maps?.services) return;
    setMessage("주소를 검색하고 있어요.");

    const kakao = window.kakao;
    const places = new kakao.maps.services.Places();
    const geocoder = new kakao.maps.services.Geocoder();

    // 장소 이름(키워드) 검색을 우선 시도하고, 실패하면 주소 검색으로 폴백한다.
    places.keywordSearch(
      query.trim(),
      (results: any[], status: string) => {
        if (status === kakao.maps.services.Status.OK && results?.length) {
          emitResults(
            results.map((place) => ({
              title: place.place_name,
              address: place.road_address_name || place.address_name || place.place_name,
              latitude: Number(place.y),
              longitude: Number(place.x),
            })),
          );
          return;
        }
        geocoder.addressSearch(
          query.trim(),
          (addressResults: any[], addressStatus: string) => {
            const found = addressStatus === kakao.maps.services.Status.OK && addressResults?.length;
            emitResults(
              found
                ? addressResults.map((item) => ({
                    title: item.address_name,
                    address: item.road_address?.address_name || item.address_name,
                    latitude: Number(item.y),
                    longitude: Number(item.x),
                  }))
                : [],
            );
          },
        );
      },
    );
  }, [emitResults, query, ready, requestId]);

  useEffect(() => {
    if (!ready || interactive || !window.kakao?.maps) return;
    const kakao = window.kakao;
    const geocoder = new kakao.maps.services.Geocoder();

    const listener = kakao.maps.event.addListener(mapRef.current, "click", (mouseEvent: any) => {
      const latitude = mouseEvent.latLng.getLat() as number;
      const longitude = mouseEvent.latLng.getLng() as number;
      markerRef.current?.setPosition(new kakao.maps.LatLng(latitude, longitude));
      geocoder.coord2Address(longitude, latitude, (results: any[], status: string) => {
        const first = results?.[0];
        const name =
          status === kakao.maps.services.Status.OK && first
            ? first.road_address?.address_name || first.address?.address_name || ""
            : "";
        const label = name || "지도에서 선택한 위치";
        emitResults([{ title: label, address: label, latitude, longitude }]);
      });
    });

    return () => {
      if (mapRef.current) kakao.maps.event.removeListener(mapRef.current, "click", listener);
    };
  }, [ready, emitResults, interactive]);

  useEffect(() => {
    if (!focusTarget || !window.kakao?.maps) return;
    const position = new window.kakao.maps.LatLng(focusTarget.latitude, focusTarget.longitude);
    mapRef.current?.setCenter(position);
    markerRef.current?.setPosition(position);
  }, [focusTarget]);

  useEffect(() => {
    if (!ready || !window.kakao?.maps || !mapRef.current) return;
    for (const overlay of displayMarkersRef.current) overlay.setMap(null);
    displayMarkersRef.current = mapMarkers.map((item) => {
      const content = document.createElement("div");
      content.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-8px);font-family:system-ui,sans-serif;";
      const icon = document.createElement("div");
      icon.textContent = "🏠";
      icon.style.cssText = "font-size:25px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3));";
      const label = document.createElement("div");
      label.textContent = item.label;
      label.style.cssText = "padding:3px 7px;border-radius:10px;background:rgba(30,30,30,.88);color:white;font-size:11px;font-weight:800;white-space:nowrap;";
      content.append(icon, label);
      return new window.kakao.maps.CustomOverlay({
        map: mapRef.current,
        position: new window.kakao.maps.LatLng(item.latitude, item.longitude),
        content,
        yAnchor: 1,
      });
    });
  }, [mapMarkers, ready]);

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
