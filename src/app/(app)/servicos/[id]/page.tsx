import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { textos } from "@/lib/i18n";
import FormServico, { type Servico, type TextosForm } from "./form";
import { removerServico } from "../acoes";

/** Criar (/servicos/novo) ou editar um serviço do ambiente aberto. */
export default async function PaginaServico({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const [{ id }, { erro }] = await Promise.all([params, searchParams]);
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
          .select("id, categoria, nome, valor, unidade, prazo_minimo_meses, complemento, visivel_comercial, ativo, observacao_interna")
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
