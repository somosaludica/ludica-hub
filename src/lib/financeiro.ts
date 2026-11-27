/**
 * Conta do financeiro, no formato do controle antigo da Music. Tudo em centavos inteiros por dentro.
 *
 *  - Cada conta pertence a um MÊS DE REFERÊNCIA e tem um estado: paga, a vencer, em atraso ou a confirmar.
 *  - De cada RECEBIMENTO saem o imposto, o fundo de reserva e os custos do projeto; o que sobra é o lucro a
 *    dividir entre os sócios, pela participação do dia do recebimento.
 *  - As contas e os custos pagos saem do fundo de reserva. Quando ele fica negativo, a falta é dos sócios,
 *    na proporção da participação.
 *  - Caixa = recebido − imposto − contas pagas − distribuído (+ aportes lançados). Caixa negativo foi coberto
 *    por alguém de fora (no MUSIC, a conta da Lúdica Marketing = aporte do Bob).
 */
export type Estado = "pago" | "a_vencer" | "em_atraso" | "a_confirmar";
export type Comprovante = "anexado" | "antigo" | "dispensado" | "falta";
export type Participacao = { socio: string; percentual: number };
export type Renuncia = { socio: string; valor: number };

/** Uma linha do fluxo: lançamento ou cobrança. `valor` é sempre a parte do ambiente. */
export type Mov = {
  id: string; origem: "lancamento" | "cobranca"; tipo: "entrada" | "saida"; categoria: string; rubrica: string | null;
  descricao: string; mes: string; vencimento: string | null; pagoEm: string | null; valor: number; valorTotal: number; pct: number;
  estado: Estado; fora: boolean; comprovante: Comprovante | null; comprovanteNome: string | null; conta: string | null; socio: string | null; obs: string | null;
};
/** Um recebimento de faturamento, com os percentuais congelados no dia. */
export type Recebimento = {
  id: string; origem: "lancamento" | "cobranca"; data: string; descricao: string; receita: number; impostoPct: number; reservaPct: number;
  custos: number; partes: Participacao[] | null; renuncias: Renuncia[]; obs: string | null;
};
export type Apuracao = { rec: number; imp: number; res: number; cus: number; lucro: number; partes: { socio: string; valor: number }[]; completa: boolean };

const c = (v: number) => Math.round(Number(v) * 100);
const r = (cent: number) => cent / 100;
const pctDe = (cent: number, pct: number) => Math.round((cent * pct) / 100);

export const mesDe = (d: string | Date) => (typeof d === "string" ? d : d.toISOString()).slice(0, 7);
export const mesValido = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
/** Soma meses a "AAAA-MM". */
export function somaMes(m: string, k: number): string {
  const [a, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(a, mm - 1 + k, 1)).toISOString().slice(0, 7);
}

/** Estado de uma conta: paga; marcada à mão (a confirmar / em atraso); vencida vira em atraso sozinha. */
export function estadoDe(l: { situacao: string; aviso: string | null; vencimento: string | null }, hoje: string): Estado {
  if (l.situacao === "paga") return "pago";
  if (l.aviso === "a_confirmar") return "a_confirmar";
  if (l.aviso === "em_atraso" || (l.vencimento != null && l.vencimento < hoje)) return "em_atraso";
  return "a_vencer";
}

/** Parte do ambiente numa conta dividida: valor total × percentual. */
export const parteDoAmbiente = (valorTotal: number, pct: number) => r(pctDe(c(valorTotal), pct));

/**
 * Quanto um sócio abriu mão num pagamento recebido. O recebido já veio com todos os descontos, então
 * o valor cheio é recebido ÷ (1 − desconto total) e a renúncia é a fatia do sócio sobre esse valor cheio.
 */
export function renunciaNoRecebido(valorRecebido: number, pctSocio: number, pctTotal: number): number {
  if (pctTotal >= 100 || pctSocio <= 0) return 0;
  return Math.round((c(valorRecebido) * pctSocio) / (100 - pctTotal)) / 100;
}

const ordena = (p: Participacao[]) => [...p].sort((a, b) => b.percentual - a.percentual || a.socio.localeCompare(b.socio));
const completa = (p: Participacao[]) => p.length > 0 && Math.abs(p.reduce((x, y) => x + Number(y.percentual), 0) - 100) < 0.005;

