import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { reais, type Unidade } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { criarOrcamento } from "../acoes";

/** Pedir orçamento (comercial) ou começar um orçamento (sócio e administrativo). Aceita ?lead=ID ou ?cliente=ID. */
export default async function NovoOrcamento({ searchParams }: { searchParams: Promise<{ lead?: string; cliente?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const t = textos(ctx.idioma);
  const sp = await searchParams;
  const comercial = ctx.perfil === "comercial";

  const supabase = await createClient();
  const [{ data: clientes }, { data: servicos }, { data: lead }] = await Promise.all([
    supabase.from("clientes").select("id, nome").order("nome"),
    supabase.from("servicos").select("id, categoria, nome, valor, unidade, complemento").eq("ambiente_id", ctx.ambiente!).eq("ativo", true).order("categoria").order("nome"),
    sp.lead && /^[0-9a-f-]{36}$/i.test(sp.lead)
      ? supabase.from("leads").select("id, cliente_id, servico_interesse_id").eq("id", sp.lead).eq("ambiente_id", ctx.ambiente!).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const clienteInicial = lead?.cliente_id ?? sp.cliente ?? "";
  const lista = (servicos ?? []) as { id: string; categoria: string; nome: string; valor: number; unidade: Unidade; complemento: boolean }[];

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{comercial ? t.pedirOrcamento : t.novoOrcamento}</h1>
        </div>
        <Link href="/orcamentos" className="btn fantasma">
          {t.voltar}
        </Link>
      </div>

      {(clientes ?? []).length === 0 ? (
        <div className="aviso">
          {t.semClientes} <Link href="/clientes/novo">{t.novoCliente}</Link>
        </div>
      ) : (
        <FormAcao acao={criarOrcamento} className="cartao form largo">
          {lead && <input type="hidden" name="lead_id" value={lead.id} />}
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="cliente_id">
                {t.cliente}
              </label>
              <select id="cliente_id" name="cliente_id" className="entrada" required defaultValue={clienteInicial}>
                <option value="">—</option>
                {(clientes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="secao">
            <legend>{t.colServicos}</legend>
            <p className="dica" style={{ margin: 0 }}>
              {t.dicaQtd} {t.dicaMensal}
            </p>
            <div className="tabela-caixa" style={{ padding: 0 }}>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>{t.colServico}</th>
                    <th className="num">{t.colValor}</th>
                    <th>{t.colUnidade}</th>
                    <th style={{ width: 110 }}>{t.qtd}</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.nome}</strong>
                        <div className="dica" style={{ marginTop: 2 }}>
                          {s.categoria}
                          {s.complemento ? ` · ${t.complemento}` : ""}
                        </div>
                      </td>
                      <td data-label={t.colValor} className="num">
                        {reais(Number(s.valor))}
                      </td>
                      <td data-label={t.colUnidade}>{t.unidades[s.unidade]}</td>
                      <td data-label={t.qtd}>
                        <input
                          name={`qtd_${s.id}`}
                          className="entrada qtd"
                          inputMode="decimal"
                          aria-label={t.qtdDe(s.nome)}
                          defaultValue={lead?.servico_interesse_id === s.id ? "1" : ""}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>

          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="desconto_categoria">
                {comercial ? t.descontoSolicitado : t.descontoCategoria}
              </label>
              <select id="desconto_categoria" name="desconto_categoria" className="entrada" defaultValue="nenhum">
                {(["nenhum", "amigo", "cliente", "parceiro"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t.descontos[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="campo" htmlFor="desconto_motivo">
                {t.motivoDesconto}
              </label>
              <input id="desconto_motivo" name="desconto_motivo" className="entrada" />
            </div>
          </div>
          <div>
            <label className="campo" htmlFor="obs_negociacao">
              {t.obsNegociacao}
            </label>
            <textarea id="obs_negociacao" name="obs_negociacao" className="entrada" rows={3} />
          </div>

          {comercial && <p className="sub">{t.notaPedido}</p>}

          <div className="acoes">
            <BotaoEnviar rotulo={comercial ? t.enviarPedido : t.criarRascunho} enviando={t.salvando} />
            <Link href="/orcamentos" className="btn fantasma">
              {t.cancelar}
            </Link>
          </div>
        </FormAcao>
      )}
    </>
  );
}
