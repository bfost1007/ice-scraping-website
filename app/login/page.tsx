"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<"owner" | "worker">("owner");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(next: "owner" | "worker") {
    setRole(next);
    setUsername("");
    setPassword("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, username, password }) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to sign in. Please try again.");
        return;
      }
      router.replace("/internal");
      router.refresh();
    } catch {
      setError("We couldn’t reach the sign-in service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="staff-signin">
      <a className="staff-signin-brand" href="/">Blake <b>Scrapes</b></a>
      <section className="staff-signin-card" aria-labelledby="signin-title">
        <p className="staff-signin-kicker">Staff access</p>
        <h1 id="signin-title">Welcome back.</h1>
        <p className="staff-signin-intro">Sign in to see your routes, customers, and work for the day.</p>
        <div className="staff-signin-switch" role="group" aria-label="Sign in as">
          <button type="button" aria-pressed={role === "owner"} onClick={() => selectRole("owner")} disabled={loading}>Owner</button>
          <button type="button" aria-pressed={role === "worker"} onClick={() => selectRole("worker")} disabled={loading}>Employee</button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="staff-username">{role === "owner" ? "Username" : "Email"}</label>
          <input id="staff-username" name="username" type={role === "owner" ? "text" : "email"} autoCapitalize="none" spellCheck={false} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required disabled={loading} />
          <label htmlFor="staff-password">Password</label>
          <input id="staff-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading} />
          {error && <p className="staff-signin-error" role="alert">{error}</p>}
          <button className="staff-signin-submit" type="submit" disabled={loading}>{loading ? "Signing in…" : `Sign in as ${role === "owner" ? "owner" : "employee"}`}<span aria-hidden="true"> →</span></button>
        </form>
        {role === "worker" && <p className="staff-signin-help">Use the email and password provided by the owner.</p>}
      </section>
      <a className="staff-signin-back" href="/">← Back to the website</a>
    </main>
  );
}
