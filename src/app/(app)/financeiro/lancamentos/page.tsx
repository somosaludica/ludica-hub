import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { mesDe, mesValido } from "@/lib/fechamento";
import { dadosDoMes } from "@/lib/dados-mes";
import { AbasFinanceiro, TrocaMes } from "../abas";

/** Lançamentos do mês: saídas (contas fixas, terceiros, comissões, distribuição) e entradas que não vêm de cobrança. */
export default async function Lancamentos({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const sp = await searchParams;
  const mes = mesValido(sp.mes ?? "") ? sp.mes! : mesDe(hojeSP());
  const supabase = await createClient();
  const { movimentos } = await dadosDoMes(supabase, ctx.ambiente!, mes);

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.lancamentos}</h1>
        </div>
        <Link href={`/financeiro/lancamentos/novo?mes=${mes}`} className="btn">
          {t.novoLancamento}
        </Link>
      </div>
      <AbasFinanceiro t={t} atual="lancamentos" />
      <TrocaMes mes={mes} idioma={ctx.idioma} base="/financeiro/lancamentos" rotulo={t.mes} />

      {sp.ok && (
        <div className="aviso ok" role="status">
          {sp.ok === "removido" ? t.lancamentoRemovido : t.lancamentoSalvo}
        </div>
      )}

      {movimentos.length === 0 ? (
        <div className="aviso">{t.lancamentosVazio}</div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>{t.docDescricao}</th>
                <th>{t.categoria}</th>
                <th>{t.colVencimento}</th>
                <th className="num">{t.colValor}</th>
                <th>{t.colSituacao}</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/financeiro/lancamentos/${m.id}`}>{m.descricao}</Link>
                    {m.fornecedor && <div className="dica" style={{ marginTop: 2 }}>{m.fornecedor}</div>}
                  </td>
                  <td data-label={t.categoria}>{t.categoriasLanc[m.categoria as "conta_fixa"]}</td>
                  <td data-label={t.colVencimento}>{dataCurta(m.vencimento, true)}</td>
                  <td data-label={t.colValor} className="num">
                    {m.tipo === "entrada" ? "+ " : "− "}
                    {reais(m.previsto)}
                  </td>
                  <td data-label={t.colSituacao}>
                    <span className={`selo ${m.paga ? "ok" : ""}`}>{t.situacoesLanc[m.paga ? "paga" : "provisionada"]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="aviso">{t.dicaEntradas}</div>
    </>
  );
}
