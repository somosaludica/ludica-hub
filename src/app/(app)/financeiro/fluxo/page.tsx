import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { ehConta, ehReceita, mesVazio, porMes, resultadoPrevisto, type Estado, type Mov } from "@/lib/financeiro";
import { carregaFinanceiro } from "@/lib/dados-financeiro";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { AbasFinanceiro, mesCurto } from "../abas";
import { Quadro, SeloComprovante, SeloEstado, pct, sinal, type Tom } from "../partes";
import { acaoLancamento, salvarRateios } from "../acoes";

const FILTROS = ["recebido", "em_atraso", "a_confirmar", "a_vencer", "pago"] as const;
type Filtro = (typeof FILTROS)[number];
const TOM: Record<Filtro, Tom> = { recebido: "ok", em_atraso: "alerta", a_confirmar: "neutro", a_vencer: "atencao", pago: "ok" };

/** Fluxo mensal: todas as contas e entradas por mês de referência, com filtro por estado e resumo por mês. */
export default async function Fluxo({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const sp = await searchParams;
  const filtro = FILTROS.find((x) => x === sp.f) ?? null;
  const fin = await carregaFinanceiro(await createClient(), ctx.ambiente!);
  const amb = nomeAmbiente(ctx.ambiente);

  const recebidas = fin.movs.filter((m) => ehReceita(m) && m.estado === "pago");
  const contas = (e: Estado) => fin.movs.filter((m) => ehConta(m) && m.estado === e);
  const soma = (l: Mov[]) => l.reduce((x, m) => x + Math.round(m.valor * 100), 0) / 100;
  const doFiltro = (m: Mov) => (filtro === null ? m.categoria !== "distribuicao" && m.categoria !== "aporte" : filtro === "recebido" ? ehReceita(m) && m.estado === "pago" : ehConta(m) && m.estado === filtro);
  const lista = fin.movs.filter(doFiltro).sort((a, b) => a.mes.localeCompare(b.mes) || (a.vencimento ?? "9").localeCompare(b.vencimento ?? "9") || a.descricao.localeCompare(b.descricao));
  const mesesLista = [...new Set(lista.map((m) => m.mes))];
  const meses = porMes(fin.movs, fin.recs, fin.participacoes);
  const T = meses.reduce((x, l) => ({ ...x, faturado: x.faturado + l.faturado, contas: x.contas + l.contas, imposto: x.imposto + l.imposto, distribuido: x.distribuido + l.distribuido, abertas: x.abertas + l.abertas }), mesVazio(""));
  const aqui = `/financeiro/fluxo${filtro ? `?f=${filtro}` : ""}`;
  const rateios = [...fin.rateios, ...Array.from({ length: 4 }, () => ({ nome: "", pct: 0 }))].slice(0, 4);

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{amb}</div>
          <h1>{t.fFluxo}</h1>
        </div>
        <Link href="/financeiro/lancamentos/novo" className="btn">
          {t.novoLancamento}
        </Link>
      </div>
      <AbasFinanceiro t={t} atual="fluxo" />

      {sp.ok && (
        <div className="aviso ok" role="status">
          {sp.ok === "removido" ? t.lancamentoRemovido : sp.ok === "rateios" ? t.fRateiosSalvos : t.lancamentoSalvo}
        </div>
      )}

      <nav className="quadros" aria-label={t.fFiltrar}>
        <Quadro tom="ok" rotulo={t.fRecebido} valor={reais(soma(recebidas))} sub={t.fNEntradas(recebidas.length)} href={filtro === "recebido" ? "/financeiro/fluxo" : "/financeiro/fluxo?f=recebido"} ativo={filtro === "recebido"} />
        {(["em_atraso", "a_confirmar", "a_vencer", "pago"] as const).map((e) => {
          const l = contas(e);
          const ate = e === "a_vencer" && l.length ? ` · ${t.fPrevistoAte(mesCurto(l.map((m) => m.mes).sort().pop()!, ctx.idioma))}` : "";
          return <Quadro key={e} tom={TOM[e]} rotulo={t.fEstados[e]} valor={reais(soma(l))} sub={`${t.fNContas(l.length)}${ate}`} href={filtro === e ? "/financeiro/fluxo" : `/financeiro/fluxo?f=${e}`} ativo={filtro === e} />;
        })}
      </nav>

      <section className="pilha" aria-label={t.fSecResumoMes}>
        <div className="rotulo">{t.fSecResumoMes}</div>
        {meses.length === 0 ? (
          <div className="aviso">{t.fSemLancamentos}</div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.mes}</th>
                  <th className="num">{t.fColEntradas}</th>
                  <th className="num">{t.fColContas}</th>
                  <th className="num">{t.fColImpostoDist}</th>
                  <th className="num">{t.fColResultadoPrevisto}</th>
                  <th className="num">{t.fColNaoPagas}</th>
                </tr>
              </thead>
              <tbody>
                {[...meses, { ...T, mes: "" }].map((l) => {
                  const res = resultadoPrevisto(l), F = l.mes ? "span" : "strong";
                  return (
                    <tr key={l.mes || "total"}>
                      <td><F>{l.mes ? mesCurto(l.mes, ctx.idioma) : t.total}</F></td>
                      <td data-label={t.fColEntradas} className="num"><F>{reais(l.faturado)}</F></td>
                      <td data-label={t.fColContas} className="num"><F>{reais(l.contas)}</F></td>
                      <td data-label={t.fColImpostoDist} className="num"><F>{reais(l.imposto + l.distribuido)}</F></td>
                      <td data-label={t.fColResultadoPrevisto} className={res < 0 ? "num neg" : "num"}><F>{sinal(res)}</F></td>
                      <td data-label={t.fColNaoPagas} className="num"><F>{reais(l.abertas)}</F></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pilha" aria-label={t.lancamentos} id="lista">
        <div className="cab">
          <div className="rotulo">
            {t.lancamentos}
            {filtro && `: ${filtro === "recebido" ? t.fRecebido : t.fEstados[filtro]}`}
          </div>
          {filtro && (
            <Link href="/financeiro/fluxo" className="btn fantasma">
              {t.fVerTodos}
            </Link>
          )}
        </div>
        {lista.length === 0 ? (
          <div className="aviso">{filtro ? t.fNadaNoFiltro : t.fSemLancamentos}</div>
        ) : (
          <div className="tabela-caixa">
            {mesesLista.map((mes) => {
              const doMes = lista.filter((m) => m.mes === mes);
              const saldo = doMes.filter((m) => !m.fora).reduce((x, m) => x + (m.tipo === "entrada" ? 1 : -1) * Math.round(m.valor * 100), 0) / 100;
              return (
                <div key={mes}>
                  <div className="faixa-mes">
                    <span>{mesCurto(mes, ctx.idioma)}</span>
                    <span>{sinal(saldo)}</span>
                  </div>
                  <ul className="contas">
                    {doMes.map((m) => (
                      <li key={m.id} className="conta">
                        <div>
                          <Link href={m.origem === "cobranca" ? `/cobrancas/${m.id}` : `/financeiro/lancamentos/${m.id}`}>
                            <strong>{m.descricao}</strong>
                          </Link>
                          <div className="dica">
                            {[
                              m.rubrica ?? (m.origem === "cobranca" ? t.cobrancas : t.categoriasLanc[m.categoria as "conta_fixa"]),
                              m.vencimento && t.fVence(dataCurta(m.vencimento, true)),
                              m.pagoEm && (m.tipo === "entrada" ? t.fRecebidoEm(dataCurta(m.pagoEm, true)) : t.fPagoEm(dataCurta(m.pagoEm, true))),
                              m.conta && (m.tipo === "entrada" ? t.fEntrouEm(m.conta) : t.fSaiuDe(m.conta)),
                            ].filter(Boolean).join(" · ")}
                          </div>
                          {m.obs && <div className="dica">{m.obs}</div>}
                        </div>
                        <div className="valor">
                          {m.tipo === "entrada" ? "+ " : ""}
                          {reais(m.valor)}
                          <div className="dica">{m.pct === 100 ? t.fCemPorCento(amb) : t.fPctDe(pct(m.pct), reais(m.valorTotal))}</div>
                        </div>
                        <div className="marcas">
                          <SeloEstado t={t} m={m} />
                          <SeloComprovante t={t} m={m} />
                          {m.origem === "lancamento" && !m.fora && m.tipo === "saida" && m.estado !== "pago" && (
                            <form action={acaoLancamento}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="acao" value="pagar" />
                              <input type="hidden" name="volta" value={aqui} />
                              <button type="submit" className="btn fantasma" aria-label={`${t.fMarcarPago}: ${m.descricao}`}>
                                {t.fMarcarPago}
                              </button>
                            </form>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <FormAcao acao={salvarRateios}>
        <div className="rotulo">{t.fSecRateio}</div>
        <p className="sub">{t.fDicaRateio(amb)}</p>
        {rateios.map((r, i) => (
          <div className="linha-2" key={i}>
            <div>
              <label className="campo" htmlFor={`rateio_nome_${i}`}>
                {t.fRateioNome} {i + 1}
              </label>
              <input id={`rateio_nome_${i}`} name={`rateio_nome_${i}`} className="entrada" maxLength={60} defaultValue={r.nome} />
            </div>
            <div>
              <label className="campo" htmlFor={`rateio_pct_${i}`}>
                {t.fParteAmbiente(amb)} {i + 1}
              </label>
              <input id={`rateio_pct_${i}`} name={`rateio_pct_${i}`} className="entrada" inputMode="decimal" defaultValue={r.pct ? String(r.pct).replace(".", ",") : ""} />
            </div>
          </div>
        ))}
        <div className="acoes">
          <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} className="btn fantasma" />
        </div>
      </FormAcao>
    </>
  );
}
