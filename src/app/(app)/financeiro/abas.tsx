import Link from "next/link";
import { LANG, type Idioma, type Textos } from "@/lib/i18n";
import { somaMes } from "@/lib/fechamento";

/** Nome do mês no idioma da pessoa: "novembro de 2026". */
export function nomeMes(mes: string, idioma: Idioma) {
  const s = new Intl.DateTimeFormat(LANG[idioma], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function AbasFinanceiro({ t, atual }: { t: Textos; atual: "fechamento" | "lancamentos" | "socios" }) {
  const abas = [
    ["fechamento", "/financeiro", t.fechamentoMes],
    ["lancamentos", "/financeiro/lancamentos", t.lancamentos],
    ["socios", "/financeiro/socios", t.socios],
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
export function TrocaMes({ mes, idioma, base, rotulo, extra = "" }: { mes: string; idioma: Idioma; base: string; rotulo: string; extra?: string }) {
  return (
    <nav aria-label={rotulo} className="troca-mes nao-imprime">
      <Link className="btn fantasma" href={`${base}?mes=${somaMes(mes, -1)}${extra}`} aria-label={nomeMes(somaMes(mes, -1), idioma)}>
        ‹
      </Link>
      <strong>{nomeMes(mes, idioma)}</strong>
      <Link className="btn fantasma" href={`${base}?mes=${somaMes(mes, 1)}${extra}`} aria-label={nomeMes(somaMes(mes, 1), idioma)}>
        ›
      </Link>
    </nav>
  );
}
