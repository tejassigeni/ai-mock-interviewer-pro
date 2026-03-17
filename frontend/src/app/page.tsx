"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAuthenticated } from "@/services/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          border: "3px solid var(--accent-primary)", borderTopColor: "transparent",
          margin: "0 auto 16px", animation: "spin-slow 1s linear infinite",
        }} />
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>
      </div>
    </div>
  );
}
