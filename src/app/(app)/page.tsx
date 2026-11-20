import { createClient } from "@/lib/supabase/server";
import { contexto, AMBIENTES, type AmbienteId } from "@/lib/contexto";
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
