"use client";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

// Sign in function
const login = () => {
  supabase.auth.signInWithOAuth({
    provider: "google",
  });
};

// Test data to print
const {
  data: { session },
} = await supabase.auth.getSession();
const { data: profile, error } = await supabase.from("profiles").select("*");

export default function Home() {
  const socketRef = useRef<Socket | null>(null);
  const [socketDebugText, setSocketDebugText] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const socketEventRef = useRef<HTMLInputElement>(null);
  const socketMessageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const socket = io("ws://localhost:5000", {
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      setSocketDebugText((prev) => `${prev}\nconnected: ${socket.id}`.trim());
    });

    socket.on("disconnect", (reason) => {
      setSocketConnected(false);
      setSocketDebugText((prev) => `${prev}\ndisconnected: ${reason}`.trim());
    });

    socket.onAny((event, data) => {
      setSocketDebugText((prev) =>
        `${prev}\nreceived Event: ${event} with data: ${JSON.stringify(data)}`.trim(),
      );
    });

    socket.on("socket:error", (data) => {
      setSocketDebugText((prev) =>
        `${prev}\nreceived Event: socket:error with data: ${JSON.stringify(data)}`.trim(),
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const socketListen = () => {
    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      setSocketDebugText((prev) => `${prev}\nsocket not connected yet`.trim());
      return;
    }

    setSocketDebugText((prev) =>
      `${prev} \nsent Event: ${socketEventRef.current?.value || "test:me"} with data: ${
        socketMessageRef.current?.value || "Hello, world!"
      }`.trim(),
    );
    socket.emit(socketEventRef.current?.value || "test:me", {
      message: socketMessageRef.current?.value || "Hello, world!",
    });
  };

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
      <div className="flex-col flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <input
          type="text"
          className="border rounded-md p-2 "
          placeholder="Socket event"
          ref={socketEventRef}
        ></input>
        <input
          type="text"
          className="border rounded-md p-2 "
          placeholder="Socket message"
          ref={socketMessageRef}
        ></input>
        <button onClick={socketListen} className="border rounded-md p-2 ">
          Send socket
        </button>
        <div>
          Socket status:{" "}
          {socketConnected ? "connected" : "connecting/disconnected"}
        </div>
        <br />
        <pre className="w-full h-120 overflow-scroll">
          {JSON.stringify(socketDebugText, null, 3).split("\\n").join("\n")}
        </pre>
      </div>
    </div>
  );
}
