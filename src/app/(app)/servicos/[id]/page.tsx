import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import FormServico, { type Servico } from "./form";
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
          <div className="rotulo">Serviço · {nomeAmbiente(ctx.ambiente)}</div>
          <h1>{novo ? "Novo serviço" : (atual as Servico).nome}</h1>
        </div>
        <Link href="/servicos" className="btn fantasma">
          Voltar
        </Link>
      </div>

      {erro === "remover" && (
        <div className="aviso erro" role="alert">
          Não deu para remover. Se o serviço já aparece em orçamentos, desmarque “Ativo” em vez de remover.
        </div>
      )}

      <FormServico servico={atual as Servico | null} categorias={categorias} />

      <div className="aviso" style={{ maxWidth: 760 }}>
        Mudar o valor não altera orçamentos já emitidos. O texto que vai na proposta (incluso, prazos, pagamento) ganha
        tela própria junto com os orçamentos.
      </div>

      {!novo && ctx.perfil === "socio" && (
        <details className="cartao" style={{ maxWidth: 760 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>
            Remover serviço
          </summary>
          <form action={removerServico} className="pilha" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="sub">
              Apaga o serviço da tabela de vez. Para só tirar de uso, desmarque “Ativo” e salve.
            </p>
            <div>
              <button type="submit" className="btn perigo">
                Remover de vez
              </button>
            </div>
          </form>
        </details>
      )}
    </>
  );
}
