"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contexto, type Contexto } from "@/lib/contexto";
import { hojeSP, lerReais } from "@/lib/formatos";
import { campo, falha, opcional } from "@/lib/form";
import { textos } from "@/lib/i18n";
import { dataValida, somaMeses } from "@/lib/cobranca";
import { mesDe, mesValido } from "@/lib/fechamento";
import { lerPercentual } from "@/lib/orcamento";
import { dadosDoMes } from "@/lib/dados-mes";
import type { Estado } from "@/componentes/form-acao";

const gestor = (ctx: Contexto) => ctx.perfil === "socio" || ctx.perfil === "administrativo";
const SAIDAS = ["conta_fixa", "custo_terceiros", "comissao", "distribuicao", "outras_saidas"];
const ENTRADAS = ["outras_entradas", "aporte"];
const fechado = (msg: string | undefined) => /fechado/.test(msg ?? "");

/** Cria (podendo repetir por N meses) ou edita um lançamento. */
export async function salvarLancamento(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const id = campo(f, "id");
  const categoria = campo(f, "categoria");
  const tipo = ENTRADAS.includes(categoria) ? "entrada" : SAIDAS.includes(categoria) ? "saida" : null;
  const descricao = campo(f, "descricao");
  const vencimento = campo(f, "vencimento");
  const valor = lerReais(campo(f, "valor"));
  const deSocio = categoria === "distribuicao" || categoria === "aporte";
  const socio = deSocio ? campo(f, "socio_id") : "";
  const paga = f.get("paga") === "on";
  const pagoEm = campo(f, "pago_em") || vencimento;
  const repetir = id ? 1 : Number(campo(f, "repetir") || "1");

  if (!tipo) return falha(f, t.erroRecusado);
  if (!descricao) return falha(f, t.erroDescricao);
  if (!dataValida(vencimento) || (paga && !dataValida(pagoEm))) return falha(f, t.erroData);
  if (valor == null || valor <= 0) return falha(f, t.erroValor);
  if (deSocio && ctx.perfil !== "socio") return falha(f, t.erroSoSocioLanc);
  if (deSocio && !socio) return falha(f, t.erroSocioLanc);
  if (!Number.isInteger(repetir) || repetir < 1 || repetir > 36) return falha(f, t.erroRepetir);

  const dados = {
    categoria, descricao, valor, vencimento,
    fornecedor: opcional(f, "fornecedor"), conta_origem: opcional(f, "conta_origem"), observacao: opcional(f, "observacao"),
    socio_id: socio || null, situacao: paga ? "paga" : "provisionada", pago_em: paga ? pagoEm : null,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("lancamentos").update(dados).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id")
    : await supabase.from("lancamentos").insert(
        Array.from({ length: repetir }, (_, i) => ({
          ...dados, tipo, ambiente_id: ctx.ambiente!, vencimento: somaMeses(vencimento, i),
          // nas repetições só a primeira nasce paga
          situacao: i === 0 ? dados.situacao : "provisionada", pago_em: i === 0 ? dados.pago_em : null,
        })),
      ).select("id");
  if (error) return falha(f, fechado(error.message) ? t.erroMesFechado : error.code === "P0001" ? t.erroSoSocioLanc : t.erroSalvar);
  if (!data?.length) return falha(f, t.erroRecusado);
  revalidatePath("/financeiro");
  redirect(`/financeiro/lancamentos?mes=${mesDe(paga ? pagoEm : vencimento)}&ok=salvo`);
}

/** Pagar, voltar para provisão ou remover. */
export async function acaoLancamento(f: FormData) {
  const ctx = await contexto();
  if (!gestor(ctx)) redirect("/");
  const id = campo(f, "id");
  const acao = campo(f, "acao");
  const supabase = await createClient();
  const alvo = supabase.from("lancamentos");
  const r = acao === "pagar"
    ? await alvo.update({ situacao: "paga", pago_em: dataValida(campo(f, "pago_em")) ? campo(f, "pago_em") : hojeSP().toISOString().slice(0, 10) }).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id, pago_em")
    : acao === "provisionar"
      ? await alvo.update({ situacao: "provisionada", pago_em: null }).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id, vencimento")
      : await alvo.delete().eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id, vencimento");
  revalidatePath("/financeiro");
  if (r.error || !r.data?.length) redirect(`/financeiro/lancamentos/${id}?erro=${fechado(r.error?.message) ? "fechado" : "1"}`);
  const linha = r.data[0] as { pago_em?: string; vencimento?: string };
  redirect(`/financeiro/lancamentos?mes=${mesDe(linha.pago_em ?? linha.vencimento ?? hojeSP())}&ok=${acao === "remover" ? "removido" : "salvo"}`);
}

/** Fecha o mês guardando a fotografia do resultado, ou reabre (só sócio; regra do banco). */
export async function fecharOuReabrir(f: FormData) {
  const ctx = await contexto();
  if (!gestor(ctx)) redirect("/");
  const mes = campo(f, "mes");
  if (!mesValido(mes)) redirect("/financeiro");
  const supabase = await createClient();
  let erro = "";
  if (campo(f, "acao") === "reabrir") {
    const { data, error } = await supabase.from("meses_fechados").delete().eq("ambiente_id", ctx.ambiente!).eq("mes", `${mes}-01`).select("mes");
    if (error || !data?.length) erro = "1";
  } else {
    const { fechamento } = await dadosDoMes(supabase, ctx.ambiente!, mes);
    const { error } = await supabase.from("meses_fechados").insert({ ambiente_id: ctx.ambiente!, mes: `${mes}-01`, resultado: fechamento });
    if (error) erro = /não começou/.test(error.message) ? "futuro" : "1";
  }
  revalidatePath("/financeiro");
  redirect(`/financeiro?mes=${mes}&${erro ? `erro=${erro}` : `ok=${campo(f, "acao") === "reabrir" ? "reaberto" : "fechado"}`}`);
}

/** Participação de cada sócio no lucro do ambiente. Precisa somar 100%. */
export async function salvarParticipacoes(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (ctx.perfil !== "socio") return falha(f, t.erroRecusado);
  const supabase = await createClient();
  const [{ data: socios }, { data: atuais }] = await Promise.all([
    supabase.from("acessos").select("usuario_id").eq("ambiente_id", ctx.ambiente!).eq("perfil", "socio"),
    supabase.from("participacoes").select("socio_id, percentual").eq("ambiente_id", ctx.ambiente!),
  ]);
  const antes = Object.fromEntries((atuais ?? []).map((p) => [p.socio_id, Number(p.percentual)]));
  const novas: { socio: string; pct: number; delta: number }[] = [];
  for (const s of socios ?? []) {
    const pct = lerPercentual(campo(f, `pct_${s.usuario_id}`));
    if (pct == null) return falha(f, t.erroPercentual);
    novas.push({ socio: s.usuario_id as string, pct, delta: pct - (antes[s.usuario_id] ?? 0) });
  }
  if (Math.abs(novas.reduce((x, n) => x + n.pct, 0) - 100) > 0.005) return falha(f, t.erroSoma100);
  // Primeiro quem diminui, para a soma nunca passar de 100% no meio do caminho.
  for (const n of novas.sort((a, b) => a.delta - b.delta)) {
    const r = n.pct === 0
      ? await supabase.from("participacoes").delete().eq("ambiente_id", ctx.ambiente!).eq("socio_id", n.socio)
      : await supabase.from("participacoes").upsert({ ambiente_id: ctx.ambiente!, socio_id: n.socio, percentual: n.pct });
    if (r.error) return falha(f, t.erroSalvar);
  }
  revalidatePath("/financeiro");
  redirect("/financeiro/socios?ok=participacoes");
}

/** Percentuais de imposto e fundo de reserva do ambiente (só sócio). */
export async function salvarTaxas(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (ctx.perfil !== "socio") return falha(f, t.erroRecusado);
  const imposto = lerPercentual(campo(f, "imposto_pct"));
  const reserva = lerPercentual(campo(f, "reserva_pct"));
  if (imposto == null || reserva == null || imposto + reserva > 100) return falha(f, t.erroPercentual);
  const supabase = await createClient();
  const { data, error } = await supabase.from("ambiente_dados").update({ imposto_pct: imposto, reserva_pct: reserva }).eq("ambiente_id", ctx.ambiente!).select("ambiente_id");
  if (error || !data?.length) return falha(f, t.erroSalvar);
  revalidatePath("/financeiro");
  redirect("/financeiro/socios?ok=taxas");
}
