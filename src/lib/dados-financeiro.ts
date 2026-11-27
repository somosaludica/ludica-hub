import type { createClient } from "@/lib/supabase/server";
import type { AmbienteId } from "@/lib/contexto";
import { hojeSP } from "@/lib/formatos";
import { estadoDe, mesDe, renunciaNoRecebido, type Comprovante, type Mov, type Participacao, type Recebimento, type Renuncia } from "@/lib/financeiro";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Rateio = { nome: string; pct: number };
export type Financeiro = Awaited<ReturnType<typeof carregaFinanceiro>>;

const partesDe = (j: unknown): Participacao[] | null =>
  j && typeof j === "object" ? Object.entries(j as Record<string, number>).map(([socio, percentual]) => ({ socio, percentual: Number(percentual) })) : null;

/**
 * Tudo do financeiro de um ambiente, já no formato do fluxo: contas e entradas lançadas + cobranças
 * (recebida entra no mês do recebimento; aberta, no mês do vencimento), recebimentos para apurar,
 * participações, sócios e meses fechados.
 */
export async function carregaFinanceiro(supabase: Supabase, ambiente: AmbienteId) {
  const hoje = hojeSP().toISOString().slice(0, 10);
  const [{ data: lancs }, { data: cobs }, { data: parts }, { data: amb }, { data: acessos }, { data: fechados }] = await Promise.all([
    supabase.from("lancamentos").select("*").eq("ambiente_id", ambiente),
    supabase.from("cobrancas").select("id, cliente_id, orcamento_id, descricao, vencimento, valor, situacao, pago_em, valor_recebido, apur_imposto_pct, apur_reserva_pct, apur_custos, apur_partes, apur_obs")
      .eq("ambiente_id", ambiente).neq("situacao", "cancelada"),
    supabase.from("participacoes").select("socio_id, percentual").eq("ambiente_id", ambiente),
    supabase.from("ambiente_dados").select("imposto_pct, reserva_pct, cobertura_socio_id, cobertura_nome, rateios").eq("ambiente_id", ambiente).maybeSingle(),
    supabase.from("acessos").select("usuario_id").eq("ambiente_id", ambiente).eq("perfil", "socio"),
    supabase.from("meses_fechados").select("mes, fechado_por, fechado_em").eq("ambiente_id", ambiente),
  ]);
  const participacoes: Participacao[] = (parts ?? []).map((p) => ({ socio: p.socio_id as string, percentual: Number(p.percentual) }));
  const impostoPct = Number(amb?.imposto_pct ?? 6), reservaPct = Number(amb?.reserva_pct ?? 20);

  const idsCli = [...new Set((cobs ?? []).map((x) => x.cliente_id as string))];
  const idsPes = [...new Set([...(acessos ?? []).map((a) => a.usuario_id as string), ...participacoes.map((p) => p.socio), ...(fechados ?? []).map((m) => m.fechado_por as string).filter(Boolean)])];
  const pagasOrc = (cobs ?? []).filter((x) => x.situacao === "paga" && x.orcamento_id);
  const idsOrc = [...new Set(pagasOrc.map((x) => x.orcamento_id as string))];
  const [{ data: cli }, { data: pes }, { data: descs }, { data: orcs }] = await Promise.all([
    idsCli.length ? supabase.from("clientes").select("id, nome").in("id", idsCli) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    idsPes.length ? supabase.from("perfis").select("id, nome").in("id", idsPes).order("nome") : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    idsOrc.length ? supabase.from("orcamento_descontos").select("orcamento_id, tipo, percentual, socio_id").in("orcamento_id", idsOrc) : Promise.resolve({ data: [] as { orcamento_id: string; tipo: string; percentual: number; socio_id: string | null }[] }),
    idsOrc.length ? supabase.from("orcamentos").select("id, desconto_percentual").in("id", idsOrc) : Promise.resolve({ data: [] as { id: string; desconto_percentual: number }[] }),
  ]);
  const cliente = Object.fromEntries((cli ?? []).map((x) => [x.id, x.nome as string]));
  const nomes: Record<string, string> = Object.fromEntries((pes ?? []).map((p) => [p.id, p.nome as string]));
  const idsSocios = new Set([...(acessos ?? []).map((a) => a.usuario_id as string), ...participacoes.map((p) => p.socio)]);
  const socios = (pes ?? []).filter((p) => idsSocios.has(p.id as string)).map((p) => ({ id: p.id as string, nome: p.nome as string }));
  const totalPct = Object.fromEntries((orcs ?? []).map((o) => [o.id, Number(o.desconto_percentual)]));

  const movs: Mov[] = [];
  const recs: Recebimento[] = [];
  for (const l of lancs ?? []) {
    const estado = estadoDe({ situacao: l.situacao, aviso: l.aviso, vencimento: l.vencimento }, hoje);
    const comprovante: Comprovante | null = l.comprovante_caminho ? "anexado" : l.comprovante_nome ? "antigo" : estado !== "pago" || l.tipo === "entrada" ? null : l.sem_comprovante ? "dispensado" : "falta";
    movs.push({
      id: l.id, origem: "lancamento", tipo: l.tipo, categoria: l.categoria, rubrica: l.rubrica, descricao: l.descricao, mes: mesDe(String(l.mes_ref)),
      vencimento: l.vencimento, pagoEm: l.pago_em, valor: Number(l.valor), valorTotal: Number(l.valor_total ?? l.valor), pct: Number(l.parte_pct ?? 100),
      estado, fora: !!l.fora_do_fluxo, comprovante, comprovanteNome: l.comprovante_nome, conta: l.conta_origem, socio: l.socio_id, obs: l.observacao,
    });
    if (l.categoria === "outras_entradas" && l.situacao === "paga" && !l.fora_do_fluxo) {
      recs.push({
        id: l.id, origem: "lancamento", data: String(l.pago_em ?? l.mes_ref), descricao: l.descricao, receita: Number(l.valor),
        impostoPct: Number(l.apur_imposto_pct ?? impostoPct), reservaPct: Number(l.apur_reserva_pct ?? reservaPct), custos: Number(l.apur_custos ?? 0),
        partes: partesDe(l.apur_partes), renuncias: [], obs: l.apur_obs,
      });
    }
  }
  for (const x of cobs ?? []) {
    const paga = x.situacao === "paga";
    const descricao = `${cliente[x.cliente_id as string] ?? "—"} · ${x.descricao}`;
    movs.push({
      id: x.id, origem: "cobranca", tipo: "entrada", categoria: "receita", rubrica: null, descricao, mes: mesDe(String(paga ? x.pago_em : x.vencimento)),
      vencimento: x.vencimento, pagoEm: x.pago_em, valor: Number(paga ? x.valor_recebido : x.valor), valorTotal: Number(x.valor), pct: 100,
      estado: paga ? "pago" : estadoDe({ situacao: "provisionada", aviso: null, vencimento: x.vencimento }, hoje), fora: false,
      comprovante: null, comprovanteNome: null, conta: null, socio: null, obs: null,
    });
    if (!paga) continue;
    const renuncias: Renuncia[] = [];
    for (const d of (descs ?? []).filter((y) => y.orcamento_id === x.orcamento_id && y.tipo === "socio" && y.socio_id)) {
      const v = renunciaNoRecebido(Number(x.valor_recebido), Number(d.percentual), totalPct[x.orcamento_id as string] ?? 0);
      if (v > 0) renuncias.push({ socio: d.socio_id as string, valor: v });
    }
    recs.push({
      id: x.id, origem: "cobranca", data: String(x.pago_em), descricao, receita: Number(x.valor_recebido),
      impostoPct: Number(x.apur_imposto_pct ?? impostoPct), reservaPct: Number(x.apur_reserva_pct ?? reservaPct), custos: Number(x.apur_custos ?? 0),
      partes: partesDe(x.apur_partes), renuncias, obs: x.apur_obs,
    });
  }
  recs.sort((a, b) => a.data.localeCompare(b.data));
  const rateios: Rateio[] = Array.isArray(amb?.rateios) ? (amb!.rateios as Rateio[]).filter((x) => x && typeof x.nome === "string" && Number(x.pct) > 0) : [];
  return {
    hoje, mesAtual: hoje.slice(0, 7), movs, recs, participacoes, socios, nomes, impostoPct, reservaPct, rateios,
    cobertura: (amb?.cobertura_socio_id as string | null) ?? null, coberturaNome: (amb?.cobertura_nome as string | null) ?? null,
    fechados: (fechados ?? []).map((m) => ({ mes: String(m.mes).slice(0, 7), por: m.fechado_por as string | null, em: String(m.fechado_em) })),
  };
}
