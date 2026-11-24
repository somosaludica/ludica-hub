import type { createClient } from "@/lib/supabase/server";
import type { AmbienteId } from "@/lib/contexto";
import { fechaMes, mesDe, renunciaNoRecebido, type CategoriaSaida, type Fechamento, type Renuncia } from "@/lib/fechamento";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type LinhaReceita = { id: string; cliente: string; descricao: string; vencimento: string; previsto: number; recebido: number; paga: boolean };
export type LinhaSaida = { id: string; descricao: string; fornecedor: string | null; categoria: string; tipo: "entrada" | "saida"; vencimento: string; previsto: number; pago: number; paga: boolean };

/**
 * Tudo o que entra no fechamento de um mês de um ambiente (regime de caixa):
 * receitas = cobranças recebidas no mês + as que vencem nele e seguem abertas;
 * saídas = lançamentos pagos no mês + os provisionados que vencem nele.
 */
export async function dadosDoMes(supabase: Supabase, ambiente: AmbienteId, mes: string) {
  const [{ data: cobs }, { data: lancs }, { data: parts }, { data: amb }] = await Promise.all([
    supabase.from("cobrancas").select("id, cliente_id, orcamento_id, descricao, vencimento, valor, situacao, pago_em, valor_recebido").eq("ambiente_id", ambiente),
    supabase.from("lancamentos").select("id, tipo, categoria, descricao, fornecedor, vencimento, valor, situacao, pago_em").eq("ambiente_id", ambiente),
    supabase.from("participacoes").select("socio_id, percentual").eq("ambiente_id", ambiente),
    supabase.from("ambiente_dados").select("imposto_pct, reserva_pct").eq("ambiente_id", ambiente).maybeSingle(),
  ]);

  const doMes = (cobs ?? []).filter((c) => (c.situacao === "paga" && mesDe(String(c.pago_em)) === mes) || (c.situacao === "aberta" && mesDe(c.vencimento) === mes));
  const idsCli = [...new Set(doMes.map((c) => c.cliente_id))];
  const { data: cli } = idsCli.length ? await supabase.from("clientes").select("id, nome").in("id", idsCli) : { data: [] };
  const nomes = Object.fromEntries((cli ?? []).map((c) => [c.id, c.nome]));
  const receitas: LinhaReceita[] = doMes
    .map((c) => ({
      id: c.id as string, cliente: nomes[c.cliente_id] ?? "—", descricao: c.descricao as string, vencimento: c.vencimento as string,
      previsto: Number(c.valor), recebido: c.situacao === "paga" ? Number(c.valor_recebido) : 0, paga: c.situacao === "paga",
    }))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const lancMes = (lancs ?? []).filter((l) => (l.situacao === "paga" ? mesDe(String(l.pago_em)) : mesDe(l.vencimento)) === mes);
  const movimentos: LinhaSaida[] = lancMes
    .map((l) => ({
      id: l.id as string, descricao: l.descricao as string, fornecedor: l.fornecedor as string | null, categoria: l.categoria as string, tipo: l.tipo as "entrada" | "saida",
      vencimento: l.vencimento as string, previsto: Number(l.valor), pago: l.situacao === "paga" ? Number(l.valor) : 0, paga: l.situacao === "paga",
    }))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  // Descontos "sócio abre mão" dos pagamentos recebidos no mês.
  const pagas = doMes.filter((c) => c.situacao === "paga" && c.orcamento_id);
  const idsOrc = [...new Set(pagas.map((c) => c.orcamento_id as string))];
  const [{ data: descs }, { data: orcs }] = idsOrc.length
    ? await Promise.all([
        supabase.from("orcamento_descontos").select("orcamento_id, tipo, percentual, socio_id").in("orcamento_id", idsOrc),
        supabase.from("orcamentos").select("id, desconto_percentual").in("id", idsOrc),
      ])
    : [{ data: [] }, { data: [] }];
  const totalPct = Object.fromEntries((orcs ?? []).map((o) => [o.id, Number(o.desconto_percentual)]));
  const renuncias: Renuncia[] = [];
  for (const c of pagas) {
    for (const d of (descs ?? []).filter((x) => x.orcamento_id === c.orcamento_id && x.tipo === "socio" && x.socio_id)) {
      const v = renunciaNoRecebido(Number(c.valor_recebido), Number(d.percentual), totalPct[c.orcamento_id as string] ?? 0);
      if (v > 0) renuncias.push({ socio: d.socio_id as string, valor: v });
    }
  }

  const soma = (f: (l: LinhaSaida) => boolean) => movimentos.filter((l) => l.paga && f(l)).reduce((x, l) => x + Math.round(l.pago * 100), 0) / 100;
  const saidas: Partial<Record<CategoriaSaida, number>> = {};
  for (const k of ["conta_fixa", "custo_terceiros", "comissao", "distribuicao", "outras_saidas"] as CategoriaSaida[]) saidas[k] = soma((l) => l.categoria === k);

  const fechamento: Fechamento = fechaMes({
    recebido: receitas.reduce((x, r) => x + Math.round(r.recebido * 100), 0) / 100,
    outrasEntradas: soma((l) => l.categoria === "outras_entradas"),
    aportes: soma((l) => l.categoria === "aporte"),
    saidas,
    impostoPct: Number(amb?.imposto_pct ?? 6),
    reservaPct: Number(amb?.reserva_pct ?? 20),
    participacoes: (parts ?? []).map((p) => ({ socio: p.socio_id as string, percentual: Number(p.percentual) })).sort((a, b) => b.percentual - a.percentual || a.socio.localeCompare(b.socio)),
    renuncias,
  });
  return { receitas, movimentos, fechamento };
}
