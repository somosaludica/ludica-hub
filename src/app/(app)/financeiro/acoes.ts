"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contexto, type Contexto } from "@/lib/contexto";
import { hojeSP, lerReais } from "@/lib/formatos";
import { campo, falha, opcional } from "@/lib/form";
import { textos } from "@/lib/i18n";
import { dataValida } from "@/lib/cobranca";
import { mesDe, mesValido, parteDoAmbiente, porMes, mesVazio, posicao, resultadoPrevisto, resultadoReal, somaMes } from "@/lib/financeiro";
import { lerPercentual } from "@/lib/orcamento";
import { carregaFinanceiro } from "@/lib/dados-financeiro";
import type { Estado } from "@/componentes/form-acao";

const gestor = (ctx: Contexto) => ctx.perfil === "socio" || ctx.perfil === "administrativo";
const SAIDAS = ["conta_fixa", "custo_terceiros", "comissao", "distribuicao", "outras_saidas"];
const ENTRADAS = ["outras_entradas", "aporte"];
const ESTADOS = ["a_vencer", "pago", "em_atraso", "a_confirmar"];
const ARQUIVOS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
const LIMITE_ARQUIVO = 4 * 1024 * 1024;
const BUCKET = "comprovantes";
const fechado = (msg: string | undefined) => /fechado/.test(msg ?? "");
/** Só volta para dentro do financeiro. */
const volta = (f: FormData, padrao = "/financeiro/fluxo") => (/^\/financeiro(\/[a-z]+)?(\?[\w=&%.-]*)?$/.test(campo(f, "volta")) ? campo(f, "volta") : padrao);
const com = (url: string, extra: string) => `${url}${url.includes("?") ? "&" : "?"}${extra}`;
/** Percentual de rateio: aceita muitas casas (aluguel pela metragem = 38,0228%). */
function lerParte(texto: string): number | null {
  const t = texto.trim().replace("%", "").replace(",", ".");
  if (!t) return 100;
  if (!/^\d{1,3}(\.\d{1,6})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100 ? n : null;
}

/** Cria (podendo repetir por N meses) ou edita uma conta, entrada, repasse ou aporte, com o comprovante. */
export async function salvarLancamento(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const id = campo(f, "id");
  const categoria = campo(f, "categoria");
  const tipo = ENTRADAS.includes(categoria) ? "entrada" : SAIDAS.includes(categoria) ? "saida" : null;
  const descricao = campo(f, "descricao");
  const vencimento = campo(f, "vencimento");
  const estado = campo(f, "estado");
  const total = lerReais(campo(f, "valor_total"));
  const parte = lerParte(campo(f, "parte_pct"));
  const deSocio = categoria === "distribuicao" || categoria === "aporte";
  const socio = deSocio ? campo(f, "socio_id") : "";
  const paga = estado === "pago";
  const pagoEm = campo(f, "pago_em");
  const repetir = id ? 1 : Number(campo(f, "repetir") || "1");
  const arquivo = f.get("comprovante");
  const novoArquivo = arquivo instanceof File && arquivo.size > 0 ? arquivo : null;
  // Repasse e aporte valem no mês em que o dinheiro andou.
  const mes = deSocio && paga && dataValida(pagoEm) ? mesDe(pagoEm) : campo(f, "mes_ref") || (dataValida(vencimento) ? mesDe(vencimento) : "");

  if (!tipo || !ESTADOS.includes(estado)) return falha(f, t.erroRecusado);
  if (!descricao) return falha(f, t.erroDescricao);
  if (!mesValido(mes)) return falha(f, t.erroMesRef);
  if ((vencimento && !dataValida(vencimento)) || (pagoEm && !dataValida(pagoEm))) return falha(f, t.erroData);
  if (total == null || total <= 0) return falha(f, t.erroValor);
  if (parte == null) return falha(f, t.erroParte);
  if (deSocio && ctx.perfil !== "socio") return falha(f, t.erroSoSocioLanc);
  if (deSocio && !socio) return falha(f, t.erroSocioLanc);
  if (!Number.isInteger(repetir) || repetir < 1 || repetir > 36) return falha(f, t.erroRepetir);
  if (novoArquivo && (!ARQUIVOS[novoArquivo.type] || novoArquivo.size > LIMITE_ARQUIVO)) return falha(f, t.erroArquivo);

  const dados = {
    categoria, descricao, rubrica: opcional(f, "rubrica"), mes_ref: `${mes}-01`, vencimento: vencimento || null,
    valor_total: total, parte_pct: parte, valor: parteDoAmbiente(total, parte),
    situacao: paga ? "paga" : "provisionada", pago_em: paga ? pagoEm || null : null,
    aviso: estado === "em_atraso" || estado === "a_confirmar" ? estado : null,
    conta_origem: opcional(f, "conta_origem"), observacao: opcional(f, "observacao"), socio_id: socio || null,
    fora_do_fluxo: f.get("fora_do_fluxo") === "on", sem_comprovante: f.get("sem_comprovante") === "on",
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("lancamentos").update(dados).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id, comprovante_caminho")
    : await supabase.from("lancamentos").insert(
        Array.from({ length: repetir }, (_, i) => ({
          ...dados, tipo, ambiente_id: ctx.ambiente!, mes_ref: `${somaMes(mes, i)}-01`,
          vencimento: vencimento ? `${somaMes(mesDe(vencimento), i)}-${vencimento.slice(8)}` : null,
          // nas repetições só a primeira nasce com o estado escolhido; as outras são previsão
          ...(i === 0 ? {} : { situacao: "provisionada", pago_em: null, aviso: null, sem_comprovante: false }),
        })),
      ).select("id, comprovante_caminho");
  if (error) return falha(f, fechado(error.message) ? t.erroMesFechado : error.code === "P0001" ? t.erroSoSocioLanc : t.erroSalvar);
  if (!data?.length) return falha(f, t.erroRecusado);

  // Comprovante: guarda o arquivo novo, ou tira o que estava.
  const alvo = data[0] as { id: string; comprovante_caminho: string | null };
  const destino = com(volta(f, `/financeiro/fluxo`), "ok=salvo");
  revalidatePath("/financeiro", "layout");
  if (novoArquivo) {
    const caminho = `${ctx.ambiente}/${alvo.id}/${Date.now()}.${ARQUIVOS[novoArquivo.type]}`;
    const envio = await supabase.storage.from(BUCKET).upload(caminho, novoArquivo, { contentType: novoArquivo.type });
    const grava = envio.error ? envio : await supabase.from("lancamentos").update({ comprovante_caminho: caminho, comprovante_nome: novoArquivo.name.slice(0, 120), sem_comprovante: false }).eq("id", alvo.id).select("id");
    if (grava.error) redirect(`/financeiro/lancamentos/${alvo.id}?erro=comprovante`);
    if (alvo.comprovante_caminho) await supabase.storage.from(BUCKET).remove([alvo.comprovante_caminho]);
  } else if (f.get("remover_comprovante") === "on") {
    await supabase.from("lancamentos").update({ comprovante_caminho: null, comprovante_nome: null }).eq("id", alvo.id);
    if (alvo.comprovante_caminho) await supabase.storage.from(BUCKET).remove([alvo.comprovante_caminho]);
  }
  redirect(destino);
}

/** Marcar pago, voltar para em aberto ou remover. */
export async function acaoLancamento(f: FormData) {
  const ctx = await contexto();
  if (!gestor(ctx)) redirect("/");
  const id = campo(f, "id");
  const acao = campo(f, "acao");
  const supabase = await createClient();
  const alvo = supabase.from("lancamentos");
  const r = acao === "pagar"
    ? await alvo.update({ situacao: "paga", pago_em: hojeSP().toISOString().slice(0, 10) }).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id, comprovante_caminho")
    : acao === "provisionar"
      ? await alvo.update({ situacao: "provisionada", pago_em: null }).eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id, comprovante_caminho")
      : await alvo.delete().eq("id", id).eq("ambiente_id", ctx.ambiente!).select("id, comprovante_caminho");
  revalidatePath("/financeiro", "layout");
  if (r.error || !r.data?.length) redirect(`/financeiro/lancamentos/${id}?erro=${fechado(r.error?.message) ? "fechado" : "1"}`);
  const caminho = (r.data[0] as { comprovante_caminho: string | null }).comprovante_caminho;
  if (acao === "remover" && caminho) await supabase.storage.from(BUCKET).remove([caminho]);
  redirect(com(volta(f), `ok=${acao === "remover" ? "removido" : "salvo"}`));
}

/** Ajusta a apuração de um recebimento: imposto, reserva e custos do projeto. */
export async function salvarApuracao(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const tabela = campo(f, "origem") === "cobranca" ? "cobrancas" : "lancamentos";
  const imposto = lerPercentual(campo(f, "imposto_pct"));
  const reserva = lerPercentual(campo(f, "reserva_pct"));
  const custos = lerReais(campo(f, "custos") || "0");
  if (imposto == null || reserva == null || imposto + reserva > 100) return falha(f, t.erroPercentual);
  if (custos == null || custos < 0) return falha(f, t.erroValor);
  const supabase = await createClient();
  const { data, error } = await supabase.from(tabela)
    .update({ apur_imposto_pct: imposto, apur_reserva_pct: reserva, apur_custos: custos, apur_obs: opcional(f, "obs") })
    .eq("id", campo(f, "id")).eq("ambiente_id", ctx.ambiente!).select("id");
  if (error) return falha(f, fechado(error.message) ? t.erroMesFechado : t.erroSalvar);
  if (!data?.length) return falha(f, t.erroRecusado);
  revalidatePath("/financeiro", "layout");
  redirect("/financeiro/socios?ok=apuracao");
}

/** Fecha o mês guardando a fotografia do resultado, ou reabre (só sócio; regra do banco). */
export async function fecharOuReabrir(f: FormData) {
  const ctx = await contexto();
  if (!gestor(ctx)) redirect("/");
  const mes = campo(f, "mes");
  if (!mesValido(mes)) redirect("/financeiro/fechamento");
  const supabase = await createClient();
  let erro = "";
  if (campo(f, "acao") === "reabrir") {
    const { data, error } = await supabase.from("meses_fechados").delete().eq("ambiente_id", ctx.ambiente!).eq("mes", `${mes}-01`).select("mes");
    if (error || !data?.length) erro = "1";
  } else {
    const fin = await carregaFinanceiro(supabase, ctx.ambiente!);
    const linha = porMes(fin.movs, fin.recs, fin.participacoes).find((l) => l.mes === mes) ?? mesVazio(mes);
    const resultado = { ...linha, resultadoReal: resultadoReal(linha), resultadoPrevisto: resultadoPrevisto(linha), posicao: posicao(fin) };
    const { error } = await supabase.from("meses_fechados").insert({ ambiente_id: ctx.ambiente!, mes: `${mes}-01`, resultado });
    if (error) erro = /não começou/.test(error.message) ? "futuro" : "1";
  }
  revalidatePath("/financeiro", "layout");
  redirect(`/financeiro/fechamento?mes=${mes}&${erro ? `erro=${erro}` : `ok=${campo(f, "acao") === "reabrir" ? "reaberto" : "fechado"}`}`);
}

/** Participação de cada sócio no lucro do ambiente. Precisa somar 100%. */
export async function salvarParticipacoes(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (ctx.perfil !== "socio") return falha(f, t.erroRecusado);
  const supabase = await createClient();
  const [{ data: socios }, { data: atuais }] = await Promise.all([
    supabase.from("acessos").select("usuario_id").eq("ambiente_id", ctx.ambiente!).eq("perfil", "socio"),
    supabase.from("participacoes").select("socio_id, percentual").eq("ambiente_id", ctx.ambiente!),
  ]);
  const antes = Object.fromEntries((atuais ?? []).map((p) => [p.socio_id, Number(p.percentual)]));
  const novas: { socio: string; pct: number; delta: number }[] = [];
  for (const s of socios ?? []) {
    const pct = lerPercentual(campo(f, `pct_${s.usuario_id}`));
    if (pct == null) return falha(f, t.erroPercentual);
    novas.push({ socio: s.usuario_id as string, pct, delta: pct - (antes[s.usuario_id] ?? 0) });
  }
  if (Math.abs(novas.reduce((x, n) => x + n.pct, 0) - 100) > 0.005) return falha(f, t.erroSoma100);
  // Primeiro quem diminui, para a soma nunca passar de 100% no meio do caminho.
  for (const n of novas.sort((a, b) => a.delta - b.delta)) {
    const r = n.pct === 0
      ? await supabase.from("participacoes").delete().eq("ambiente_id", ctx.ambiente!).eq("socio_id", n.socio)
      : await supabase.from("participacoes").upsert({ ambiente_id: ctx.ambiente!, socio_id: n.socio, percentual: n.pct });
    if (r.error) return falha(f, t.erroSalvar);
  }
  revalidatePath("/financeiro", "layout");
  redirect("/financeiro/socios?ok=participacoes");
}

/** Imposto, fundo de reserva e quem cobre a falta de caixa (só sócio). */
export async function salvarTaxas(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (ctx.perfil !== "socio") return falha(f, t.erroRecusado);
  const imposto = lerPercentual(campo(f, "imposto_pct"));
  const reserva = lerPercentual(campo(f, "reserva_pct"));
  if (imposto == null || reserva == null || imposto + reserva > 100) return falha(f, t.erroPercentual);
  const cobertura = campo(f, "cobertura_socio_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("ambiente_dados")
    .update({ imposto_pct: imposto, reserva_pct: reserva, cobertura_socio_id: cobertura || null, cobertura_nome: cobertura ? opcional(f, "cobertura_nome") : null })
    .eq("ambiente_id", ctx.ambiente!).select("ambiente_id");
  if (error || !data?.length) return falha(f, t.erroSalvar);
  revalidatePath("/financeiro", "layout");
  redirect("/financeiro/socios?ok=taxas");
}

/** Atalhos de rateio do formulário de conta: nome + percentual do ambiente (até 4). */
export async function salvarRateios(_: Estado, f: FormData): Promise<Estado> {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  if (!gestor(ctx)) return falha(f, t.erroRecusado);
  const rateios: { nome: string; pct: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const nome = campo(f, `rateio_nome_${i}`);
    const pct = lerParte(campo(f, `rateio_pct_${i}`) || "0");
    if (!nome) continue;
    if (pct == null) return falha(f, t.erroParte);
    rateios.push({ nome: nome.slice(0, 60), pct });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("ambiente_dados").update({ rateios }).eq("ambiente_id", ctx.ambiente!).select("ambiente_id");
  if (error || !data?.length) return falha(f, t.erroSalvar);
  revalidatePath("/financeiro", "layout");
  redirect("/financeiro/fluxo?ok=rateios");
}
