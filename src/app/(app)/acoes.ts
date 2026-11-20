"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AMBIENTE_COOKIE, AMBIENTES, contexto, type Idioma, type Tema } from "@/lib/contexto";

/** Troca o ambiente aberto. Só aceita um ambiente a que a pessoa tem acesso. */
export async function trocarAmbiente(formData: FormData) {
  const id = String(formData.get("ambiente") ?? "");
  const ctx = await contexto();
  if (!AMBIENTES.some((a) => a.id === id) || !ctx.acessos[id as keyof typeof ctx.acessos]) return;
  const store = await cookies();
  store.set(AMBIENTE_COOKIE, id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

/** Tema e idioma ficam no perfil: valem em qualquer aparelho. */
export async function salvarPreferencia(formData: FormData) {
  const tema = formData.get("tema");
  const idioma = formData.get("idioma");
  const mudanca: { tema?: Tema; idioma?: Idioma } = {};
  if (tema === "claro" || tema === "escuro" || tema === "sistema") mudanca.tema = tema;
  if (idioma === "pt" || idioma === "en" || idioma === "es") mudanca.idioma = idioma;
  if (!mudanca.tema && !mudanca.idioma) return;
  const ctx = await contexto();
  const supabase = await createClient();
  await supabase.from("perfis").update(mudanca).eq("id", ctx.usuarioId);
  revalidatePath("/", "layout");
}
