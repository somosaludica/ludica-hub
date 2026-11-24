import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { hojeSP, reaisCampo } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { mesValido } from "@/lib/fechamento";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { acaoLancamento, salvarLancamento } from "../../acoes";

const CATS = ["conta_fixa", "custo_terceiros", "comissao", "outras_saidas", "distribuicao", "outras_entradas", "aporte"] as const;

/** Novo lançamento (/financeiro/lancamentos/novo) ou edição. */
export default async function PaginaLancamento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string; erro?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const novo = id === "novo";
  if (!novo && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: l }, { data: acessos }] = await Promise.all([
    novo ? Promise.resolve({ data: null }) : supabase.from("lancamentos").select("*").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle(),
    supabase.from("acessos").select("usuario_id").eq("ambiente_id", ctx.ambiente!).eq("perfil", "socio"),
  ]);
  if (!novo && !l) notFound();
  const ids = (acessos ?? []).map((a) => a.usuario_id as string);
  const { data: socios } = ids.length ? await supabase.from("perfis").select("id, nome").in("id", ids).order("nome") : { data: [] };
  const hoje = hojeSP().toISOString().slice(0, 10);
  const inicial = mesValido(sp.mes ?? "") && sp.mes !== hoje.slice(0, 7) ? `${sp.mes}-01` : hoje;
  const socio = ctx.perfil === "socio";

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {t.lancamento} · {nomeAmbiente(ctx.ambiente)}
          </div>
          <h1>{novo ? t.novoLancamento : l!.descricao}</h1>
        </div>
        <Link href="/financeiro/lancamentos" className="btn fantasma">
          {t.voltar}
        </Link>
      </div>

      {sp.erro && (
        <div className="aviso erro" role="alert">
          {sp.erro === "fechado" ? t.erroMesFechado : t.erroRecusado}
        </div>
      )}

      <FormAcao acao={salvarLancamento}>
        {l && <input type="hidden" name="id" value={l.id} />}
        <div className="linha-2">
          <div>
            <label className="campo" htmlFor="categoria">
              {t.categoria}
            </label>
            <select id="categoria" name="categoria" className="entrada" defaultValue={l?.categoria ?? "conta_fixa"} disabled={!!l}>
              {CATS.filter((c) => socio || (c !== "distribuicao" && c !== "aporte")).map((c) => (
                <option key={c} value={c}>
                  {t.categoriasLanc[c]}
                </option>
              ))}
            </select>
            {l && <input type="hidden" name="categoria" value={l.categoria} />}
          </div>
          <div>
            <label className="campo" htmlFor="descricao">
              {t.docDescricao}
            </label>
            <input id="descricao" name="descricao" className="entrada" required defaultValue={l?.descricao ?? ""} />
          </div>
        </div>
        <div className="linha-3">
          <div>
            <label className="campo" htmlFor="valor">
              {t.valorReais}
            </label>
            <input id="valor" name="valor" className="entrada" inputMode="decimal" placeholder="0,00" required defaultValue={reaisCampo(l ? Number(l.valor) : null)} />
          </div>
          <div>
            <label className="campo" htmlFor="vencimento">
              {t.colVencimento}
            </label>
            <input id="vencimento" name="vencimento" type="date" className="entrada" required defaultValue={l?.vencimento ?? inicial} />
          </div>
          <div>
            <label className="campo" htmlFor="fornecedor">
              {t.fornecedor}
            </label>
            <input id="fornecedor" name="fornecedor" className="entrada" defaultValue={l?.fornecedor ?? ""} />
          </div>
        </div>
        <div className="linha-3">
          <div>
            <label className="campo" htmlFor="conta_origem">
              {t.contaOrigem}
            </label>
            <input id="conta_origem" name="conta_origem" className="entrada" defaultValue={l?.conta_origem ?? ""} />
          </div>
          {socio && (
            <div>
              <label className="campo" htmlFor="socio_id">
                {t.socio} ({t.categoriasLanc.distribuicao} / {t.categoriasLanc.aporte})
              </label>
              <select id="socio_id" name="socio_id" className="entrada" defaultValue={l?.socio_id ?? ""}>
                <option value="">—</option>
                {(socios ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {novo && (
            <div>
              <label className="campo" htmlFor="repetir">
                {t.repetirMeses}
              </label>
              <input id="repetir" name="repetir" type="number" min={1} max={36} className="entrada" defaultValue={1} aria-describedby="repetir-dica" />
              <div id="repetir-dica" className="dica">
                {t.dicaRepetir}
              </div>
            </div>
          )}
        </div>
        <div className="linha-2">
          <label className="marcar">
            <input type="checkbox" name="paga" defaultChecked={l?.situacao === "paga"} />
            {t.jaPaga}
          </label>
          <div>
            <label className="campo" htmlFor="pago_em">
              {t.dataPagamento}
            </label>
            <input id="pago_em" name="pago_em" type="date" className="entrada" defaultValue={l?.pago_em ?? ""} />
          </div>
        </div>
        <div>
          <label className="campo" htmlFor="observacao">
            {t.observacoes}
          </label>
          <textarea id="observacao" name="observacao" className="entrada" rows={2} defaultValue={l?.observacao ?? ""} />
        </div>
        <div className="acoes">
          <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
          <Link href="/financeiro/lancamentos" className="btn fantasma">
            {t.cancelar}
          </Link>
        </div>
      </FormAcao>

      {l && (
        <div className="cartao pilha" style={{ maxWidth: 760 }}>
          <div className="acoes">
            <form action={acaoLancamento}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="acao" value={l.situacao === "paga" ? "provisionar" : "pagar"} />
              <button type="submit" className="btn fantasma">
                {l.situacao === "paga" ? t.voltarProvisao : t.marcarPaga}
              </button>
            </form>
            <form action={acaoLancamento}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="acao" value="remover" />
              <button type="submit" className="btn perigo">
                {t.removerLancamento}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
