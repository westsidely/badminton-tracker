"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    const completeSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        setStatus("error");
        router.replace("/login");
        return;
      }
      if (session) {
        setStatus("done");
        router.replace("/matches");
        return;
      }
      router.replace("/login");
    };

    completeSession();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <p className="text-zinc-400">
        {status === "loading" && "Completing sign in…"}
        {status === "error" && "Sign-in failed. Redirecting…"}
        {status === "done" && "Redirecting…"}
      </p>
    </div>
  );
}
