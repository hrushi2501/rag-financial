"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { setApiAccessToken } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token || null);
      setReady(true);
    });
    return () => {
      data.subscription.unsubscribe();
      setApiAccessToken(null);
    };
  }, [supabase]);

  if (!ready) {
    return <main className="auth-shell"><div className="auth-card"><span className="auth-loader" /><p>Restoring your secure workspace…</p></div></main>;
  }
  if (!supabase) return children;
  if (session) {
    return (
      <>
        {children}
        <button className="auth-signout" type="button" onClick={() => void supabase.auth.signOut()}>
          Sign out · {session.user.email}
        </button>
      </>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(error ? error.message : "Check your inbox for a secure sign-in link.");
    setSubmitting(false);
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">LedgerLens secure workspace</p>
        <h1>Research the filing.<br />Trace the evidence.</h1>
        <p>Sign in to keep documents, ingestion jobs, and citations isolated to your organization.</p>
        <form onSubmit={submit}>
          <label htmlFor="auth-email">Work email</label>
          <input id="auth-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="analyst@company.com" />
          <button className="button button--primary" disabled={submitting} type="submit">
            {submitting ? "Sending link…" : "Continue with email"}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <small>No password is stored by LedgerLens. Authentication is handled by Supabase.</small>
      </section>
    </main>
  );
}
