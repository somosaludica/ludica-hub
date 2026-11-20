import { cookies, headers } from "next/headers";
import { IDIOMA_COOKIE, idiomaDoPedido, textos } from "@/lib/i18n";
import Confirmar from "./confirmar";

export default async function Pagina() {
  const [store, cab] = await Promise.all([cookies(), headers()]);
  const t = textos(idiomaDoPedido(store.get(IDIOMA_COOKIE)?.value, cab.get("accept-language")));
  return <Confirmar t={{ linkFalhou: t.linkFalhou, linkFalhouExplica: t.linkFalhouExplica, linkIncompleto: t.linkIncompleto, irLogin: t.irLogin, entrando: t.entrando }} />;
}
