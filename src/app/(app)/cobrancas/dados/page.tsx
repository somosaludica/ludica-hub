import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { textos } from "@/lib/i18n";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { salvarDadosNota } from "../acoes";

/** O mínimo que a nota de débito precisa: quem emite e como pagar. (A tela completa de dados do ambiente fica para o final.) */
export default async function DadosNota({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const { ok } = await searchParams;
  const supabase = await createClient();
  const { data: d } = await supabase.from("ambiente_dados").select("razao_social, cnpj, endereco, conta_recebimento").eq("ambiente_id", ctx.ambiente!).maybeSingle();
  const cnpj = (d?.cnpj ?? "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.dadosNota}</h1>
        </div>
        <Link href="/cobrancas" className="btn fantasma">
          {t.voltar}
        </Link>
      </div>
      {ok && (
        <div className="aviso ok" role="status">
          {t.dadosSalvos}
        </div>
      )}
      <FormAcao acao={salvarDadosNota}>
        <div className="linha-2">
          <div>
            <label className="campo" htmlFor="razao_social">
              {t.razaoSocial}
            </label>
            <input id="razao_social" name="razao_social" className="entrada" defaultValue={d?.razao_social ?? ""} />
          </div>
          <div>
            <label className="campo" htmlFor="cnpj">
              {t.cnpj}
            </label>
            <input id="cnpj" name="cnpj" className="entrada" inputMode="numeric" defaultValue={cnpj} />
          </div>
        </div>
        <div>
          <label className="campo" htmlFor="endereco">
            {t.endereco}
          </label>
          <input id="endereco" name="endereco" className="entrada" defaultValue={d?.endereco ?? ""} />
        </div>
        <div>
          <label className="campo" htmlFor="conta_recebimento">
            {t.dadosPagamento}
          </label>
          <textarea id="conta_recebimento" name="conta_recebimento" className="entrada" rows={4} defaultValue={d?.conta_recebimento ?? ""} aria-describedby="conta-dica" />
          <div id="conta-dica" className="dica">
            {t.dicaDadosPagamento}
          </div>
        </div>
        <div className="acoes">
          <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
        </div>
      </FormAcao>
    </>
  );
}
