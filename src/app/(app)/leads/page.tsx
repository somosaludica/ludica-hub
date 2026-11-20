import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { avancarLead } from "./acoes";

const ETAPAS = ["novo", "em_contato", "proposta_enviada", "fechado", "perdido"] as const;
type Etapa = (typeof ETAPAS)[number];
const PROXIMA: Partial<Record<Etapa, Etapa>> = { novo: "em_contato", em_contato: "proposta_enviada", proposta_enviada: "fechado" };

type Lead = {
  id: string; cliente_id: string; responsavel_id: string; etapa: Etapa; servico_interesse_id: string | null;
  valor_estimado: number | null; ultimo_contato: string | null;
};

/** Painel de leads do ambiente aberto. Sócio e administrativo veem todos; o comercial, só os dele. */
export default async function Leads({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const t = textos(ctx.idioma);
  const { salvo } = await searchParams;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, cliente_id, responsavel_id, etapa, servico_interesse_id, valor_estimado, ultimo_contato")
    .eq("ambiente_id", ctx.ambiente!)
    .order("criado_em", { ascending: false });
  const leads = (data ?? []) as Lead[];

  const ids = (k: keyof Lead) => [...new Set(leads.map((l) => l[k]).filter(Boolean))] as string[];
  const [cli, ser, pes] = await Promise.all([
    ids("cliente_id").length ? supabase.from("clientes").select("id, nome").in("id", ids("cliente_id")) : { data: [] },
    ids("servico_interesse_id").length ? supabase.from("servicos").select("id, nome").in("id", ids("servico_interesse_id")) : { data: [] },
    ids("responsavel_id").length ? supabase.from("perfis").select("id, nome").in("id", ids("responsavel_id")) : { data: [] },
  ]);
  const nome = (lista: { id: string; nome: string }[] | null) => Object.fromEntries((lista ?? []).map((x) => [x.id, x.nome]));
  const clientes = nome(cli.data), servicos = nome(ser.data), pessoas = nome(pes.data);

  const abertos = leads.filter((l) => l.etapa !== "fechado" && l.etapa !== "perdido");
  const fechados = leads.filter((l) => l.etapa === "fechado").length;
  const perdidos = leads.filter((l) => l.etapa === "perdido").length;
  const valorAberto = abertos.reduce((s, l) => s + Number(l.valor_estimado ?? 0), 0);
  const conversao = fechados + perdidos > 0 ? `${Math.round((fechados / (fechados + perdidos)) * 100)}%` : "—";

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.leadsTitulo}</h1>
        </div>
        <Link href="/leads/novo" className="btn">
          {t.novoLead}
        </Link>
      </div>

      {salvo && (
        <div className="aviso ok" role="status">
          {salvo === "removido" ? t.leadRemovido : t.leadSalvo}
        </div>
      )}
      {error && (
        <div className="aviso erro" role="alert">
          {t.erroCarregar}
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span className="rotulo">{t.kpiAbertos}</span>
          <strong>{abertos.length}</strong>
        </div>
        <div className="kpi">
          <span className="rotulo">{t.kpiValor}</span>
          <strong>{reais(valorAberto)}</strong>
        </div>
        <div className="kpi">
          <span className="rotulo">{t.kpiFechados}</span>
          <strong>{fechados}</strong>
        </div>
        <div className="kpi">
          <span className="rotulo">{t.kpiConversao}</span>
          <strong>{conversao}</strong>
          <span className="dica">{t.dicaConversao}</span>
        </div>
      </div>

      <div className="quadro">
        {ETAPAS.map((etapa) => {
          const daEtapa = leads.filter((l) => l.etapa === etapa);
          const proxima = PROXIMA[etapa];
          return (
            <section key={etapa} className="coluna" aria-label={t.etapas[etapa]}>
              <h2>
                <span>{t.etapas[etapa]}</span>
                <span>{daEtapa.length}</span>
              </h2>
              {daEtapa.length === 0 && <p className="dica" style={{ margin: "0 4px 4px" }}>{t.colunaVazia}</p>}
              {daEtapa.map((l) => (
                <div key={l.id} className="cartao-lead">
                  <Link href={`/leads/${l.id}`}>{clientes[l.cliente_id] ?? "—"}</Link>
                  <span>{l.servico_interesse_id ? (servicos[l.servico_interesse_id] ?? t.naoDefinido) : t.naoDefinido}</span>
                  {l.valor_estimado != null && <strong>{reais(Number(l.valor_estimado))}</strong>}
                  <span style={{ color: "var(--texto-2)" }}>
                    {pessoas[l.responsavel_id] ?? ""}
                    {l.ultimo_contato ? ` · ${dataCurta(l.ultimo_contato)}` : ""}
                  </span>
                  {proxima && (
                    <form action={avancarLead}>
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="btn fantasma">
                        {t.moverPara(t.etapas[proxima])}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
