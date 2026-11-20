import { contexto, AMBIENTES } from "@/lib/contexto";
import { LANG, textos } from "@/lib/i18n";
import Menu, { type ItemMenu } from "./menu";
import styles from "./shell.module.css";

/**
 * Moldura de todas as páginas internas: menu preto com troca de ambiente à esquerda
 * (recolhível no celular) e o conteúdo à direita. O tema da pessoa vale a partir daqui;
 * a tela de login fica sempre clara.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contexto();
  const t = textos(ctx.idioma);
  const p = ctx.perfil;

  // Só entram no menu as telas prontas e abertas ao perfil no ambiente atual.
  const itens: ItemMenu[] = [{ href: "/", rotulo: t.inicio }];
  if (p === "socio" || p === "administrativo" || p === "comercial") itens.push({ href: "/servicos", rotulo: t.servicos });

  const ambientes = AMBIENTES.filter((a) => ctx.acessos[a.id]);

  return (
    <div data-tema={ctx.tema} className={styles.app} lang={LANG[ctx.idioma]}>
      <Menu
        itens={itens}
        ambientes={ambientes}
        ambiente={ctx.ambiente}
        tema={ctx.tema}
        idioma={ctx.idioma}
        t={{
          menu: t.menu,
          menuPrincipal: t.menuPrincipal,
          ambiente: t.ambiente,
          conta: t.conta,
          sair: t.sair,
          tema: t.tema,
          claro: t.claro,
          escuro: t.escuro,
          idioma: t.idioma,
        }}
      />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
