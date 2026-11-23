"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contexto, type Contexto } from "@/lib/contexto";
import { cnpjValido, lerReais, soDigitos } from "@/lib/formatos";
import { campo, falha, opcional } from "@/lib/form";
import { textos } from "@/lib/i18n";
import { dataValida } from "@/lib/cobranca";
import type { Estado } from "@/componentes/form-acao";

const gestor = (ctx: Contexto) => ctx.perfil === "socio" || ctx.perfil === "administrativo";

/** Cria as cobranças de uma proposta aprovada a partir das linhas conferidas na tela (uma gravação só: ou entram todas, ou nenhuma). */
export async function criarCobrancas(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const orcamento = campo(f, "orcamento_id");
  const supabase = await createClient();
  const { data: o } = await supabase.from("orcamentos").select("id, cliente_id, situacao").eq("id", orcamento).eq("ambiente_id", ctx.ambiente!).maybeSingle();
  if (!o || o.situacao !== "aprovado") return falha(f, t.erroRecusado);

  const linhas: { descricao: string; vencimento: string; valor: number; envio_automatico: boolean }[] = [];
  const total = Number(campo(f, "linhas")) || 0;
  for (let i = 0; i < Math.min(total, 80); i++) {
    const valorTxt = campo(f, `valor_${i}`);
    if (!valorTxt) continue; // valor vazio tira a linha
    const valor = lerReais(valorTxt);
    if (valor == null || valor <= 0) return falha(f, t.erroValor);
    const descricao = campo(f, `desc_${i}`);
    const vencimento = campo(f, `venc_${i}`);
    if (!descricao) return falha(f, t.erroDescricao);
    if (!dataValida(vencimento)) return falha(f, t.erroData);
    linhas.push({ descricao, vencimento, valor, envio_automatico: f.get(`auto_${i}`) === "on" });
  }
  if (linhas.length === 0) return falha(f, t.erroSemParcela);

  const { error } = await supabase.from("cobrancas").insert(
    linhas.map((l, i) => ({ ...l, ambiente_id: ctx.ambiente!, cliente_id: o.cliente_id, orcamento_id: o.id, parcela: i + 1, parcelas: linhas.length })),
  );
  if (error) return falha(f, t.erroSalvar);
  revalidatePath("/cobrancas");
  redirect("/cobrancas?ok=criadas");
}

/** Cobrança avulsa (sem proposta) ou edição de uma cobrança ainda aberta. */
export async function salvarCobranca(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const id = campo(f, "id");
  const descricao = campo(f, "descricao");
  const vencimento = campo(f, "vencimento");
  const valor = lerReais(campo(f, "valor"));
  if (!id && !campo(f, "cliente_id")) return falha(f, t.erroCliente);
  if (!descricao) return falha(f, t.erroDescricao);
  if (!dataValida(vencimento)) return falha(f, t.erroData);
  if (valor == null || valor <= 0) return falha(f, t.erroValor);

  const dados = { descricao, vencimento, valor, envio_automatico: f.get("envio_automatico") === "on" };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("cobrancas").update(dados).eq("id", id).eq("ambiente_id", ctx.ambiente!).eq("situacao", "aberta").select("id")
    : await supabase.from("cobrancas").insert({ ...dados, ambiente_id: ctx.ambiente!, cliente_id: campo(f, "cliente_id") }).select("id");
  if (error || !data?.length) return falha(f, error ? t.erroSalvar : t.erroRecusado);
  revalidatePath("/cobrancas");
  redirect(`/cobrancas/${data[0].id}?ok=salva`);
}

/** Baixa: data e valor recebido. Para os lembretes e (na fase do financeiro) lança a entrada. */
export async function darBaixa(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const id = campo(f, "id");
  const data = campo(f, "pago_em");
  const valor = lerReais(campo(f, "valor_recebido"));
  if (!dataValida(data)) return falha(f, t.erroData);
  if (valor == null || valor <= 0) return falha(f, t.erroValor);
  const supabase = await createClient();
  const { data: ok, error } = await supabase
    .from("cobrancas")
    .update({ situacao: "paga", pago_em: data, valor_recebido: valor })
    .eq("id", id).eq("ambiente_id", ctx.ambiente!).eq("situacao", "aberta").select("id");
  if (error || !ok?.length) return falha(f, error ? t.erroSalvar : t.erroRecusado);
  revalidatePath("/cobrancas");
  redirect(`/cobrancas/${id}?ok=baixa`);
}

/** Estornar, cancelar, reabrir, registrar envio, nota fiscal e chave do envio automático. */
export async function acaoCobranca(f: FormData) {
  const ctx = await contexto();
  const id = campo(f, "id");
  const acao = campo(f, "acao");
  if (!gestor(ctx)) redirect("/");
  const supabase = await createClient();
  const alvo = () => supabase.from("cobrancas");
  let erro = false;
  let ok = "salva";

  if (acao === "envio") {
    const canal = campo(f, "canal") === "email" ? "email" : "whatsapp";
    const r = await supabase.from("cobranca_eventos").insert({ cobranca_id: id, tipo: "envio_manual", canal });
    erro = !!r.error; ok = "envio";
  } else if (acao === "nf") {
    const sit = campo(f, "nf_situacao");
    const r = await alvo().update({ nf_situacao: ["nao_solicitada", "solicitada", "emitida"].includes(sit) ? sit : "nao_solicitada", nf_numero: opcional(f, "nf_numero") })
      .eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id");
    erro = !!r.error || !r.data?.length;
  } else if (acao === "auto") {
    const r = await alvo().update({ envio_automatico: campo(f, "valor") === "1" }).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id");
    erro = !!r.error || !r.data?.length;
  } else if (acao === "cancelar" || acao === "reabrir" || acao === "estornar") {
    const r = await alvo().update({ situacao: acao === "cancelar" ? "cancelada" : "aberta" }).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id");
    erro = !!r.error || !r.data?.length;
  } else erro = true;

  revalidatePath("/cobrancas");
  redirect(`/cobrancas/${id}?${erro ? "erro=1" : `ok=${ok}`}`);
}

/** Dados que saem em toda nota de débito do ambiente. */
export async function salvarDadosNota(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const cnpj = soDigitos(campo(f, "cnpj"));
  if (cnpj && !cnpjValido(cnpj)) return falha(f, t.erroDocumento);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ambiente_dados")
    .update({ razao_social: opcional(f, "razao_social"), cnpj: cnpj || null, endereco: opcional(f, "endereco"), conta_recebimento: opcional(f, "conta_recebimento") })
    .eq("ambiente_id", ctx.ambiente!).select("ambiente_id");
  if (error || !data?.length) return falha(f, error ? t.erroSalvar : t.erroRecusado);
  revalidatePath("/cobrancas");
  redirect("/cobrancas/dados?ok=1");
}
