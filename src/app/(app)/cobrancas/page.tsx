import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { diasAte, numeroNota, vistaCobranca, type SituacaoCobranca, type VistaCobranca } from "@/lib/cobranca";

type Cob = { id: string; numero: number; cliente_id: string; descricao: string; vencimento: string; valor: number; situacao: SituacaoCobranca; pago_em: string | null; valor_recebido: number | null; envio_automatico: boolean };
const FILTROS: VistaCobranca[] = ["vencida", "a_vencer", "paga", "cancelada"];
const SELO: Record<VistaCobranca, string> = { a_vencer: "selo", vencida: "selo alerta", paga: "selo ok", cancelada: "selo off" };

/** Cobranças do ambiente aberto: o que vence, o que venceu e o que já entrou. Só sócio e administrativo. */
export default async function Cobrancas({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const { s = "", ok } = await searchParams;

  const supabase = await createClient();
  const [{ data, error }, { data: emissor }] = await Promise.all([
    supabase.from("cobrancas").select("id, numero, cliente_id, descricao, vencimento, valor, situacao, pago_em, valor_recebido, envio_automatico").eq("ambiente_id", ctx.ambiente!).order("vencimento"),
    supabase.from("ambiente_dados").select("conta_recebimento").eq("ambiente_id", ctx.ambiente!).maybeSingle(),
  ]);
  const hoje = hojeSP();
  const todas = ((data ?? []) as Cob[]).map((c) => ({ ...c, vista: vistaCobranca(c.situacao, c.vencimento, hoje) })).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const ids = [...new Set(todas.map((c) => c.cliente_id))];
  const { data: cli } = ids.length ? await supabase.from("clientes").select("id, nome").in("id", ids) : { data: [] };
  const clientes = Object.fromEntries((cli ?? []).map((c) => [c.id, c.nome]));
  const lista = s ? todas.filter((c) => c.vista === s) : todas.filter((c) => c.vista !== "cancelada");
  const soma = (v: VistaCobranca) => todas.filter((c) => c.vista === v).reduce((x, c) => x + Number(c.valor), 0);
  const mes = hoje.toISOString().slice(0, 7);
  const recebidoMes = todas.filter((c) => c.situacao === "paga" && (c.pago_em ?? "").startsWith(mes)).reduce((x, c) => x + Number(c.valor_recebido ?? 0), 0);

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.cobrancas}</h1>
        </div>
        <div className="acoes">
          <Link href="/cobrancas/dados" className="btn fantasma">
            {t.dadosNota}
          </Link>
          <Link href="/cobrancas/nova" className="btn">
            {t.novaCobranca}
          </Link>
        </div>
      </div>

      {ok && (
        <div className="aviso ok" role="status">
          {ok === "criadas" ? t.cobrancasCriadas : t.cobrancaSalva}
        </div>
      )}
      {error && (
        <div className="aviso erro" role="alert">
          {t.erroCarregar}
        </div>
      )}
      {!emissor?.conta_recebimento && (
        <div className="aviso erro" role="status">
          {t.avisoSemDados} <Link href="/cobrancas/dados">{t.preencherDados}</Link>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span className="rotulo">{t.kpiAReceber}</span>
          <strong>{reais(soma("a_vencer") + soma("vencida"))}</strong>
        </div>
        <div className="kpi">
          <span className="rotulo">{t.kpiVencido}</span>
          <strong>{reais(soma("vencida"))}</strong>
        </div>
        <div className="kpi">
          <span className="rotulo">{t.kpiRecebidoMes}</span>
          <strong>{reais(recebidoMes)}</strong>
        </div>
      </div>

      <nav aria-label={t.colSituacao} className="chips">
        <Link href="/cobrancas" className="chip" aria-current={!s ? "page" : undefined}>
          {t.todas}
        </Link>
        {FILTROS.filter((f) => todas.some((c) => c.vista === f) || f === s).map((f) => (
          <Link key={f} href={`/cobrancas?s=${f}`} className="chip" aria-current={s === f ? "page" : undefined}>
            {t.vistas[f]} ({todas.filter((c) => c.vista === f).length})
          </Link>
        ))}
      </nav>

      {lista.length === 0 ? (
        <div className="aviso">{t.cobrancasVazio}</div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>{t.cliente}</th>
                <th>{t.colReferencia}</th>
                <th>{t.colVencimento}</th>
                <th className="num">{t.colValor}</th>
                <th>{t.colSituacao}</th>
                <th>{t.envioAuto}</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const d = diasAte(c.vencimento, hoje);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/cobrancas/${c.id}`}>{clientes[c.cliente_id] ?? "—"}</Link>
                      <div className="dica" style={{ marginTop: 2 }}>
                        {numeroNota(ctx.ambiente!, c.numero)}
                      </div>
                    </td>
                    <td data-label={t.colReferencia}>{c.descricao}</td>
                    <td data-label={t.colVencimento}>
                      {dataCurta(c.vencimento, true)}
                      {c.vista === "vencida" && <div className="dica" style={{ marginTop: 2 }}>{t.vencidaHa(-d)}</div>}
                      {c.vista === "a_vencer" && d <= 7 && <div className="dica" style={{ marginTop: 2 }}>{t.venceEm(d)}</div>}
                    </td>
                    <td data-label={t.colValor} className="num">
                      {reais(Number(c.valor))}
                    </td>
                    <td data-label={t.colSituacao}>
                      <span className={SELO[c.vista]}>{t.vistas[c.vista]}</span>
                    </td>
                    <td data-label={t.envioAuto}>{c.situacao === "aberta" ? (c.envio_automatico ? t.ligado : t.desligado) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
