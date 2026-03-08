"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type Profile = { id: string; display_name: string | null };

export function DisplayNameGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);

  const skipGate = pathname === "/login" || pathname?.startsWith("/auth/");

  useEffect(() => {
    if (skipGate) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        setChecking(false);
        return;
      }
      supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          setProfile((data as Profile) ?? null);
          setChecking(false);
        });
    });
  }, [skipGate]);

  if (skipGate || checking) return <>{children}</>;
  if (!session) return <>{children}</>;
  if (profile?.display_name?.trim()) return <>{children}</>;

  const userId = session?.user?.id;
  if (!userId) return <>{children}</>;

  const refetchProfile = () => {
    supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", userId)
      .single()
      .then(({ data }) => setProfile((data as Profile) ?? null));
  };

  return (
    <SetDisplayNamePrompt userId={userId} onSaved={refetchProfile} />
  );
}

function SetDisplayNamePrompt({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("profiles").upsert(
      { id: userId, display_name: trimmed },
      { onConflict: "id" }
    );
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6">
        <h1 className="mb-2 text-lg font-semibold text-zinc-50">Choose a display name</h1>
        <p className="mb-4 text-sm text-zinc-400">Shown on leaderboard and in the app.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            maxLength={50}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full rounded-full bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
