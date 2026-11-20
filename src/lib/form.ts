import type { Estado } from "@/componentes/form-acao";

/** Texto de um campo, sem espaços nas pontas. */
export const campo = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Campo opcional: vazio vira null no banco. */
export const opcional = (f: FormData, k: string) => campo(f, k) || null;

/** Erro de formulário devolvendo o que foi digitado, para a tela não voltar vazia. */
export function falha(f: FormData, erro: string): Estado {
  const valores: [string, string][] = [];
  for (const [k, v] of f.entries()) if (typeof v === "string" && !k.startsWith("$")) valores.push([k, v]);
  return { erro, valores };
}

export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
