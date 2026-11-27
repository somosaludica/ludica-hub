import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contexto } from "@/lib/contexto";

/** Abre o comprovante de um lançamento por um link que vale um minuto. Quem não vê o lançamento não chega ao arquivo. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexto();
  const { id } = await params;
  if ((ctx.perfil !== "socio" && ctx.perfil !== "administrativo") || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: l } = await supabase.from("lancamentos").select("comprovante_caminho").eq("id", id).eq("ambiente_id", ctx.ambiente!).maybeSingle();
  if (!l?.comprovante_caminho) return new NextResponse(null, { status: 404 });
  const { data } = await supabase.storage.from("comprovantes").createSignedUrl(l.comprovante_caminho, 60);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
