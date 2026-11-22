"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="uz">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>Kutilmagan xatolik</h1>
        <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
          Qayta urinish
        </button>
      </body>
    </html>
  );
}
