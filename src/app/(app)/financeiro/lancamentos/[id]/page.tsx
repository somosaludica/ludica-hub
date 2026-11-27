import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { hojeSP, reaisCampo } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { estadoDe, mesDe, mesValido } from "@/lib/financeiro";
import type { Rateio } from "@/lib/dados-financeiro";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { acaoLancamento, salvarLancamento } from "../../acoes";
import CamposRateio from "../rateio";

const CATS = ["conta_fixa", "custo_terceiros", "comissao", "outras_saidas", "distribuicao", "outras_entradas", "aporte"] as const;
const ESTADOS = ["a_vencer", "pago", "em_atraso", "a_confirmar"] as const;

/** Novo lançamento (/financeiro/lancamentos/novo) ou edição: conta, entrada, repasse a sócio ou aporte. */
export default async function PaginaLancamento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string; erro?: string; volta?: string; categoria?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const novo = id === "novo";
  if (!novo && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const amb = nomeAmbiente(ctx.ambiente);

  const supabase = await createClient();
  const [{ data: l }, { data: acessos }, { data: dados }, { data: usadas }] = await Promise.all([
    novo ? Promise.resolve({ data: null }) : supabase.from("lancamentos").select("*").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle(),
    supabase.from("acessos").select("usuario_id").eq("ambiente_id", ctx.ambiente!).eq("perfil", "socio"),
    supabase.from("ambiente_dados").select("rateios, cobertura_nome").eq("ambiente_id", ctx.ambiente!).maybeSingle(),
    supabase.from("lancamentos").select("rubrica, conta_origem").eq("ambiente_id", ctx.ambiente!),
  ]);
  if (!novo && !l) notFound();
  const ids = (acessos ?? []).map((a) => a.usuario_id as string);
  const { data: socios } = ids.length ? await supabase.from("perfis").select("id, nome").in("id", ids).order("nome") : { data: [] };
  const hoje = hojeSP().toISOString().slice(0, 10);
  const socio = ctx.perfil === "socio";
  const rateios: Rateio[] = Array.isArray(dados?.rateios) ? (dados!.rateios as Rateio[]) : [];
  const unicos = (k: "rubrica" | "conta_origem", mais: (string | null | undefined)[] = []) =>
    [...new Set([...mais, ...(usadas ?? []).map((u) => u[k] as string | null)].filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  const estado = l ? estadoDe({ situacao: l.situacao, aviso: l.aviso, vencimento: null }, hoje) : "a_vencer";
  const mes = l ? mesDe(String(l.mes_ref)) : mesValido(sp.mes ?? "") ? sp.mes! : hoje.slice(0, 7);
  const categoria = l?.categoria ?? (CATS.find((c) => c === sp.categoria && (socio || (c !== "distribuicao" && c !== "aporte"))) ?? "conta_fixa");
  const volta = sp.volta === "fechamento" ? `/financeiro/fechamento?mes=${mes}` : sp.volta === "socios" || categoria === "distribuicao" || categoria === "aporte" ? "/financeiro/socios" : "/financeiro/fluxo";

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {t.lancamento} · {amb}
          </div>
          <h1>{novo ? t.novoLancamento : l!.descricao}</h1>
        </div>
        <Link href={volta} className="btn fantasma">
          {t.voltar}
        </Link>
      </div>

      {sp.erro && (
        <div className="aviso erro" role="alert">
          {sp.erro === "fechado" ? t.erroMesFechado : sp.erro === "comprovante" ? t.fErroComprovante : t.erroRecusado}
        </div>
      )}

      <FormAcao acao={salvarLancamento}>
        {l && <input type="hidden" name="id" value={l.id} />}
        <input type="hidden" name="volta" value={volta} />
        <div className="linha-3">
          <div>
            <label className="campo" htmlFor="categoria">
              {t.categoria}
            </label>
            <select id="categoria" name="categoria" className="entrada" defaultValue={categoria} disabled={!!l}>
              {CATS.filter((c) => socio || (c !== "distribuicao" && c !== "aporte")).map((c) => (
                <option key={c} value={c}>
                  {t.categoriasLanc[c]}
                </option>
              ))}
            </select>
            {l && <input type="hidden" name="categoria" value={l.categoria} />}
          </div>
          <div>
            <label className="campo" htmlFor="rubrica">
              {t.fRubrica}
            </label>
            <input id="rubrica" name="rubrica" className="entrada" list="rubricas" maxLength={40} defaultValue={l?.rubrica ?? ""} aria-describedby="rubrica-dica" />
            <datalist id="rubricas">
              {unicos("rubrica").map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <div id="rubrica-dica" className="dica">
              {t.fDicaRubrica}
            </div>
          </div>
          <div>
            <label className="campo" htmlFor="descricao">
              {t.docDescricao}
            </label>
            <input id="descricao" name="descricao" className="entrada" required maxLength={120} defaultValue={l?.descricao ?? ""} />
          </div>
        </div>
        <div className="linha-2">
          <div>
            <label className="campo" htmlFor="mes_ref">
              {t.fMesReferencia}
            </label>
            <input id="mes_ref" name="mes_ref" type="month" className="entrada" required defaultValue={mes} />
          </div>
          <div>
            <label className="campo" htmlFor="vencimento">
              {t.colVencimento}
            </label>
            <input id="vencimento" name="vencimento" type="date" className="entrada" defaultValue={l?.vencimento ?? ""} />
          </div>
        </div>
        <CamposRateio
          total={reaisCampo(l ? Number(l.valor_total ?? l.valor) : null)}
          parte={l ? String(Number(l.parte_pct ?? 100)).replace(".", ",") : "100"}
          atalhos={rateios}
          t={{ total: t.fValorTotal, parte: t.fParteAmbiente(amb), calculada: t.fParteCalculada(amb), informe: t.fParteInforme }}
        />
        <div className="linha-3">
          <div>
            <label className="campo" htmlFor="estado">
              {t.fColStatus}
            </label>
            <select id="estado" name="estado" className="entrada" defaultValue={estado}>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {t.fEstados[e]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="campo" htmlFor="pago_em">
              {t.dataPagamento}
            </label>
            <input id="pago_em" name="pago_em" type="date" className="entrada" defaultValue={l?.pago_em ?? ""} />
          </div>
          <div>
            <label className="campo" htmlFor="conta_origem">
              {t.fContaPagamento}
            </label>
            <input id="conta_origem" name="conta_origem" className="entrada" list="contas" maxLength={60} defaultValue={l?.conta_origem ?? ""} />
            <datalist id="contas">
              {unicos("conta_origem", [dados?.cobertura_nome as string | null, ...(socios ?? []).map((s) => s.nome as string)]).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="linha-2">
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
                {t.fDicaRepetir}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="campo" htmlFor="observacao">
            {t.observacoes}
          </label>
          <textarea id="observacao" name="observacao" className="entrada" rows={2} maxLength={600} defaultValue={l?.observacao ?? ""} />
        </div>
        <label className="marcar">
          <input type="checkbox" name="fora_do_fluxo" defaultChecked={!!l?.fora_do_fluxo} />
          {t.fForaFluxoCampo}
        </label>

        <fieldset className="pilha" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="rotulo">{t.fComprovante}</legend>
          {l?.comprovante_caminho ? (
            <p className="sub">
              <a href={`/financeiro/comprovante/${l.id}`} target="_blank" rel="noopener" data-sem-carregar>
                {t.fAbrirArquivo(l.comprovante_nome ?? t.fComprovante)}
              </a>
            </p>
          ) : l?.comprovante_nome ? (
            <p className="sub">{t.fCompAntigoNome(l.comprovante_nome)}</p>
          ) : (
            <p className="sub">{t.fSemComprovanteAnexado}</p>
          )}
          <div>
            <label className="campo" htmlFor="comprovante">
              {l?.comprovante_caminho ? t.fTrocarArquivo : t.fAnexarArquivo}
            </label>
            <input id="comprovante" name="comprovante" type="file" className="entrada" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" aria-describedby="comprovante-dica" />
            <div id="comprovante-dica" className="dica">
              {t.fDicaArquivo}
            </div>
          </div>
          {l?.comprovante_caminho && (
            <label className="marcar">
              <input type="checkbox" name="remover_comprovante" />
              {t.fRemoverComprovante}
            </label>
          )}
          <label className="marcar">
            <input type="checkbox" name="sem_comprovante" defaultChecked={!!l?.sem_comprovante} />
            {t.fSemComprovanteCampo}
          </label>
        </fieldset>

        <div className="acoes">
          <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
          <Link href={volta} className="btn fantasma">
            {t.cancelar}
          </Link>
        </div>
      </FormAcao>

      {l && (
        <div className="cartao pilha" style={{ maxWidth: 760 }}>
          <div className="acoes">
            <form action={acaoLancamento}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="volta" value={volta} />
              <input type="hidden" name="acao" value={l.situacao === "paga" ? "provisionar" : "pagar"} />
              <button type="submit" className="btn fantasma">
                {l.situacao === "paga" ? t.fVoltarAberto : t.fMarcarPago}
              </button>
            </form>
            <form action={acaoLancamento}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="volta" value={volta} />
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
