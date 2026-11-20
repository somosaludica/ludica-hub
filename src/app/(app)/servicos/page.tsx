import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { reais, UNIDADES, type Unidade } from "@/lib/formatos";

type Linha = {
  id: string;
  categoria: string;
  nome: string;
  valor: number;
  unidade: Unidade;
  prazo_minimo_meses: number | null;
  complemento: boolean;
  visivel_comercial: boolean;
  ativo: boolean;
};

/** Tabela de Serviços do ambiente aberto. Sócio e administrativo editam; o comercial só consulta os liberados. */
export default async function Servicos({ searchParams }: { searchParams: Promise<{ categoria?: string; salvo?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const { categoria, salvo } = await searchParams;
  const edita = ctx.perfil === "socio" || ctx.perfil === "administrativo";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servicos")
    .select("id, categoria, nome, valor, unidade, prazo_minimo_meses, complemento, visivel_comercial, ativo")
    .eq("ambiente_id", ctx.ambiente!)
    .order("categoria")
    .order("nome");
  const todos = (data ?? []) as Linha[];
  const categorias = [...new Set(todos.map((s) => s.categoria))];
  const lista = categoria ? todos.filter((s) => s.categoria === categoria) : todos;
  const ativos = todos.filter((s) => s.ativo).length;

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {nomeAmbiente(ctx.ambiente)} · {ativos} {ativos === 1 ? "serviço ativo" : "serviços ativos"}
          </div>
          <h1>Tabela de Serviços</h1>
        </div>
        {edita && (
          <Link href="/servicos/novo" className="btn">
            Novo serviço
          </Link>
        )}
      </div>

      {salvo && (
        <div className="aviso ok" role="status">
          {salvo === "removido" ? "Serviço removido." : "Serviço salvo."}
        </div>
      )}
      {error && (
        <div className="aviso erro" role="alert">
          Não deu para carregar a tabela agora. Tente de novo em instantes.
        </div>
      )}

      {categorias.length > 1 && (
        <nav aria-label="Categoria" className="chips">
          <Link href="/servicos" className="chip" aria-current={!categoria ? "page" : undefined}>
            Todas
          </Link>
          {categorias.map((c) => (
            <Link
              key={c}
              href={`/servicos?categoria=${encodeURIComponent(c)}`}
              className="chip"
              aria-current={categoria === c ? "page" : undefined}
            >
              {c}
            </Link>
          ))}
        </nav>
      )}

      {lista.length === 0 ? (
        <div className="aviso">
          {edita ? "Nenhum serviço cadastrado neste ambiente ainda." : "Nenhum serviço liberado para você neste ambiente."}
        </div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Categoria</th>
                <th className="num">Valor</th>
                <th>Unidade</th>
                {edita && <th>Situação</th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id}>
                  <td>
                    {edita ? <Link href={`/servicos/${s.id}`}>{s.nome}</Link> : <strong>{s.nome}</strong>}
                    {s.complemento && (
                      <>
                        {" "}
                        <span className="selo">Complemento</span>
                      </>
                    )}
                  </td>
                  <td data-label="Categoria">{s.categoria}</td>
                  <td data-label="Valor" className="num">
                    {reais(Number(s.valor))}
                  </td>
                  <td data-label="Unidade">
                    {UNIDADES[s.unidade]}
                    {s.prazo_minimo_meses ? ` · mín. ${s.prazo_minimo_meses} meses` : ""}
                  </td>
                  {edita && (
                    <td data-label="Situação">
                      <span className={`selo ${s.ativo ? "ok" : "off"}`}>{s.ativo ? "Ativo" : "Inativo"}</span>
                      {s.ativo && !s.visivel_comercial && (
                        <>
                          {" "}
                          <span className="selo off">Oculto do comercial</span>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="aviso">
        Cada ambiente tem a sua tabela. Mudar um valor aqui não altera orçamentos já emitidos.
      </div>
    </>
  );
}
