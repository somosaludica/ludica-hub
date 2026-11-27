import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { aporteDoMes, ehConta, mesVazio, porMes, posicao, resultadoReal } from "@/lib/financeiro";
import { carregaFinanceiro } from "@/lib/dados-financeiro";
import { AbasFinanceiro, mesCurto, nomeMes } from "./abas";
import { PosicaoSocios, Quadro, pct, sinal } from "./partes";

/** Resumo do financeiro do ambiente: o acumulado, o mês atual, a posição dos sócios e o balanço até o caixa. */
export default async function ResumoFinanceiro() {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const fin = await carregaFinanceiro(await createClient(), ctx.ambiente!);
  const p = posicao(fin);
  const meses = porMes(fin.movs, fin.recs, fin.participacoes);
  const atual = meses.find((l) => l.mes === fin.mesAtual) ?? mesVazio(fin.mesAtual);
  const ap = aporteDoMes(atual.abertas, p.fundo, fin.participacoes);
  const atrasadoAntes = fin.movs.filter((m) => ehConta(m) && m.estado === "em_atraso" && m.mes < fin.mesAtual).reduce((x, m) => x + Math.round(m.valor * 100), 0) / 100;
  const realMes = resultadoReal(atual);
  const ate = meses.filter((l) => l.mes <= fin.mesAtual);
  const T = ate.reduce((x, l) => ({ ...x, faturado: x.faturado + l.faturado, recebido: x.recebido + l.recebido, pagas: x.pagas + l.pagas, imposto: x.imposto + l.imposto, distribuido: x.distribuido + l.distribuido, abertas: x.abertas + l.abertas }), mesVazio(""));
  const quemCobre = fin.cobertura ? fin.nomes[fin.cobertura] ?? "—" : null;
  const linha = (rotulo: string, valor: string, forte = false, neg = false) => (
    <>
      <dt className={forte ? "forte" : undefined}>{rotulo}</dt>
      <dd className={`${forte ? "forte" : ""}${neg ? " neg" : ""}` || undefined}>{valor}</dd>
    </>
  );

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.financeiro}</h1>
        </div>
      </div>
      <AbasFinanceiro t={t} atual="resumo" />

      <div className="quadros">
        <Quadro tom="ok" rotulo={t.fRecebidoAteAgora} valor={reais(p.recebido)} sub={t.fSubEntradasRecebidas} />
        <Quadro tom="atencao" rotulo={t.fContasPagasAteAgora} valor={reais(p.pagas)} sub={t.fSubPagamentos(p.nPagas, nomeAmbiente(ctx.ambiente))} />
        <Quadro rotulo={t.fDistribuidoSocios} valor={reais(p.distribuido)} sub={p.socios.map((s) => `${fin.nomes[s.socio] ?? "—"} ${reais(s.retirado)}`).join(" · ") || undefined} />
        <Quadro
          tom={p.coberto > 0 ? "alerta" : "ok"}
          rotulo={fin.coberturaNome ? t.fCobertoPor(fin.coberturaNome) : t.fFaltaCaixa}
          valor={reais(p.coberto)}
          sub={p.coberto > 0 ? (quemCobre ? t.fSubCobertoSim(quemCobre) : t.fSubCobertoSemDono) : t.fSubCobertoNao}
        />
      </div>

      <section className="pilha" aria-label={t.fMesAtual(nomeMes(fin.mesAtual, ctx.idioma))}>
        <div className="rotulo">{t.fMesAtual(nomeMes(fin.mesAtual, ctx.idioma))}</div>
        <div className="quadros">
          <Quadro tom="ok" rotulo={t.fFaturadoMes} valor={reais(atual.faturado)} sub={t.fSubRecebido(reais(atual.recebido))} />
          <Quadro tom="ok" rotulo={t.fPagoMes} valor={reais(atual.pagas + atual.imposto + atual.distribuido)} sub={t.fSubContasImposto(reais(atual.pagas), reais(atual.imposto + atual.distribuido))} />
          <Quadro tom={atual.abertas > 0 ? "atencao" : "ok"} rotulo={t.fAbertoMes} valor={reais(atual.abertas)} sub={t.fSubAbertoMes} />
          <Quadro tom={realMes < 0 ? "alerta" : "ok"} rotulo={t.fResultadoRealMes} valor={sinal(realMes)} sub={t.fSubResultadoReal} />
        </div>
        <div className="cartao">
          <dl className="resumo-total largo">
            {linha(t.fAbertoMes, reais(atual.abertas))}
            {linha(t.fFundoDisponivel, reais(ap.disponivel))}
            {linha(t.fFaltaCobrirMes, reais(ap.falta), true, ap.falta > 0)}
            {ap.socios.map((s) => (
              <div key={s.socio} style={{ display: "contents" }}>{linha(t.fAporteDe(fin.nomes[s.socio] ?? "—", pct(s.pct)), reais(s.valor))}</div>
            ))}
            {linha(t.fAtrasadoAnterior, reais(atrasadoAntes))}
          </dl>
        </div>
      </section>

      <section className="pilha" aria-label={t.fSecSocios}>
        <div className="rotulo">{t.fSecSocios}</div>
        <PosicaoSocios t={t} p={p} nomes={fin.nomes} coberturaNome={fin.coberturaNome} />
      </section>

      <section className="cartao pilha" aria-label={t.fSecBalanco}>
        <div className="rotulo">{t.fSecBalanco}</div>
        <dl className="resumo-total largo">
          {linha(t.fBalEntradas, reais(p.recebido))}
          {linha(t.fBalImposto, reais(p.imposto))}
          {linha(t.fBalContas, reais(p.pagas))}
          {linha(t.fBalAntes, sinal(p.antes), true, p.antes < 0)}
          {linha(t.fBalDistribuido, reais(p.distribuido))}
          {p.aportes > 0 && linha(t.fBalAportes, reais(p.aportes))}
          {linha(fin.coberturaNome ? t.fBalCaixaEm(nomeAmbiente(ctx.ambiente), fin.coberturaNome) : t.fBalCaixa, sinal(p.caixa), true, p.caixa < 0)}
          {linha(fin.coberturaNome && quemCobre ? t.fBalCoberto(fin.coberturaNome, quemCobre) : t.fFaltaCaixa, reais(p.coberto))}
          {linha(t.fBalNaoRetirado, reais(p.naoRetirado))}
          {linha(t.fBalAtraso, reais(p.emAtraso))}
        </dl>
      </section>

      <section className="pilha" aria-label={t.fSecPorMes}>
        <div className="rotulo">{t.fSecPorMes}</div>
        {ate.length === 0 ? (
          <div className="aviso">{t.fSemLancamentos}</div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.mes}</th>
                  <th className="num">{t.fColFaturado}</th>
                  <th className="num">{t.colRecebido}</th>
                  <th className="num">{t.fColContasPagas}</th>
                  <th className="num">{t.fColImposto}</th>
                  <th className="num">{t.fColDistribuido}</th>
                  <th className="num">{t.fResultadoReal}</th>
                  <th className="num">{t.fColEmAberto}</th>
                </tr>
              </thead>
              <tbody>
                {[...ate, { ...T, mes: "" }].map((l) => {
                  const res = resultadoReal(l), F = l.mes ? "span" : "strong";
                  return (
                    <tr key={l.mes || "total"}>
                      <td><F>{l.mes ? mesCurto(l.mes, ctx.idioma) : t.total}</F></td>
                      <td data-label={t.fColFaturado} className="num"><F>{reais(l.faturado)}</F></td>
                      <td data-label={t.colRecebido} className="num"><F>{reais(l.recebido)}</F></td>
                      <td data-label={t.fColContasPagas} className="num"><F>{reais(l.pagas)}</F></td>
                      <td data-label={t.fColImposto} className="num"><F>{reais(l.imposto)}</F></td>
                      <td data-label={t.fColDistribuido} className="num"><F>{reais(l.distribuido)}</F></td>
                      <td data-label={t.fResultadoReal} className={res < 0 ? "num neg" : "num"}><F>{sinal(res)}</F></td>
                      <td data-label={t.fColEmAberto} className="num"><F>{reais(l.abertas)}</F></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
