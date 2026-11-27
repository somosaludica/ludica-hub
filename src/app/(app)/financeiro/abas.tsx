import Link from "next/link";
import { LANG, type Idioma, type Textos } from "@/lib/i18n";
import { somaMes } from "@/lib/financeiro";

/** Nome do mês no idioma da pessoa: "Novembro de 2026". */
export function nomeMes(mes: string, idioma: Idioma) {
  const s = new Intl.DateTimeFormat(LANG[idioma], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Mês curto para tabelas: "nov/26". */
export function mesCurto(mes: string, idioma: Idioma) {
  const m = new Intl.DateTimeFormat(LANG[idioma], { month: "short", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`)).replace(".", "");
  return `${m}/${mes.slice(2, 4)}`;
}

export type Aba = "resumo" | "fluxo" | "fechamento" | "socios";
export function AbasFinanceiro({ t, atual }: { t: Textos; atual: Aba }) {
  const abas = [
    ["resumo", "/financeiro", t.fResumo],
    ["fluxo", "/financeiro/fluxo", t.fFluxo],
    ["fechamento", "/financeiro/fechamento", t.fechamentoMes],
    ["socios", "/financeiro/socios", t.fSociosLucros],
  ] as const;
  return (
    <nav aria-label={t.financeiro} className="chips nao-imprime">
      {abas.map(([k, href, rotulo]) => (
        <Link key={k} href={href} className="chip" aria-current={atual === k ? "page" : undefined}>
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}

/** Mês anterior · mês atual · próximo mês, por links. */
export function TrocaMes({ mes, idioma, base, rotulo }: { mes: string; idioma: Idioma; base: string; rotulo: string }) {
  return (
    <nav aria-label={rotulo} className="troca-mes nao-imprime">
      <Link className="btn fantasma" href={`${base}?mes=${somaMes(mes, -1)}`} aria-label={nomeMes(somaMes(mes, -1), idioma)}>
        ‹
      </Link>
      <strong>{nomeMes(mes, idioma)}</strong>
      <Link className="btn fantasma" href={`${base}?mes=${somaMes(mes, 1)}`} aria-label={nomeMes(somaMes(mes, 1), idioma)}>
        ›
      </Link>
    </nav>
  );
}
