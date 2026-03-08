"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email) return;

    setStatus("loading");
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setStatus("error");
      return;
    }

    setStatus("sent");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 text-zinc-50 shadow-lg">
        <h1 className="mb-2 text-center text-xl font-semibold">
          Sign in to track matches
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-400">
          Enter your email and we&apos;ll send you a magic link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 outline-none ring-0 focus:border-zinc-400"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          {status === "sent" && (
            <p className="text-sm text-emerald-400">
              Magic link sent. Check your email.
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-emerald-500 text-sm font-medium text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "loading" ? "Sending link..." : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  );
}

