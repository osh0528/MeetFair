import { useEffect } from "react";
import { AppState } from "react-native";
import { syncAutomaticLocation } from "../services/automatic-location";
import { setAutomaticLocationSessionToken } from "../services/automatic-location-core";
import { useSession } from "../services/session";

export function AutomaticLocationBridge() {
  const { user, loading, accessToken } = useSession();
  useEffect(() => {
    if (loading) return;
    setAutomaticLocationSessionToken(accessToken);
    const sync = () => { void syncAutomaticLocation(user?.id ?? null).catch(() => undefined); };
    sync();
    const timer = setInterval(sync, 30_000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") sync(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [user?.id, loading, accessToken]);
  return null;
}
