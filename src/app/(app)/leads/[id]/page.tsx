import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, hojeSP, reaisCampo } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { removerLead, salvarLead } from "../acoes";

const ETAPAS = ["novo", "em_contato", "proposta_enviada", "fechado", "perdido"] as const;
type Etapa = (typeof ETAPAS)[number];

type Lead = {
  id: string; cliente_id: string; responsavel_id: string; etapa: Etapa; servico_interesse_id: string | null;
  valor_estimado: number | null; ultimo_contato: string | null; motivo_perda: string | null; observacoes: string | null;
};

/** Criar (/leads/novo, opcionalmente ?cliente=ID) ou editar um lead do ambiente aberto. */
export default async function PaginaLead({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cliente?: string; erro?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const novo = id === "novo";
  if (!novo && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: lead }, { data: clientes }, { data: servicos }, { data: acessos }] = await Promise.all([
    novo ? Promise.resolve({ data: null }) : supabase.from("leads").select("*").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle(),
    supabase.from("clientes").select("id, nome").order("nome"),
    supabase.from("servicos").select("id, nome, categoria, ativo").eq("ambiente_id", ctx.ambiente!).order("categoria").order("nome"),
    supabase.from("acessos").select("usuario_id, perfil").eq("ambiente_id", ctx.ambiente!),
  ]);
  if (!novo && !lead) notFound();
  const l = lead as Lead | null;

  // Quem pode ser responsável: sócio, administrativo ou comercial deste ambiente.
  const idsPessoas = [...new Set([...(acessos ?? []).filter((a) => a.perfil !== "pauta").map((a) => a.usuario_id), ctx.usuarioId, ...(l ? [l.responsavel_id] : [])])];
  const { data: pessoas } = await supabase.from("perfis").select("id, nome, ativo").in("id", idsPessoas).order("nome");
  const { data: eventos } = novo ? { data: [] } : await supabase.from("lead_eventos").select("id, de, para, em").eq("lead_id", id).order("em");

  const listaClientes = clientes ?? [];
  const nomeCliente = l ? (listaClientes.find((c) => c.id === l.cliente_id)?.nome ?? "—") : "";
  const listaServicos = (servicos ?? []).filter((s) => s.ativo || s.id === l?.servico_interesse_id);
  const comercial = ctx.perfil === "comercial";

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {t.lead} · {nomeAmbiente(ctx.ambiente)}
          </div>
          <h1>{novo ? t.novoLead : nomeCliente}</h1>
        </div>
        <div className="acoes">
          {l && l.etapa !== "perdido" && (
            <Link href={`/orcamentos/novo?lead=${l.id}`} className="btn">
              {comercial ? t.pedirOrcamento : t.novoOrcamento}
            </Link>
          )}
          {l && (
            <Link href={`/clientes/${l.cliente_id}`} className="btn fantasma">
              {t.cliente}
            </Link>
          )}
          <Link href="/leads" className="btn fantasma">
            {t.voltar}
          </Link>
        </div>
      </div>

      {sp.erro && (
        <div className="aviso erro" role="alert">
          {t.erroRecusado}
        </div>
      )}

      {novo && listaClientes.length === 0 ? (
        <div className="aviso">
          {t.semClientes}{" "}
          <Link href="/clientes/novo">{t.novoCliente}</Link>
        </div>
      ) : (
        <FormAcao acao={salvarLead}>
          {l && <input type="hidden" name="id" value={l.id} />}

          <div className="linha-2">
            {novo && (
              <div>
                <label className="campo" htmlFor="cliente_id">
                  {t.cliente}
                </label>
                <select id="cliente_id" name="cliente_id" className="entrada" required defaultValue={sp.cliente ?? ""}>
                  <option value="">—</option>
                  {listaClientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="campo" htmlFor="servico_interesse_id">
                {t.servicoInteresse}
              </label>
              <select id="servico_interesse_id" name="servico_interesse_id" className="entrada" defaultValue={l?.servico_interesse_id ?? ""}>
                <option value="">{t.naoDefinido}</option>
                {listaServicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.categoria} · {s.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="linha-3">
            <div>
              <label className="campo" htmlFor="valor_estimado">
                {t.valorEstimado}
              </label>
              <input id="valor_estimado" name="valor_estimado" className="entrada" inputMode="decimal" placeholder="0,00" defaultValue={reaisCampo(l?.valor_estimado != null ? Number(l.valor_estimado) : null)} />
            </div>
            <div>
              <label className="campo" htmlFor="responsavel_id">
                {t.responsavel}
              </label>
              <select id="responsavel_id" name="responsavel_id" className="entrada" defaultValue={l?.responsavel_id ?? ctx.usuarioId} disabled={comercial}>
                {(pessoas ?? []).filter((p) => p.ativo || p.id === l?.responsavel_id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="campo" htmlFor="ultimo_contato">
                {t.ultimoContato}
              </label>
              <input id="ultimo_contato" name="ultimo_contato" type="date" className="entrada" defaultValue={l?.ultimo_contato ?? ""} />
            </div>
          </div>

          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="etapa">
                {t.etapa}
              </label>
              <select id="etapa" name="etapa" className="entrada" defaultValue={l?.etapa ?? "novo"}>
                {ETAPAS.map((e) => (
                  <option key={e} value={e}>
                    {t.etapas[e]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="campo" htmlFor="motivo_perda">
                {t.motivoPerda}
              </label>
              <input id="motivo_perda" name="motivo_perda" className="entrada" defaultValue={l?.motivo_perda ?? ""} aria-describedby="motivo-dica" />
              <div id="motivo-dica" className="dica">
                {t.dicaMotivo}
              </div>
            </div>
          </div>

          <div>
            <label className="campo" htmlFor="observacoes">
              {t.observacoes}
            </label>
            <textarea id="observacoes" name="observacoes" className="entrada" rows={3} defaultValue={l?.observacoes ?? ""} />
          </div>

          <div className="acoes">
            <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
            <Link href="/leads" className="btn fantasma">
              {t.cancelar}
            </Link>
          </div>
        </FormAcao>
      )}

      {!novo && (eventos ?? []).length > 0 && (
        <div className="cartao pilha" style={{ maxWidth: 760 }}>
          <div className="rotulo">{t.historico}</div>
          <ul className="lista-linhas">
            {(eventos ?? []).map((e) => (
              <li key={e.id}>
                <span>{t.historicoLinha(e.de ? t.etapas[e.de as Etapa] : null, t.etapas[e.para as Etapa])}</span>
                <span style={{ color: "var(--texto-2)" }}>{dataCurta(hojeSP(new Date(String(e.em))).toISOString(), true)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!novo && ctx.perfil === "socio" && (
        <details className="cartao" style={{ maxWidth: 760 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>{t.removerLead}</summary>
          <form action={removerLead} className="pilha" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="sub">{t.removerLeadExplica}</p>
            <div>
              <button type="submit" className="btn perigo">
                {t.removerDeVez}
              </button>
            </div>
          </form>
        </details>
      )}
    </>
  );
}
