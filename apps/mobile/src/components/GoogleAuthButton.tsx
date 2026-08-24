import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { appConfig } from "../config/env";
import { Button } from "./Button";

WebBrowser.maybeCompleteAuthSession();

interface Props {
  label: string;
  disabled?: boolean;
  onIdToken(idToken: string): Promise<void>;
  onError(error: Error): void;
}

function configuredClientId() {
  if (Platform.OS === "android") return appConfig.googleAndroidClientId;
  if (Platform.OS === "ios") return appConfig.googleIosClientId;
  return appConfig.googleWebClientId;
}

function ConfiguredGoogleAuthButton({ label, disabled, onIdToken, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const onIdTokenRef = useRef(onIdToken);
  const onErrorRef = useRef(onError);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: appConfig.googleWebClientId,
    androidClientId: appConfig.googleAndroidClientId,
    iosClientId: appConfig.googleIosClientId,
    selectAccount: true,
  });

  useEffect(() => {
    onIdTokenRef.current = onIdToken;
    onErrorRef.current = onError;
  }, [onError, onIdToken]);

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") {
      setBusy(false);
      return;
    }
    const idToken = response.params.id_token;
    if (!idToken) {
      setBusy(false);
      onErrorRef.current(new Error("Google 로그인 토큰을 받지 못했습니다."));
      return;
    }
    void onIdTokenRef.current(idToken).catch((error) => {
      onErrorRef.current(error instanceof Error ? error : new Error("Google 로그인에 실패했습니다."));
    }).finally(() => setBusy(false));
  }, [response]);

  return (
    <Button
      disabled={disabled || busy || !request}
      label={busy ? "Google 로그인 중..." : label}
      leftLabel="G"
      onPress={() => {
        setBusy(true);
        void promptAsync().catch((error) => {
          setBusy(false);
          onErrorRef.current(error instanceof Error ? error : new Error("Google 로그인에 실패했습니다."));
        });
      }}
      variant="secondary"
    />
  );
}

export function GoogleAuthButton(props: Props) {
  if (!configuredClientId()) {
    return <Button disabled label="Google 로그인 (설정 필요)" leftLabel="G" variant="secondary" />;
  }
  return <ConfiguredGoogleAuthButton {...props} />;
}
