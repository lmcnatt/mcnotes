import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline - McNotes",
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "1rem",
        padding: "2rem",
        backgroundColor: "var(--bg-app)",
        color: "var(--text-main)",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>You&apos;re offline</h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "28rem" }}>
        McNotes needs a connection to load your notes. Check your network and
        try again.
      </p>
    </main>
  );
}
