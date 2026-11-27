import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { apura, ehConta, ehReceita, ehRepasse, mesDe, mesValido, mesVazio, porMes, resultadoPrevisto, resultadoReal, type Mov } from "@/lib/financeiro";
import { carregaFinanceiro } from "@/lib/dados-financeiro";
import BotaoImprimir from "@/componentes/botao-imprimir";
import { AbasFinanceiro, TrocaMes } from "../abas";
import { Quadro, SeloComprovante, SeloEstado, sinal } from "../partes";
import { fecharOuReabrir } from "../acoes";

/** Fechamento do mês: entradas, saídas com comprovante, imposto e distribuição, resultado real e acumulado. */
export default async function FechamentoMes({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; erro?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const sp = await searchParams;
  const fin = await carregaFinanceiro(await createClient(), ctx.ambiente!);
  const mes = mesValido(sp.mes ?? "") ? sp.mes! : fin.mesAtual;
  const amb = nomeAmbiente(ctx.ambiente);

  const meses = porMes(fin.movs, fin.recs, fin.participacoes);
  const l = meses.find((x) => x.mes === mes) ?? mesVazio(mes);
  const real = resultadoReal(l), previsto = resultadoPrevisto(l);
  const acumulado = meses.filter((x) => x.mes <= mes).reduce((x, y) => x + Math.round(resultadoReal(y) * 100), 0) / 100;
  const ordem = (a: Mov, b: Mov) => (a.vencimento ?? a.pagoEm ?? "9").localeCompare(b.vencimento ?? b.pagoEm ?? "9");
  const entradas = fin.movs.filter((m) => m.mes === mes && ehReceita(m)).sort(ordem);
  const saidas = fin.movs.filter((m) => m.mes === mes && ehConta(m)).sort(ordem);
  const semComprovante = saidas.filter((m) => m.comprovante === "falta").length;
  const extras = [
    ...fin.recs.filter((x) => mesDe(x.data) === mes).map((x) => ({ id: `i${x.id}`, data: x.data, texto: t.fImpostoNota(x.descricao), valor: apura(x, fin.participacoes).imp, mov: null as Mov | null })),
    ...fin.movs.filter((m) => m.mes === mes && ehRepasse(m)).map((m) => ({ id: m.id, data: m.pagoEm ?? `${m.mes}-01`, texto: t.fDistribuicaoPara(fin.nomes[m.socio ?? ""] ?? "—"), valor: m.valor, mov: m as Mov | null })),
  ].filter((x) => x.valor > 0).sort((a, b) => a.data.localeCompare(b.data));
  const registro = fin.fechados.find((x) => x.mes === mes);

  const tabela = (lista: Mov[], entrada: boolean) =>
    lista.length === 0 ? (
      <div className="aviso">{entrada ? t.fSemEntradas : t.fSemSaidas}</div>
    ) : (
      <div className="tabela-caixa">
        <table className="tabela">
          <thead>
            <tr>
              <th>{t.docDescricao}</th>
              <th>{t.colVencimento}</th>
              <th>{entrada ? t.fColRecebidoEm : t.fColPagoEm}</th>
              <th className="num">{t.fColParte(amb)}</th>
              <th>{t.fColStatus}</th>
              <th>{t.fComprovante}</th>
              <th>{t.fColConta}</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={m.origem === "cobranca" ? `/cobrancas/${m.id}` : `/financeiro/lancamentos/${m.id}?volta=fechamento&mes=${mes}`}>{m.descricao}</Link>
                  <div className="dica" style={{ marginTop: 2 }}>{m.rubrica ?? (m.origem === "cobranca" ? t.cobrancas : t.categoriasLanc[m.categoria as "conta_fixa"])}</div>
                </td>
                <td data-label={t.colVencimento}>{m.vencimento ? dataCurta(m.vencimento, true) : "—"}</td>
                <td data-label={entrada ? t.fColRecebidoEm : t.fColPagoEm}>{m.pagoEm ? dataCurta(m.pagoEm, true) : "—"}</td>
                <td data-label={t.fColParte(amb)} className="num">{reais(m.valor)}</td>
                <td data-label={t.fColStatus}><SeloEstado t={t} m={m} /></td>
                <td data-label={t.fComprovante}><SeloComprovante t={t} m={m} curto /></td>
                <td data-label={t.fColConta}>{m.conta ?? "—"}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}><strong>{t.total}</strong></td>
              <td data-label={t.fColParte(amb)} className="num"><strong>{reais(lista.reduce((x, m) => x + Math.round(m.valor * 100), 0) / 100)}</strong></td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
    );

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{amb}</div>
          <h1>{t.fechamentoMes}</h1>
        </div>
        <div className="acoes nao-imprime">
          <BotaoImprimir rotulo={t.imprimir} />
        </div>
      </div>
      <AbasFinanceiro t={t} atual="fechamento" />
      <TrocaMes mes={mes} idioma={ctx.idioma} base="/financeiro/fechamento" rotulo={t.mes} />

      {sp.ok && (
        <div className="aviso ok nao-imprime" role="status">
          {sp.ok === "reaberto" ? t.mesReabertoOk : sp.ok === "fechado" ? t.mesFechadoOk : t.lancamentoSalvo}
        </div>
      )}
      {sp.erro && (
        <div className="aviso erro nao-imprime" role="alert">
          {sp.erro === "futuro" ? t.erroMesFuturo : t.erroRecusado}
        </div>
      )}
      {registro && (
        <div className="aviso" role="status">
          {t.fMesFechadoPor(dataCurta(hojeSP(new Date(registro.em)).toISOString(), true), fin.nomes[registro.por ?? ""] ?? "—")}
        </div>
      )}

      <div className="quadros">
        <Quadro tom="ok" rotulo={t.fColEntradas} valor={reais(l.faturado)} sub={t.fSubRecebido(reais(l.recebido))} />
        <Quadro tom="atencao" rotulo={t.fContasDoMes} valor={reais(l.contas)} sub={t.fSubPagoAberto(reais(l.pagas), reais(l.abertas))} />
        <Quadro rotulo={t.fColImpostoDist} valor={reais(l.imposto + l.distribuido)} sub={t.fSubImpostoDist(reais(l.imposto), reais(l.distribuido))} />
        <Quadro tom={real < 0 ? "alerta" : "ok"} rotulo={t.fResultadoRealMes} valor={sinal(real)} sub={t.fSubComAbertas(sinal(previsto))} />
        <Quadro tom={acumulado < 0 ? "alerta" : "neutro"} rotulo={t.fAcumulado} valor={sinal(acumulado)} sub={semComprovante ? t.fSubSemComp(semComprovante) : t.fSubCompEmDia} />
      </div>

      <section className="pilha" aria-label={t.fSecEntradas}>
        <div className="rotulo">{t.fSecEntradas}</div>
        {tabela(entradas, true)}
      </section>
      <section className="pilha" aria-label={t.fSecSaidas}>
        <div className="rotulo">{t.fSecSaidas}</div>
        {tabela(saidas, false)}
      </section>
      <section className="pilha" aria-label={t.fSecImpostoDist}>
        <div className="rotulo">{t.fSecImpostoDist}</div>
        {extras.length === 0 ? (
          <div className="aviso">{t.fSemImpostoDist}</div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.docDescricao}</th>
                  <th>{t.fColData}</th>
                  <th className="num">{t.valorReais}</th>
                  <th>{t.fComprovante}</th>
                </tr>
              </thead>
              <tbody>
                {extras.map((x) => (
                  <tr key={x.id}>
                    <td>{x.mov ? <Link href={`/financeiro/lancamentos/${x.mov.id}?volta=fechamento&mes=${mes}`}>{x.texto}</Link> : x.texto}</td>
                    <td data-label={t.fColData}>{dataCurta(x.data, true)}</td>
                    <td data-label={t.valorReais} className="num">{reais(x.valor)}</td>
                    <td data-label={t.fComprovante}>{x.mov ? <SeloComprovante t={t} m={x.mov} curto /> : "—"}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}><strong>{t.total}</strong></td>
                  <td data-label={t.valorReais} className="num"><strong>{reais(l.imposto + l.distribuido)}</strong></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(!registro || ctx.perfil === "socio") && (
        <form action={fecharOuReabrir} className="cartao pilha nao-imprime" style={{ maxWidth: 760 }}>
          <input type="hidden" name="mes" value={mes} />
          <input type="hidden" name="acao" value={registro ? "reabrir" : "fechar"} />
          <p className="sub">{t.fDicaFechar}</p>
          <div>
            <button type="submit" className={registro ? "btn fantasma" : "btn"}>
              {registro ? t.reabrirMes : t.fecharMes}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
