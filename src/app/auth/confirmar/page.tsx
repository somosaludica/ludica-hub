"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Chegada de qualquer link de acesso: link gerado pelo admin (token_hash), link do e-mail no formato
 * novo (token_hash) ou antigo (#access_token) e o do próprio aparelho (?code). Grava a sessão e abre o início.
 */
export default function Confirmar() {
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
        falha = h.get("error_description") ?? q.get("error_description") ?? "Link incompleto.";
      }
      if (falha) { setErro(falha); return; }
      location.replace("/");
    })();
  }, []);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: "center", display: "grid", gap: 12 }}>
        {erro ? (
          <>
            <h1 style={{ margin: 0 }}>Esse link não funcionou<span style={{ color: "#f3901f" }}>.</span></h1>
            <p style={{ margin: 0, color: "#4a5056" }}>Ele pode ter expirado ou já ter sido usado. Peça um novo a um sócio ou entre com e-mail e senha.</p>
            <p style={{ margin: 0, color: "#8a8f93", fontSize: 12 }}>{erro}</p>
            <a href="/login" className="btn" style={{ textDecoration: "none" }}>Ir para o login</a>
          </>
        ) : <p role="status">Entrando…</p>}
      </div>
    </main>
  );
}
