import Link from "next/link";
import { contexto } from "@/lib/contexto";
import { textos } from "@/lib/i18n";

/** Página ou registro que não existe, ou que é de outro ambiente. */
export default async function NaoEncontrado() {
  const t = textos((await contexto()).idioma);
  return (
    <div className="cartao pilha" style={{ maxWidth: 560 }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>{t.naoEncontrado}</h1>
      <p className="sub">{t.naoEncontradoExplica}</p>
      <div>
        <Link href="/" className="btn">
          {t.irInicio}
        </Link>
      </div>
    </div>
  );
}
