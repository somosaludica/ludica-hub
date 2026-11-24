/**
 * Conta do fechamento do mês, em centavos inteiros. Regime de caixa.
 *   Entradas (recebido) − imposto − reserva − saídas pagas = resultado antes da distribuição
 *   − distribuição de lucros paga = resultado do mês
 * Imposto e reserva incidem sobre o faturamento recebido (aporte de sócio não é faturamento).
 */
export type CategoriaSaida = "conta_fixa" | "custo_terceiros" | "comissao" | "distribuicao" | "outras_saidas";
export type Participacao = { socio: string; percentual: number };
export type Renuncia = { socio: string; valor: number };
export type ParteSocio = { socio: string; percentual: number; renunciaLiquida: number; parte: number };

export type Fechamento = {
  faturamento: number; imposto: number; reserva: number; contasFixas: number; custosTerceiros: number; comissoes: number;
  outrasSaidas: number; resultadoAntes: number; distribuicao: number; resultadoMes: number; aportes: number;
  impostoPct: number; reservaPct: number; socios: ParteSocio[]; participacaoCompleta: boolean;
};

const c = (v: number) => Math.round(Number(v) * 100);

/**
 * Quanto um sócio abriu mão num pagamento recebido. O recebido já veio com todos os descontos, então
 * o valor cheio é recebido ÷ (1 − desconto total) e a renúncia é a fatia do sócio sobre esse valor cheio.
 */
export function renunciaNoRecebido(valorRecebido: number, pctSocio: number, pctTotal: number): number {
  if (pctTotal >= 100 || pctSocio <= 0) return 0;
  return Math.round((c(valorRecebido) * pctSocio) / (100 - pctTotal)) / 100;
}

export function fechaMes(e: {
  recebido: number;                    // baixas de cobranças no mês
  outrasEntradas: number;              // entradas lançadas à mão que são faturamento
  aportes: number;                     // entradas de sócio: caixa, não faturamento
  saidas: Partial<Record<CategoriaSaida, number>>; // pagas no mês
  impostoPct: number;
  reservaPct: number;
  participacoes: Participacao[];
  renuncias: Renuncia[];               // descontos "sócio abre mão" nos pagamentos recebidos no mês (valor cheio)
}): Fechamento {
  const fat = c(e.recebido) + c(e.outrasEntradas);
  const imposto = Math.round((fat * e.impostoPct) / 100);
  const reserva = Math.round((fat * e.reservaPct) / 100);
  const s = (k: CategoriaSaida) => c(e.saidas[k] ?? 0);
  const antes = fat - imposto - reserva - s("conta_fixa") - s("custo_terceiros") - s("comissao") - s("outras_saidas");
  const mes = antes - s("distribuicao");

  // Divisão entre sócios sobre o resultado antes da distribuição.
  // Quem abriu mão da parte dele paga sozinho por isso: os outros recebem como se o desconto tivesse entrado
  // (líquido de imposto e reserva). parte = % × (resultado + renúncias líquidas) − renúncia líquida própria.
  const somaPct = e.participacoes.reduce((x, p) => x + Number(p.percentual), 0);
  const completa = e.participacoes.length > 0 && Math.abs(somaPct - 100) < 0.005;
  const liquida = new Map<string, number>();
  for (const r of e.renuncias) {
    const l = Math.round(c(r.valor) * (1 - (e.impostoPct + e.reservaPct) / 100));
    liquida.set(r.socio, (liquida.get(r.socio) ?? 0) + l);
  }
  const totalLiquido = [...liquida.values()].reduce((a, b) => a + b, 0);
  let usado = 0;
  const socios: ParteSocio[] = completa
    ? e.participacoes.map((p, i) => {
        const propria = liquida.get(p.socio) ?? 0;
        const parte = i === e.participacoes.length - 1
          ? antes - usado
          : Math.round(((antes + totalLiquido) * Number(p.percentual)) / 100) - propria;
        usado += parte;
        return { socio: p.socio, percentual: Number(p.percentual), renunciaLiquida: propria / 100, parte: parte / 100 };
      })
    : [];

  return {
    faturamento: fat / 100, imposto: imposto / 100, reserva: reserva / 100,
    contasFixas: s("conta_fixa") / 100, custosTerceiros: s("custo_terceiros") / 100, comissoes: s("comissao") / 100,
    outrasSaidas: s("outras_saidas") / 100, resultadoAntes: antes / 100, distribuicao: s("distribuicao") / 100,
    resultadoMes: mes / 100, aportes: c(e.aportes) / 100, impostoPct: e.impostoPct, reservaPct: e.reservaPct,
    socios, participacaoCompleta: completa,
  };
}

/** "2026-11" a partir de uma data ISO ou Date. */
export const mesDe = (d: string | Date) => (typeof d === "string" ? d : d.toISOString()).slice(0, 7);
export const mesValido = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
/** Soma meses a "AAAA-MM". */
export function somaMes(m: string, k: number): string {
  const [a, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(a, mm - 1 + k, 1)).toISOString().slice(0, 7);
}
