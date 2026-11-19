import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PERFIS, type Perfil } from "@/lib/formatos";

/**
 * Início provisório da Fase 1: confirma o login e mostra os acessos de quem entrou.
 * O painel completo (cartões por ambiente, alertas, agenda do dia) entra nas próximas entregas.
 */
export default async function Inicio() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: perfil }, { data: acessos }] = await Promise.all([
    supabase.from("perfis").select("nome").eq("id", auth.user.id).maybeSingle(),
    supabase.from("acessos").select("perfil, ambientes(nome, ordem)").eq("usuario_id", auth.user.id),
  ]);

  const lista = (acessos ?? [])
    .map((a) => ({ perfil: a.perfil as Perfil, amb: a.ambientes as unknown as { nome: string; ordem: number } | null }))
    .filter((a) => a.amb)
    .sort((x, y) => x.amb!.ordem - y.amb!.ordem);

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 20px", display: "grid", gap: 20 }}>
      <div className="rotulo">Lúdica HUB</div>
      <h1 style={{ margin: 0, fontSize: 30 }}>Olá, {perfil?.nome ?? auth.user.email}</h1>
      {lista.length === 0 ? (
        <div className="aviso" role="status">
          Sua conta ainda não tem acesso a nenhum ambiente. Peça a um sócio para liberar.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {lista.map((a) => (
            <div key={a.amb!.nome} className="cartao">
              <div className="rotulo">Seu perfil: {PERFIS[a.perfil]}</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{a.amb!.nome}</div>
            </div>
          ))}
        </div>
      )}
      <form action="/auth/sair" method="post">
        <button className="btn fantasma" type="submit">Sair</button>
      </form>
    </main>
  );
}
