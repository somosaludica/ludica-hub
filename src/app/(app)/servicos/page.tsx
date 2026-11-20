import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { reais, type Unidade } from "@/lib/formatos";
import { textos } from "@/lib/i18n";

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
  const t = textos(ctx.idioma);

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
            {nomeAmbiente(ctx.ambiente)} · {t.servicosAtivos(ativos)}
          </div>
          <h1>{t.servicos}</h1>
        </div>
        {edita && (
          <Link href="/servicos/novo" className="btn">
            {t.novoServico}
          </Link>
        )}
      </div>

      {salvo && (
        <div className="aviso ok" role="status">
          {salvo === "removido" ? t.servicoRemovido : t.servicoSalvo}
        </div>
      )}
      {error && (
        <div className="aviso erro" role="alert">
          {t.erroCarregar}
        </div>
      )}

      {categorias.length > 1 && (
        <nav aria-label={t.categoria} className="chips">
          <Link href="/servicos" className="chip" aria-current={!categoria ? "page" : undefined}>
            {t.todas}
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
          {edita ? t.vazioEdita : t.vazioComercial}
        </div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>{t.colServico}</th>
                <th>{t.categoria}</th>
                <th className="num">{t.colValor}</th>
                <th>{t.colUnidade}</th>
                {edita && <th>{t.colSituacao}</th>}
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
                        <span className="selo">{t.complemento}</span>
                      </>
                    )}
                  </td>
                  <td data-label={t.categoria}>{s.categoria}</td>
                  <td data-label={t.colValor} className="num">
                    {reais(Number(s.valor))}
                  </td>
                  <td data-label={t.colUnidade}>
                    {t.unidades[s.unidade]}
                    {s.prazo_minimo_meses ? ` · ${t.minMeses(s.prazo_minimo_meses)}` : ""}
                  </td>
                  {edita && (
                    <td data-label={t.colSituacao}>
                      <span className={`selo ${s.ativo ? "ok" : "off"}`}>{s.ativo ? t.ativo : t.inativo}</span>
                      {s.ativo && !s.visivel_comercial && (
                        <>
                          {" "}
                          <span className="selo off">{t.ocultoComercial}</span>
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

      <div className="aviso">{t.avisoTabela}</div>
    </>
  );
}
