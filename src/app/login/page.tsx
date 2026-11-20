import { cookies, headers } from "next/headers";
import { IDIOMA_COOKIE, idiomaDoPedido, textos } from "@/lib/i18n";
import FormLogin from "./form";

/** Login no idioma do último uso neste aparelho, ou no do navegador. */
export default async function Login() {
  const [store, cab] = await Promise.all([cookies(), headers()]);
  const t = textos(idiomaDoPedido(store.get(IDIOMA_COOKIE)?.value, cab.get("accept-language")));
  const simples = Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return <FormLogin t={simples as never} />;
}
