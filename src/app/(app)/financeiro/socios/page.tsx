import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import type { Fechamento } from "@/lib/fechamento";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { AbasFinanceiro } from "../abas";
import { salvarParticipacoes, salvarTaxas } from "../acoes";

/** Sócios do ambiente: participação, lucro a distribuir (meses fechados), retiradas, aportes e os percentuais de imposto e reserva. */
export default async function Socios({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const { ok } = await searchParams;
  const socio = ctx.perfil === "socio";

  const supabase = await createClient();
  const [{ data: acessos }, { data: parts }, { data: fechados }, { data: lancs }, { data: amb }] = await Promise.all([
    supabase.from("acessos").select("usuario_id").eq("ambiente_id", ctx.ambiente!).eq("perfil", "socio"),
    supabase.from("participacoes").select("socio_id, percentual").eq("ambiente_id", ctx.ambiente!),
    supabase.from("meses_fechados").select("mes, resultado").eq("ambiente_id", ctx.ambiente!),
    supabase.from("lancamentos").select("id, categoria, descricao, socio_id, vencimento, pago_em, valor, situacao").eq("ambiente_id", ctx.ambiente!),
    supabase.from("ambiente_dados").select("imposto_pct, reserva_pct").eq("ambiente_id", ctx.ambiente!).maybeSingle(),
  ]);
  const ids = [...new Set([...(acessos ?? []).map((a) => a.usuario_id as string), ...(parts ?? []).map((p) => p.socio_id as string)])];
  const { data: pes } = ids.length ? await supabase.from("perfis").select("id, nome").in("id", ids).order("nome") : { data: [] };
  const pessoas = (pes ?? []) as { id: string; nome: string }[];
  const pctDe = (id: string) => Number((parts ?? []).find((p) => p.socio_id === id)?.percentual ?? 0);

  const movs = (lancs ?? []).filter((l) => l.categoria === "distribuicao" || l.categoria === "aporte").sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
  const cent = (v: number) => Math.round(Number(v) * 100);
  const resumo = pessoas.map((p) => {
    const lucro = (fechados ?? []).reduce((x, m) => x + cent((m.resultado as Fechamento).socios?.find((s) => s.socio === p.id)?.parte ?? 0), 0);
    const retirado = movs.filter((l) => l.socio_id === p.id && l.categoria === "distribuicao" && l.situacao === "paga").reduce((x, l) => x + cent(l.valor), 0);
    const aportes = movs.filter((l) => l.socio_id === p.id && l.categoria === "aporte" && l.situacao === "paga").reduce((x, l) => x + cent(l.valor), 0);
    return { ...p, pct: pctDe(p.id), lucro: lucro / 100, retirado: retirado / 100, saldo: (lucro - retirado) / 100, aportes: aportes / 100 };
  });
  const fundo = (fechados ?? []).reduce((x, m) => x + cent((m.resultado as Fechamento).reserva ?? 0), 0) / 100;
  const nome = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? "—";
  const num = (n: number) => Number(n).toLocaleString("pt-BR");

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.socios}</h1>
        </div>
      </div>
      <AbasFinanceiro t={t} atual="socios" />

      {ok && (
        <div className="aviso ok" role="status">
          {ok === "taxas" ? t.taxasSalvas : t.participacoesSalvas}
        </div>
      )}

      {pessoas.length === 0 ? (
        <div className="aviso">{t.semSocios}</div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>{t.socio}</th>
                <th className="num">{t.colParticipacao}</th>
                <th className="num">{t.lucroADistribuir}</th>
                <th className="num">{t.jaRetirado}</th>
                <th className="num">{t.saldoNaoRetirado}</th>
                <th className="num">{t.aportesT}</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.nome}</strong>
                  </td>
                  <td data-label={t.colParticipacao} className="num">{s.pct ? `${num(s.pct)}%` : "—"}</td>
                  <td data-label={t.lucroADistribuir} className="num">{reais(s.lucro)}</td>
                  <td data-label={t.jaRetirado} className="num">{reais(s.retirado)}</td>
                  <td data-label={t.saldoNaoRetirado} className="num"><strong>{reais(s.saldo)}</strong></td>
                  <td data-label={t.aportesT} className="num">{reais(s.aportes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="kpis">
        <div className="kpi">
          <span className="rotulo">{t.fundoReserva}</span>
          <strong>{reais(fundo)}</strong>
        </div>
      </div>
      <div className="aviso">{t.dicaSocios}</div>

      {socio && pessoas.length > 0 && (
        <FormAcao acao={salvarParticipacoes}>
          <div className="rotulo">{t.participacaoLucro}</div>
          <div className="linha-3">
            {pessoas.map((p) => (
              <div key={p.id}>
                <label className="campo" htmlFor={`pct_${p.id}`}>
                  {p.nome} (%)
                </label>
                <input id={`pct_${p.id}`} name={`pct_${p.id}`} className="entrada" inputMode="decimal" defaultValue={pctDe(p.id) ? num(pctDe(p.id)) : ""} placeholder="0" />
              </div>
            ))}
          </div>
          <div className="acoes">
            <BotaoEnviar rotulo={t.salvarParticipacoes} enviando={t.salvando} />
          </div>
        </FormAcao>
      )}

      {socio && (
        <FormAcao acao={salvarTaxas}>
          <div className="rotulo">{t.impostoReserva}</div>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="imposto_pct">
                {t.impostoPct}
              </label>
              <input id="imposto_pct" name="imposto_pct" className="entrada" inputMode="decimal" defaultValue={num(Number(amb?.imposto_pct ?? 6))} />
            </div>
            <div>
              <label className="campo" htmlFor="reserva_pct">
                {t.reservaPct}
              </label>
              <input id="reserva_pct" name="reserva_pct" className="entrada" inputMode="decimal" defaultValue={num(Number(amb?.reserva_pct ?? 20))} />
            </div>
          </div>
          <p className="dica" style={{ margin: 0 }}>
            {t.dicaTaxas}
          </p>
          <div className="acoes">
            <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} className="btn fantasma" />
          </div>
        </FormAcao>
      )}

      <div className="cartao pilha" style={{ maxWidth: 760 }}>
        <div className="rotulo">{t.movimentos}</div>
        {movs.length === 0 ? (
          <p className="sub">{t.semMovimentos}</p>
        ) : (
          <ul className="lista-linhas">
            {movs.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{nome(m.socio_id as string | null)}</strong> · {t.categoriasLanc[m.categoria as "aporte"]} · {m.descricao}
                </span>
                <span>
                  {dataCurta(String(m.pago_em ?? m.vencimento), true)} · {reais(Number(m.valor))} · {t.situacoesLanc[m.situacao as "paga"]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
