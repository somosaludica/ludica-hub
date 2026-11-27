import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contexto, exigePerfil, nomeAmbiente } from "@/lib/contexto";
import { dataCurta, reais, reaisCampo } from "@/lib/formatos";
import { textos } from "@/lib/i18n";
import { apura } from "@/lib/financeiro";
import { carregaFinanceiro } from "@/lib/dados-financeiro";
import FormAcao, { BotaoEnviar } from "@/componentes/form-acao";
import { salvarApuracao } from "../../../acoes";

/** Ajuste da apuração de um recebimento: imposto, fundo de reserva e custos do projeto. */
export default async function PaginaApuracao({ params }: { params: Promise<{ origem: string; id: string }> }) {
  const ctx = await contexto();
  exigePerfil(ctx, ["socio", "administrativo"]);
  const t = textos(ctx.idioma);
  const { origem, id } = await params;
  const fin = await carregaFinanceiro(await createClient(), ctx.ambiente!);
  const x = fin.recs.find((r) => r.id === id && r.origem === origem);
  if (!x) notFound();
  const a = apura(x, fin.participacoes);
  const num = (n: number) => Number(n).toLocaleString("pt-BR");

  return (
    <>
      <div className="cab">
        <div>
          <div className="rotulo">
            {t.fApuracaoLucro} · {nomeAmbiente(ctx.ambiente)}
          </div>
          <h1>{x.descricao}</h1>
        </div>
        <Link href="/financeiro/socios" className="btn fantasma">
          {t.voltar}
        </Link>
      </div>
      <div className="aviso">
        {t.fResumoApuracao(dataCurta(x.data, true), reais(a.rec), reais(a.lucro))}
        {a.partes.length > 0 && ` ${a.partes.map((p) => `${fin.nomes[p.socio] ?? "—"} ${reais(p.valor)}`).join(" · ")}`}
      </div>
      <FormAcao acao={salvarApuracao}>
        <input type="hidden" name="id" value={x.id} />
        <input type="hidden" name="origem" value={x.origem} />
        <div className="linha-3">
          <div>
            <label className="campo" htmlFor="imposto_pct">
              {t.fImpostoPct}
            </label>
            <input id="imposto_pct" name="imposto_pct" className="entrada" inputMode="decimal" required defaultValue={num(x.impostoPct)} />
          </div>
          <div>
            <label className="campo" htmlFor="reserva_pct">
              {t.fReservaPct}
            </label>
            <input id="reserva_pct" name="reserva_pct" className="entrada" inputMode="decimal" required defaultValue={num(x.reservaPct)} />
          </div>
          <div>
            <label className="campo" htmlFor="custos">
              {t.fCustosProjeto}
            </label>
            <input id="custos" name="custos" className="entrada" inputMode="decimal" placeholder="0,00" defaultValue={reaisCampo(x.custos)} aria-describedby="custos-dica" />
            <div id="custos-dica" className="dica">
              {t.fDicaCustos}
            </div>
          </div>
        </div>
        <div>
          <label className="campo" htmlFor="obs">
            {t.observacoes}
          </label>
          <textarea id="obs" name="obs" className="entrada" rows={2} maxLength={600} defaultValue={x.obs ?? ""} />
        </div>
        <div className="acoes">
          <BotaoEnviar rotulo={t.salvar} enviando={t.salvando} />
          <Link href="/financeiro/socios" className="btn fantasma">
            {t.cancelar}
          </Link>
        </div>
      </FormAcao>
    </>
  );
}
