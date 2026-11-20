"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { AmbienteId, Idioma, Tema } from "@/lib/contexto";
import { IDIOMA_COOKIE } from "@/lib/i18n";
import { salvarPreferencia, trocarAmbiente } from "./acoes";
import styles from "./shell.module.css";

export type ItemMenu = { href: string; rotulo: string };

type Props = {
  itens: ItemMenu[];
  ambientes: { id: AmbienteId; nome: string }[];
  ambiente: AmbienteId | null;
  tema: Tema;
  idioma: Idioma;
  t: Record<"menu" | "menuPrincipal" | "ambiente" | "conta" | "sair" | "tema" | "claro" | "escuro" | "idioma", string>;
};

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export default function Menu({ itens, ambientes, ambiente, tema, idioma, t }: Props) {
  const pathname = usePathname();
  const gaveta = useRef<HTMLDetailsElement>(null);

  // Mantém o cookie de idioma igual ao do perfil (vale para o login e o indicador de carregamento).
  useEffect(() => {
    if (!document.cookie.split("; ").includes(`${IDIOMA_COOKIE}=${idioma}`)) {
      document.cookie = `${IDIOMA_COOKIE}=${idioma}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [idioma]);

  // No celular, fecha o menu ao trocar de página.
  useEffect(() => {
    if (gaveta.current) gaveta.current.open = false;
  }, [pathname]);

  const nomeAtual = ambientes.find((a) => a.id === ambiente)?.nome;

  const seletor = ambientes.length > 0 && (
    <div className={styles.grupo}>
      <div className={styles.rotulo}>{t.ambiente}</div>
      <form action={trocarAmbiente} className={styles.ambientes}>
        {ambientes.map((a) => (
          <button
            key={a.id}
            type="submit"
            name="ambiente"
            value={a.id}
            aria-pressed={a.id === ambiente}
            className={styles.amb}
          >
            {a.nome}
          </button>
        ))}
      </form>
    </div>
  );

  const links = (
    <ul className={styles.links}>
      {itens.map((i) => {
        const on = ativo(pathname, i.href);
        return (
          <li key={i.href}>
            <Link href={i.href} className={styles.link} aria-current={on ? "page" : undefined}>
              {i.rotulo}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const rodape = (
    <div className={styles.rodape}>
      <div className={styles.prefs}>
        <form action={salvarPreferencia} role="group" aria-label={t.tema} className={styles.pilulas}>
          <button type="submit" name="tema" value="claro" aria-pressed={tema === "claro"} className={styles.pilula}>
            {t.claro}
          </button>
          <button type="submit" name="tema" value="escuro" aria-pressed={tema === "escuro"} className={styles.pilula}>
            {t.escuro}
          </button>
        </form>
        <form action={salvarPreferencia} role="group" aria-label={t.idioma} className={styles.pilulas}>
          {(["pt", "en", "es"] as const).map((l) => (
            <button key={l} type="submit" name="idioma" value={l} lang={l} aria-pressed={idioma === l} className={styles.pilula}>
              {l.toUpperCase()}
            </button>
          ))}
        </form>
      </div>
      <Link href="/conta" className={styles.link} aria-current={ativo(pathname, "/conta") ? "page" : undefined}>
        {t.conta}
      </Link>
      <form action="/auth/sair" method="post">
        <button type="submit" className={`${styles.link} ${styles.sair}`}>
          {t.sair}
        </button>
      </form>
    </div>
  );

  return (
    <>
      <details ref={gaveta} className={styles.navMob} data-nao-imprime="">
        <summary className={styles.summary}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-claro.png" alt="Lúdica" className={styles.logoMob} />
          <span className={styles.summaryDir}>
            {nomeAtual && <span className={styles.badge}>{nomeAtual}</span>}
            <span className={styles.botaoMenu}>{t.menu}</span>
          </span>
        </summary>
        <nav aria-label={t.menuPrincipal} className={styles.gaveta}>
          {seletor}
          {links}
          {rodape}
        </nav>
      </details>

      <nav aria-label={t.menuPrincipal} className={styles.navDesk} data-nao-imprime="">
        <Link href="/" className={styles.marca}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-claro.png" alt="Lúdica" className={styles.logo} />
          <span className={styles.marcaHub}>HUB</span>
        </Link>
        {seletor}
        {links}
        {rodape}
      </nav>
    </>
  );
}
