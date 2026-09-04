import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import RNCWebView, { type WebViewMessageEvent, type WebViewProps } from "react-native-webview";
import { appConfig } from "../config/env";
import { colors } from "../theme/colors";
import type { AddressCandidate, AddressSelection, MapDisplayMarker } from "../types/location";
import { OpenStreetMapFallback } from "./OpenStreetMapFallback";

// react-native-webview@14.0.1 루트 index.d.ts는 `Component<WebViewProps & P>`(P=undefined)라
// props 타입이 never로 붕괴되는 업스트림 타입 버그가 있다.
// 패키지 내부 플랫폼 d.ts(lib/WebView.*.d.ts)와 동일한 형태로 재선언해 우회한다.
interface WebViewInstance {
  goBack(): void;
  goForward(): void;
  reload(): void;
  stopLoading(): void;
  injectJavaScript(script: string): void;
  requestFocus(): void;
  postMessage(message: string): void;
}

const WebView = RNCWebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebViewInstance>
>;

export interface KakaoAddressMapProps {
  query: string;
  requestId: number;
  focusTarget?: AddressSelection | null;
  onResults?: (candidates: AddressCandidate[]) => void;
  onResolved?: (selection: AddressSelection) => void;
  onLocationConfirmed?: (selection: AddressSelection) => void;
  interactive?: boolean;
  mapMarkers?: MapDisplayMarker[];
  fitMarkers?: boolean;
}

const DEFAULT_CENTER = { lat: 37.56661, lng: 126.97839 };
const EMPTY_MAP_MARKERS: MapDisplayMarker[] = [];

