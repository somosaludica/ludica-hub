/**
 * "Lembrar de mim": o login grava o cookie `ludica-lembrar`.
 *  - "1" (padrão): os cookies da sessão duram 30 dias.
 *  - "0": viram cookies de sessão do navegador (somem ao fechar).
 */
export const REMEMBER_COOKIE = "ludica-lembrar";
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

type CookieOptions = { maxAge?: number; expires?: Date; [k: string]: unknown };

export function applyRemember<T extends CookieOptions>(options: T, remember: string | undefined): T {
  const out = { ...options };
  if (remember === "0") {
    delete out.maxAge;
    delete out.expires;
  } else if (out.maxAge !== 0) {
    // maxAge 0 significa "apagar o cookie" (logout): não mexer.
    out.maxAge = REMEMBER_MAX_AGE;
    delete out.expires;
  }
  return out;
}
