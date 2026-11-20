import Link from "next/link";
import { cookies, headers } from "next/headers";
import { IDIOMA_COOKIE, idiomaDoPedido, textos } from "@/lib/i18n";

export default async function NaoEncontrado() {
  const [store, cab] = await Promise.all([cookies(), headers()]);
  const t = textos(idiomaDoPedido(store.get(IDIOMA_COOKIE)?.value, cab.get("accept-language")));
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px" }} className="pilha">
      <h1 style={{ margin: 0, fontSize: 20 }}>{t.paginaNaoEncontrada}</h1>
      <div>
        <Link href="/" className="btn">
          {t.irInicio}
        </Link>
      </div>
    </main>
  );
}
