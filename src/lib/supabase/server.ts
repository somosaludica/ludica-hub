import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { REMEMBER_COOKIE, applyRemember } from "./cookies";

/** Cliente do Supabase para Server Components, Server Actions e Route Handlers. */
export async function createClient() {
  const store = await cookies();
  const remember = store.get(REMEMBER_COOKIE)?.value;

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, applyRemember(options, remember));
          }
        } catch {
          // Chamado de um Server Component: quem renova a sessão é o proxy.
        }
      },
    },
  });
}
