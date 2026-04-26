import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const AuthContext = createContext(null);
const SESSION_KEY = "f3-session";
const LAST_ACTIVE_KEY = "f3-last-active";
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LAST_ACTIVE_KEY);
    setSession(null);
  }, []);

  const touch = useCallback(() => {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  }, []);

  useEffect(() => {
    if (!session) return;
    touch();
    const events = ["click", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
    const timer = window.setInterval(() => {
      const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || Date.now());
      if (Date.now() - last > EIGHT_HOURS) logout();
    }, 60_000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, touch));
      window.clearInterval(timer);
    };
  }, [logout, session, touch]);

  async function login(username, password) {
    const data = await api("/auth/login", { method: "POST", body: { username, password } });
    const next = { token: data.token, user: data.user };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    touch();
    return next;
  }

  async function changePassword(currentPassword, newPassword) {
    await api("/auth/change-password", { method: "POST", token: session.token, body: { currentPassword, newPassword } });
    const next = { ...session, user: { ...session.user, mustChangePassword: false } };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }

  const value = useMemo(() => ({ session, login, logout, changePassword }), [session, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
