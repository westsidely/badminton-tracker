"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

const PROFILE_REP_FIELDS = [
  "club_affiliation",
  "school_affiliation",
  "corporate_affiliation",
  "city",
  "country",
  "represented_as",
  "home_venue",
] as const;
type ProfileRepKey = (typeof PROFILE_REP_FIELDS)[number];

const PROFILE_REP_LABELS: Record<ProfileRepKey, string> = {
  club_affiliation: "Club",
  school_affiliation: "School",
  corporate_affiliation: "Corporate",
  city: "City",
  country: "Country",
  represented_as: "Represented as",
  home_venue: "Home venue",
};

export default function ProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [rep, setRep] = useState<Record<ProfileRepKey, string>>({
    club_affiliation: "",
    school_affiliation: "",
    corporate_affiliation: "",
    city: "",
    country: "",
    represented_as: "",
    home_venue: "",
  });
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
        .select("display_name, club_affiliation, school_affiliation, corporate_affiliation, city, country, represented_as, home_venue")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          const d = data as Record<string, string | null> | null;
          if (d) {
            setDisplayName((d.display_name ?? "") as string);
            const next: Record<ProfileRepKey, string> = { ...rep };
            PROFILE_REP_FIELDS.forEach((key) => { next[key] = (d[key] ?? "") as string; });
            setRep(next);
          }
          setLoading(false);
        });
    });
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    setMessage(null);
    const payload: Record<string, string | null> = {
      id: session.user.id,
      display_name: displayName.trim() || null,
    };
    PROFILE_REP_FIELDS.forEach((key) => {
      payload[key] = rep[key].trim() || null;
    });
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
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
          <p className="text-xs font-medium text-zinc-500">Representation (optional)</p>
          {PROFILE_REP_FIELDS.map((key) => (
            <div key={key}>
              <label htmlFor={key} className="mb-1 block text-xs text-zinc-400">
                {PROFILE_REP_LABELS[key]}
              </label>
              <input
                id={key}
                type="text"
                value={rep[key]}
                onChange={(e) => setRep((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={PROFILE_REP_LABELS[key]}
                maxLength={80}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500"
              />
            </div>
          ))}
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
