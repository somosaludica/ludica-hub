import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave secreta: SÓ no servidor (cron e envio de push).
 * A chave fica na variável SUPABASE_SECRET_KEY da Vercel, nunca no código nem no navegador.
 */
export function adminClient() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
