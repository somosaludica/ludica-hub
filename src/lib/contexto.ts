import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "@/lib/formatos";

export type AmbienteId = "hub" | "music" | "mkt";
export type Tema = "claro" | "escuro" | "sistema";
export type { Idioma } from "@/lib/i18n";
import type { Idioma } from "@/lib/i18n";

export const AMBIENTE_COOKIE = "hub-ambiente";
export const AMBIENTES: { id: AmbienteId; nome: string }[] = [
  { id: "hub", nome: "HUB" },
  { id: "music", nome: "MUSIC" },
  { id: "mkt", nome: "MKT" },
];

export type Contexto = {
  usuarioId: string;
  nome: string;
  email: string;
  tema: Tema;
  idioma: Idioma;
  /** Perfil da pessoa em cada ambiente a que tem acesso. */
  acessos: Partial<Record<AmbienteId, Perfil>>;
  /** Ambiente aberto agora (escolhido no menu e guardado em cookie). */
  ambiente: AmbienteId | null;
  /** Perfil no ambiente aberto. */
  perfil: Perfil | null;
  socioAlgum: boolean;
};

/**
 * Quem está logado, com que perfil em cada ambiente e qual ambiente está aberto.
 * Uma consulta por página (cache do React). A tela usa isso para montar o menu;
 * quem garante o que cada um vê de fato é o RLS do banco.
 */
export const contexto = cache(async (): Promise<Contexto> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: perfil }, { data: lista }] = await Promise.all([
    supabase.from("perfis").select("nome, email, tema, idioma, ativo").eq("id", auth.user.id).maybeSingle(),
    supabase.from("acessos").select("ambiente_id, perfil").eq("usuario_id", auth.user.id),
  ]);

  const ativo = perfil?.ativo ?? false;
  const acessos: Contexto["acessos"] = {};
  if (ativo) for (const a of lista ?? []) acessos[a.ambiente_id as AmbienteId] = a.perfil as Perfil;

  const store = await cookies();
  const pedido = store.get(AMBIENTE_COOKIE)?.value as AmbienteId | undefined;
  const ambiente = pedido && acessos[pedido] ? pedido : (AMBIENTES.find((a) => acessos[a.id])?.id ?? null);

  return {
    usuarioId: auth.user.id,
    nome: perfil?.nome ?? auth.user.email ?? "",
    email: perfil?.email ?? auth.user.email ?? "",
    tema: (perfil?.tema as Tema) ?? "claro",
    idioma: (perfil?.idioma as Idioma) ?? "pt",
    acessos,
    ambiente,
    perfil: ambiente ? (acessos[ambiente] ?? null) : null,
    socioAlgum: Object.values(acessos).includes("socio"),
  };
});

export function nomeAmbiente(id: AmbienteId | null): string {
  return AMBIENTES.find((a) => a.id === id)?.nome ?? "";
}

/** Para páginas restritas: manda para o início quem não tem um dos perfis no ambiente aberto. */
export function exigePerfil(ctx: Contexto, permitidos: Perfil[]) {
  if (!ctx.perfil || !permitidos.includes(ctx.perfil)) redirect("/?sem-acesso=1");
}
