import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export function LoginPage() {
  const { login, changePassword, session } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await login(username, password);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    setError("");
    try {
      await changePassword(password, newPassword);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (session?.user.mustChangePassword) {
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={updatePassword}>
          <p className="eyebrow">First login</p>
          <h1>Change Password</h1>
          <p className="muted">The default admin password must be changed before using the system.</p>
          <label>Current password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          {error ? <div className="error-message">{error}</div> : null}
          <button className="primary-button" type="submit">Save Password</button>
        </form>
      </main>
    );
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <p className="eyebrow">Factory production management</p>
        <h1>F3 Station</h1>
        <p className="muted">Sign in to manage airplane production, tasks, NCRs, and time logs.</p>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error ? <div className="error-message">{error}</div> : null}
        <button className="primary-button" type="submit">Sign In</button>
      </form>
    </main>
  );
}