/**
 * Apuração de um recebimento: recebido − imposto − reserva − custos do projeto = lucro a dividir.
 * Quem abriu mão da própria parte num serviço paga sozinho por isso: os outros recebem a participação deles
 * como se o desconto tivesse entrado, já líquido de imposto e reserva (decisão de 24/11).
 */
export function apura(x: Recebimento, atuais: Participacao[]): Apuracao {
  const rec = c(x.receita), imp = pctDe(rec, x.impostoPct), res = pctDe(rec, x.reservaPct), cus = c(x.custos);
  const lucro = rec - imp - res - cus;
  const parts = ordena(x.partes?.length ? x.partes : atuais);
  if (!completa(parts)) return { rec: r(rec), imp: r(imp), res: r(res), cus: r(cus), lucro: r(lucro), partes: [], completa: false };
  const liquida = new Map<string, number>();
  for (const n of x.renuncias) liquida.set(n.socio, (liquida.get(n.socio) ?? 0) + Math.round(c(n.valor) * (1 - (x.impostoPct + x.reservaPct) / 100)));
  const total = [...liquida.values()].reduce((a, b) => a + b, 0);
  let usado = 0;
  const partes = parts.map((p, i) => {
    const v = i === parts.length - 1 ? lucro - usado : pctDe(lucro + total, p.percentual) - (liquida.get(p.socio) ?? 0);
    usado += v;
    return { socio: p.socio, valor: r(v) };
  });
  return { rec: r(rec), imp: r(imp), res: r(res), cus: r(cus), lucro: r(lucro), partes, completa: true };
}

/** Linhas que entram nos totais do fluxo. Repasse a sócio e aporte ficam de fora das contas: têm lugar próprio. */
const noFluxo = (m: Mov) => !m.fora;
export const ehConta = (m: Mov) => noFluxo(m) && m.tipo === "saida" && m.categoria !== "distribuicao";
export const ehReceita = (m: Mov) => noFluxo(m) && m.tipo === "entrada" && m.categoria !== "aporte";
export const ehRepasse = (m: Mov) => noFluxo(m) && m.categoria === "distribuicao" && m.estado === "pago";
export const ehAporte = (m: Mov) => noFluxo(m) && m.categoria === "aporte" && m.estado === "pago";
const soma = (l: Mov[]) => l.reduce((x, m) => x + c(m.valor), 0);

export type LinhaMes = { mes: string; faturado: number; recebido: number; contas: number; pagas: number; abertas: number; imposto: number; distribuido: number };

/** Por mês: faturado, recebido, contas (todas, pagas e em aberto), imposto das notas e distribuído aos sócios. */
export function porMes(movs: Mov[], recs: Recebimento[], atuais: Participacao[]): LinhaMes[] {
  const by = new Map<string, LinhaMes>();
  const g = (mes: string) => by.get(mes) ?? by.set(mes, { mes, faturado: 0, recebido: 0, contas: 0, pagas: 0, abertas: 0, imposto: 0, distribuido: 0 }).get(mes)!;
  for (const m of movs) {
    const o = g(m.mes), v = c(m.valor);
    if (ehReceita(m)) { o.faturado += v; if (m.estado === "pago") o.recebido += v; }
    else if (ehConta(m)) { o.contas += v; if (m.estado === "pago") o.pagas += v; else o.abertas += v; }
    else if (ehRepasse(m)) o.distribuido += v;
  }
  for (const x of recs) g(mesDe(x.data)).imposto += c(apura(x, atuais).imp);
  return [...by.values()].sort((a, b) => a.mes.localeCompare(b.mes))
    .map((o) => ({ ...o, faturado: r(o.faturado), recebido: r(o.recebido), contas: r(o.contas), pagas: r(o.pagas), abertas: r(o.abertas), imposto: r(o.imposto), distribuido: r(o.distribuido) }));
}
/** Resultado real: recebido menos tudo o que já saiu. Previsto: conta também o que ainda está em aberto. */
export const resultadoReal = (l: LinhaMes) => r(c(l.recebido) - c(l.pagas) - c(l.imposto) - c(l.distribuido));
export const resultadoPrevisto = (l: LinhaMes) => r(c(l.faturado) - c(l.contas) - c(l.imposto) - c(l.distribuido));
export const mesVazio = (mes: string): LinhaMes => ({ mes, faturado: 0, recebido: 0, contas: 0, pagas: 0, abertas: 0, imposto: 0, distribuido: 0 });

