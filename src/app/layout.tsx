import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Carregando from "./carregando";
import { IDIOMA_COOKIE, LANG, idiomaDoPedido, textos } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Lúdica HUB",
  description: "Clientes, serviços, orçamentos, cobrança, financeiro e agendas da Lúdica.",
};

export const viewport: Viewport = { themeColor: "#0e0f15" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Antes do login vale o último idioma usado neste aparelho ou o do navegador;
  // depois, o do perfil (o menu mantém o cookie igual ao perfil).
  const [store, cab] = await Promise.all([cookies(), headers()]);
  const idioma = idiomaDoPedido(store.get(IDIOMA_COOKIE)?.value, cab.get("accept-language"));
  return (
    <html lang={LANG[idioma]} data-tema="claro">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {children}
        <Carregando texto={textos(idioma).carregando} />
      </body>
    </html>
  );
}
