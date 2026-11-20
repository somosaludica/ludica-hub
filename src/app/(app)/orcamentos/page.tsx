import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { hojeSP, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { numeroOrcamento, situacaoVista, totais, type Situacao, type SituacaoVista } from "@/lib/orcamento";

type Orc = {
  id: string; numero: number; cliente_id: string; pedido_por: string; situacao: Situacao; validade_ate: string | null;
  desconto_categoria: "nenhum" | "amigo" | "cliente" | "parceiro"; desconto_percentual: number;
};
const FILTROS: SituacaoVista[] = ["pedido", "rascunho", "enviado", "aprovado", "recusado", "expirado"];
const SELO: Record<SituacaoVista, string> = { pedido: "selo", rascunho: "selo off", enviado: "selo", aprovado: "selo ok", recusado: "selo off", expirado: "selo off" };

/** Orçamentos do ambiente aberto. O comercial vê os pedidos que fez e acompanha a situação. */
export default async function Orcamentos({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const t = textos(ctx.idioma);
  const { s = "", ok } = await searchParams;
  const comercial = ctx.perfil === "comercial";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orcamentos")
    .select("id, numero, cliente_id, pedido_por, situacao, validade_ate, desconto_categoria, desconto_percentual")
    .eq("ambiente_id", ctx.ambiente!)
    .order("numero", { ascending: false });
  const orcs = ((data ?? []) as Orc[]).sort((a, b) => b.numero - a.numero);
  const ids = orcs.map((o) => o.id);
  const unicos = (k: "cliente_id" | "pedido_por") => [...new Set(orcs.map((o) => o[k]))];
  const [it, cli, pes] = await Promise.all([
    ids.length ? supabase.from("orcamento_itens").select("orcamento_id, descricao, quantidade, valor_unitario").in("orcamento_id", ids) : { data: [] },
    ids.length ? supabase.from("clientes").select("id, nome").in("id", unicos("cliente_id")) : { data: [] },
    ids.length ? supabase.from("perfis").select("id, nome").in("id", unicos("pedido_por")) : { data: [] },
  ]);
  const nomes = (l: { id: string; nome: string }[] | null) => Object.fromEntries((l ?? []).map((x) => [x.id, x.nome]));
  const clientes = nomes(cli.data), pessoas = nomes(pes.data);
  const hoje = hojeSP();
  const linhas = orcs.map((o) => {
    const itens = (it.data ?? []).filter((i) => i.orcamento_id === o.id);
    return {
      ...o,
      vista: situacaoVista(o.situacao, o.validade_ate, hoje),
      servicos: itens.map((i) => i.descricao as string).join(" · "),
      total: totais(itens.map((i) => ({ quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario) })), Number(o.desconto_percentual)).total,
    };
  });
  const lista = s ? linhas.filter((l) => l.vista === s) : linhas;
  const conta = (f: SituacaoVista) => linhas.filter((l) => l.vista === f).length;

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.orcamentos}</h1>
        </div>
        <Link href="/orcamentos/novo" className="btn">
          {comercial ? t.pedirOrcamento : t.novoOrcamento}
        </Link>
      </div>

      {ok && (
        <div className="aviso ok" role="status">
          {ok === "pedido" ? t.pedidoEnviado : ok === "removido" ? t.orcamentoRemovido : t.orcamentoSalvo}
        </div>
      )}
      {error && (
        <div className="aviso erro" role="alert">
          {t.erroCarregar}
        </div>
      )}

      <nav aria-label={t.colSituacao} className="chips">
        <Link href="/orcamentos" className="chip" aria-current={!s ? "page" : undefined}>
          {t.todos} ({linhas.length})
        </Link>
        {FILTROS.filter((f) => conta(f) > 0 || f === s).map((f) => (
          <Link key={f} href={`/orcamentos?s=${f}`} className="chip" aria-current={s === f ? "page" : undefined}>
            {t.situacoes[f]} ({conta(f)})
          </Link>
        ))}
      </nav>

      {lista.length === 0 ? (
        <div className="aviso">{t.orcamentosVazio}</div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>{t.cliente}</th>
                <th>{t.colServicos}</th>
                <th>{t.colPedidoPor}</th>
                <th>{t.desconto}</th>
                <th className="num">{t.total}</th>
                <th>{t.colSituacao}</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={!comercial && (o.situacao === "pedido" || o.situacao === "rascunho") ? `/orcamentos/${o.id}/editar` : `/orcamentos/${o.id}`}>
                      {clientes[o.cliente_id] ?? "—"}
                    </Link>
                    <div className="dica" style={{ marginTop: 2 }}>
                      {numeroOrcamento(ctx.ambiente!, o.numero)}
                    </div>
                  </td>
                  <td data-label={t.colServicos}>{o.servicos || "—"}</td>
                  <td data-label={t.colPedidoPor}>{pessoas[o.pedido_por] ?? "—"}</td>
                  <td data-label={t.desconto}>
                    {t.descontos[o.desconto_categoria]}
                    {Number(o.desconto_percentual) > 0 ? ` · ${Number(o.desconto_percentual).toLocaleString("pt-BR")}%` : ""}
                  </td>
                  <td data-label={t.total} className="num">
                    {reais(o.total)}
                  </td>
                  <td data-label={t.colSituacao}>
                    <span className={SELO[o.vista]}>{t.situacoes[o.vista]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
