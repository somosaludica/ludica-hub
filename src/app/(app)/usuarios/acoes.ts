"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { AMBIENTES, contexto, type AmbienteId, type Contexto } from "@/lib/contexto";
import type { Perfil } from "@/lib/formatos";
import { campo, emailValido, falha } from "@/lib/form";
import { textos } from "@/lib/i18n";
import type { Estado } from "@/componentes/form-acao";

const PERFIS: Perfil[] = ["socio", "administrativo", "comercial", "pauta"];
const ehPerfil = (v: string): v is Perfil => (PERFIS as string[]).includes(v);

/** Acessos pedidos no formulário, só nos ambientes em que quem pede é sócio. */
function acessosPedidos(ctx: Contexto, f: FormData) {
  const pedidos: { ambiente_id: AmbienteId; perfil: Perfil | null }[] = [];
  for (const a of AMBIENTES) {
    if (ctx.acessos[a.id] !== "socio" || !f.has(`perfil_${a.id}`)) continue;
    const v = campo(f, `perfil_${a.id}`);
    pedidos.push({ ambiente_id: a.id, perfil: ehPerfil(v) ? v : null });
  }
  return pedidos;
}

async function origem() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** Link de acesso de uso único. Gerado com a chave secreta, só no servidor; não fica guardado. */
async function linkDeAcesso(email: string): Promise<string | null> {
  const admin = adminClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) return null;
  return `${await origem()}/auth/confirmar?token_hash=${encodeURIComponent(token)}&type=magiclink`;
}

/** Cria a conta de uma pessoa do time, define os acessos e devolve o link para mandar por WhatsApp. */
export async function convidar(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!ctx.socioAlgum) return falha(f, t.erroRecusado);
  const nome = campo(f, "nome");
  const email = campo(f, "email").toLowerCase();
  const acessos = acessosPedidos(ctx, f).filter((a) => a.perfil);
  if (!nome) return falha(f, t.erroNome);
  if (!emailValido(email)) return falha(f, t.erroEmail);
  if (acessos.length === 0) return falha(f, t.erroUmAcesso);

  const admin = adminClient();
  if (!admin) return falha(f, t.erroSemChave);

  const { data: criado, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { nome } });
  if (error || !criado.user) {
    const existe = error?.code === "email_exists" || /already|registered|exists/i.test(error?.message ?? "");
    return falha(f, existe ? t.erroEmailExiste : t.erroConvite);
  }
  const id = criado.user.id;
  const { error: e1 } = await admin.from("perfis").insert({ id, nome, email, idioma: ctx.idioma });
  const { error: e2 } = e1 ? { error: e1 } : await admin.from("acessos").insert(acessos.map((a) => ({ usuario_id: id, ambiente_id: a.ambiente_id, perfil: a.perfil })));
  if (e1 || e2) {
    await admin.auth.admin.deleteUser(id); // não deixa conta pela metade
    return falha(f, t.erroConvite);
  }

  revalidatePath("/usuarios");
  const url = await linkDeAcesso(email);
  return url ? { link: { titulo: t.linkDe(nome), url } } : { erro: t.erroLinkAcesso };
}

/** Novo link de acesso para quem já tem conta (perdeu o link ou esqueceu a senha). */
export async function gerarLink(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!ctx.socioAlgum) return { erro: t.erroRecusado };
  if (!adminClient()) return { erro: t.erroSemChave };
  const supabase = await createClient();
  const { data: p } = await supabase.from("perfis").select("id, nome, email").eq("id", campo(f, "id")).maybeSingle();
  if (!p || p.id === ctx.usuarioId) return { erro: t.erroRecusado };
  // Um link de acesso entra como a pessoa. Só gera quem é sócio de TODOS os ambientes dela:
  // sem isso, um sócio de um ambiente entraria na conta de alguém com acesso a outro.
  const { data: dela, error } = await adminClient()!.from("acessos").select("ambiente_id").eq("usuario_id", p.id);
  if (error) return { erro: t.erroLinkAcesso };
  if ((dela ?? []).some((a) => ctx.acessos[a.ambiente_id as AmbienteId] !== "socio")) return { erro: t.erroSoSeusAmbientes };
  const url = await linkDeAcesso(p.email);
  return url ? { link: { titulo: t.linkDe(p.nome), url } } : { erro: t.erroLinkAcesso };
}

/** Salva os acessos de uma pessoa ou ativa/desativa a conta. As travas (um sócio por ambiente etc.) são do banco. */
export async function alterarPessoa(f: FormData) {
  const ctx = await contexto();
  if (!ctx.socioAlgum) redirect("/");
  const id = campo(f, "id");
  const supabase = await createClient();
  let erro = false;
  let feito = "salvo";

  if (f.get("acao") === "ativo") {
    const ativo = f.get("ativo") === "1";
    const { data, error } = await supabase.from("perfis").update({ ativo }).eq("id", id).select("id");
    erro = !!error || !data?.length;
    feito = ativo ? "reativado" : "desativado";
  } else {
    for (const a of acessosPedidos(ctx, f)) {
      const r = a.perfil
        ? await supabase.from("acessos").upsert({ usuario_id: id, ambiente_id: a.ambiente_id, perfil: a.perfil }).select("usuario_id")
        : await supabase.from("acessos").delete().eq("usuario_id", id).eq("ambiente_id", a.ambiente_id).select("usuario_id");
      if (r.error) erro = true;
    }
  }
  revalidatePath("/usuarios");
  redirect(erro ? "/usuarios?erro=1" : `/usuarios?ok=${feito}`);
}
