import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { reais, reaisCampo, type Unidade } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { diasDe, juntaLinhas, numeroOrcamento, totais } from "@/lib/orcamento";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { salvarOrcamento } from "../../acoes";

type ItemLinha = { id: string; servico_id: string | null; descricao: string; unidade: Unidade; quantidade: number; valor_unitario: number; ordem: number };
type ServicoTexto = {
  id: string; categoria: string; nome: string; ativo: boolean; proposta_titulo: string | null; proposta_descricao: string | null;
  proposta_incluso: string | null; proposta_nao_incluso: string | null; proposta_opcionais: string | null; proposta_workflow: string | null;
  proposta_prazo: string | null; proposta_pagamento: string | null; proposta_validade: string | null;
};

/** Montagem do orçamento por sócio ou administrativo. Abrir um pedido do comercial aqui e salvar o transforma em rascunho. */
export default async function MontarOrcamento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: o } = await supabase.from("orcamentos").select("*").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle();
  if (!o) notFound();
  if (o.situacao !== "pedido" && o.situacao !== "rascunho") redirect(`/orcamentos/${id}`);

  const [{ data: its }, { data: servs }, { data: cliente }, { data: autor }] = await Promise.all([
    supabase.from("orcamento_itens").select("id, servico_id, descricao, unidade, quantidade, valor_unitario, ordem").eq("orcamento_id", id).order("ordem"),
    supabase.from("servicos").select("id, categoria, nome, ativo, proposta_titulo, proposta_descricao, proposta_incluso, proposta_nao_incluso, proposta_opcionais, proposta_workflow, proposta_prazo, proposta_pagamento, proposta_validade").eq("ambiente_id", ctx.ambiente!).order("categoria").order("nome"),
    supabase.from("clientes").select("nome").eq("id", o.cliente_id).maybeSingle(),
    supabase.from("perfis").select("nome").eq("id", o.pedido_por).maybeSingle(),
  ]);
  const itens = ([...(its ?? [])] as ItemLinha[]).sort((a, b) => a.ordem - b.ordem);
  const servicos = (servs ?? []) as ServicoTexto[];

  // Texto ainda não ajustado nesta proposta: vem do cadastro dos serviços escolhidos.
  const doItem = itens.map((i) => servicos.find((s) => s.id === i.servico_id)).filter(Boolean) as ServicoTexto[];
  const primeiro = <K extends keyof ServicoTexto>(k: K) => doItem.map((s) => s[k]).find(Boolean) as string | undefined;
  const padrao = {
    titulo: o.titulo ?? primeiro("proposta_titulo") ?? (itens.length === 1 ? itens[0].descricao : ""),
    descricao: o.descricao ?? primeiro("proposta_descricao") ?? "",
    incluso: o.incluso ?? juntaLinhas(doItem.map((s) => s.proposta_incluso)) ?? "",
    nao_incluso: o.nao_incluso ?? juntaLinhas(doItem.map((s) => s.proposta_nao_incluso)) ?? "",
    opcionais: o.opcionais ?? juntaLinhas(doItem.map((s) => s.proposta_opcionais)) ?? "",
    workflow: o.workflow ?? primeiro("proposta_workflow") ?? "",
    prazo: o.prazo ?? primeiro("proposta_prazo") ?? "",
    pagamento: o.pagamento ?? primeiro("proposta_pagamento") ?? "",
    validade: o.situacao === "pedido" ? diasDe(primeiro("proposta_validade"), o.validade_dias) : o.validade_dias,
  };
  const { subtotal, desconto, total } = totais(itens, Number(o.desconto_percentual));
  const area = (rotulo: string, nome: string, valor: string, linhasCampo = 4, dica?: string) => (
    <div>
      <label className="campo" htmlFor={nome}>
        {rotulo}
      </label>
      <textarea id={nome} name={nome} className="entrada" rows={linhasCampo} defaultValue={valor} aria-describedby={dica ? `${nome}-dica` : undefined} />
      {dica && (
        <div id={`${nome}-dica`} className="dica">
          {dica}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {nomeAmbiente(ctx.ambiente)} · {numeroOrcamento(ctx.ambiente!, o.numero)} · {t.situacoes[o.situacao as "pedido" | "rascunho"]}
          </div>
          <h1>
            {t.montarOrcamento}: {cliente?.nome ?? "—"}
          </h1>
        </div>
        <Link href="/orcamentos" className="btn fantasma">
          {t.voltar}
        </Link>
      </div>

      {sp.salvo && (
        <div className="aviso ok" role="status">
          {t.orcamentoSalvo}
        </div>
      )}
      {(o.obs_negociacao || o.desconto_categoria !== "nenhum") && (
        <div className="aviso">
          <strong>
            {t.pedidoDoComercial} ({autor?.nome ?? "—"}):
          </strong>{" "}
          {o.obs_negociacao ?? ""} {t.descontoSolicitado}: {t.descontos[o.desconto_categoria as "nenhum"]}
          {o.desconto_motivo ? ` (${o.desconto_motivo})` : ""}.
        </div>
      )}

      <FormAcao acao={salvarOrcamento} className="cartao form largo">
        <input type="hidden" name="id" value={id} />

        <fieldset className="secao">
          <legend>{t.colServicos}</legend>
          <div className="tabela-caixa" style={{ padding: 0 }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>{t.colServico}</th>
                  <th style={{ width: 100 }}>{t.qtd}</th>
                  <th style={{ width: 150 }}>{t.valorUnit}</th>
                  <th className="num">{t.subtotal}</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.descricao}</strong>
                      <div className="dica" style={{ marginTop: 2 }}>
                        {t.unidades[i.unidade]}
                      </div>
                    </td>
                    <td data-label={t.qtd}>
                      <input name={`qtd_${i.id}`} className="entrada qtd" inputMode="decimal" aria-label={t.qtdDe(i.descricao)} defaultValue={Number(i.quantidade).toLocaleString("pt-BR")} />
                    </td>
                    <td data-label={t.valorUnit}>
                      <input name={`valor_${i.id}`} className="entrada qtd" inputMode="decimal" aria-label={t.valorDe(i.descricao)} defaultValue={reaisCampo(Number(i.valor_unitario))} />
                    </td>
                    <td data-label={t.subtotal} className="num">
                      {reais(totais([i], 0).subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="novo_servico">
                {t.adicionarServico}
              </label>
              <select id="novo_servico" name="novo_servico" className="entrada" defaultValue="">
                <option value="">—</option>
                {servicos.filter((s) => s.ativo).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.categoria} · {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ maxWidth: 140 }}>
              <label className="campo" htmlFor="novo_qtd">
                {t.qtd}
              </label>
              <input id="novo_qtd" name="novo_qtd" className="entrada qtd" inputMode="decimal" defaultValue="1" />
            </div>
          </div>
          <p className="dica" style={{ margin: 0 }}>
            {t.dicaItens}
          </p>
        </fieldset>

        <fieldset className="secao">
          <legend>{t.desconto}</legend>
          <div className="linha-3">
            <div>
              <label className="campo" htmlFor="desconto_categoria">
                {t.descontoCategoria}
              </label>
              <select id="desconto_categoria" name="desconto_categoria" className="entrada" defaultValue={o.desconto_categoria}>
                {(["nenhum", "amigo", "cliente", "parceiro"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t.descontos[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="campo" htmlFor="desconto_percentual">
                {t.percentual}
              </label>
              <input id="desconto_percentual" name="desconto_percentual" className="entrada" inputMode="decimal" defaultValue={Number(o.desconto_percentual) ? Number(o.desconto_percentual).toLocaleString("pt-BR") : ""} placeholder="0" />
            </div>
            <div>
              <label className="campo" htmlFor="desconto_motivo">
                {t.motivoDesconto}
              </label>
              <input id="desconto_motivo" name="desconto_motivo" className="entrada" defaultValue={o.desconto_motivo ?? ""} />
            </div>
          </div>
          <dl className="resumo-total">
            <dt>{t.subtotal}</dt>
            <dd>{reais(subtotal)}</dd>
            <dt>{t.desconto}</dt>
            <dd>− {reais(desconto)}</dd>
            <dt className="forte">{t.total}</dt>
            <dd className="forte">{reais(total)}</dd>
          </dl>
        </fieldset>

        <fieldset className="secao">
          <legend>{t.textoProposta}</legend>
          <p className="dica" style={{ margin: 0 }}>
            {t.dicaTextoProposta}
          </p>
          <div>
            <label className="campo" htmlFor="titulo">
              {t.tituloProjeto}
            </label>
            <input id="titulo" name="titulo" className="entrada" defaultValue={padrao.titulo} />
          </div>
          {area(t.descricaoProjeto, "descricao", padrao.descricao, 3)}
          {area(t.incluso, "incluso", padrao.incluso, 6, t.umPorLinha)}
          <div className="linha-2">
            {area(t.naoIncluso, "nao_incluso", padrao.nao_incluso, 4, t.umPorLinha)}
            {area(t.opcionais, "opcionais", padrao.opcionais, 4, t.umPorLinha)}
          </div>
          {area(t.workflow, "workflow", padrao.workflow, 5, t.umPorLinha)}
        </fieldset>

        <fieldset className="secao">
          <legend>{t.condicoes}</legend>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="pagamento">
                {t.pagamento}
              </label>
              <input id="pagamento" name="pagamento" className="entrada" defaultValue={padrao.pagamento} />
            </div>
            <div>
              <label className="campo" htmlFor="entrega">
                {t.entrega}
              </label>
              <input id="entrega" name="entrega" className="entrada" defaultValue={o.entrega ?? ""} />
            </div>
          </div>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="prazo">
                {t.prazo}
              </label>
              <input id="prazo" name="prazo" className="entrada" defaultValue={padrao.prazo} />
            </div>
            <div>
              <label className="campo" htmlFor="validade_dias">
                {t.validadeDias}
              </label>
              <input id="validade_dias" name="validade_dias" type="number" min={1} max={365} className="entrada" defaultValue={padrao.validade} />
            </div>
          </div>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="assinatura">
                {t.quemAssina}
              </label>
              <select id="assinatura" name="assinatura" className="entrada" defaultValue={o.assinatura}>
                <option value="ambiente">Lúdica {nomeAmbiente(ctx.ambiente)}</option>
                <option value="hub">{t.assinaHub}</option>
              </select>
            </div>
            <div>
              <label className="campo" htmlFor="formato">
                {t.formato}
              </label>
              <select id="formato" name="formato" className="entrada" defaultValue={o.formato}>
                {(["one_page", "completa", "ambos"] as const).map((f) => (
                  <option key={f} value={f}>
                    {t.formatos[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="marcar">
            <input type="checkbox" name="envio_automatico" defaultChecked={o.situacao === "pedido" ? itens.some((i) => i.unidade === "mensal") : o.envio_automatico} />
            {t.envioAutomatico}
          </label>
        </fieldset>

        <div className="acoes">
          <BotaoEnviar rotulo={t.salvarRascunho} enviando={t.salvando} className="btn fantasma" />
          <button type="submit" name="ir" value="proposta" className="btn">
            {t.verProposta}
          </button>
        </div>
      </FormAcao>
    </>
  );
}
