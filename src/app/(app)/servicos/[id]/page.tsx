import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { textos } from "@/lib/i18n";
import FormServico, { type Servico, type TextosForm } from "./form";
import { removerServico, salvarConteudoProposta } from "../acoes";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";

/** Criar (/servicos/novo) ou editar um serviço do ambiente aberto. */
export default async function PaginaServico({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; conteudo?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const [{ id }, { erro, conteudo }] = await Promise.all([params, searchParams]);
  const novo = id === "novo";
  const t = textos(ctx.idioma);
  const tf: TextosForm = {
    categoria: t.categoria, dicaCategoria: t.dicaCategoria, nomeServico: t.nomeServico, valorReais: t.valorReais,
    unidadeCobranca: t.unidadeCobranca, prazoMinimo: t.prazoMinimo, dicaPrazoMensal: t.dicaPrazoMensal,
    dicaPrazoOutros: t.dicaPrazoOutros, observacaoInterna: t.observacaoInterna, dicaObservacao: t.dicaObservacao,
    marcaComplemento: t.marcaComplemento, marcaComercial: t.marcaComercial, marcaAtivo: t.marcaAtivo,
    salvar: t.salvar, salvando: t.salvando, cancelar: t.cancelar, unidades: t.unidades,
  };

  const supabase = await createClient();
  const [{ data: cats }, { data: atual }] = await Promise.all([
    supabase.from("servicos").select("categoria").eq("ambiente_id", ctx.ambiente!),
    novo
      ? Promise.resolve({ data: null })
      : supabase
          .from("servicos")
          .select("*")
          .eq("id", id)
          .eq("ambiente_id", ctx.ambiente!)
          .maybeSingle(),
  ]);
  if (!novo && !atual) notFound();

  const categorias = [...new Set((cats ?? []).map((c) => c.categoria))].sort();

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{t.servico} · {nomeAmbiente(ctx.ambiente)}</div>
          <h1>{novo ? t.novoServico : (atual as Servico).nome}</h1>
        </div>
        <Link href="/servicos" className="btn fantasma">
          {t.voltar}
        </Link>
      </div>

      {erro === "remover" && (
        <div className="aviso erro" role="alert">
          {t.erroRemover}
        </div>
      )}

      <FormServico servico={atual as Servico | null} categorias={categorias} t={tf} />

      <div className="aviso" style={{ maxWidth: 760 }}>
        {t.avisoServico}
      </div>

      {!novo && atual && (
        <div id="conteudo" style={{ display: "contents" }}>
          {conteudo && (
            <div className="aviso ok" role="status" style={{ maxWidth: 760 }}>
              {t.conteudoSalvo}
            </div>
          )}
          <FormAcao acao={salvarConteudoProposta}>
            <input type="hidden" name="id" value={id} />
            <fieldset className="secao">
              <legend>{t.conteudoProposta}</legend>
              <p className="dica" style={{ margin: 0 }}>
                {t.notaConteudo}
              </p>
              <div>
                <label className="campo" htmlFor="proposta_titulo">
                  {t.tituloProjeto}
                </label>
                <input id="proposta_titulo" name="proposta_titulo" className="entrada" defaultValue={atual.proposta_titulo ?? ""} />
              </div>
              {(
                [
                  ["proposta_descricao", t.descricaoProjeto, 3, false],
                  ["proposta_incluso", t.incluso, 6, true],
                  ["proposta_nao_incluso", t.naoIncluso, 4, true],
                  ["proposta_opcionais", t.opcionais, 4, true],
                  ["proposta_workflow", t.workflow, 5, true],
                ] as const
              ).map(([nome, rotulo, linhasCampo, lista]) => (
                <div key={nome}>
                  <label className="campo" htmlFor={nome}>
                    {rotulo}
                  </label>
                  <textarea id={nome} name={nome} className="entrada" rows={linhasCampo} defaultValue={(atual[nome] as string | null) ?? ""} aria-describedby={lista ? `${nome}-dica` : undefined} />
                  {lista && (
                    <div id={`${nome}-dica`} className="dica">
                      {t.umPorLinha}
                    </div>
                  )}
                </div>
              ))}
              <div className="linha-3">
                <div>
                  <label className="campo" htmlFor="proposta_prazo">
                    {t.prazoPadrao}
                  </label>
                  <input id="proposta_prazo" name="proposta_prazo" className="entrada" defaultValue={atual.proposta_prazo ?? ""} />
                </div>
                <div>
                  <label className="campo" htmlFor="proposta_pagamento">
                    {t.pagamentoPadrao}
                  </label>
                  <input id="proposta_pagamento" name="proposta_pagamento" className="entrada" defaultValue={atual.proposta_pagamento ?? ""} />
                </div>
                <div>
                  <label className="campo" htmlFor="proposta_validade">
                    {t.validadePadrao}
                  </label>
                  <input id="proposta_validade" name="proposta_validade" className="entrada" inputMode="numeric" placeholder="7" defaultValue={(atual.proposta_validade ?? "").match(/\d+/)?.[0] ?? ""} />
                </div>
              </div>
            </fieldset>
            <div className="acoes">
              <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
            </div>
          </FormAcao>
        </div>
      )}

      {!novo && ctx.perfil === "socio" && (
        <details className="cartao" style={{ maxWidth: 760 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>
            {t.removerServico}
          </summary>
          <form action={removerServico} className="pilha" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="sub">{t.removerExplica}</p>
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
