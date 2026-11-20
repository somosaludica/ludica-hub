import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, AMBIENTES, type Idioma, type Tema } from "@/lib/contexto";
import { IDIOMA_COOKIE, textos } from "@/lib/i18n";

async function salvarConta(f: FormData) {
  "use server";
  const ctx = await contexto();
  const nome = String(f.get("nome") ?? "").trim();
  const tema = f.get("tema") as Tema;
  const idioma = f.get("idioma") as Idioma;
  if (!nome || !["claro", "escuro", "sistema"].includes(tema) || !["pt", "en", "es"].includes(idioma)) {
    redirect("/conta?erro=1");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("perfis").update({ nome, tema, idioma }).eq("id", ctx.usuarioId);
  if (!error) (await cookies()).set(IDIOMA_COOKIE, idioma, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect(error ? "/conta?erro=1" : "/conta?salvo=1");
}

/** Minha conta: nome, tema e idioma da interface. Cada pessoa altera só a sua. */
export default async function Conta({ searchParams }: { searchParams: Promise<{ salvo?: string; erro?: string }> }) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams]);
  const t = textos(ctx.idioma);
  const meus = AMBIENTES.filter((a) => ctx.acessos[a.id]);

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{ctx.email}</div>
          <h1>{t.conta}</h1>
        </div>
      </div>

      {sp.salvo && (
        <div className="aviso ok" role="status">
          {t.preferenciasSalvas}
        </div>
      )}
      {sp.erro && (
        <div className="aviso erro" role="alert">
          {t.erroConta}
        </div>
      )}

      <form action={salvarConta} className="cartao form">
        <div>
          <label className="campo" htmlFor="nome">
            {t.nome}
          </label>
          <input id="nome" name="nome" className="entrada" required defaultValue={ctx.nome} autoComplete="name" />
        </div>
        <div className="linha-2">
          <div>
            <label className="campo" htmlFor="tema">
              {t.tema}
            </label>
            <select id="tema" name="tema" className="entrada" defaultValue={ctx.tema}>
              <option value="claro">{t.claro}</option>
              <option value="escuro">{t.escuro}</option>
              <option value="sistema">{t.igualAparelho}</option>
            </select>
          </div>
          <div>
            <label className="campo" htmlFor="idioma">
              {t.idioma}
            </label>
            <select id="idioma" name="idioma" className="entrada" defaultValue={ctx.idioma}>
              <option value="pt" lang="pt">Português</option>
              <option value="en" lang="en">English</option>
              <option value="es" lang="es">Español</option>
            </select>
          </div>
        </div>
        <p className="sub">{t.notaIdioma}</p>
        <div className="acoes">
          <button type="submit" className="btn">
            {t.salvar}
          </button>
        </div>
      </form>

      <div className="cartao pilha" style={{ maxWidth: 760 }}>
        <div className="rotulo">{t.seusAcessos}</div>
        {meus.length === 0 ? (
          <p className="sub">{t.semAcesso}</p>
        ) : (
          meus.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <strong>{a.nome}</strong>
              <span>{t.perfis[ctx.acessos[a.id]!]}</span>
            </div>
          ))
        )}
        <p className="sub">{t.notaAcessos}</p>
      </div>
    </>
  );
}
