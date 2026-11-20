import type { Idioma } from "@/lib/contexto";

/**
 * Textos da interface em português, inglês e espanhol, escolhidos em Minha conta.
 * Os documentos para clientes (proposta, nota, mensagens) seguem o idioma da ficha do cliente.
 * Cada tela nova acrescenta as suas chaves aqui nos três idiomas.
 */
const pt = {
  menu: "Menu",
  menuPrincipal: "Menu principal",
  ambiente: "Ambiente",
  inicio: "Início",
  servicos: "Tabela de Serviços",
  conta: "Minha conta",
  soSocios: "Só sócios",
  sair: "Sair",
  tema: "Tema",
  claro: "Claro",
  escuro: "Escuro",
  idioma: "Idioma",
  ola: "Olá",
  seuPerfil: "Seu perfil",
  voceEstaAqui: "Você está aqui",
  entrar: "Entrar",
  semAcesso: "Sua conta ainda não tem acesso a nenhum ambiente. Peça a um sócio para liberar.",
  paginaSemAcesso: "Seu perfil neste ambiente não abre essa página.",
  emBreve: "Em construção",
};

type Textos = typeof pt;

const en: Textos = {
  menu: "Menu",
  menuPrincipal: "Main menu",
  ambiente: "Workspace",
  inicio: "Home",
  servicos: "Services",
  conta: "My account",
  soSocios: "Partners only",
  sair: "Sign out",
  tema: "Theme",
  claro: "Light",
  escuro: "Dark",
  idioma: "Language",
  ola: "Hi",
  seuPerfil: "Your role",
  voceEstaAqui: "You are here",
  entrar: "Open",
  semAcesso: "Your account has no workspace yet. Ask a partner for access.",
  paginaSemAcesso: "Your role in this workspace can't open that page.",
  emBreve: "Coming soon",
};

const es: Textos = {
  menu: "Menú",
  menuPrincipal: "Menú principal",
  ambiente: "Ambiente",
  inicio: "Inicio",
  servicos: "Tabla de servicios",
  conta: "Mi cuenta",
  soSocios: "Solo socios",
  sair: "Salir",
  tema: "Tema",
  claro: "Claro",
  escuro: "Oscuro",
  idioma: "Idioma",
  ola: "Hola",
  seuPerfil: "Tu perfil",
  voceEstaAqui: "Estás aquí",
  entrar: "Entrar",
  semAcesso: "Tu cuenta aún no tiene acceso a ningún ambiente. Pide acceso a un socio.",
  paginaSemAcesso: "Tu perfil en este ambiente no abre esa página.",
  emBreve: "En construcción",
};

const TEXTOS: Record<Idioma, Textos> = { pt, en, es };

export function textos(idioma: Idioma): Textos {
  return TEXTOS[idioma] ?? pt;
}
