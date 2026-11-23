import type { AmbienteId } from "@/lib/contexto";

export type Situacao = "pedido" | "rascunho" | "enviado" | "aprovado" | "recusado";
export type SituacaoVista = Situacao | "expirado";
export type Item = { quantidade: number; valor_unitario: number };

const PREFIXO: Record<AmbienteId, string> = { hub: "HUB", music: "MUS", mkt: "MKT" };

/** Número do orçamento como aparece nos documentos: MUS-0012. */
export function numeroOrcamento(ambiente: AmbienteId, numero: number): string {
  return `${PREFIXO[ambiente]}-${String(numero).padStart(4, "0")}`;
}

const centavos = (v: number) => Math.round(v * 100);

/** Subtotal, desconto e total, sempre em centavos inteiros para não acumular erro de arredondamento. */
export function totais(itens: Item[], descontoPercentual: number) {
  const sub = itens.reduce((s, i) => s + Math.round(centavos(Number(i.valor_unitario)) * Number(i.quantidade)), 0);
  const desc = Math.round((sub * Number(descontoPercentual)) / 100);
  return { subtotal: sub / 100, desconto: desc / 100, total: (sub - desc) / 100 };
}

/**
 * Valor de cada linha de desconto. Os percentuais somam sobre o subtotal; o total é arredondado uma vez
 * e a última linha absorve o centavo de diferença, para as linhas sempre fecharem com o total.
 */
export function valoresDesconto(subtotal: number, percentuais: number[]): number[] {
  const sub = centavos(subtotal);
  const total = Math.round((sub * percentuais.reduce((s, p) => s + Number(p), 0)) / 100);
  let usado = 0;
  return percentuais.map((p, i) => {
    const v = i === percentuais.length - 1 ? total - usado : Math.round((sub * Number(p)) / 100);
    usado += v;
    return v / 100;
  });
}

/** Percentual digitado ("20", "12,5") -> número com até 2 casas entre 0 e 100, ou null. Vazio = 0. */
export function lerPercentual(texto: string): number | null {
  const t = texto.trim().replace("%", "").replace(",", ".");
  if (!t) return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

/** Proposta enviada que passou da validade conta como expirada (calculado, sem rotina noturna). */
export function situacaoVista(situacao: Situacao, validadeAte: string | null, hoje: Date): SituacaoVista {
  if (situacao === "enviado" && validadeAte && validadeAte < hoje.toISOString().slice(0, 10)) return "expirado";
  return situacao;
}

/** Texto de várias linhas -> lista, sem linhas vazias. */
export const linhas = (texto: string | null | undefined) => (texto ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/** Junta listas de vários serviços sem repetir linha. */
export function juntaLinhas(textos: (string | null | undefined)[]): string | null {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const t of textos) for (const l of linhas(t)) if (!vistas.has(l.toLowerCase())) (vistas.add(l.toLowerCase()), saida.push(l));
  return saida.length ? saida.join("\n") : null;
}

/** "7 dias corridos" -> 7. */
export function diasDe(texto: string | null | undefined, padrao = 7): number {
  const n = Number((texto ?? "").match(/\d+/)?.[0]);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : padrao;
}

/** Quantidade digitada ("2", "1,5") -> número com até 2 casas, ou null. Vazio = 0. */
export function lerQtd(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t) return 0;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}
