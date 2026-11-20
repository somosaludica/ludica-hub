import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil } from "@/lib/contexto";
import { dataCurta, diasAteAniversario, hojeSP } from "@/lib/formatos";
import { textos } from "@/lib/i18n";

type Linha = { id: string; tipo: "artista" | "empresa"; nome: string; email: string | null; whatsapp: string | null; nascimento: string | null };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cadastro de clientes, comum aos três ambientes. O comercial vê só os dele (regra do banco). */
export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; salvo?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo", "comercial"]);
  const t = textos(ctx.idioma);
  const { q = "", tipo = "", salvo } = await searchParams;

  const supabase = await createClient();
  const { data, error } = await supabase.from("clientes").select("id, tipo, nome, email, whatsapp, nascimento").order("nome");
  const todos = (data ?? []) as Linha[];
  const busca = semAcento(q.trim());
  const digitos = q.replace(/\D/g, "");
  const lista = todos.filter(
    (c) =>
      (!tipo || c.tipo === tipo) &&
      (!busca ||
        semAcento(c.nome).includes(busca) ||
        (c.email ?? "").toLowerCase().includes(busca) ||
        (digitos.length >= 3 && (c.whatsapp ?? "").replace(/\D/g, "").includes(digitos))),
  );
  const hoje = hojeSP();
  const link = (tp: string) => `/clientes?${new URLSearchParams({ ...(q ? { q } : {}), ...(tp ? { tipo: tp } : {}) })}`;

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{t.clientesQtd(todos.length)}</div>
          <h1>{t.clientes}</h1>
        </div>
        <Link href="/clientes/novo" className="btn">
          {t.novoCliente}
        </Link>
      </div>

      {salvo && (
        <div className="aviso ok" role="status">
          {t.clienteRemovido}
        </div>
      )}
      {error && (
        <div className="aviso erro" role="alert">
          {t.erroCarregar}
        </div>
      )}

      <form className="busca" role="search">
        <label className="so-leitor" htmlFor="q">
          {t.buscarCliente}
        </label>
        <input id="q" name="q" className="entrada" defaultValue={q} placeholder={t.buscarCliente} />
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <button type="submit" className="btn fantasma">
          {t.buscar}
        </button>
        {(q || tipo) && (
          <Link href="/clientes" className="btn fantasma">
            {t.limpar}
          </Link>
        )}
      </form>

      <nav aria-label={t.tipo} className="chips">
        <Link href={link("")} className="chip" aria-current={!tipo ? "page" : undefined}>
          {t.todosTipos}
        </Link>
        {(["artista", "empresa"] as const).map((tp) => (
          <Link key={tp} href={link(tp)} className="chip" aria-current={tipo === tp ? "page" : undefined}>
            {t.tipos[tp]}
          </Link>
        ))}
      </nav>

      {lista.length === 0 ? (
        <div className="aviso">{t.clientesVazio}</div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>{t.cliente}</th>
                <th>{t.tipo}</th>
                <th>{t.colContato}</th>
                <th>{t.colAniversario}</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const dias = c.nascimento ? diasAteAniversario(c.nascimento, hoje) : null;
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clientes/${c.id}`}>{c.nome}</Link>
                    </td>
                    <td data-label={t.tipo}>{t.tipos[c.tipo]}</td>
                    <td data-label={t.colContato}>{c.whatsapp || c.email || "—"}</td>
                    <td data-label={t.colAniversario}>
                      {c.nascimento ? dataCurta(c.nascimento) : "—"}
                      {dias != null && dias <= 7 && (
                        <>
                          {" "}
                          <span className="selo ok">{dias === 0 ? t.hoje : dias === 1 ? t.amanha : t.emDias(dias)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
