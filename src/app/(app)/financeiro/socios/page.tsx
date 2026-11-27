import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { apura, ehAporte, ehRepasse, posicao } from "@/lib/financeiro";
import { carregaFinanceiro } from "@/lib/dados-financeiro";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { AbasFinanceiro } from "../abas";
import { PosicaoSocios, Quadro, SeloComprovante, pct, sinal } from "../partes";
import { salvarParticipacoes, salvarTaxas } from "../acoes";

/** Sócios e lucros: saldo de cada sócio, fundo de reserva, apuração por recebimento, repasses e as regras da conta. */
export default async function SociosLucros({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const { ok } = await searchParams;
  const socio = ctx.perfil === "socio";
  const fin = await carregaFinanceiro(await createClient(), ctx.ambiente!);
  const p = posicao(fin);
  const apuracoes = fin.recs.map((x) => ({ x, a: apura(x, fin.participacoes) }));
  const colunas = p.socios.filter((s) => s.pct > 0 || s.direito !== 0);
  const tot = apuracoes.reduce((s, { a }) => ({ rec: s.rec + a.rec, imp: s.imp + a.imp, res: s.res + a.res, cus: s.cus + a.cus, lucro: s.lucro + a.lucro }), { rec: 0, imp: 0, res: 0, cus: 0, lucro: 0 });
  const repasses = fin.movs.filter((m) => ehRepasse(m) || ehAporte(m) || (!m.fora && (m.categoria === "distribuicao" || m.categoria === "aporte"))).sort((a, b) => (a.pagoEm ?? a.mes).localeCompare(b.pagoEm ?? b.mes));
  const pctDe = (id: string) => fin.participacoes.find((x) => x.socio === id)?.percentual ?? 0;
  const num = (n: number) => Number(n).toLocaleString("pt-BR");

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.fSociosLucros}</h1>
        </div>
      </div>
      <AbasFinanceiro t={t} atual="socios" />

      {ok && (
        <div className="aviso ok" role="status">
          {ok === "taxas" ? t.taxasSalvas : ok === "apuracao" ? t.fApuracaoSalva : ok === "salvo" ? t.lancamentoSalvo : ok === "removido" ? t.lancamentoRemovido : t.participacoesSalvas}
        </div>
      )}

      <div className="quadros">
        {p.socios.filter((s) => s.pct > 0).map((s) => (
          <Quadro
            key={s.socio}
            tom={s.saldo > 0.005 ? "atencao" : s.saldo < -0.005 ? "alerta" : "ok"}
            rotulo={t.fSocioPct(fin.nomes[s.socio] ?? "—", pct(s.pct))}
            valor={reais(Math.abs(s.saldo))}
            sub={`${s.saldo > 0.005 ? t.fLucrosNaoRetirados : s.saldo < -0.005 ? t.fRetiradoAMais : t.fLucrosEmDia} · ${t.fSubDireitoRetirado(reais(s.direito), reais(s.retirado))}`}
          />
        ))}
        <Quadro tom={p.fundo < 0 ? "alerta" : "neutro"} rotulo={t.fFundoReserva} valor={sinal(p.fundo)} sub={`${p.fundo < 0 ? `${t.fFaltaCobrir} · ` : ""}${t.fSubFundo(reais(p.reserva + p.custos), reais(p.pagas))}`} />
      </div>

      <section className="pilha" aria-label={t.fSecPosicao}>
        <div className="rotulo">{t.fSecPosicao}</div>
        <PosicaoSocios t={t} p={p} nomes={fin.nomes} coberturaNome={fin.coberturaNome} />
      </section>

      <section className="pilha" aria-label={t.fSecApuracoes}>
        <div className="rotulo">{t.fSecApuracoes}</div>
        {apuracoes.length === 0 ? (
          <div className="aviso">{t.fSemApuracoes}</div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.fColData}</th>
                  <th>{t.fColProjeto}</th>
                  <th className="num">{t.colRecebido}</th>
                  <th className="num">{t.fColImposto}</th>
                  <th className="num">{t.fColReserva}</th>
                  <th className="num">{t.fColCustos}</th>
                  <th className="num">{t.fColLucroDividir}</th>
                  {colunas.map((s) => (
                    <th key={s.socio} className="num">{fin.nomes[s.socio] ?? "—"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apuracoes.map(({ x, a }) => (
                  <tr key={x.id}>
                    <td>{dataCurta(x.data, true)}</td>
                    <td data-label={t.fColProjeto}>
                      <Link href={`/financeiro/apuracao/${x.origem}/${x.id}`}>{x.descricao}</Link>
                      {x.obs && <div className="dica" style={{ marginTop: 2 }}>{x.obs}</div>}
                    </td>
                    <td data-label={t.colRecebido} className="num">{reais(a.rec)}</td>
                    <td data-label={t.fColImposto} className="num">{reais(a.imp)}</td>
                    <td data-label={t.fColReserva} className="num">{reais(a.res)}</td>
                    <td data-label={t.fColCustos} className="num">{reais(a.cus)}</td>
                    <td data-label={t.fColLucroDividir} className="num"><strong>{reais(a.lucro)}</strong></td>
                    {colunas.map((s) => (
                      <td key={s.socio} data-label={fin.nomes[s.socio] ?? "—"} className="num">{reais(a.partes.find((y) => y.socio === s.socio)?.valor ?? 0)}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}><strong>{t.total}</strong></td>
                  <td data-label={t.colRecebido} className="num"><strong>{reais(tot.rec)}</strong></td>
                  <td data-label={t.fColImposto} className="num"><strong>{reais(tot.imp)}</strong></td>
                  <td data-label={t.fColReserva} className="num"><strong>{reais(tot.res)}</strong></td>
                  <td data-label={t.fColCustos} className="num"><strong>{reais(tot.cus)}</strong></td>
                  <td data-label={t.fColLucroDividir} className="num"><strong>{reais(tot.lucro)}</strong></td>
                  {colunas.map((s) => (
                    <td key={s.socio} data-label={fin.nomes[s.socio] ?? "—"} className="num"><strong>{reais(s.direito)}</strong></td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="dica" style={{ margin: 0 }}>{t.fDicaApuracoes}</p>
      </section>

      <section className="pilha" aria-label={t.fSecRepasses}>
        <div className="cab">
          <div className="rotulo">{t.fSecRepasses}</div>
          {socio && (
            <Link href="/financeiro/lancamentos/novo?categoria=distribuicao&volta=socios" className="btn">
              {t.fNovoRepasse}
            </Link>
          )}
        </div>
        {repasses.length === 0 ? (
          <div className="aviso">{t.fSemRepasses}</div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.fColData}</th>
                  <th>{t.socio}</th>
                  <th>{t.categoria}</th>
                  <th className="num">{t.valorReais}</th>
                  <th>{t.fComprovante}</th>
                  <th>{t.observacoes}</th>
                </tr>
              </thead>
              <tbody>
                {repasses.map((m) => (
                  <tr key={m.id}>
                    <td>{dataCurta(m.pagoEm ?? m.vencimento ?? `${m.mes}-01`, true)}</td>
                    <td data-label={t.socio}>
                      <Link href={`/financeiro/lancamentos/${m.id}?volta=socios`}>{fin.nomes[m.socio ?? ""] ?? "—"}</Link>
                    </td>
                    <td data-label={t.categoria}>
                      {t.categoriasLanc[m.categoria as "aporte"]}
                      {m.estado !== "pago" && ` · ${t.fEstados[m.estado]}`}
                    </td>
                    <td data-label={t.valorReais} className="num">{reais(m.valor)}</td>
                    <td data-label={t.fComprovante}><SeloComprovante t={t} m={m} curto /></td>
                    <td data-label={t.observacoes}>{m.obs ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cartao pilha" aria-label={t.fSecComoConta}>
        <div className="rotulo">{t.fSecComoConta}</div>
        <p className="sub">{t.fComoConta(num(fin.impostoPct), num(fin.reservaPct))}</p>
      </section>

      {socio && fin.socios.length > 0 && (
        <FormAcao acao={salvarParticipacoes}>
          <div className="rotulo" id="participacao">{t.participacaoLucro}</div>
          <div className="linha-3">
            {fin.socios.map((s) => (
              <div key={s.id}>
                <label className="campo" htmlFor={`pct_${s.id}`}>
                  {s.nome} (%)
                </label>
                <input id={`pct_${s.id}`} name={`pct_${s.id}`} className="entrada" inputMode="decimal" defaultValue={pctDe(s.id) ? num(pctDe(s.id)) : ""} placeholder="0" />
              </div>
            ))}
          </div>
          <p className="dica" style={{ margin: 0 }}>{t.fDicaParticipacao}</p>
          <div className="acoes">
            <BotaoEnviar rotulo={t.salvarParticipacoes} enviando={t.salvando} className="btn fantasma" />
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
              <input id="imposto_pct" name="imposto_pct" className="entrada" inputMode="decimal" defaultValue={num(fin.impostoPct)} />
            </div>
            <div>
              <label className="campo" htmlFor="reserva_pct">
                {t.reservaPct}
              </label>
              <input id="reserva_pct" name="reserva_pct" className="entrada" inputMode="decimal" defaultValue={num(fin.reservaPct)} />
            </div>
          </div>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="cobertura_socio_id">
                {t.fCoberturaSocio}
              </label>
              <select id="cobertura_socio_id" name="cobertura_socio_id" className="entrada" defaultValue={fin.cobertura ?? ""}>
                <option value="">{t.fCoberturaNinguem}</option>
                {fin.socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="campo" htmlFor="cobertura_nome">
                {t.fCoberturaNome}
              </label>
              <input id="cobertura_nome" name="cobertura_nome" className="entrada" maxLength={60} defaultValue={fin.coberturaNome ?? ""} />
            </div>
          </div>
          <p className="dica" style={{ margin: 0 }}>
            {t.fDicaTaxas}
          </p>
          <div className="acoes">
            <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} className="btn fantasma" />
          </div>
        </FormAcao>
      )}
    </>
  );
}
