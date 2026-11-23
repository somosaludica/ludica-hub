"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contexto } from "@/lib/contexto";
import { lerReais } from "@/lib/formatos";
import { campo, falha, opcional } from "@/lib/form";
import { textos } from "@/lib/i18n";
import { lerPercentual, lerQtd } from "@/lib/orcamento";
import type { Estado } from "@/componentes/form-acao";

const CATEGORIAS = ["nenhum", "amigo", "cliente", "parceiro"];
const FORMATOS = ["one_page", "completa", "ambos"];
const TIPOS_DESCONTO = ["amigo", "cliente", "parceiro", "socio"];
type Servico = { id: string; nome: string; unidade: string; valor: number };

/**
 * Novo orçamento a partir da lista de serviços com quantidade.
 * Comercial: vira um PEDIDO (preço sempre o da tabela; quem monta é sócio ou administrativo).
 * Sócio e administrativo: vira um rascunho e abre direto a montagem.
 */
export async function criarOrcamento(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!ctx.ambiente || !ctx.perfil || ctx.perfil === "pauta") return falha(f, t.erroRecusado);
  const comercial = ctx.perfil === "comercial";
  const cliente = campo(f, "cliente_id");
  const categoria = CATEGORIAS.includes(campo(f, "desconto_categoria")) ? campo(f, "desconto_categoria") : "nenhum";
  if (!cliente) return falha(f, t.erroCliente);

  const supabase = await createClient();
  // Só os serviços que a pessoa enxerga (regra do banco): o comercial não pede o que não foi liberado.
  const { data: servicos } = await supabase.from("servicos").select("id, nome, unidade, valor").eq("ambiente_id", ctx.ambiente).eq("ativo", true);
  const itens: { servico: Servico; quantidade: number }[] = [];
  for (const s of (servicos ?? []) as Servico[]) {
    const q = lerQtd(campo(f, `qtd_${s.id}`));
    if (q == null) return falha(f, t.erroQtd);
    if (q > 0) itens.push({ servico: s, quantidade: q });
  }
  if (itens.length === 0) return falha(f, t.erroSemServico);

  const { data: novo, error } = await supabase
    .from("orcamentos")
    .insert({
      ambiente_id: ctx.ambiente,
      cliente_id: cliente,
      lead_id: opcional(f, "lead_id"),
      situacao: comercial ? "pedido" : "rascunho",
      pedido_por: ctx.usuarioId,
      obs_negociacao: opcional(f, "obs_negociacao"),
    })
    .select("id");
  if (error || !novo?.length) return falha(f, error?.code === "42501" && comercial ? t.erroLeadComercial : t.erroSalvar);
  const id = novo[0].id as string;

  const { error: e2 } = await supabase.from("orcamento_itens").insert(
    itens.map((i, n) => ({
      orcamento_id: id,
      servico_id: i.servico.id,
      descricao: i.servico.nome,
      unidade: i.servico.unidade,
      quantidade: i.quantidade,
      valor_unitario: i.servico.valor,
      ordem: n,
    })),
  );
  if (e2) {
    await supabase.from("orcamentos").delete().eq("id", id); // sem itens não fica orçamento pela metade (quando o perfil permite apagar)
    return falha(f, t.erroSalvar);
  }
  revalidatePath("/orcamentos");
  redirect(comercial ? "/orcamentos?ok=pedido" : `/orcamentos/${id}/editar`);
}

