"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from "@/lib/supabase/cookies";
import styles from "./login.module.css";

type Estado = { tipo: "form" } | { tipo: "link-enviado" } | { tipo: "erro"; msg: string };

function gravarLembrar(lembrar: boolean) {
  document.cookie = lembrar
    ? `${REMEMBER_COOKIE}=1; path=/; max-age=${REMEMBER_MAX_AGE}; samesite=lax`
    : `${REMEMBER_COOKIE}=0; path=/; samesite=lax`;
}

export default function LoginPage() {
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
      const msg = error.code === "email_not_confirmed" ? "Seu login ainda não foi confirmado. Peça um link de acesso a um sócio."
        : error.code === "invalid_credentials" ? "E-mail ou senha não conferem. Nunca criou senha? Use o link por e-mail abaixo ou fale com um sócio."
        : /rate|limit/i.test(error.message) ? "Muitas tentativas. Espere um minuto e tente de novo."
        : `Não deu para entrar: ${error.message}`;
      setEstado({ tipo: "erro", msg });
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function receberLink() {
    if (!email) {
      setEstado({ tipo: "erro", msg: "Escreva seu e-mail para receber o link." });
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
      const msg = /rate|limit|seconds/i.test(error.message) ? "O envio de e-mails está no limite agora. Espere alguns minutos ou peça o link a um sócio."
        : /not found|signups not allowed|otp_disabled/i.test(`${error.code} ${error.message}`) ? "Esse e-mail ainda não tem acesso. Fale com um sócio."
        : `Não deu para mandar o link: ${error.message}`;
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
          <p className={styles.titulo}>HUB, MUSIC e MKT num lugar só.</p>
          <p className={styles.sub}>Clientes, serviços, orçamentos, cobrança e financeiro da Lúdica, cada ambiente com o seu.</p>
        </div>
        <div className={styles["nota-marca"]}>Acesso só para o time. Quem cria as contas são os sócios.</div>
      </section>

      <section className={styles.lado} aria-label="Entrar">
        <div className={styles.form}>
          <h1 className={styles.h1}>Entrar</h1>
          {estado.tipo === "link-enviado" ? (
            <div className="aviso ok" role="status">
              <strong>Link enviado.</strong> Abra o e-mail neste aparelho e toque no link para entrar.{" "}
              <button type="button" className={styles.link} onClick={() => setEstado({ tipo: "form" })}>
                voltar
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
                  E-mail
                </label>
                <input id="email" className="entrada" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="campo" htmlFor="senha">
                  Senha
                </label>
                <input id="senha" className="entrada" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
              <label className={styles.lembrar}>
                <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                <span>
                  <strong>Lembrar de mim neste aparelho</strong>
                  <span className={styles.nota}>
                    {lembrar ? "Você fica conectado por 30 dias. Use só em aparelho seu." : "Você sai quando fechar o navegador."}
                  </span>
                </span>
              </label>
              <button className="btn cheio" type="submit" disabled={carregando}>
                {carregando ? "Entrando…" : "Entrar"}
              </button>
              <div className={styles.ou}>
                <span />
                ou
                <span />
              </div>
              <button className="btn fantasma cheio" type="button" onClick={receberLink} disabled={carregando}>
                Receber link de acesso por e-mail
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
