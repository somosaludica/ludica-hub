import { createClient } from "@/lib/supabase/server";
import { contexto, AMBIENTES, nomeAmbiente, type AmbienteId } from "@/lib/contexto";
import Link from "next/link";
import { diasAteAniversario, hojeSP, reais } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { trocarAmbiente } from "./acoes";


/**
 * Início. Por enquanto: os ambientes de cada pessoa e o atalho para trocar.
 * O painel financeiro (faturado, a receber, vencido, metas, alertas e agenda do dia)
 * entra aqui quando a cobrança e o financeiro existirem (fase 3).
 */
export default async function Inicio({ searchParams }: { searchParams: Promise<{ "sem-acesso"?: string }> }) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams]);
  const t = textos(ctx.idioma);
  const supabase = await createClient();
  const { data: servicos } = await supabase.from("servicos").select("ambiente_id").eq("ativo", true);
  const qtd = (id: AmbienteId) => (servicos ?? []).filter((s) => s.ambiente_id === id).length;
  const meus = AMBIENTES.filter((a) => ctx.acessos[a.id]);

  // Resumo financeiro do ambiente aberto (sócio e administrativo). O banco já filtra por perfil.
  const financeiro = ctx.perfil === "socio" || ctx.perfil === "administrativo";
  let aReceber = 0, vencido = 0, recebidoMes = 0;
  if (financeiro) {
    const { data: cobs } = await supabase.from("cobrancas").select("valor, vencimento, situacao, pago_em, valor_recebido").eq("ambiente_id", ctx.ambiente!);
    const dia = hojeSP().toISOString().slice(0, 10);
    for (const c of cobs ?? []) {
      if (c.situacao === "aberta") {
        aReceber += Number(c.valor);
        if (c.vencimento < dia) vencido += Number(c.valor);
      } else if (c.situacao === "paga" && String(c.pago_em).startsWith(dia.slice(0, 7))) recebidoMes += Number(c.valor_recebido);
    }
  }

  // Aniversários da semana: aviso para os sócios.
  let aniversarios: { id: string; nome: string; dias: number }[] = [];
  if (ctx.socioAlgum) {
    const { data: comData } = await supabase.from("clientes").select("id, nome, nascimento").not("nascimento", "is", null);
    const hoje = hojeSP();
    aniversarios = (comData ?? [])
      .map((c) => ({ id: c.id as string, nome: c.nome as string, dias: diasAteAniversario(c.nascimento as string, hoje) }))
      .filter((c) => c.dias <= 7)
      .sort((a, b) => a.dias - b.dias);
  }
  const descricao: Record<AmbienteId, string> = { hub: t.descHub, music: t.descMusic, mkt: t.descMkt };

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {t.ola}, {ctx.nome.split(" ")[0]}
          </div>
          <h1>{t.inicio}</h1>
        </div>
      </div>

      {sp["sem-acesso"] && (
        <div className="aviso" role="status">
          {t.paginaSemAcesso}
        </div>
      )}

      {aniversarios.length > 0 && (
        <div className="cartao pilha">
          <div className="rotulo">{t.aniversarios}</div>
          <ul className="lista-linhas">
            {aniversarios.map((c) => (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`}>
                  {c.dias === 0 ? t.aniversarioHoje(c.nome) : c.dias === 1 ? t.aniversarioAmanha(c.nome) : t.aniversarioSemana(c.nome, c.dias)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {financeiro && (
        <div className="kpis">
          <Link href="/cobrancas" className="kpi" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="rotulo">
              {t.kpiAReceber} · {nomeAmbiente(ctx.ambiente)}
            </span>
            <strong>{reais(aReceber)}</strong>
          </Link>
          <Link href="/cobrancas?s=vencida" className="kpi" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="rotulo">{t.kpiVencido}</span>
            <strong>{reais(vencido)}</strong>
          </Link>
          <Link href="/cobrancas?s=paga" className="kpi" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="rotulo">{t.kpiRecebidoMes}</span>
            <strong>{reais(recebidoMes)}</strong>
          </Link>
        </div>
      )}

      {meus.length === 0 ? (
        <div className="aviso" role="status">
          {t.semAcesso}
        </div>
      ) : (
        <div className="grade">
          {meus.map((a) => {
            const perfil = ctx.acessos[a.id]!;
            const aqui = a.id === ctx.ambiente;
            return (
              <div
                key={a.id}
                className="cartao pilha"
                style={{ border: `2px solid ${aqui ? "var(--laranja)" : "transparent"}` }}
              >
                <div className="rotulo">
                  {t.seuPerfil}: {t.perfis[perfil]}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{a.nome}</div>
                <p className="sub">{descricao[a.id]}</p>
                {perfil !== "pauta" && (
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.servicosNaTabela(qtd(a.id))}</div>
                )}
                <div style={{ marginTop: 4 }}>
                  {aqui ? (
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.voceEstaAqui}</span>
                  ) : (
                    <form action={trocarAmbiente}>
                      <button className="btn fantasma" type="submit" name="ambiente" value={a.id}>
                        {t.entrar}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="aviso">{t.avisoPainel}</div>
    </>
  );
}
