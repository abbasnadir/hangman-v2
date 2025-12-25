"use client";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

const login = () => {
  supabase.auth.signInWithOAuth({
    provider: "google",
  });
};
const {
  data: { session },
} = await supabase.auth.getSession();
const { data: profile, error } = await supabase.from("profiles").select("*");

export default function Home() {
  return (
    <div className="flex-col flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <button onClick={login} className="border rounded-md p-2 ">
        Log in
      </button>
      <br />
      Auth info:
      <br />
      <pre className="w-full h-120 overflow-scroll">
        {JSON.stringify(session, null, 3)}
      </pre>
      <pre>{JSON.stringify(profile, null, 2)}</pre>
    </div>
  );
}
