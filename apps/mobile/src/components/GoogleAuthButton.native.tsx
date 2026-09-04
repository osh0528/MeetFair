import Constants from "expo-constants";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { useEffect, useRef, useState } from "react";
import { appConfig } from "../config/env";
import { Button } from "./Button";

WebBrowser.maybeCompleteAuthSession();

interface Props {
  label: string;
  disabled?: boolean;
  onIdToken(idToken: string): Promise<void>;
  onError(error: Error): void;
}

const isExpoGo = Constants.appOwnership === "expo";

function useHandlerRefs(onIdToken: Props["onIdToken"], onError: Props["onError"]) {
  const onIdTokenRef = useRef(onIdToken);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onIdTokenRef.current = onIdToken;
    onErrorRef.current = onError;
  }, [onError, onIdToken]);
  return { onIdTokenRef, onErrorRef };
}

function failRef(error: unknown, onErrorRef: React.MutableRefObject<Props["onError"]>) {
  onErrorRef.current(error instanceof Error ? error : new Error("Google 로그인에 실패했습니다."));
}

function NativeGoogleButton({ label, disabled, onIdToken, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const { onIdTokenRef, onErrorRef } = useHandlerRefs(onIdToken, onError);

  async function signIn() {
    if (busy) return;
    setBusy(true);
    try {
      const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
      GoogleSignin.configure({ webClientId: appConfig.googleWebClientId });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken
        ?? (response as unknown as { idToken?: string }).idToken;
      if (!idToken) throw new Error("Google 로그인 토큰을 받지 못했습니다.");
      await onIdTokenRef.current(idToken);
    } catch (error) {
      if (
        isErrorWithCode(error)
        && (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS)
      ) {
        return;
      }
      failRef(error, onErrorRef);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      disabled={disabled || busy}
      label={busy ? "Google 로그인 중..." : label}
      leftLabel="G"
      onPress={() => void signIn()}
      variant="secondary"
    />
  );
}

function ExpoGoGoogleButton({ label, disabled, onIdToken, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const { onIdTokenRef, onErrorRef } = useHandlerRefs(onIdToken, onError);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: appConfig.googleWebClientId,
    redirectUri: AuthSession.makeRedirectUri({ useProxy: true }),
    selectAccount: true,
  });

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
          failRef(error, onErrorRef);
        });
      }}
      variant="secondary"
    />
  );
}

export function GoogleAuthButton(props: Props) {
  if (!appConfig.googleWebClientId) {
    return <Button disabled label="Google 로그인 (설정 필요)" leftLabel="G" variant="secondary" />;
  }
  if (isExpoGo) return <ExpoGoGoogleButton {...props} />;
  if (!appConfig.googleAndroidClientId) {
    return <Button disabled label="Google 로그인 (설정 필요)" leftLabel="G" variant="secondary" />;
  }
  return <NativeGoogleButton {...props} />;
}
