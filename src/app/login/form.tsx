"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from "@/lib/supabase/cookies";
import styles from "./login.module.css";
import type { Textos } from "@/lib/i18n";

type T = Omit<Textos, "unidades" | "perfis" | "servicosNaTabela" | "servicosAtivos" | "minMeses">;

type Estado = { tipo: "form" } | { tipo: "link-enviado" } | { tipo: "erro"; msg: string };

function gravarLembrar(lembrar: boolean) {
  document.cookie = lembrar
    ? `${REMEMBER_COOKIE}=1; path=/; max-age=${REMEMBER_MAX_AGE}; samesite=lax`
    : `${REMEMBER_COOKIE}=0; path=/; samesite=lax`;
}

export default function FormLogin({ t }: { t: T }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "form" });

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    gravarLembrar(lembrar);
    const { error } = await createClient().auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      const msg = error.code === "email_not_confirmed" ? t.erroNaoConfirmado
        : error.code === "invalid_credentials" ? t.erroCredenciais
        : /rate|limit/i.test(error.message) ? t.erroTentativas
        : `${t.erroEntrar} ${error.message}`;
      setEstado({ tipo: "erro", msg });
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function receberLink() {
    if (!email) {
      setEstado({ tipo: "erro", msg: t.erroEmailVazio });
      return;
    }
    setCarregando(true);
    gravarLembrar(lembrar);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      // Só entra quem já foi convidado por um sócio.
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirmar` },
    });
    setCarregando(false);
    if (error) {
      const msg = /rate|limit|seconds/i.test(error.message) ? t.erroLimiteEmail
        : /not found|signups not allowed|otp_disabled/i.test(`${error.code} ${error.message}`) ? t.erroSemConta
        : `${t.erroLink} ${error.message}`;
      setEstado({ tipo: "erro", msg });
      return;
    }
    setEstado({ tipo: "link-enviado" });
  }

  return (
    <div className={styles.tela}>
      <section className={styles.marca} aria-label="Lúdica">
        <img src="/logo-claro.png" alt="Lúdica" className={styles.logo} />
        <div>
          <p className={styles.titulo}>{t.loginTitulo}</p>
          <p className={styles.sub}>{t.loginSub}</p>
        </div>
        <div className={styles["nota-marca"]}>{t.loginNota}</div>
      </section>

      <section className={styles.lado} aria-label={t.loginEntrar}>
        <div className={styles.form}>
          <h1 className={styles.h1}>{t.loginEntrar}</h1>
          {estado.tipo === "link-enviado" ? (
            <div className="aviso ok" role="status">
              <strong>{t.linkEnviado}</strong> {t.linkEnviadoExplica}{" "}
              <button type="button" className={styles.link} onClick={() => setEstado({ tipo: "form" })}>
                {t.voltarMinusculo}
              </button>
            </div>
          ) : (
            <form onSubmit={entrar} className={styles.campos}>
              {estado.tipo === "erro" && (
                <div className="aviso erro" role="alert">
                  {estado.msg}
                </div>
              )}
              <div>
                <label className="campo" htmlFor="email">
                  {t.email}
                </label>
                <input id="email" className="entrada" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="campo" htmlFor="senha">
                  {t.senha}
                </label>
                <input id="senha" className="entrada" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
              <label className={styles.lembrar}>
                <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                <span>
                  <strong>{t.lembrar}</strong>
                  <span className={styles.nota}>
                    {lembrar ? t.lembrarSim : t.lembrarNao}
                  </span>
                </span>
              </label>
              <button className="btn cheio" type="submit" disabled={carregando}>
                {carregando ? t.entrando : t.loginEntrar}
              </button>
              <div className={styles.ou}>
                <span />
                {t.ou}
                <span />
              </div>
              <button className="btn fantasma cheio" type="button" onClick={receberLink} disabled={carregando}>
                {t.receberLink}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
