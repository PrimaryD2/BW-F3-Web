import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const INACTIVITY_MS = 8 * 60 * 60 * 1000; // 8 hours
const STORAGE_KEY_TOKEN = 'f3_token';
const STORAGE_KEY_USER  = 'f3_user';
const STORAGE_KEY_LAST  = 'f3_last_activity';

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(null);
  const [loading, setLoading] = useState(true);
  const inactivityTimer = useRef(null);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_LAST);
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    clearTimeout(inactivityTimer.current);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    localStorage.setItem(STORAGE_KEY_LAST, Date.now().toString());
    clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(logout, INACTIVITY_MS);
  }, [logout]);

  // On activity events
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => {
      if (token) resetInactivityTimer();
    };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [token, resetInactivityTimer]);

  // Restore session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const storedUser  = localStorage.getItem(STORAGE_KEY_USER);
    const lastActivity = parseInt(localStorage.getItem(STORAGE_KEY_LAST) || '0');

    if (storedToken && storedUser && Date.now() - lastActivity < INACTIVITY_MS) {
      const parsedUser = JSON.parse(storedUser);
      setToken(storedToken);
      setUser(parsedUser);
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      resetInactivityTimer();
    } else if (storedToken) {
      logout();
    }
    setLoading(false);
  }, []); // eslint-disable-line

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    localStorage.setItem(STORAGE_KEY_LAST, Date.now().toString());
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(newUser);
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const updateUser = useCallback((updates) => {
    setUser(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isAdmin      = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor' || user?.role === 'admin';
  const isViewer     = user?.role === 'viewer';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser, isAdmin, isSupervisor, isViewer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
