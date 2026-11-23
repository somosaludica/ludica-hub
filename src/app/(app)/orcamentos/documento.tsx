import { dataCurta, reais, type Unidade } from "@/lib/formatos";
import { textos, type Idioma } from "@/lib/i18n";
import { linhas, totais, valoresDesconto } from "@/lib/orcamento";

export type DadosProposta = {
  numero: string;
  assinatura: string;          // "Lúdica MUSIC" ou "Lúdica HUB"
  cliente: string;
  idioma: Idioma;              // idioma dos documentos do cliente
  titulo: string | null;
  descricao: string | null;
  incluso: string | null;
  nao_incluso: string | null;
  opcionais: string | null;
  workflow: string | null;
  entrega: string | null;
  prazo: string | null;
  pagamento: string | null;
  validade_dias: number;
  validade_ate: string | null;
  desconto_percentual: number;
  descontos: { tipo: "amigo" | "cliente" | "parceiro" | "socio"; percentual: number }[];
  itens: { descricao: string; unidade: Unidade; quantidade: number; valor_unitario: number }[];
};

function Lista({ titulo, texto, numerada }: { titulo: string; texto: string | null; numerada?: boolean }) {
  const l = linhas(texto);
  if (l.length === 0) return null;
  const itens = l.map((x, i) => <li key={i}>{numerada ? x.replace(/^\d+[.)]\s*/, "") : x}</li>);
  return (
    <section>
      <h2>{titulo}</h2>
      {numerada ? <ol>{itens}</ol> : <ul>{itens}</ul>}
    </section>
  );
}

/** A proposta como o cliente vê. Os rótulos saem no idioma da ficha do cliente; o conteúdo é o que foi escrito. */
export default function DocumentoProposta({ d }: { d: DadosProposta }) {
  const t = textos(d.idioma);
  const { subtotal, desconto, total } = totais(d.itens, d.desconto_percentual);
  const qtd = (n: number) => Number(n).toLocaleString("pt-BR");
  const valores = valoresDesconto(subtotal, d.descontos.map((x) => x.percentual));
  const cond: [string, string | null][] = [
    [t.docEntrega, d.entrega],
    [t.docPrazo, d.prazo],
    [t.docPagamento, d.pagamento],
    [t.docValidade, d.validade_ate ? dataCurta(d.validade_ate, true) : t.docValidadeTexto(d.validade_dias)],
  ];

  return (
    <article className="doc" lang={d.idioma === "pt" ? "pt-BR" : d.idioma}>
      <header className="doc-topo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-claro.png" alt="Lúdica" />
        <div className="doc-slogan">WE MAKE YOU MATTER</div>
        <h1 className="doc-titulo">
          {t.docProposta}: {d.titulo || d.itens.map((i) => i.descricao).join(" + ")}
        </h1>
        <div className="doc-meta">
          {d.assinatura} · {d.numero} · {d.cliente}
        </div>
      </header>

      <div className="doc-corpo">
        {d.descricao && (
          <section>
            <h2>{t.docProjeto}</h2>
            {linhas(d.descricao).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        )}

        <Lista titulo={t.docIncluso} texto={d.incluso} />
        {(d.nao_incluso || d.opcionais) && (
          <div className="doc-duas">
            <Lista titulo={t.docNaoIncluso} texto={d.nao_incluso} />
            <Lista titulo={t.docOpcionais} texto={d.opcionais} />
          </div>
        )}
        <Lista titulo={t.docWorkflow} texto={d.workflow} numerada />

        <section>
          <h2>{t.docInvestimento}</h2>
          <div className="doc-invest">
            {(d.itens.length > 1 || desconto > 0 || d.itens.some((i) => Number(i.quantidade) !== 1)) && (
              <table>
                <thead>
                  <tr>
                    <th>{t.docServicos}</th>
                    <th className="num">{t.qtd}</th>
                    <th className="num">{t.subtotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.itens.map((i, n) => (
                    <tr key={n}>
                      <td>
                        {i.descricao} <span style={{ color: "#4a5056" }}>· {t.unidades[i.unidade]}</span>
                      </td>
                      <td className="num">{qtd(i.quantidade)}</td>
                      <td className="num">{reais(totais([i], 0).subtotal)}</td>
                    </tr>
                  ))}
                  {desconto > 0 && (
                    <>
                      <tr>
                        <td colSpan={2}>{t.subtotal}</td>
                        <td className="num">{reais(subtotal)}</td>
                      </tr>
                      {d.descontos.map((x, n) => (
                        <tr key={n}>
                          <td colSpan={2}>
                            {t.docDescontos[x.tipo]} ({qtd(x.percentual)}%)
                          </td>
                          <td className="num">− {reais(valores[n])}</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            )}
            <div className="doc-valor">{reais(total)}</div>
            {d.itens.length === 1 && d.itens[0].unidade === "mensal" && <p>{t.unidades.mensal}</p>}
          </div>
        </section>

        <div className="doc-cond">
          {cond.filter(([, v]) => v).map(([k, v]) => (
            <section key={k}>
              <h2>{k}</h2>
              <p>{v}</p>
            </section>
          ))}
        </div>
      </div>
      <footer className="doc-rodape">LÚDICA · WE MAKE YOU MATTER</footer>
    </article>
  );
}
