import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PublicUser } from "@meetfair/shared";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest, setApiAccessToken } from "./api";
import { getStoredAccessToken, removeStoredAccessToken, setStoredAccessToken } from "./authStorage";

const LEGACY_TOKEN_KEY = "meetfair.access-token";
const REMEMBER_LOGIN_KEY = "meetfair.remember-login";
const SAVED_EMAIL_KEY = "meetfair.saved-email";

interface SessionContextValue {
  user: PublicUser | null;
  accessToken: string | null;
  loading: boolean;
  rememberLogin: boolean;
  savedEmail: string;
  login(email: string, password: string, rememberLogin?: boolean): Promise<void>;
  register(input: {
    email: string;
    password: string;
    accountId: string;
    nickname: string;
  }): Promise<void>;
  googleLogin(idToken: string, registration?: {
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
  const [rememberLogin, setRememberLogin] = useState(true);
  const [savedEmail, setSavedEmail] = useState("");

  useEffect(() => {
    void Promise.all([
      getStoredAccessToken(),
      AsyncStorage.getItem(REMEMBER_LOGIN_KEY),
      AsyncStorage.getItem(SAVED_EMAIL_KEY),
    ]).then(async ([storedToken, rememberValue, storedEmail]) => {
      const shouldRemember = rememberValue !== "false";
      setRememberLogin(shouldRemember);
      setSavedEmail(storedEmail ?? "");
      let token = storedToken;
      if (!token) {
        const legacyToken = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
        if (legacyToken) {
          token = legacyToken;
          await setStoredAccessToken(legacyToken);
          await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
        }
      }
      if (!token) return;
      setApiAccessToken(token);
      setAccessToken(token);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const data = await apiRequest<{ user: PublicUser }>("/auth/me");
          setUser(data.user);
          return;
        } catch (caught) {
          if (caught instanceof ApiError && caught.status === 401) {
            setApiAccessToken(null);
            setAccessToken(null);
            await removeStoredAccessToken();
            return;
          }
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1_500));
          }
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  async function saveAuth(
    data: { user: PublicUser; accessToken: string },
    persist = true,
    loginEmail = data.user.email,
  ) {
    setApiAccessToken(data.accessToken);
    setAccessToken(data.accessToken);
    setRememberLogin(persist);
    if (persist) {
      const normalizedEmail = loginEmail.trim().toLowerCase();
      setSavedEmail(normalizedEmail);
      await Promise.all([
        setStoredAccessToken(data.accessToken),
        AsyncStorage.setItem(REMEMBER_LOGIN_KEY, "true"),
        AsyncStorage.setItem(SAVED_EMAIL_KEY, normalizedEmail),
      ]);
    } else {
      setSavedEmail("");
      await Promise.all([
        removeStoredAccessToken(),
        AsyncStorage.setItem(REMEMBER_LOGIN_KEY, "false"),
        AsyncStorage.removeItem(SAVED_EMAIL_KEY),
      ]);
    }
    setUser(data.user);
  }

  const value = useMemo<SessionContextValue>(() => ({
    user,
    accessToken,
    loading,
    rememberLogin,
    savedEmail,
    async login(email, password, shouldRemember = true) {
      const data = await apiRequest<{ user: PublicUser; accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await saveAuth(data, shouldRemember, email);
    },
    async register(input) {
      const data = await apiRequest<{ user: PublicUser; accessToken: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await saveAuth(data);
    },
    async googleLogin(idToken, registration) {
      const data = await apiRequest<{ user: PublicUser; accessToken: string }>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken, ...registration }),
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
      await removeStoredAccessToken();
    },
  }), [accessToken, loading, rememberLogin, savedEmail, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
