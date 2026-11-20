import type { Metadata, Viewport } from "next";
import "./globals.css";
import Carregando from "./carregando";

export const metadata: Metadata = {
  title: "Lúdica HUB",
  description: "Clientes, serviços, orçamentos, cobrança, financeiro e agendas da Lúdica.",
};

export const viewport: Viewport = { themeColor: "#0e0f15" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-tema="claro">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {children}
        <Carregando />
      </body>
    </html>
  );
}
