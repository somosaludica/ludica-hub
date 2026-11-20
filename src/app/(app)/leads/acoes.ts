"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contexto } from "@/lib/contexto";
import { lerReais } from "@/lib/formatos";
import { campo, falha, opcional } from "@/lib/form";
import { textos } from "@/lib/i18n";
import type { Estado } from "@/componentes/form-acao";

const ETAPAS = ["novo", "em_contato", "proposta_enviada", "fechado", "perdido"] as const;
type Etapa = (typeof ETAPAS)[number];
const PROXIMA: Partial<Record<Etapa, Etapa>> = { novo: "em_contato", em_contato: "proposta_enviada", proposta_enviada: "fechado" };

/** Cria ou atualiza um lead do ambiente aberto. O comercial só mexe nos dele (regra do banco). */
export async function salvarLead(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!ctx.ambiente || !ctx.perfil || ctx.perfil === "pauta") return falha(f, t.erroRecusado);

  const id = campo(f, "id");
  const cliente = campo(f, "cliente_id");
  const etapa = (ETAPAS as readonly string[]).includes(campo(f, "etapa")) ? (campo(f, "etapa") as Etapa) : "novo";
  const valorTxt = campo(f, "valor_estimado");
  const valor = valorTxt ? lerReais(valorTxt) : null;
  const motivo = opcional(f, "motivo_perda");
  const contato = campo(f, "ultimo_contato");
  // O comercial é sempre o responsável pelos próprios leads.
  const responsavel = ctx.perfil === "comercial" ? ctx.usuarioId : campo(f, "responsavel_id") || ctx.usuarioId;

  if (!id && !cliente) return falha(f, t.erroCliente);
  if (valorTxt && valor == null) return falha(f, t.erroValor);
  if (etapa === "perdido" && !motivo) return falha(f, t.erroMotivo);

  const dados = {
    etapa,
    servico_interesse_id: opcional(f, "servico_interesse_id"),
    valor_estimado: valor,
    responsavel_id: responsavel,
    ultimo_contato: /^\d{4}-\d{2}-\d{2}$/.test(contato) ? contato : null,
    motivo_perda: etapa === "perdido" ? motivo : null,
    observacoes: opcional(f, "observacoes"),
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("leads").update(dados).eq("id", id).eq("ambiente_id", ctx.ambiente).select("id")
    : await supabase.from("leads").insert({ ...dados, cliente_id: cliente, ambiente_id: ctx.ambiente }).select("id");

  if (error) {
    if (error.code === "42501") return falha(f, !id && ctx.perfil === "comercial" ? t.erroLeadComercial : t.erroRecusado);
    if (error.code === "P0001") return falha(f, t.erroResponsavel);
    return falha(f, t.erroSalvar);
  }
  if (!data?.length) return falha(f, t.erroRecusado);
  revalidatePath("/leads");
  redirect("/leads?salvo=1");
}

/** Botão do painel: passa o lead para a etapa seguinte. */
export async function avancarLead(f: FormData) {
  const ctx = await contexto();
  const id = campo(f, "id");
  if (!ctx.ambiente || !id) return;
  const supabase = await createClient();
  const { data: atual } = await supabase.from("leads").select("etapa").eq("id", id).eq("ambiente_id", ctx.ambiente).maybeSingle();
  const proxima = atual ? PROXIMA[atual.etapa as Etapa] : undefined;
  if (!proxima) return;
  await supabase.from("leads").update({ etapa: proxima }).eq("id", id).eq("etapa", atual!.etapa);
  revalidatePath("/leads");
}

/** Remove o lead. Só sócio do ambiente (regra do banco). */
export async function removerLead(f: FormData) {
  const ctx = await contexto();
  const id = campo(f, "id");
  if (ctx.perfil !== "socio" || !id) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").delete().eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id");
  if (error || !data?.length) redirect(`/leads/${id}?erro=1`);
  revalidatePath("/leads");
  redirect("/leads?salvo=removido");
}
