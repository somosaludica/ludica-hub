import type { AmbienteId } from "@/lib/contexto";

export type SituacaoCobranca = "aberta" | "paga" | "cancelada";
export type VistaCobranca = "a_vencer" | "vencida" | "paga" | "cancelada";
export type Parcela = { descricao: string; vencimento: string; valor: number; automatico: boolean };

const PREFIXO: Record<AmbienteId, string> = { hub: "HUB", music: "MUS", mkt: "MKT" };

/** Número da nota de débito: ND-MUS-0007. */
export const numeroNota = (ambiente: AmbienteId, numero: number) => `ND-${PREFIXO[ambiente]}-${String(numero).padStart(4, "0")}`;

/** Divide um valor em n partes iguais em centavos; a última leva a sobra, para a soma fechar. */
export function dividir(total: number, n: number): number[] {
  const c = Math.round(total * 100);
  const base = Math.floor(c / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? c - base * (n - 1) : base) / 100);
}

/** Soma meses a uma data ISO mantendo o dia; em mês mais curto cai no último dia (31/01 + 1 = 28/02). */
export function somaMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export const dataValida = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

/** Parcelas iguais, uma por mês a partir do primeiro vencimento. `rotulo(i, n)` dá o texto "parcela 1 de 2". */
export function plano(total: number, n: number, primeiro: string, base: string, rotulo: (i: number, n: number) => string, automatico: boolean): Parcela[] {
  if (total <= 0 || n < 1) return [];
  return dividir(total, n).map((valor, i) => ({
    descricao: n === 1 ? base : `${base} · ${rotulo(i + 1, n)}`,
    vencimento: somaMeses(primeiro, i),
    valor,
    automatico,
  }));
}

/** Mensal: o mesmo valor todo mês. */
export function planoMensal(valorMes: number, meses: number, primeiro: string, base: string, rotulo: (i: number, n: number) => string): Parcela[] {
  if (valorMes <= 0 || meses < 1) return [];
  return Array.from({ length: meses }, (_, i) => ({
    descricao: `${base} · ${rotulo(i + 1, meses)}`,
    vencimento: somaMeses(primeiro, i),
    valor: valorMes,
    automatico: true, // fee mensal nasce com o envio automático ligado
  }));
}

export function vistaCobranca(situacao: SituacaoCobranca, vencimento: string, hoje: Date): VistaCobranca {
  if (situacao !== "aberta") return situacao;
  return vencimento < hoje.toISOString().slice(0, 10) ? "vencida" : "a_vencer";
}

/** Dias corridos entre hoje e o vencimento: positivo = falta, negativo = atraso. */
export function diasAte(vencimento: string, hoje: Date): number {
  return Math.round((Date.parse(`${vencimento}T00:00:00Z`) - hoje.getTime()) / 86400000);
}

/** Número para o link do WhatsApp: só dígitos, com 55 quando vier só DDD + número. */
export function numeroWhatsapp(texto: string | null): string | null {
  const d = (texto ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}
