"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

export default function ProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        setLoading(false);
        router.replace("/login");
        return;
      }
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          setDisplayName((data as { display_name: string | null })?.display_name ?? "");
          setLoading(false);
        });
    });
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: session.user.id, display_name: displayName.trim() || null }, { onConflict: "id" });
    setSaving(false);
    setMessage(error ? "error" : "saved");
  };

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 pb-8">
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-50">Profile</h1>
          <Link href="/matches" className="text-sm text-zinc-400 underline active:text-zinc-300">
            ← Matches
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={session.user?.email ?? ""}
              readOnly
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-zinc-400"
            />
          </div>
          <div>
            <label htmlFor="display_name" className="mb-1 block text-xs font-medium text-zinc-400">
              Display name
            </label>
            <input
              id="display_name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50 placeholder-zinc-500"
            />
          </div>
          {message === "saved" && (
            <p className="text-sm text-emerald-400">Saved.</p>
          )}
          {message === "error" && (
            <p className="text-sm text-red-400">Could not save. Try again.</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
