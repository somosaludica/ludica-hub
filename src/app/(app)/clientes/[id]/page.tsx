import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente, type AmbienteId } from "@/lib/contexto";
import { textos } from "@/lib/i18n";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { removerCliente, salvarCliente } from "../acoes";

type Cliente = {
  id: string; tipo: "artista" | "empresa"; nome: string; documento: string | null; email: string | null; whatsapp: string | null;
  aceita_whatsapp: boolean; nascimento: string | null; idioma_documentos: "pt" | "en" | "es"; origem: string | null;
  indicado_por: string | null; indicador_recebe_comissao: boolean; instagram: string | null; spotify: string | null;
  youtube: string | null; tiktok: string | null; outros_links: string | null; observacoes: string | null;
};

function mascaraDoc(d: string | null) {
  if (!d) return "";
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** Ficha do cliente: criar (/clientes/novo) ou editar, com os leads dele nos ambientes que a pessoa enxerga. */
export default async function FichaCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const t = textos(ctx.idioma);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const novo = id === "novo";

  const supabase = await createClient();
  let c: Cliente | null = null;
  let leads: { id: string; ambiente_id: AmbienteId; etapa: keyof typeof t.etapas; servico_interesse_id: string | null }[] = [];
  let servicos: Record<string, string> = {};
  if (!novo) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const { data } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    c = data as Cliente;
    const { data: ls } = await supabase.from("leads").select("id, ambiente_id, etapa, servico_interesse_id").eq("cliente_id", id).order("criado_em", { ascending: false });
    leads = (ls ?? []) as typeof leads;
    const ids = [...new Set(leads.map((l) => l.servico_interesse_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: ss } = await supabase.from("servicos").select("id, nome").in("id", ids);
      servicos = Object.fromEntries((ss ?? []).map((s) => [s.id, s.nome]));
    }
  }

  const texto = (rotulo: string, nome: keyof Cliente, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="campo" htmlFor={nome}>
        {rotulo}
      </label>
      <input id={nome} name={nome} className="entrada" defaultValue={(c?.[nome] as string | null) ?? ""} {...extra} />
    </div>
  );

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{t.cliente}</div>
          <h1>{novo ? t.novoCliente : c!.nome}</h1>
        </div>
        <div className="acoes">
          {!novo && (
            <Link href={`/leads/novo?cliente=${id}`} className="btn">
              {t.novoLead}
            </Link>
          )}
          <Link href="/clientes" className="btn fantasma">
            {t.voltar}
          </Link>
        </div>
      </div>

      {sp.salvo && (
        <div className="aviso ok" role="status">
          {t.clienteSalvo}
        </div>
      )}
      {sp.erro && (
        <div className="aviso erro" role="alert">
          {t.erroRecusado}
        </div>
      )}

      <FormAcao acao={salvarCliente}>
        {c && <input type="hidden" name="id" value={c.id} />}

        <fieldset className="secao">
          <legend>{t.secDados}</legend>
          <div className="linha-2">
            {texto(t.nomeCliente, "nome", { required: true })}
            <div>
              <label className="campo" htmlFor="tipo">
                {t.tipo}
              </label>
              <select id="tipo" name="tipo" className="entrada" defaultValue={c?.tipo ?? "artista"}>
                <option value="artista">{t.tipos.artista}</option>
                <option value="empresa">{t.tipos.empresa}</option>
              </select>
            </div>
          </div>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="documento">
                {t.documento}
              </label>
              <input id="documento" name="documento" className="entrada" inputMode="numeric" defaultValue={mascaraDoc(c?.documento ?? null)} />
            </div>
            {texto(t.email, "email", { type: "email", autoComplete: "off" })}
          </div>
          <div className="linha-2">
            {texto(t.whatsapp, "whatsapp", { type: "tel", placeholder: "(11) 90000-0000" })}
            <div>
              <label className="campo" htmlFor="nascimento">
                {t.nascimento}
              </label>
              <input id="nascimento" name="nascimento" type="date" className="entrada" defaultValue={c?.nascimento ?? ""} aria-describedby="nasc-dica" />
              <div id="nasc-dica" className="dica">
                {t.dicaNascimento}
              </div>
            </div>
          </div>
          <label className="marcar">
            <input type="checkbox" name="aceita_whatsapp" defaultChecked={c?.aceita_whatsapp ?? false} />
            {t.aceitaWhatsapp}
          </label>
          <div className="linha-2">
            <div>
              <label className="campo" htmlFor="idioma_documentos">
                {t.idiomaDocs}
              </label>
              <select id="idioma_documentos" name="idioma_documentos" className="entrada" defaultValue={c?.idioma_documentos ?? "pt"} aria-describedby="idioma-dica">
                <option value="pt" lang="pt">Português</option>
                <option value="en" lang="en">English</option>
                <option value="es" lang="es">Español</option>
              </select>
              <div id="idioma-dica" className="dica">
                {t.dicaIdiomaDocs}
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="secao">
          <legend>{t.secOrigem}</legend>
          <div className="linha-2">
            {texto(t.origem, "origem")}
            {texto(t.indicadoPor, "indicado_por")}
          </div>
          <label className="marcar">
            <input type="checkbox" name="indicador_recebe_comissao" defaultChecked={c?.indicador_recebe_comissao ?? false} />
            {t.indicadorComissao}
          </label>
        </fieldset>

        <fieldset className="secao">
          <legend>{t.secLinks}</legend>
          <div className="linha-2">
            {texto("Instagram", "instagram", { placeholder: "@" })}
            {texto("Spotify", "spotify")}
          </div>
          <div className="linha-2">
            {texto("YouTube", "youtube")}
            {texto("TikTok", "tiktok", { placeholder: "@" })}
          </div>
          {texto(t.outrosLinks, "outros_links")}
        </fieldset>

        <div>
          <label className="campo" htmlFor="observacoes">
            {t.observacoes}
          </label>
          <textarea id="observacoes" name="observacoes" className="entrada" rows={3} defaultValue={c?.observacoes ?? ""} />
        </div>

        <div className="acoes">
          <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
          <Link href="/clientes" className="btn fantasma">
            {t.cancelar}
          </Link>
        </div>
      </FormAcao>

      {!novo && (
        <div className="cartao pilha" style={{ maxWidth: 760 }}>
          <div className="rotulo">{t.leadsDoCliente}</div>
          {leads.length === 0 ? (
            <p className="sub">{t.semLeads}</p>
          ) : (
            <ul className="lista-linhas">
              {leads.map((l) => (
                <li key={l.id}>
                  <span>
                    <Link href={`/leads/${l.id}`}>
                      <strong>{nomeAmbiente(l.ambiente_id)}</strong>
                    </Link>
                    {" · "}
                    {l.servico_interesse_id ? (servicos[l.servico_interesse_id] ?? t.naoDefinido) : t.naoDefinido}
                  </span>
                  <span className="selo">{t.etapas[l.etapa]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!novo && ctx.socioAlgum && (
        <details className="cartao" style={{ maxWidth: 760 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>{t.removerCliente}</summary>
          <form action={removerCliente} className="pilha" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="sub">{t.removerClienteExplica}</p>
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
