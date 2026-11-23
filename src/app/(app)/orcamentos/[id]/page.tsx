import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, type Unidade } from "@/lib/formatos";
import { textos, type Idioma } from "@/lib/i18n";
import { numeroOrcamento, situacaoVista, type Situacao } from "@/lib/orcamento";
import BotaoImprimir from "@/componentes/botao-imprimir";
import DocumentoProposta from "../documento";
import { mudarSituacao, removerOrcamento } from "../acoes";

/** A proposta como vai para o cliente, com as ações de cada situação. */
export default async function Proposta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: o } = await supabase.from("orcamentos").select("*").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle();
  if (!o) notFound();
  const [{ data: descs }, { data: itens }, { data: cliente }, { data: eventos }] = await Promise.all([
    supabase.from("orcamento_descontos").select("tipo, percentual, ordem, criado_em").eq("orcamento_id", id).order("ordem"),
    supabase.from("orcamento_itens").select("descricao, unidade, quantidade, valor_unitario, ordem").eq("orcamento_id", id).order("ordem"),
    supabase.from("clientes").select("nome, idioma_documentos").eq("id", o.cliente_id).maybeSingle(),
    supabase.from("orcamento_eventos").select("id, de, para, em").eq("orcamento_id", id).order("em"),
  ]);

  const gestor = ctx.perfil === "socio" || ctx.perfil === "administrativo";
  const situacao = o.situacao as Situacao;
  const vista = situacaoVista(situacao, o.validade_ate, hojeSP());
  const numero = numeroOrcamento(ctx.ambiente!, o.numero);
  const ordenados = [...(itens ?? [])].sort((a, b) => a.ordem - b.ordem);
  const acao = (para: string, rotulo: string, classe = "btn") => (
    <form action={mudarSituacao}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="para" value={para} />
      <button type="submit" className={classe}>
        {rotulo}
      </button>
    </form>
  );

  return (
    <>
      <div className="cab nao-imprime">
        <div>
          <div className="rotulo">
            {nomeAmbiente(ctx.ambiente)} · {cliente?.nome ?? "—"}
          </div>
          <h1>
            {t.proposta} {numero}
          </h1>
        </div>
        <div className="acoes">
          <span className={`selo ${vista === "aprovado" ? "ok" : vista === "enviado" || vista === "pedido" ? "" : "off"}`} style={{ alignSelf: "center" }}>
            {t.situacoes[vista]}
          </span>
          {gestor && (situacao === "pedido" || situacao === "rascunho") && (
            <Link href={`/orcamentos/${id}/editar`} className="btn fantasma">
              {t.editar}
            </Link>
          )}
          <BotaoImprimir rotulo={t.imprimir} />
          <Link href="/orcamentos" className="btn fantasma">
            {t.voltar}
          </Link>
        </div>
      </div>

      {sp.ok && (
        <div className="aviso ok nao-imprime" role="status">
          {t.orcamentoSalvo}
        </div>
      )}
      {sp.erro && (
        <div className="aviso erro nao-imprime" role="alert">
          {sp.erro === "desconto" ? t.erroDescontoSocio : sp.erro === "itens" ? t.erroSemItens : t.erroRecusado}
        </div>
      )}
      {situacao === "pedido" && !gestor && <div className="aviso nao-imprime">{t.aguardandoMontagem}</div>}
      {o.obs_negociacao && gestor && (
        <div className="aviso nao-imprime">
          <strong>{t.obsNegociacao}:</strong> {o.obs_negociacao}
        </div>
      )}

      <DocumentoProposta
        d={{
          numero,
          assinatura: o.assinatura === "hub" ? "Lúdica HUB" : `Lúdica ${nomeAmbiente(ctx.ambiente)}`,
          cliente: cliente?.nome ?? "",
          idioma: ((cliente?.idioma_documentos as Idioma) ?? "pt"),
          titulo: o.titulo, descricao: o.descricao, incluso: o.incluso, nao_incluso: o.nao_incluso, opcionais: o.opcionais,
          workflow: o.workflow, entrega: o.entrega, prazo: o.prazo, pagamento: o.pagamento,
          validade_dias: o.validade_dias, validade_ate: o.validade_ate, desconto_percentual: Number(o.desconto_percentual),
          descontos: [...(descs ?? [])].sort((a, b) => a.ordem - b.ordem || String(a.criado_em).localeCompare(String(b.criado_em))).map((x) => ({ tipo: x.tipo as "amigo", percentual: Number(x.percentual) })),
          itens: ordenados.map((i) => ({ descricao: i.descricao, unidade: i.unidade as Unidade, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario) })),
        }}
      />

      {gestor && situacao === "rascunho" && (
        <div className="cartao pilha nao-imprime" style={{ maxWidth: 820 }}>
          <p className="sub">{t.notaEnviar}</p>
          <div className="acoes">{acao("enviado", t.marcarEnviada)}</div>
        </div>
      )}

      {gestor && situacao === "enviado" && (
        <div className="cartao pilha nao-imprime" style={{ maxWidth: 820 }}>
          <div className="rotulo">{t.respostaCliente}</div>
          {o.validade_ate && <p className="sub">{t.validaAte(dataCurta(o.validade_ate, true))}</p>}
          <div className="acoes">
            {acao("aprovado", t.marcarAprovada)}
            {acao("rascunho", t.voltarRascunho, "btn fantasma")}
          </div>
          <form action={mudarSituacao} className="busca">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="para" value="recusado" />
            <label className="so-leitor" htmlFor="motivo_recusa">
              {t.motivoRecusa}
            </label>
            <input id="motivo_recusa" name="motivo_recusa" className="entrada" placeholder={t.motivoRecusa} />
            <button type="submit" className="btn perigo">
              {t.marcarRecusada}
            </button>
          </form>
          <p className="sub">{t.notaAprovar}</p>
        </div>
      )}

      {gestor && situacao === "recusado" && (
        <div className="cartao pilha nao-imprime" style={{ maxWidth: 820 }}>
          {o.motivo_recusa && (
            <p className="sub">
              <strong>{t.motivoRecusa}:</strong> {o.motivo_recusa}
            </p>
          )}
          <div className="acoes">{acao("rascunho", t.voltarRascunho, "btn fantasma")}</div>
        </div>
      )}

      {(eventos ?? []).length > 0 && (
        <div className="cartao pilha nao-imprime" style={{ maxWidth: 820 }}>
          <div className="rotulo">{t.historico}</div>
          <ul className="lista-linhas">
            {(eventos ?? []).map((e) => (
              <li key={e.id}>
                <span>{t.historicoLinha(e.de ? t.situacoes[e.de as Situacao] : null, t.situacoes[e.para as Situacao])}</span>
                <span style={{ color: "var(--texto-2)" }}>{dataCurta(hojeSP(new Date(String(e.em))).toISOString(), true)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ctx.perfil === "socio" && situacao !== "aprovado" && (
        <details className="cartao nao-imprime" style={{ maxWidth: 820 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>{t.removerOrcamento}</summary>
          <form action={removerOrcamento} className="pilha" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="sub">{t.removerOrcamentoExplica}</p>
            <div>
              <button type="submit" className="btn perigo">
                {t.removerDeVez}
              </button>
            </div>
          </form>
        </details>
      )}
    </>
  );
}
