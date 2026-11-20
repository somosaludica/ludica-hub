"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contexto } from "@/lib/contexto";
import { documentoValido, soDigitos } from "@/lib/formatos";
import { campo, emailValido, falha, opcional } from "@/lib/form";
import { ehIdioma, textos } from "@/lib/i18n";
import type { Estado } from "@/componentes/form-acao";

/** Cria ou atualiza um cliente. O cadastro é comum aos três ambientes; o banco decide quem pode. */
export async function salvarCliente(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  const id = campo(f, "id");
  const nome = campo(f, "nome");
  const documento = soDigitos(campo(f, "documento"));
  const email = campo(f, "email").toLowerCase();
  const tipo = campo(f, "tipo") === "empresa" ? "empresa" : "artista";
  const idioma = campo(f, "idioma_documentos");
  const nascimento = campo(f, "nascimento");

  if (!nome) return falha(f, t.erroNomeCliente);
  if (documento && !documentoValido(documento)) return falha(f, t.erroDocumento);
  if (email && !emailValido(email)) return falha(f, t.erroEmail);

  const dados = {
    tipo,
    nome,
    documento: documento || null,
    email: email || null,
    whatsapp: opcional(f, "whatsapp"),
    aceita_whatsapp: f.get("aceita_whatsapp") === "on",
    nascimento: /^\d{4}-\d{2}-\d{2}$/.test(nascimento) ? nascimento : null,
    idioma_documentos: ehIdioma(idioma) ? idioma : "pt",
    origem: opcional(f, "origem"),
    indicado_por: opcional(f, "indicado_por"),
    indicador_recebe_comissao: f.get("indicador_recebe_comissao") === "on" && !!campo(f, "indicado_por"),
    instagram: opcional(f, "instagram"),
    spotify: opcional(f, "spotify"),
    youtube: opcional(f, "youtube"),
    tiktok: opcional(f, "tiktok"),
    outros_links: opcional(f, "outros_links"),
    observacoes: opcional(f, "observacoes"),
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("clientes").update(dados).eq("id", id).select("id")
    : await supabase.from("clientes").insert({ ...dados, criado_por: ctx.usuarioId }).select("id");

  if (error) return falha(f, error.code === "23505" ? t.erroDocDuplicado : error.code === "42501" ? t.erroRecusado : t.erroSalvar);
  if (!data?.length) return falha(f, t.erroRecusado);
  revalidatePath("/clientes");
  redirect(`/clientes/${data[0].id}?salvo=1`);
}

/** Remove o cliente e os leads dele. Só sócio (regra do banco). */
export async function removerCliente(f: FormData) {
  const ctx = await contexto();
  const id = campo(f, "id");
  if (!ctx.socioAlgum || !id) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("clientes").delete().eq("id", id).select("id");
  if (error || !data?.length) redirect(`/clientes/${id}?erro=remover`);
  revalidatePath("/clientes");
  redirect("/clientes?salvo=removido");
}
