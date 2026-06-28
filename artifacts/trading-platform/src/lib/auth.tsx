import {
  getCurrentUser,
  login,
  setAuthTokenGetter,
  type AuthUser,
  type LoginInput,
} from "@workspace/api-client-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  login: (credentials: LoginInput) => Promise<void>;
  logout: () => void;
  canAccessRole: (role: AuthUser["role"]) => boolean;
}

const TOKEN_KEY = "quantedge.auth.token";
const AuthContext = createContext<AuthContextValue | null>(null);
let memoryToken: string | null = readStoredToken();
const unauthorizedHandlers = new Set<() => void>();

setAuthTokenGetter(() => memoryToken);

export function getAuthToken(): string | null {
  return memoryToken;
}

export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

export function notifyUnauthorized(): void {
  unauthorizedHandlers.forEach((handler) => handler());
}

export function isUnauthorizedError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { status?: unknown }).status === 401);
}

export function authHeaders(): HeadersInit {
  return memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<AuthStatus>(() => memoryToken ? "loading" : "unauthenticated");
  const [user, setUser] = useState<AuthUser | null>(null);

  const clearAuth = useCallback(() => {
    memoryToken = null;
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    navigate("/login", { replace: true });
  }, [clearAuth, navigate]);

  useEffect(() => onUnauthorized(logout), [logout]);

  useEffect(() => {
    let cancelled = false;
    async function validate() {
      if (!memoryToken) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const current = await getCurrentUser();
        if (cancelled) return;
        setUser(current.user);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        clearAuth();
      }
    }
    validate();
    return () => {
      cancelled = true;
    };
  }, [clearAuth]);

  const loginUser = useCallback(async (credentials: LoginInput) => {
    const result = await login(credentials);
    memoryToken = result.accessToken;
    sessionStorage.setItem(TOKEN_KEY, result.accessToken);
    setUser(result.user);
    setStatus("authenticated");
    navigate("/", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    token: memoryToken,
    login: loginUser,
    logout,
    canAccessRole(role) {
      if (!user) return false;
      if (user.role === "admin") return true;
      return user.role === role;
    },
  }), [loginUser, logout, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

function readStoredToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}
