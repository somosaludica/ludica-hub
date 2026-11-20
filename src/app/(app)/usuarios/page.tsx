import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AMBIENTES, contexto, type AmbienteId } from "@/lib/contexto";
import type { Perfil } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { alterarPessoa, convidar, gerarLink } from "./acoes";

const PERFIS: Perfil[] = ["socio", "administrativo", "comercial", "pauta"];

/** Pessoas do time e seus acessos. Só sócios; cada um mexe nos ambientes em que é sócio. */
export default async function Usuarios({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const ctx = await contexto();
  if (!ctx.socioAlgum) redirect("/?sem-acesso=1");
  const t = textos(ctx.idioma);
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: pessoas }, { data: acessos }] = await Promise.all([
    supabase.from("perfis").select("id, nome, email, ativo").order("nome"),
    supabase.from("acessos").select("usuario_id, ambiente_id, perfil"),
  ]);
  const meus = AMBIENTES.filter((a) => ctx.acessos[a.id] === "socio");
  const perfilDe = (u: string, amb: AmbienteId) => (acessos ?? []).find((a) => a.usuario_id === u && a.ambiente_id === amb)?.perfil as Perfil | undefined;
  const tLink = { explica: t.linkExplica, copiar: t.copiar, copiado: t.copiado };

  const seletores = (u: string | null) => (
    <div className="linha-3">
      {meus.map((a) => (
        <div key={a.id}>
          <label className="campo" htmlFor={`perfil_${a.id}_${u ?? "novo"}`}>
            {a.nome}
          </label>
          <select id={`perfil_${a.id}_${u ?? "novo"}`} name={`perfil_${a.id}`} className="entrada" defaultValue={u ? (perfilDe(u, a.id) ?? "") : ""}>
            <option value="">{t.semAcessoAmb}</option>
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {t.perfis[p]}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="cab">
        <div>
          <h1>{t.usuarios}</h1>
        </div>
      </div>

      {sp.ok && (
        <div className="aviso ok" role="status">
          {sp.ok === "desativado" ? t.usuarioDesativado : sp.ok === "reativado" ? t.usuarioReativado : t.usuarioSalvo}
        </div>
      )}
      {sp.erro && (
        <div className="aviso erro" role="alert">
          {t.erroRecusado}
        </div>
      )}

      <details className="cartao" style={{ maxWidth: 760 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>{t.convidar}</summary>
        <FormAcao acao={convidar} className="form" tLink={tLink}>
          <p className="sub" style={{ marginTop: 8 }}>
            {t.conviteExplica}
          </p>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="nome">
                {t.nome}
              </label>
              <input id="nome" name="nome" className="entrada" required autoComplete="off" />
            </div>
            <div>
              <label className="campo" htmlFor="email">
                {t.email}
              </label>
              <input id="email" name="email" type="email" className="entrada" required autoComplete="off" />
            </div>
          </div>
          {seletores(null)}
          <div className="acoes">
            <BotaoEnviar rotulo={t.convidar} enviando={t.salvando} />
          </div>
        </FormAcao>
      </details>

      {(pessoas ?? []).map((p) => {
        const eu = p.id === ctx.usuarioId;
        return (
          <section key={p.id} className="cartao pilha" style={{ maxWidth: 760 }} aria-label={p.nome}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: 15 }}>{p.nome}</strong> {eu && <span className="selo">{t.voce}</span>}{" "}
                {!p.ativo && <span className="selo off">{t.inativo}</span>}
                <div className="dica" style={{ marginTop: 2 }}>
                  {p.email}
                </div>
              </div>
            </div>
            <form action={alterarPessoa} className="pilha">
              <input type="hidden" name="id" value={p.id} />
              {seletores(p.id)}
              <div className="acoes">
                <button type="submit" name="acao" value="acessos" className="btn">
                  {t.salvarAcessos}
                </button>
                {!eu && (
                  <button type="submit" name="acao" value="ativo" className="btn fantasma" formNoValidate>
                    {p.ativo ? t.desativar : t.reativar}
                  </button>
                )}
                {!eu && <input type="hidden" name="ativo" value={p.ativo ? "0" : "1"} />}
              </div>
            </form>
            {!eu && p.ativo && (
              <FormAcao acao={gerarLink} className="pilha" tLink={tLink}>
                <input type="hidden" name="id" value={p.id} />
                <div>
                  <BotaoEnviar rotulo={t.gerarLink} enviando={t.salvando} className="btn fantasma" />
                </div>
              </FormAcao>
            )}
          </section>
        );
      })}

      <div className="aviso" style={{ maxWidth: 760 }}>
        {t.notaUsuarios}
      </div>
    </>
  );
}