function buildMapHtml(appKey: string, interactive: boolean): string {
  const head =
    "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\" />" +
    "<style>html,body{width:100%;height:100%;margin:0;padding:0}#map{width:100%;height:100%}</style>" +
    "<script src=\"https://dapi.kakao.com/v2/maps/sdk.js?appkey=" +
    encodeURIComponent(appKey) +
    "&autoload=false&libraries=services\"></script></head><body><div id=\"map\"></div><script>";
  const clickHandler = `
    kakao.maps.event.addListener(map, "click", function (mouseEvent) {
      var latlng = mouseEvent.latLng;
      marker.setPosition(latlng);
      geocoder.coord2Address(latlng.getLng(), latlng.getLat(), function (result, status) {
        var address = status === kakao.maps.services.Status.OK && result && result[0]
          ? ((result[0].road_address && result[0].road_address.address_name) || result[0].address.address_name)
          : "지도에서 선택한 위치";
        post({ type: "results", items: [{ title: address, address: address, latitude: latlng.getLat(), longitude: latlng.getLng() }] });
        ${interactive ? 'post({ type: "resolved", address: address, latitude: latlng.getLat(), longitude: latlng.getLng() });' : ""}
      });
    });
  `;
  const body = `
(function () {
  var map = null;
  var marker = null;
  var geocoder = null;
  var places = null;

  function post(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function focusAt(lat, lng) {
    var position = new kakao.maps.LatLng(lat, lng);
    map.setCenter(position);
    marker.setPosition(position);
  }

  function respond(items) {
    var seen = {};
    var candidates = [];
    items.forEach(function (item) {
      if (typeof item.latitude !== "number" || typeof item.longitude !== "number") return;
      var key = item.latitude.toFixed(6) + "|" + item.longitude.toFixed(6) + "|" + item.address;
      if (seen[key]) return;
      seen[key] = true;
      candidates.push(item);
    });
    if (!candidates.length) {
      post({ type: "not-found" });
      return;
    }
    focusAt(candidates[0].latitude, candidates[0].longitude);
    post({ type: "results", items: candidates.slice(0, 5) });
  }

  function init() {
    var el = document.getElementById("map");
    var center = new kakao.maps.LatLng(${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng});
    map = new kakao.maps.Map(el, { center: center, level: 3 });
    marker = new kakao.maps.Marker({ position: center });
    marker.setMap(map);
    geocoder = new kakao.maps.services.Geocoder();
    places = new kakao.maps.services.Places();
    kakao.maps.event.addListener(map, "click", function (mouseEvent) {
      var lat = mouseEvent.latLng.getLat();
      var lng = mouseEvent.latLng.getLng();
      marker.setPosition(mouseEvent.latLng);
      geocoder.coord2Address(lng, lat, function (results, status) {
        var name = "";
        if (status === kakao.maps.services.Status.OK && results && results.length) {
          name = (results[0].road_address && results[0].road_address.address_name)
            || (results[0].address && results[0].address.address_name)
            || "";
        }
        var label = name || "지도에서 선택한 위치";
        post({
          type: "results",
          items: [{ title: label, address: label, latitude: lat, longitude: lng }]
        });
        ${interactive ? 'post({ type: "resolved", address: label, latitude: lat, longitude: lng });' : ""}
      });
    });
    post({ type: "ready" });
  }

  window.meetfairSearch = function (query) {
    if (!places || !geocoder) return;
    places.keywordSearch(query, function (results, status) {
      if (status === kakao.maps.services.Status.OK && results && results.length) {
        respond(results.map(function (place) {
          return {
            title: place.place_name,
            address: place.road_address_name || place.address_name || place.place_name,
            latitude: Number(place.y),
            longitude: Number(place.x)
          };
        }));
        return;
      }
      geocoder.addressSearch(query, function (addrResults, addrStatus) {
        if (addrStatus !== kakao.maps.services.Status.OK || !addrResults || !addrResults.length) {
          post({ type: "not-found" });
          return;
        }
        respond(addrResults.map(function (item) {
          return {
            title: item.address_name,
            address: (item.road_address && item.road_address.address_name) || item.address_name,
            latitude: Number(item.y),
            longitude: Number(item.x)
          };
        }));
      });
    });
  };

  window.meetfairFocus = function (lat, lng) {
    if (!map || !marker) return;
    focusAt(Number(lat), Number(lng));
  };

  var displayOverlays = [];
  window.meetfairSetMarkers = function (items, fitMarkers) {
    displayOverlays.forEach(function (overlay) { overlay.setMap(null); });
    displayOverlays = (items || []).map(function (item) {
      var content = document.createElement("div");
      content.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-8px);font-family:system-ui,sans-serif;";
      var icon = document.createElement("div");
      icon.textContent = item.kind === "RECOMMENDED" ? "✨" : item.kind === "LIVE" ? "●" : "🏠";
      icon.style.cssText = item.kind === "RECOMMENDED"
        ? "width:32px;height:32px;border-radius:16px;background:radial-gradient(circle,#60A5FA 0%,#2563EB 62%,#172554 100%);border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 0 4px rgba(59,130,246,.18),0 5px 12px rgba(37,99,235,.4);"
        : item.kind === "LIVE"
        ? "color:#1677FF;font-size:28px;line-height:28px;text-shadow:0 2px 5px rgba(0,0,0,.35);"
        : "font-size:25px;";
      var label = document.createElement("div");
      label.textContent = item.label;
      label.style.cssText = item.kind === "RECOMMENDED"
        ? "padding:5px 10px;border-radius:12px;background:linear-gradient(135deg,#2563EB,#172554);color:white;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 4px 12px rgba(37,99,235,.35);"
        : item.kind === "LIVE"
        ? "padding:3px 7px;border-radius:10px;background:rgba(22,119,255,.92);color:white;font-size:11px;font-weight:800;white-space:nowrap;"
        : "padding:3px 7px;border-radius:10px;background:rgba(30,30,30,.88);color:white;font-size:11px;font-weight:800;white-space:nowrap;";
      content.appendChild(icon);
      content.appendChild(label);
      return new kakao.maps.CustomOverlay({ map: map, position: new kakao.maps.LatLng(item.latitude, item.longitude), content: content, yAnchor: 1 });
    });
    if (fitMarkers && map && items && items.length > 1) {
      var bounds = new kakao.maps.LatLngBounds();
      items.forEach(function (item) {
        bounds.extend(new kakao.maps.LatLng(item.latitude, item.longitude));
      });
      map.setBounds(bounds, 48, 48, 48, 48);
    } else if (fitMarkers && map && items && items.length === 1) {
      map.setCenter(new kakao.maps.LatLng(items[0].latitude, items[0].longitude));
    }
  };

  if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
    kakao.maps.load(init);
    setTimeout(function () {
      if (!map) post({ type: "load-failed" });
    }, 6000);
  } else {
    post({ type: "load-failed" });
  }
})();
`;
  const tail = "</script></body></html>";
  return head + body + tail;
}

