"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Chegada de qualquer link de acesso: link gerado pelo admin (token_hash), link do e-mail no formato
 * novo (token_hash) ou antigo (#access_token) e o do próprio aparelho (?code). Grava a sessão e abre o início.
 */
type T = { linkFalhou: string; linkFalhouExplica: string; linkIncompleto: string; irLogin: string; entrando: string };

export default function Confirmar({ t }: { t: T }) {
  const [erro, setErro] = useState("");
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const q = new URLSearchParams(location.search);
      const h = new URLSearchParams(location.hash.slice(1));
      let falha: string | null = null;
      if (q.get("token_hash")) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: q.get("token_hash")!, type: (q.get("type") ?? "magiclink") as EmailOtpType });
        falha = error?.message ?? null;
      } else if (q.get("code")) {
        const { error } = await supabase.auth.exchangeCodeForSession(q.get("code")!);
        falha = error?.message ?? null;
      } else if (h.get("access_token") && h.get("refresh_token")) {
        const { error } = await supabase.auth.setSession({ access_token: h.get("access_token")!, refresh_token: h.get("refresh_token")! });
        falha = error?.message ?? null;
      } else {
        falha = h.get("error_description") ?? q.get("error_description") ?? t.linkIncompleto;
      }
      if (falha) { setErro(falha); return; }
      location.replace("/");
    })();
  }, [t.linkIncompleto]);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: "center", display: "grid", gap: 12 }}>
        {erro ? (
          <>
            <h1 style={{ margin: 0 }}>{t.linkFalhou}<span style={{ color: "#f3901f" }}>.</span></h1>
            <p style={{ margin: 0, color: "#4a5056" }}>{t.linkFalhouExplica}</p>
            <p style={{ margin: 0, color: "#8a8f93", fontSize: 11 }}>{erro}</p>
            <a href="/login" className="btn" style={{ textDecoration: "none" }}>{t.irLogin}</a>
          </>
        ) : <p role="status">{t.entrando}</p>}
      </div>
    </main>
  );
}
