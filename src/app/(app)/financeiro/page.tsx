import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { mesDe, mesValido, type Fechamento } from "@/lib/fechamento";
import { dadosDoMes } from "@/lib/dados-mes";
import BotaoImprimir from "@/componentes/botao-imprimir";
import { AbasFinanceiro, TrocaMes } from "./abas";
import { fecharOuReabrir } from "./acoes";

/** Fechamento do mês do ambiente aberto: receitas por cliente, saídas, resultado e divisão entre os sócios. */
export default async function FechamentoMes({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; erro?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const sp = await searchParams;
  const hoje = hojeSP();
  const mes = mesValido(sp.mes ?? "") ? sp.mes! : mesDe(hoje);

  const supabase = await createClient();
  const [{ receitas, movimentos, fechamento: vivo }, { data: fechados }] = await Promise.all([
    dadosDoMes(supabase, ctx.ambiente!, mes),
    supabase.from("meses_fechados").select("mes, resultado, fechado_por, fechado_em").eq("ambiente_id", ctx.ambiente!),
  ]);
  const registro = (fechados ?? []).find((m) => String(m.mes).slice(0, 7) === mes);
  const f: Fechamento = registro ? (registro.resultado as Fechamento) : vivo;
  const idsNomes = [...new Set([...f.socios.map((s) => s.socio), ...(registro?.fechado_por ? [registro.fechado_por as string] : [])])];
  const { data: pes } = idsNomes.length ? await supabase.from("perfis").select("id, nome").in("id", idsNomes) : { data: [] };
  const nomes = Object.fromEntries((pes ?? []).map((p) => [p.id, p.nome]));

  const saidas = movimentos.filter((m) => m.tipo === "saida");
  const tot = (l: { previsto: number; realizado: number }[]) => ({
    previsto: l.reduce((x, r) => x + Math.round(r.previsto * 100), 0) / 100,
    realizado: l.reduce((x, r) => x + Math.round(r.realizado * 100), 0) / 100,
  });
  const totR = tot(receitas.map((r) => ({ previsto: r.previsto, realizado: r.recebido })));
  const totS = tot(saidas.map((s) => ({ previsto: s.previsto, realizado: s.pago })));
  const pct = (n: number) => Number(n).toLocaleString("pt-BR");
  const linha = (rotulo: string, valor: number, forte = false) => (
    <>
      <dt className={forte ? "forte" : undefined}>{rotulo}</dt>
      <dd className={forte ? "forte" : undefined}>{reais(valor)}</dd>
    </>
  );

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.fechamentoMes}</h1>
        </div>
        <div className="acoes nao-imprime">
          <BotaoImprimir rotulo={t.imprimir} />
        </div>
      </div>
      <AbasFinanceiro t={t} atual="fechamento" />
      <TrocaMes mes={mes} idioma={ctx.idioma} base="/financeiro" rotulo={t.mes} />

      {sp.ok && (
        <div className="aviso ok nao-imprime" role="status">
          {sp.ok === "reaberto" ? t.mesReabertoOk : t.mesFechadoOk}
        </div>
      )}
      {sp.erro && (
        <div className="aviso erro nao-imprime" role="alert">
          {sp.erro === "futuro" ? t.erroMesFuturo : t.erroRecusado}
        </div>
      )}
      {registro && (
        <div className="aviso" role="status">
          {t.mesFechadoPor(dataCurta(hojeSP(new Date(String(registro.fechado_em))).toISOString(), true), nomes[registro.fechado_por as string] ?? "—")}
        </div>
      )}

      <section className="pilha" aria-label={t.receitasCliente}>
        <div className="rotulo">{t.receitasCliente}</div>
        {receitas.length === 0 ? (
          <div className="aviso">{t.semMovimento}</div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.cliente}</th>
                  <th>{t.colReferencia}</th>
                  <th>{t.colVencimento}</th>
                  <th className="num">{t.colAReceber}</th>
                  <th className="num">{t.colRecebido}</th>
                  <th className="num">{t.colBalanco}</th>
                </tr>
              </thead>
              <tbody>
                {receitas.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/cobrancas/${r.id}`}>{r.cliente}</Link>
                    </td>
                    <td data-label={t.colReferencia}>{r.descricao}</td>
                    <td data-label={t.colVencimento}>{dataCurta(r.vencimento, true)}</td>
                    <td data-label={t.colAReceber} className="num">{reais(r.previsto)}</td>
                    <td data-label={t.colRecebido} className="num">{reais(r.recebido)}</td>
                    <td data-label={t.colBalanco} className="num">{reais(r.paga ? 0 : r.previsto)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}>
                    <strong>{t.totalMes}</strong>
                  </td>
                  <td data-label={t.colAReceber} className="num"><strong>{reais(totR.previsto)}</strong></td>
                  <td data-label={t.colRecebido} className="num"><strong>{reais(totR.realizado)}</strong></td>
                  <td data-label={t.colBalanco} className="num"><strong>{reais(receitas.filter((r) => !r.paga).reduce((x, r) => x + r.previsto, 0))}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pilha" aria-label={t.saidasMes}>
        <div className="rotulo">{t.saidasMes}</div>
        {saidas.length === 0 ? (
          <div className="aviso">{t.semMovimento}</div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.colFornecedor}</th>
                  <th>{t.categoria}</th>
                  <th>{t.colVencimento}</th>
                  <th className="num">{t.colAPagar}</th>
                  <th className="num">{t.colPago}</th>
                  <th className="num">{t.colBalanco}</th>
                </tr>
              </thead>
              <tbody>
                {saidas.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/financeiro/lancamentos/${s.id}`}>{s.descricao}</Link>
                      {s.fornecedor && <div className="dica" style={{ marginTop: 2 }}>{s.fornecedor}</div>}
                    </td>
                    <td data-label={t.categoria}>{t.categoriasLanc[s.categoria as "conta_fixa"]}</td>
                    <td data-label={t.colVencimento}>{dataCurta(s.vencimento, true)}</td>
                    <td data-label={t.colAPagar} className="num">{reais(s.previsto)}</td>
                    <td data-label={t.colPago} className="num">{reais(s.pago)}</td>
                    <td data-label={t.colBalanco} className="num">{reais(s.paga ? 0 : s.previsto)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}>
                    <strong>{t.totalMes}</strong>
                  </td>
                  <td data-label={t.colAPagar} className="num"><strong>{reais(totS.previsto)}</strong></td>
                  <td data-label={t.colPago} className="num"><strong>{reais(totS.realizado)}</strong></td>
                  <td data-label={t.colBalanco} className="num"><strong>{reais(saidas.filter((s) => !s.paga).reduce((x, s) => x + s.previsto, 0))}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="dica" style={{ margin: 0 }}>{t.dicaBalanco}</p>
      </section>

      <div className="grade-2">
        <section className="cartao pilha" aria-label={t.resultadoDoMes}>
          <div className="rotulo">{t.resultadoDoMes}</div>
          <dl className="resumo-total largo">
            {linha(t.linhaEntradas, f.faturamento)}
            {linha(t.linhaImposto(pct(f.impostoPct)), f.imposto)}
            {linha(t.linhaReserva(pct(f.reservaPct)), f.reserva)}
            {linha(t.linhaFixas, f.contasFixas)}
            {linha(t.linhaTerceiros, f.custosTerceiros)}
            {linha(t.linhaComissoes, f.comissoes)}
            {linha(t.linhaOutras, f.outrasSaidas)}
            {linha(t.linhaAntes, f.resultadoAntes, true)}
            {linha(t.linhaDistribuicao, f.distribuicao)}
            {linha(t.linhaResultado, f.resultadoMes, true)}
          </dl>
          {f.aportes > 0 && (
            <p className="sub">
              {t.linhaAportes}: <strong>{reais(f.aportes)}</strong>
            </p>
          )}
        </section>

        <section className="cartao pilha" aria-label={t.divisaoSocios}>
          <div className="rotulo">{t.divisaoSocios}</div>
          {!f.participacaoCompleta ? (
            <p className="sub">
              {t.semParticipacoes} <Link href="/financeiro/socios">{t.socios}</Link>
            </p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.socio}</th>
                  <th className="num">{t.colParticipacao}</th>
                  <th className="num">{t.colRenuncia}</th>
                  <th className="num">{t.colParte}</th>
                </tr>
              </thead>
              <tbody>
                {f.socios.map((s) => (
                  <tr key={s.socio}>
                    <td>
                      <strong>{nomes[s.socio] ?? "—"}</strong>
                    </td>
                    <td data-label={t.colParticipacao} className="num">{pct(s.percentual)}%</td>
                    <td data-label={t.colRenuncia} className="num">{s.renunciaLiquida > 0 ? reais(s.renunciaLiquida) : "—"}</td>
                    <td data-label={t.colParte} className="num"><strong>{reais(s.parte)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="dica" style={{ margin: 0 }}>{t.dicaDivisao}</p>
        </section>
      </div>

      {(!registro || ctx.perfil === "socio") && (
        <form action={fecharOuReabrir} className="cartao pilha nao-imprime" style={{ maxWidth: 760 }}>
          <input type="hidden" name="mes" value={mes} />
          <input type="hidden" name="acao" value={registro ? "reabrir" : "fechar"} />
          <p className="sub">{t.dicaFechar}</p>
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