export function KakaoAddressMap({ query, requestId, focusTarget = null, onResults, onResolved, interactive = false, mapMarkers = EMPTY_MAP_MARKERS, fitMarkers = true }: KakaoAddressMapProps) {
  const webViewRef = useRef<WebViewInstance>(null);
  const readyRef = useRef(false);
  const pendingQueryRef = useRef("");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const webViewSource = useMemo(() => ({
    html: buildMapHtml(appConfig.kakaoMapJsKey, interactive),
    baseUrl: "https://localhost",
  }), [interactive]);

  const runSearch = useCallback((searchQuery: string) => {
    webViewRef.current?.injectJavaScript(`window.meetfairSearch(${JSON.stringify(searchQuery)}); true;`);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (readyRef.current) {
      runSearch(trimmed);
    } else {
      pendingQueryRef.current = trimmed;
    }
  }, [query, requestId, runSearch]);

  useEffect(() => {
    if (!readyRef.current || !focusTarget) return;
    webViewRef.current?.injectJavaScript(
      `window.meetfairFocus(${focusTarget.latitude}, ${focusTarget.longitude}); true;`,
    );
  }, [focusTarget, ready]);

  useEffect(() => {
    if (!readyRef.current) return;
    webViewRef.current?.injectJavaScript(`window.meetfairSetMarkers(${JSON.stringify(mapMarkers)}, ${fitMarkers}); true;`);
  }, [fitMarkers, mapMarkers, ready]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: {
        type?: string;
        items?: AddressCandidate[];
        address?: string;
        latitude?: number;
        longitude?: number;
      };
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch (error) {
        console.warn("카카오 지도 메시지 파싱에 실패했어요.", error);
        return;
      }

      if (data.type === "ready") {
        readyRef.current = true;
        setReady(true);
        const pending = pendingQueryRef.current;
        pendingQueryRef.current = "";
        if (pending) runSearch(pending);
        return;
      }
      if (data.type === "not-found") {
        setMessage("검색 결과가 없습니다. 주소 또는 장소 이름으로 다시 검색해주세요.");
        onResults?.([]);
        return;
      }
      if (data.type === "load-failed") {
        setMessage(
          "카카오 지도를 불러오지 못했습니다. 키가 유효한지, Kakao Developers 콘솔 > 플랫폼 > Web에 배포 도메인(예: https://your-app.vercel.app)과 https://localhost 가 등록되어 있는지 확인해주세요.",
        );
        return;
      }
      if (data.type === "results" && Array.isArray(data.items)) {
        setMessage("");
        onResults?.(data.items);
        return;
      }
      if (
        data.type === "resolved"
        && typeof data.address === "string"
        && typeof data.latitude === "number"
        && typeof data.longitude === "number"
      ) {
        onResolved?.({ address: data.address, latitude: data.latitude, longitude: data.longitude });
      }
    },
    [onResolved, onResults, runSearch],
  );

  if (!appConfig.kakaoMapJsKey) {
    return <OpenStreetMapFallback focusTarget={focusTarget} mapMarkers={mapMarkers} />;
  }

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={webViewSource}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        scrollEnabled={false}
      />
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
  wrapper: { flex: 1, minHeight: 280, backgroundColor: "#F2EFEB", overflow: "hidden" },
  fallback: { alignItems: "center", justifyContent: "center", padding: 16 },
  overlay: { position: "absolute", left: 16, right: 16, bottom: 16, borderRadius: 6, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#1B3125", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  message: { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center", flexShrink: 1 },
});
