import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PublicUser } from "@meetfair/shared";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, setApiAccessToken } from "./api";

const TOKEN_KEY = "meetfair.access-token";

interface SessionContextValue {
  user: PublicUser | null;
  accessToken: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: {
    email: string;
    password: string;
    accountId: string;
    nickname: string;
  }): Promise<void>;
  refreshUser(): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void AsyncStorage.getItem(TOKEN_KEY).then(async (token) => {
      if (!token) return;
      setApiAccessToken(token);
      setAccessToken(token);
      try {
        const data = await apiRequest<{ user: PublicUser }>("/auth/me");
        setUser(data.user);
      } catch {
        setApiAccessToken(null);
        setAccessToken(null);
        await AsyncStorage.removeItem(TOKEN_KEY);
      }
    }).finally(() => setLoading(false));
  }, []);

  async function saveAuth(data: { user: PublicUser; accessToken: string }) {
    setApiAccessToken(data.accessToken);
    setAccessToken(data.accessToken);
    await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
    setUser(data.user);
  }

  const value = useMemo<SessionContextValue>(() => ({
    user,
    accessToken,
    loading,
    async login(email, password) {
      const data = await apiRequest<{ user: PublicUser; accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await saveAuth(data);
    },
    async register(input) {
      const data = await apiRequest<{ user: PublicUser; accessToken: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await saveAuth(data);
    },
    async refreshUser() {
      const data = await apiRequest<{ user: PublicUser }>("/auth/me");
      setUser(data.user);
    },
    async logout() {
      setApiAccessToken(null);
      setAccessToken(null);
      setUser(null);
      await AsyncStorage.removeItem(TOKEN_KEY);
    },
  }), [accessToken, loading, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
