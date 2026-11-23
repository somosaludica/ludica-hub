import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, reais, reaisCampo } from "@/lib/formatos";
import { textos, type Idioma } from "@/lib/i18n";
import { numeroOrcamento, totais } from "@/lib/orcamento";
import { dataValida, numeroNota, plano, planoMensal, somaMeses } from "@/lib/cobranca";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { criarCobrancas } from "../../../cobrancas/acoes";

type Item = { descricao: string; unidade: string; quantidade: number; valor_unitario: number };
const inteiro = (v: string | undefined, padrao: number) => (/^\d{1,2}$/.test(v ?? "") && Number(v) >= 1 && Number(v) <= 36 ? Number(v) : padrao);

/**
 * Plano de pagamento de uma proposta aprovada. Primeiro monta (parcelas do projeto e meses do mensal),
 * depois confere linha a linha e cria as cobranças. O desconto da proposta vale por igual nas duas partes.
 */
export default async function Parcelas({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ n?: string; inicio?: string; meses?: string; inicioMensal?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: o } = await supabase.from("orcamentos").select("*").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle();
  if (!o) notFound();
  if (o.situacao !== "aprovado") redirect(`/orcamentos/${id}`);
  const [{ data: its }, { data: cliente }, { data: existentes }] = await Promise.all([
    supabase.from("orcamento_itens").select("descricao, unidade, quantidade, valor_unitario, ordem").eq("orcamento_id", id).order("ordem"),
    supabase.from("clientes").select("nome, idioma_documentos").eq("id", o.cliente_id).maybeSingle(),
    supabase.from("cobrancas").select("id, numero, descricao, vencimento, valor").eq("orcamento_id", id).order("vencimento"),
  ]);
  const itens = (its ?? []) as Item[];
  const pct = Number(o.desconto_percentual);
  const td = textos(((cliente?.idioma_documentos as Idioma) ?? "pt")); // a descrição vai na nota: idioma do cliente
  const projeto = itens.filter((i) => i.unidade !== "mensal");
  const mensais = itens.filter((i) => i.unidade === "mensal");
  const totalProjeto = totais(projeto, pct).total;
  // Em serviço mensal a quantidade é o número de meses; o valor do mês é o unitário com o desconto.
  const valorMes = totais(mensais.map((i) => ({ quantidade: 1, valor_unitario: Number(i.valor_unitario) })), pct).total;
  const mesesPadrao = Math.min(36, Math.max(1, Math.round(Math.max(0, ...mensais.map((i) => Number(i.quantidade))))));
  const totalProposta = totais(itens, pct).total;

  const hoje = hojeSP().toISOString().slice(0, 10);
  const n = inteiro(sp.n, 1);
  const meses = inteiro(sp.meses, mesesPadrao);
  const inicio = dataValida(sp.inicio ?? "") ? sp.inicio! : hoje;
  const inicioMensal = dataValida(sp.inicioMensal ?? "") ? sp.inicioMensal! : somaMeses(hoje, 1);
  const base = o.titulo || projeto.map((i) => i.descricao).join(" + ");
  const linhas = [
    ...plano(totalProjeto, n, inicio, base || numeroOrcamento(ctx.ambiente!, o.numero), td.parcelaDe, o.envio_automatico),
    ...planoMensal(valorMes, meses, inicioMensal, mensais.map((i) => i.descricao).join(" + "), td.mesDe),
  ];
  const soma = linhas.reduce((s, l) => s + Math.round(l.valor * 100), 0) / 100;

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {nomeAmbiente(ctx.ambiente)} · {numeroOrcamento(ctx.ambiente!, o.numero)} · {cliente?.nome ?? "—"}
          </div>
          <h1>{t.planoPagamento}</h1>
        </div>
        <Link href={`/orcamentos/${id}`} className="btn fantasma">
          {t.voltar}
        </Link>
      </div>

      {(existentes ?? []).length > 0 ? (
        <div className="cartao pilha" style={{ maxWidth: 820 }}>
          <p className="sub">{t.jaTemCobrancas}</p>
          <ul className="lista-linhas">
            {(existentes ?? []).map((c) => (
              <li key={c.id}>
                <span>
                  <Link href={`/cobrancas/${c.id}`}>{numeroNota(ctx.ambiente!, c.numero)}</Link> · {c.descricao}
                </span>
                <span>
                  {dataCurta(c.vencimento, true)} · {reais(Number(c.valor))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <form method="get" className="cartao form largo">
            <div className="rotulo">1 · {t.montarParcelas}</div>
            {totalProjeto > 0 && (
              <div className="linha-2">
                <div>
                  <label className="campo" htmlFor="n">
                    {t.parcelasProjeto} ({reais(totalProjeto)})
                  </label>
                  <input id="n" name="n" type="number" min={1} max={36} className="entrada" defaultValue={n} />
                </div>
                <div>
                  <label className="campo" htmlFor="inicio">
                    {t.primeiroVencimento}
                  </label>
                  <input id="inicio" name="inicio" type="date" className="entrada" defaultValue={inicio} />
                </div>
              </div>
            )}
            {valorMes > 0 && (
              <div className="linha-2">
                <div>
                  <label className="campo" htmlFor="meses">
                    {t.mesesMensal} ({reais(valorMes)})
                  </label>
                  <input id="meses" name="meses" type="number" min={1} max={36} className="entrada" defaultValue={meses} />
                </div>
                <div>
                  <label className="campo" htmlFor="inicioMensal">
                    {t.primeiroVencMensal}
                  </label>
                  <input id="inicioMensal" name="inicioMensal" type="date" className="entrada" defaultValue={inicioMensal} />
                </div>
              </div>
            )}
            <div className="acoes">
              <button type="submit" className="btn fantasma">
                {t.montarParcelas}
              </button>
            </div>
          </form>

          <FormAcao acao={criarCobrancas} className="cartao form largo">
            <input type="hidden" name="orcamento_id" value={id} />
            <input type="hidden" name="linhas" value={linhas.length} />
            <div className="rotulo">2 · {t.confirmarParcelas}</div>
            <p className="dica" style={{ margin: 0 }}>
              {t.dicaPlano}
            </p>
            <div className="tabela-caixa" style={{ padding: 0 }}>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>{t.docDescricao}</th>
                    <th style={{ width: 170 }}>{t.colVencimento}</th>
                    <th style={{ width: 150 }}>{t.valorReais}</th>
                    <th style={{ width: 110 }}>{t.envioAuto}</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={`${i}-${l.vencimento}-${l.valor}`}>
                      <td>
                        <input name={`desc_${i}`} className="entrada" aria-label={`${t.docDescricao} ${i + 1}`} defaultValue={l.descricao} />
                      </td>
                      <td data-label={t.colVencimento}>
                        <input name={`venc_${i}`} type="date" className="entrada" aria-label={`${t.colVencimento} ${i + 1}`} defaultValue={l.vencimento} />
                      </td>
                      <td data-label={t.valorReais}>
                        <input name={`valor_${i}`} className="entrada qtd" inputMode="decimal" aria-label={`${t.valorReais} ${i + 1}`} defaultValue={reaisCampo(l.valor)} />
                      </td>
                      <td data-label={t.envioAuto}>
                        <input type="checkbox" name={`auto_${i}`} aria-label={`${t.envioAuto} ${i + 1}`} defaultChecked={l.automatico} style={{ width: 20, height: 20 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="resumo-total">
              <dt>{t.totalProposta}</dt>
              <dd>{reais(totalProposta)}</dd>
              <dt className="forte">{t.somaParcelas}</dt>
              <dd className="forte">{reais(soma)}</dd>
            </dl>
            <div className="acoes">
              <BotaoEnviar rotulo={t.confirmarParcelas} enviando={t.salvando} />
            </div>
          </FormAcao>
        </>
      )}
    </>
  );
}
