import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import RNCWebView, { type WebViewMessageEvent, type WebViewProps } from "react-native-webview";
import { appConfig } from "../config/env";
import { colors } from "../theme/colors";
import type { AddressSelection } from "../types/location";

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
  onResolved: (selection: AddressSelection) => void;
}

const DEFAULT_CENTER = { lat: 37.56661, lng: 126.97839 };

function buildMapHtml(appKey: string): string {
  const head =
    "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\" />" +
    "<style>html,body{width:100%;height:100%;margin:0;padding:0}#map{width:100%;height:100%}</style>" +
    "<script src=\"https://dapi.kakao.com/v2/maps/sdk.js?appkey=" +
    encodeURIComponent(appKey) +
    "&autoload=false&libraries=services\"></script></head><body><div id=\"map\"></div><script>";
  const body = `
(function () {
  var map = null;
  var marker = null;
  var geocoder = null;

  function post(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  function init() {
    var el = document.getElementById("map");
    var center = new kakao.maps.LatLng(${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng});
    map = new kakao.maps.Map(el, { center: center, level: 3 });
    marker = new kakao.maps.Marker({ position: center });
    marker.setMap(map);
    geocoder = new kakao.maps.services.Geocoder();
    post({ type: "ready" });
  }

  window.meetfairSearch = function (query) {
    if (!geocoder) return;
    geocoder.addressSearch(query, function (results, status) {
      if (status !== kakao.maps.services.Status.OK || !results || !results.length) {
        post({ type: "not-found" });
        return;
      }
      var first = results[0];
      var lat = Number(first.y);
      var lng = Number(first.x);
      var position = new kakao.maps.LatLng(lat, lng);
      map.setCenter(position);
      marker.setPosition(position);
      post({
        type: "resolved",
        address: (first.road_address && first.road_address.address_name) || first.address_name,
        latitude: lat,
        longitude: lng
      });
    });
  };

  if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
    kakao.maps.load(init);
  } else {
    post({ type: "load-failed" });
  }
})();
`;
  const tail = "</script></body></html>";
  return head + body + tail;
}

export function KakaoAddressMap({ query, requestId, onResolved }: KakaoAddressMapProps) {
  const webViewRef = useRef<WebViewInstance>(null);
  const readyRef = useRef(false);
  const pendingQueryRef = useRef("");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

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

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: { type?: string; address?: string; latitude?: number; longitude?: number };
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
        setMessage("검색 결과가 없습니다. 도로명 주소로 다시 검색해주세요.");
        return;
      }
      if (data.type === "load-failed") {
        setMessage("카카오 지도를 불러오지 못했습니다. 키와 도메인 등록을 확인해주세요.");
        return;
      }
      if (data.type === "resolved" && typeof data.latitude === "number" && typeof data.longitude === "number") {
        setMessage("");
        onResolved({
          address: data.address ?? "",
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    },
    [onResolved, runSearch],
  );

  if (!appConfig.kakaoMapJsKey) {
    return (
      <View style={[styles.wrapper, styles.fallback]}>
        <Text style={styles.message}>.env에 EXPO_PUBLIC_KAKAO_MAP_JS_KEY를 설정해주세요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: buildMapHtml(appConfig.kakaoMapJsKey), baseUrl: "https://localhost" }}
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
  overlay: { position: "absolute", left: 16, right: 16, bottom: 16, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#1B3125", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  message: { color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center", flexShrink: 1 },
});
