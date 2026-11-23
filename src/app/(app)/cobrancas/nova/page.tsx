import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { textos } from "@/lib/i18n";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { salvarCobranca } from "../acoes";

/** Cobrança avulsa, sem proposta (um extra, um ajuste, um serviço fechado por fora). */
export default async function NovaCobranca() {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const supabase = await createClient();
  const { data: clientes } = await supabase.from("clientes").select("id, nome").order("nome");

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">{nomeAmbiente(ctx.ambiente)}</div>
          <h1>{t.novaCobranca}</h1>
        </div>
        <Link href="/cobrancas" className="btn fantasma">
          {t.voltar}
        </Link>
      </div>
      <FormAcao acao={salvarCobranca}>
        <div className="linha-2">
          <div>
            <label className="campo" htmlFor="cliente_id">
              {t.cliente}
            </label>
            <select id="cliente_id" name="cliente_id" className="entrada" required defaultValue="">
              <option value="">—</option>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="campo" htmlFor="descricao">
              {t.docDescricao}
            </label>
            <input id="descricao" name="descricao" className="entrada" required />
          </div>
        </div>
        <div className="linha-2">
          <div>
            <label className="campo" htmlFor="vencimento">
              {t.colVencimento}
            </label>
            <input id="vencimento" name="vencimento" type="date" className="entrada" required />
          </div>
          <div>
            <label className="campo" htmlFor="valor">
              {t.valorReais}
            </label>
            <input id="valor" name="valor" className="entrada" inputMode="decimal" placeholder="0,00" required />
          </div>
        </div>
        <label className="marcar">
          <input type="checkbox" name="envio_automatico" />
          {t.envioAuto}
        </label>
        <div className="acoes">
          <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
          <Link href="/cobrancas" className="btn fantasma">
            {t.cancelar}
          </Link>
        </div>
      </FormAcao>
    </>
  );
}
