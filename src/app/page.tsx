"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) router.replace("/matches");
        else router.replace("/login");
      },
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/matches");
      else router.replace("/login");
      setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  if (!checking) return null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <p className="text-zinc-400">Loading…</p>
    </div>
  );
}
