import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { REMEMBER_COOKIE, applyRemember } from "@/lib/supabase/cookies";

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Roda antes de cada página: renova a sessão do Supabase e manda para o login
 * quem não estiver conectado.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, applyRemember(options, remember));
        }
      },
    },
  });

  // Confere o token localmente quando possível (sem ida ao servidor de login) e renova a sessão se venceu.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ?? null;

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
