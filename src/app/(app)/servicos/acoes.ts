"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contexto } from "@/lib/contexto";
import { lerReais, UNIDADES, type Unidade } from "@/lib/formatos";
import { textos } from "@/lib/i18n";

/** Em caso de erro, devolve o que foi digitado para o formulário não voltar vazio. */
export type Estado = { erro?: string; valores?: Record<string, string>; n?: number };

function digitado(f: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const k of ["categoria", "nome", "valor", "unidade", "prazo", "observacao"]) v[k] = String(f.get(k) ?? "");
  for (const k of ["complemento", "visivel_comercial", "ativo"]) v[k] = f.get(k) === "on" ? "on" : "";
  return v;
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Cria ou atualiza um serviço do ambiente aberto. O banco confere de novo se o perfil pode. */
export async function salvarServico(_anterior: Estado, f: FormData): Promise<Estado> {
  const r = await salvar(f);
  return r.erro ? { ...r, valores: digitado(f), n: Date.now() } : r;
}

async function salvar(f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (ctx.perfil !== "socio" && ctx.perfil !== "administrativo") return { erro: t.erroSemPermissao };

  const id = texto(f, "id");
  const categoria = texto(f, "categoria");
  const nome = texto(f, "nome");
  const unidade = texto(f, "unidade") as Unidade;
  const valor = lerReais(texto(f, "valor"));
  const prazoTxt = texto(f, "prazo");
  const prazo = unidade === "mensal" && prazoTxt ? Number(prazoTxt) : null;

  if (!categoria) return { erro: t.erroCategoria };
  if (!nome) return { erro: t.erroNome };
  if (valor == null) return { erro: t.erroValor };
  if (!(unidade in UNIDADES)) return { erro: t.erroUnidade };
  if (prazo != null && (!Number.isInteger(prazo) || prazo < 1 || prazo > 60)) {
    return { erro: t.erroPrazo };
  }

  const dados = {
    categoria,
    nome,
    valor,
    unidade,
    prazo_minimo_meses: prazo,
    complemento: f.get("complemento") === "on",
    visivel_comercial: f.get("visivel_comercial") === "on",
    ativo: f.get("ativo") === "on",
    observacao_interna: texto(f, "observacao") || null,
  };

  const supabase = await createClient();
  const { data: gravado, error } = id
    ? await supabase.from("servicos").update(dados).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id")
    : await supabase.from("servicos").insert({ ...dados, ambiente_id: ctx.ambiente! }).select("id");

  if (error) {
    if (error.code === "23505") return { erro: t.erroDuplicado };
    if (error.code === "42501") return { erro: t.erroSemPermissao };
    return { erro: t.erroSalvar };
  }
  // O banco não devolve erro quando a regra de acesso filtra a linha: nada gravado é falha.
  if (!gravado?.length) return { erro: t.erroSemPermissao };
  revalidatePath("/servicos");
  redirect("/servicos?salvo=1");
}

/** Remove um serviço. Só sócio (regra do banco). Para tirar de uso sem apagar, use "Ativo". */
export async function removerServico(f: FormData) {
  const ctx = await contexto();
  const id = texto(f, "id");
  if (ctx.perfil !== "socio" || !id) return;
  const supabase = await createClient();
  const { data: apagado, error } = await supabase.from("servicos").delete().eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id");
  if (error || !apagado?.length) redirect(`/servicos/${id}?erro=remover`);
  revalidatePath("/servicos");
  redirect("/servicos?salvo=removido");
}
