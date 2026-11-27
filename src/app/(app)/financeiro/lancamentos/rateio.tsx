"use client";

import { useState } from "react";

/** Valor total da conta × parte do ambiente, com os atalhos de rateio e a parte calculada na hora. */
export default function CamposRateio({
  total, parte, atalhos, t,
}: {
  total: string; parte: string; atalhos: { nome: string; pct: number }[];
  t: { total: string; parte: string; calculada: string; informe: string };
}) {
  const [v, setV] = useState(total);
  const [p, setP] = useState(parte);
  const n = (s: string) => Number(s.trim().replace(/[R$\s%]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  const valor = n(v), pct = n(p || "100");
  const ok = v.trim() !== "" && Number.isFinite(valor) && valor > 0 && Number.isFinite(pct) && pct > 0 && pct <= 100;
  const txt = (x: number) => String(x).replace(".", ",");
  return (
    <>
      <div className="linha-2">
        <div>
          <label className="campo" htmlFor="valor_total">
            {t.total}
          </label>
          <input id="valor_total" name="valor_total" className="entrada" inputMode="decimal" placeholder="0,00" required value={v} onChange={(e) => setV(e.target.value)} />
        </div>
        <div>
          <label className="campo" htmlFor="parte_pct">
            {t.parte}
          </label>
          <input id="parte_pct" name="parte_pct" className="entrada" inputMode="decimal" placeholder="100" value={p} onChange={(e) => setP(e.target.value)} aria-describedby="parte-calc" />
        </div>
      </div>
      {atalhos.length > 0 && (
        <div className="chips">
          {atalhos.map((a) => (
            <button key={a.nome} type="button" className="chip" data-sem-carregar aria-pressed={n(p) === a.pct} onClick={() => setP(txt(a.pct))}>
              {txt(a.pct)}% · {a.nome}
            </button>
          ))}
        </div>
      )}
      <div id="parte-calc" className="aviso" role="status">
        {ok ? `${t.calculada} ${(Math.round(Math.round(valor * 100) * pct / 100) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : t.informe}
      </div>
    </>
  );
}
