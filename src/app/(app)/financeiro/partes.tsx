import Link from "next/link";
import { reais } from "@/lib/formatos";
import type { Textos } from "@/lib/i18n";
import type { Estado, Mov, Posicao } from "@/lib/financeiro";

export type Tom = "ok" | "alerta" | "atencao" | "neutro";
/** Valor com sinal de menos tipográfico: "− R$ 1.332,81". */
export const sinal = (n: number) => (n < -0.004 ? `− ${reais(-n)}` : reais(Math.abs(n)));
export const pct = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const TOM_ESTADO: Record<Estado, string> = { pago: "selo ok", a_vencer: "selo", em_atraso: "selo alerta", a_confirmar: "selo off" };

/** Quadro de número grande. Com `href` vira filtro (link). */
export function Quadro({ tom = "neutro", rotulo, valor, sub, href, ativo }: { tom?: Tom; rotulo: string; valor: string; sub?: string; href?: string; ativo?: boolean }) {
  const dentro = (
    <>
      <span className="rotulo">{rotulo}</span>
      <strong>{valor}</strong>
      {sub && <span className="dica">{sub}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`quadro ${tom}`} aria-current={ativo ? "true" : undefined} scroll={false}>
      {dentro}
    </Link>
  ) : (
    <div className={`quadro ${tom}`}>{dentro}</div>
  );
}

export function SeloEstado({ t, m }: { t: Textos; m: Mov }) {
  if (m.fora) return <span className="selo off">{t.fForaFluxo}</span>;
  return <span className={TOM_ESTADO[m.estado]}>{m.tipo === "entrada" && m.estado === "pago" ? t.fRecebido : m.tipo === "entrada" && m.estado === "a_vencer" ? t.fAReceber : t.fEstados[m.estado]}</span>;
}

/** Situação do comprovante de uma conta paga, com link para abrir quando existe. */
export function SeloComprovante({ t, m, curto = false }: { t: Textos; m: Mov; curto?: boolean }) {
  if (m.comprovante === "anexado")
    return (
      <a className="selo ok" href={`/financeiro/comprovante/${m.id}`} target="_blank" rel="noopener" data-sem-carregar>
        {curto ? t.fAbrir : t.fCompAnexado}
      </a>
    );
  if (m.comprovante === "antigo") return <span className="selo" title={m.comprovanteNome ?? undefined}>{t.fCompAntigo}</span>;
  if (m.comprovante === "dispensado") return <span className="selo off">{t.fCompDispensado}</span>;
  if (m.comprovante === "falta") return <span className="selo alerta">{curto ? t.fFalta : t.fCompFalta}</span>;
  return null;
}

/** Posição de cada sócio: distribuído, lucros não retirados, parte na falta da reserva, aportado e quem deve a quem. */
export function PosicaoSocios({ t, p, nomes, coberturaNome }: { t: Textos; p: Posicao; nomes: Record<string, string>; coberturaNome: string | null }) {
  if (!p.completa)
    return (
      <p className="sub">
        {t.semParticipacoes} <Link href="/financeiro/socios#participacao">{t.participacaoLucro}</Link>
      </p>
    );
  const devedor = p.socios.find((s) => s.posicao < -0.005), credor = p.socios.find((s) => s.posicao > 0.005);
  return (
    <>
      <div className="tabela-caixa">
        <table className="tabela">
          <thead>
            <tr>
              <th>{t.socio}</th>
              <th className="num">{t.fColDistribuido}</th>
              <th className="num">{t.fColNaoRetirados}</th>
              <th className="num">{t.fColParteFalta}</th>
              <th className="num">{t.fColAportado}</th>
              <th className="num">{t.fColPosicao}</th>
            </tr>
          </thead>
          <tbody>
            {p.socios.map((s) => (
              <tr key={s.socio}>
                <td>
                  <strong>{nomes[s.socio] ?? "—"}</strong> · {pct(s.pct)}%
                </td>
                <td data-label={t.fColDistribuido} className="num">{reais(s.retirado)}</td>
                <td data-label={t.fColNaoRetirados} className={s.saldo < -0.004 ? "num neg" : "num"}>{sinal(s.saldo)}</td>
                <td data-label={t.fColParteFalta} className="num">{reais(s.falta)}</td>
                <td data-label={t.fColAportado} className="num">{reais(s.aportado)}</td>
                <td data-label={t.fColPosicao} className={s.posicao < -0.005 ? "num neg" : "num"}>
                  <strong>{s.posicao < -0.005 ? t.fPosDeve(reais(-s.posicao)) : s.posicao > 0.005 ? t.fPosReceber(reais(s.posicao)) : t.fPosQuitado}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sub">
        {devedor && credor && <strong>{t.fMsgDeve(nomes[devedor.socio] ?? "—", reais(Math.min(-devedor.posicao, credor.posicao)), nomes[credor.socio] ?? "—")} </strong>}
        {coberturaNome ? t.fNotaPosicaoCobertura(coberturaNome) : t.fNotaPosicao}
      </p>
    </>
  );
}