export type PosicaoSocio = { socio: string; pct: number; direito: number; retirado: number; saldo: number; falta: number; aportado: number; posicao: number };
export type Posicao = {
  recebido: number; imposto: number; reserva: number; custos: number; pagas: number; nPagas: number; distribuido: number; aportes: number;
  antes: number; caixa: number; coberto: number; fundo: number; falta: number; emAtraso: number; naoRetirado: number;
  socios: PosicaoSocio[]; completa: boolean;
};

/** Posição acumulada do ambiente e de cada sócio (a aba "Sócios e lucros" e o balanço do Resumo). */
export function posicao(e: { movs: Mov[]; recs: Recebimento[]; participacoes: Participacao[]; cobertura: string | null }): Posicao {
  const parts = ordena(e.participacoes), ok = completa(parts);
  const direito = new Map<string, number>(), retirado = new Map<string, number>(), aportou = new Map<string, number>();
  const mais = (m: Map<string, number>, k: string | null, v: number) => { if (k) m.set(k, (m.get(k) ?? 0) + v); };
  let imp = 0, res = 0, cus = 0;
  for (const x of e.recs) {
    const a = apura(x, parts);
    imp += c(a.imp); res += c(a.res); cus += c(a.cus);
    for (const p of a.partes) mais(direito, p.socio, c(p.valor));
  }
  const contasPagas = e.movs.filter((m) => ehConta(m) && m.estado === "pago");
  const pagas = soma(contasPagas), recebido = soma(e.movs.filter((m) => ehReceita(m) && m.estado === "pago"));
  for (const m of e.movs.filter(ehRepasse)) mais(retirado, m.socio, c(m.valor));
  for (const m of e.movs.filter(ehAporte)) mais(aportou, m.socio, c(m.valor));
  const dist = [...retirado.values()].reduce((a, b) => a + b, 0), aportes = [...aportou.values()].reduce((a, b) => a + b, 0);
  const antes = recebido - imp - pagas, caixa = antes - dist + aportes, coberto = caixa < 0 ? -caixa : 0;
  const fundo = res + cus - pagas, falta = fundo < 0 ? -fundo : 0;
  const ids = [...new Set([...parts.map((p) => p.socio), ...direito.keys(), ...retirado.keys(), ...aportou.keys()])];
  let usada = 0;
  const comPct = parts.filter((p) => p.percentual > 0);
  const faltaDe = new Map<string, number>();
  if (ok) comPct.forEach((p, i) => { const v = i === comPct.length - 1 ? falta - usada : pctDe(falta, p.percentual); usada += v; faltaDe.set(p.socio, v); });
  const socios = ids.map((id) => {
    const saldo = (direito.get(id) ?? 0) - (retirado.get(id) ?? 0), f = faltaDe.get(id) ?? 0;
    const ap = (aportou.get(id) ?? 0) + (id === e.cobertura ? coberto : 0);
    return { socio: id, pct: parts.find((p) => p.socio === id)?.percentual ?? 0, direito: r(direito.get(id) ?? 0), retirado: r(retirado.get(id) ?? 0), saldo: r(saldo), falta: r(f), aportado: r(ap), posicao: r(saldo + ap - f) };
  });
  return {
    recebido: r(recebido), imposto: r(imp), reserva: r(res), custos: r(cus), pagas: r(pagas), nPagas: contasPagas.length, distribuido: r(dist), aportes: r(aportes),
    antes: r(antes), caixa: r(caixa), coberto: r(coberto), fundo: r(fundo), falta: r(falta),
    emAtraso: r(soma(e.movs.filter((m) => ehConta(m) && m.estado === "em_atraso"))),
    naoRetirado: r(socios.reduce((x, s) => x + Math.max(0, c(s.saldo)), 0)), socios, completa: ok,
  };
}

/** Quanto falta cobrir no mês: contas em aberto menos o que o fundo de reserva tem, dividido pela participação. */
export function aporteDoMes(abertas: number, fundo: number, participacoes: Participacao[]) {
  const disponivel = Math.max(0, c(fundo)), falta = Math.max(0, c(abertas) - disponivel);
  const parts = ordena(participacoes).filter((p) => p.percentual > 0);
  let usada = 0;
  const socios = completa(parts) ? parts.map((p, i) => { const v = i === parts.length - 1 ? falta - usada : pctDe(falta, p.percentual); usada += v; return { socio: p.socio, pct: p.percentual, valor: r(v) }; }) : [];
  return { disponivel: r(disponivel), falta: r(falta), socios };
}
