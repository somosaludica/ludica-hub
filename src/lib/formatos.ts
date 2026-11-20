/** Regras de formato usadas em várias telas. Sem dependências, para poder testar com node --test. */

export type Unidade =
  | "unitario" | "mensal" | "diaria" | "por_hora" | "por_faixa"
  | "por_video_musica" | "por_evento" | "por_pacote" | "por_formato_de_show";

export const UNIDADES: Record<Unidade, string> = {
  unitario: "Unitário",
  mensal: "Mensal",
  diaria: "Diária",
  por_hora: "Por hora",
  por_faixa: "Por faixa",
  por_video_musica: "Por vídeo/música",
  por_evento: "Por evento",
  por_pacote: "Por pacote",
  por_formato_de_show: "Por formato de show",
};

export type Perfil = "socio" | "administrativo" | "comercial" | "pauta";

export const PERFIS: Record<Perfil, string> = {
  socio: "Sócio",
  administrativo: "Administrativo",
  comercial: "Comercial",
  pauta: "Pauta",
};

/** Valor em reais no formato brasileiro: 1234.5 -> "R$ 1.234,50". */
export function reais(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return "R$ —";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}

/** Deixa só os dígitos de um CPF ou CNPJ digitado com pontos, traços ou barras. */
export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function digitoCpf(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** CPF válido pelos dígitos verificadores. */
export function cpfValido(texto: string): boolean {
  const d = soDigitos(texto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  return digitoCpf(d.slice(0, 9)) === Number(d[9]) && digitoCpf(d.slice(0, 10)) === Number(d[10]);
}

function digitoCnpj(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((s, p, i) => s + p * Number(base[i]), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ válido pelos dígitos verificadores. */
export function cnpjValido(texto: string): boolean {
  const d = soDigitos(texto);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  return digitoCnpj(d.slice(0, 12)) === Number(d[12]) && digitoCnpj(d.slice(0, 13)) === Number(d[13]);
}

/** Aceita vazio (documento é opcional), CPF ou CNPJ válidos. */
export function documentoValido(texto: string): boolean {
  const d = soDigitos(texto);
  return d === "" || cpfValido(d) || cnpjValido(d);
}

/** Dias até o próximo aniversário, contando a partir de hoje (0 = hoje). 29/02 conta como 28/02 em ano comum. */
export function diasAteAniversario(nascimento: string, hoje: Date): number {
  const [, m, d] = nascimento.split("-").map(Number);
  const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const proximo = (ano: number) => {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    const dia = m === 2 && d === 29 && !bissexto ? 28 : d;
    return new Date(Date.UTC(ano, m - 1, dia));
  };
  let alvo = proximo(base.getUTCFullYear());
  if (alvo < base) alvo = proximo(base.getUTCFullYear() + 1);
  return Math.round((alvo.getTime() - base.getTime()) / 86_400_000);
}

/** O aviso de aniversário sai uma semana antes e um dia antes. */
export function avisoAniversario(nascimento: string | null, hoje: Date): "semana" | "amanha" | null {
  if (!nascimento) return null;
  const dias = diasAteAniversario(nascimento, hoje);
  return dias === 7 ? "semana" : dias === 1 ? "amanha" : null;
}

/** Lê um valor digitado em reais ("1.500,00", "1500", "R$ 150,5") e devolve número com 2 casas, ou null se inválido. */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/R\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo.replace(/\./g, "").replace(",", ".")) * 100) / 100;
}

/** Valor para preencher um campo de edição: 1500 -> "1.500,00". */
export function reaisCampo(valor: number | null | undefined): string {
  if (valor == null) return "";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