/** Montagem: itens, texto da proposta, desconto e condições. Um pedido vira rascunho ao ser salvo. */
export async function salvarOrcamento(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (ctx.perfil !== "socio" && ctx.perfil !== "administrativo") return falha(f, t.erroRecusado);
  const id = campo(f, "id");
  const supabase = await createClient();
  const [{ data: o }, { data: itens }] = await Promise.all([
    supabase.from("orcamentos").select("id, situacao").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle(),
    supabase.from("orcamento_itens").select("id").eq("orcamento_id", id),
  ]);
  if (!o || (o.situacao !== "pedido" && o.situacao !== "rascunho")) return falha(f, t.erroRecusado);

  // 1. Lê e confere tudo antes de gravar qualquer coisa.
  const mudancas: { id: string; quantidade: number; valor: number }[] = [];
  for (const i of itens ?? []) {
    const q = lerQtd(campo(f, `qtd_${i.id}`));
    const v = lerReais(campo(f, `valor_${i.id}`));
    if (q == null) return falha(f, t.erroQtd);
    if (q > 0 && v == null) return falha(f, t.erroValor);
    mudancas.push({ id: i.id as string, quantidade: q, valor: v ?? 0 });
  }
  const novoServico = campo(f, "novo_servico");
  const novoQtd = novoServico ? lerQtd(campo(f, "novo_qtd") || "1") : 0;
  if (novoQtd == null) return falha(f, t.erroQtd);

  // Descontos: linhas que somam. Percentual 0 remove a linha.
  const { data: descontos } = await supabase.from("orcamento_descontos").select("id, tipo, percentual").eq("orcamento_id", id);
  const mudaDesc: { id: string; pct: number; delta: number; motivo: string | null }[] = [];
  let soma = 0;
  for (const d of descontos ?? []) {
    const pct = lerPercentual(campo(f, `desc_pct_${d.id}`));
    if (pct == null) return falha(f, t.erroPercentual);
    mudaDesc.push({ id: d.id as string, pct, delta: pct - Number(d.percentual), motivo: opcional(f, `desc_motivo_${d.id}`) });
    soma += pct;
  }
  const novoTipo = campo(f, "novo_desc_tipo");
  const novoPct = TIPOS_DESCONTO.includes(novoTipo) ? lerPercentual(campo(f, "novo_desc_pct")) : 0;
  if (novoPct == null) return falha(f, t.erroPercentual);
  if (novoTipo === "socio" && novoPct > 0 && ctx.perfil !== "socio") return falha(f, t.erroSoProprioSocio);
  soma += novoPct;
  if (soma > 100) return falha(f, t.erroDescontoTotal);
  const validade = Number(campo(f, "validade_dias"));
  if (!Number.isInteger(validade) || validade < 1 || validade > 365) return falha(f, t.erroValidade);
  const formato = FORMATOS.includes(campo(f, "formato")) ? campo(f, "formato") : "one_page";
  const restantes = mudancas.filter((m) => m.quantidade > 0).length + (novoServico && novoQtd > 0 ? 1 : 0);
  if (formato === "one_page" && restantes > 2) return falha(f, t.erroOnePage);

  // 2. Itens.
  for (const m of mudancas) {
    const r = m.quantidade === 0
      ? await supabase.from("orcamento_itens").delete().eq("id", m.id)
      : await supabase.from("orcamento_itens").update({ quantidade: m.quantidade, valor_unitario: m.valor }).eq("id", m.id);
    if (r.error) return falha(f, t.erroSalvar);
  }
  if (novoServico && novoQtd > 0) {
    const { data: s } = await supabase.from("servicos").select("id, nome, unidade, valor").eq("id", novoServico).eq("ambiente_id", ctx.ambiente!).maybeSingle();
    if (!s) return falha(f, t.erroRecusado);
    const { error } = await supabase.from("orcamento_itens").insert({
      orcamento_id: id, servico_id: s.id, descricao: s.nome, unidade: s.unidade, quantidade: novoQtd, valor_unitario: s.valor, ordem: (itens ?? []).length,
    });
    if (error) return falha(f, t.erroSalvar);
  }

  // 3. Descontos (primeiro as reduções, para a soma nunca passar de 100% no meio do caminho).
  for (const d of [...mudaDesc].sort((x, y) => x.delta - y.delta)) {
    const r = d.pct === 0
      ? await supabase.from("orcamento_descontos").delete().eq("id", d.id)
      : await supabase.from("orcamento_descontos").update({ percentual: d.pct, motivo: d.motivo }).eq("id", d.id);
    if (r.error) return falha(f, t.erroSalvar);
  }
  if (novoPct > 0) {
    const { error } = await supabase.from("orcamento_descontos").insert({
      orcamento_id: id, tipo: novoTipo, percentual: novoPct, motivo: opcional(f, "novo_desc_motivo"),
      socio_id: novoTipo === "socio" ? ctx.usuarioId : null, ordem: (descontos ?? []).length,
    });
    if (error) return falha(f, novoTipo === "socio" ? t.erroSoProprioSocio : t.erroSalvar);
  }

  // 4. Cabeçalho, texto e condições.
  const { data, error } = await supabase
    .from("orcamentos")
    .update({
      situacao: "rascunho",
      assinatura: campo(f, "assinatura") === "hub" ? "hub" : "ambiente",
      formato,
      titulo: opcional(f, "titulo"),
      descricao: opcional(f, "descricao"),
      incluso: opcional(f, "incluso"),
      nao_incluso: opcional(f, "nao_incluso"),
      opcionais: opcional(f, "opcionais"),
      workflow: opcional(f, "workflow"),
      entrega: opcional(f, "entrega"),
      prazo: opcional(f, "prazo"),
      pagamento: opcional(f, "pagamento"),
      validade_dias: validade,
      envio_automatico: f.get("envio_automatico") === "on",
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return falha(f, t.erroSalvar);

  revalidatePath("/orcamentos");
  redirect(f.get("ir") === "proposta" ? `/orcamentos/${id}` : `/orcamentos/${id}/editar?salvo=1`);
}

/** Enviada, aprovada, recusada ou de volta a rascunho. As passagens permitidas e o limite de desconto são do banco. */
export async function mudarSituacao(f: FormData) {
  const ctx = await contexto();
  const id = campo(f, "id");
  const para = campo(f, "para");
  if (!["enviado", "aprovado", "recusado", "rascunho"].includes(para) || (ctx.perfil !== "socio" && ctx.perfil !== "administrativo")) {
    redirect(`/orcamentos/${id}?erro=1`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orcamentos")
    .update({ situacao: para, ...(para === "recusado" ? { motivo_recusa: opcional(f, "motivo_recusa") } : {}) })
    .eq("id", id)
    .eq("ambiente_id", ctx.ambiente!)
    .select("id");
  revalidatePath("/orcamentos");
  revalidatePath("/leads");
  if (error || !data?.length) {
    const msg = error?.message ?? "";
    redirect(`/orcamentos/${id}?erro=${/Desconto acima/.test(msg) ? "desconto" : /pelo menos um servi/.test(msg) ? "itens" : "1"}`);
  }
  redirect(para === "rascunho" ? `/orcamentos/${id}/editar` : para === "aprovado" ? `/orcamentos/${id}/parcelas` : `/orcamentos/${id}?ok=${para}`);
}

/** Remove o orçamento. Só sócio, e nunca um aprovado (regra do banco). */
export async function removerOrcamento(f: FormData) {
  const ctx = await contexto();
  const id = campo(f, "id");
  if (ctx.perfil !== "socio" || !id) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("orcamentos").delete().eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id");
  if (error || !data?.length) redirect(`/orcamentos/${id}?erro=1`);
  revalidatePath("/orcamentos");
  redirect("/orcamentos?ok=removido");
}
