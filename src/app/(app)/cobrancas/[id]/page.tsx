import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, reais, reaisCampo } from "@/lib/formatos";
import { LANG, textos, type Idioma } from "@/lib/i18n";
import { diasAte, numeroNota, numeroWhatsapp, vistaCobranca, type SituacaoCobranca } from "@/lib/cobranca";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import BotaoImprimir from "@/componentes/botao-imprimir";
import { acaoCobranca, darBaixa, salvarCobranca } from "../acoes";

const doc = (d: string | null) =>
  !d ? "" : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

/** Uma cobrança: a nota de débito, o envio, a baixa, a nota fiscal e o histórico. */
export default async function Cobranca({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase.from("cobrancas").select("*").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle();
  if (!c) notFound();
  const [{ data: cliente }, { data: emissor }, { data: eventos }] = await Promise.all([
    supabase.from("clientes").select("nome, documento, email, whatsapp, aceita_whatsapp, idioma_documentos").eq("id", c.cliente_id).maybeSingle(),
    supabase.from("ambiente_dados").select("razao_social, cnpj, endereco, conta_recebimento").eq("ambiente_id", ctx.ambiente!).maybeSingle(),
    supabase.from("cobranca_eventos").select("id, tipo, canal, detalhe, por, em").eq("cobranca_id", id).order("em", { ascending: false }),
  ]);
  const idsPor = [...new Set((eventos ?? []).map((e) => e.por).filter(Boolean))] as string[];
  const { data: pes } = idsPor.length ? await supabase.from("perfis").select("id, nome").in("id", idsPor) : { data: [] };
  const pessoas = Object.fromEntries((pes ?? []).map((p) => [p.id, p.nome]));

  const hoje = hojeSP();
  const situacao = c.situacao as SituacaoCobranca;
  const vista = vistaCobranca(situacao, c.vencimento, hoje);
  const dias = diasAte(c.vencimento, hoje);
  const numero = numeroNota(ctx.ambiente!, c.numero);
  const idiomaDoc = ((cliente?.idioma_documentos as Idioma) ?? "pt");
  const td = textos(idiomaDoc);
  const nome = (cliente?.nome ?? "").split(" ")[0];
  const venc = dataCurta(c.vencimento, true);
  const valor = reais(Number(c.valor));

  // Mensagem pronta, no idioma do cliente, conforme o momento da cobrança.
  const mensagem = vista === "paga" ? td.msgPago(nome, numero, reais(Number(c.valor_recebido)))
    : vista === "vencida" ? td.msgAtraso(nome, numero, valor, venc)
    : td.msgNota(nome, numero, c.descricao, valor, venc);
  const wpp = numeroWhatsapp(cliente?.whatsapp ?? null);
  const linkWpp = wpp ? `https://wa.me/${wpp}?text=${encodeURIComponent(mensagem)}` : null;
  const linkEmail = cliente?.email ? `mailto:${cliente.email}?subject=${encodeURIComponent(td.assuntoNota(numero))}&body=${encodeURIComponent(mensagem)}` : null;

  const botao = (acao: string, rotulo: string, classe = "btn fantasma", extra: Record<string, string> = {}) => (
    <form action={acaoCobranca}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="acao" value={acao} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={classe}>
        {rotulo}
      </button>
    </form>
  );

  return (
    <>
      <div className="cab nao-imprime">
        <div>
          <div className="rotulo">
            {nomeAmbiente(ctx.ambiente)} · {cliente?.nome ?? "—"}
          </div>
          <h1>
            {t.cobranca} {numero}
          </h1>
        </div>
        <div className="acoes">
          <span className={`selo ${vista === "paga" ? "ok" : vista === "vencida" ? "alerta" : vista === "cancelada" ? "off" : ""}`} style={{ alignSelf: "center" }}>
            {t.vistas[vista]}
            {vista === "vencida" ? ` · ${t.vencidaHa(-dias)}` : vista === "a_vencer" ? ` · ${t.venceEm(dias)}` : vista === "paga" ? ` · ${t.pagaEm(dataCurta(c.pago_em, true))}` : ""}
          </span>
          <BotaoImprimir rotulo={t.imprimir} />
          <Link href="/cobrancas" className="btn fantasma">
            {t.voltar}
          </Link>
        </div>
      </div>

      {sp.ok && (
        <div className="aviso ok nao-imprime" role="status">
          {sp.ok === "baixa" ? t.baixaFeita : sp.ok === "envio" ? t.envioRegistrado : t.cobrancaSalva}
        </div>
      )}
      {sp.erro && (
        <div className="aviso erro nao-imprime" role="alert">
          {t.erroRecusado}
        </div>
      )}
      {!emissor?.conta_recebimento && (
        <div className="aviso erro nao-imprime" role="status">
          {t.avisoSemDados} <Link href="/cobrancas/dados">{t.preencherDados}</Link>
        </div>
      )}

      <article className="doc" lang={LANG[idiomaDoc]}>
        <header className="doc-topo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-claro.png" alt="Lúdica" />
          <h1 className="doc-titulo">
            {td.docNota} {numero}
          </h1>
        </header>
        <div className="doc-corpo">
          <div className="doc-cond">
            <section>
              <h2>{td.docEmissor}</h2>
              <p>{emissor?.razao_social ?? "Lúdica"}</p>
              {emissor?.cnpj && <p>CNPJ {doc(emissor.cnpj)}</p>}
              {emissor?.endereco && <p>{emissor.endereco}</p>}
            </section>
            <section>
              <h2>{td.docCliente}</h2>
              <p>{cliente?.nome}</p>
              {cliente?.documento && <p>{doc(cliente.documento)}</p>}
            </section>
          </div>
          <section>
            <h2>{td.docDescricao}</h2>
            <p>{c.descricao}</p>
          </section>
          <div className="doc-invest">
            <div className="doc-nota-valor">
              <div>
                <h2>{td.docVencimento}</h2>
                <p style={{ fontSize: 16, fontWeight: 600 }}>{venc}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <h2>{td.docValor}</h2>
                <div className="doc-valor">{valor}</div>
              </div>
            </div>
          </div>
          {emissor?.conta_recebimento && (
            <section>
              <h2>{td.docDadosPagamento}</h2>
              <pre>{emissor.conta_recebimento}</pre>
            </section>
          )}
        </div>
        <footer className="doc-rodape">LÚDICA · WE MAKE YOU MATTER</footer>
      </article>

      {situacao !== "cancelada" && (
        <div className="cartao pilha nao-imprime" style={{ maxWidth: 820 }}>
          <div className="rotulo">{t.enviarAgora}</div>
          <div className="msg-caixa" lang={LANG[idiomaDoc]}>
            {mensagem}
          </div>
          {!linkWpp && !linkEmail ? (
            <p className="sub">{t.semContato}</p>
          ) : (
            <>
              <div className="acoes">
                {linkWpp && (
                  <a className="btn" href={linkWpp} target="_blank" rel="noopener noreferrer">
                    {t.abrirWhatsapp}
                  </a>
                )}
                {linkEmail && (
                  <a className="btn fantasma" href={linkEmail} target="_blank" rel="noopener noreferrer">
                    {t.abrirEmail}
                  </a>
                )}
              </div>
              <p className="sub">{t.dicaEnvio}</p>
              <div className="acoes">
                {linkWpp && botao("envio", t.registrarWhatsapp, "btn fantasma", { canal: "whatsapp" })}
                {linkEmail && botao("envio", t.registrarEmail, "btn fantasma", { canal: "email" })}
              </div>
            </>
          )}
        </div>
      )}

      {situacao === "aberta" && (
        <>
          <FormAcao acao={darBaixa} className="cartao form nao-imprime">
            <input type="hidden" name="id" value={id} />
            <div className="rotulo">{t.darBaixa}</div>
            <div className="linha-2">
              <div>
                <label className="campo" htmlFor="pago_em">
                  {t.dataPagamento}
                </label>
                <input id="pago_em" name="pago_em" type="date" className="entrada" required defaultValue={hoje.toISOString().slice(0, 10)} />
              </div>
              <div>
                <label className="campo" htmlFor="valor_recebido">
                  {t.valorRecebido}
                </label>
                <input id="valor_recebido" name="valor_recebido" className="entrada" inputMode="decimal" required defaultValue={reaisCampo(Number(c.valor))} />
              </div>
            </div>
            <div className="acoes">
              <BotaoEnviar rotulo={t.darBaixa} enviando={t.salvando} />
            </div>
          </FormAcao>

          <details className="cartao nao-imprime" style={{ maxWidth: 760 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>{t.editarCobranca}</summary>
            <FormAcao acao={salvarCobranca} className="form">
              <input type="hidden" name="id" value={id} />
              <div>
                <label className="campo" htmlFor="descricao">
                  {t.docDescricao}
                </label>
                <input id="descricao" name="descricao" className="entrada" required defaultValue={c.descricao} />
              </div>
              <div className="linha-2">
                <div>
                  <label className="campo" htmlFor="vencimento">
                    {t.colVencimento}
                  </label>
                  <input id="vencimento" name="vencimento" type="date" className="entrada" required defaultValue={c.vencimento} />
                </div>
                <div>
                  <label className="campo" htmlFor="valor">
                    {t.valorReais}
                  </label>
                  <input id="valor" name="valor" className="entrada" inputMode="decimal" required defaultValue={reaisCampo(Number(c.valor))} />
                </div>
              </div>
              <label className="marcar">
                <input type="checkbox" name="envio_automatico" defaultChecked={c.envio_automatico} />
                {t.envioAuto}
              </label>
              <p className="dica" style={{ margin: 0 }}>
                {t.dicaEnvioAuto}
              </p>
              <div className="acoes">
                <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
              </div>
            </FormAcao>
            <div className="pilha" style={{ marginTop: 16 }}>
              <p className="sub">{t.dicaCancelar}</p>
              <div className="acoes">{botao("cancelar", t.cancelarCobranca, "btn perigo")}</div>
            </div>
          </details>
        </>
      )}

      {situacao !== "aberta" && ctx.perfil === "socio" && (
        <div className="cartao pilha nao-imprime" style={{ maxWidth: 760 }}>
          <p className="sub">{t.dicaCancelar}</p>
          <div className="acoes">{situacao === "paga" ? botao("estornar", t.estornarBaixa, "btn perigo") : botao("reabrir", t.reabrirCobranca)}</div>
        </div>
      )}

      <form action={acaoCobranca} className="cartao form nao-imprime">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="acao" value="nf" />
        <div className="rotulo">{t.notaFiscal}</div>
        <div className="linha-2">
          <div>
            <label className="campo" htmlFor="nf_situacao">
              {t.colSituacao}
            </label>
            <select id="nf_situacao" name="nf_situacao" className="entrada" defaultValue={c.nf_situacao}>
              {(["nao_solicitada", "solicitada", "emitida"] as const).map((n) => (
                <option key={n} value={n}>
                  {t.nfSituacoes[n]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="campo" htmlFor="nf_numero">
              {t.numeroNF}
            </label>
            <input id="nf_numero" name="nf_numero" className="entrada" defaultValue={c.nf_numero ?? ""} />
          </div>
        </div>
        <div className="acoes">
          <button type="submit" className="btn fantasma">
            {t.salvar}
          </button>
        </div>
      </form>

      <div className="cartao pilha nao-imprime" style={{ maxWidth: 760 }}>
        <div className="rotulo">{t.historico}</div>
        <ul className="lista-linhas">
          {(eventos ?? []).map((e) => (
            <li key={e.id}>
              <span>
                {t.eventosCobranca[e.tipo as "criada"]}
                {e.canal ? ` · ${e.canal === "email" ? t.email : t.whatsapp}` : ""}
                {e.detalhe ? ` · ${e.detalhe}` : ""}
              </span>
              <span style={{ color: "var(--texto-2)" }}>
                {e.por && pessoas[e.por] ? `${pessoas[e.por]} · ` : ""}
                {dataCurta(hojeSP(new Date(String(e.em))).toISOString(), true)}
              </span>
            </li>
          ))}
        </ul>
        {c.orcamento_id && (
          <div>
            <Link href={`/orcamentos/${c.orcamento_id}`}>{t.proposta}</Link>
          </div>
        )}
      </div>
    </>
  );
}
