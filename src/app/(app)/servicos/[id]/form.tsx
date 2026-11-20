"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { reaisCampo, UNIDADES, type Unidade } from "@/lib/formatos";
import { salvarServico, type Estado } from "../acoes";

export type Servico = {
  id: string;
  categoria: string;
  nome: string;
  valor: number;
  unidade: Unidade;
  prazo_minimo_meses: number | null;
  complemento: boolean;
  visivel_comercial: boolean;
  ativo: boolean;
  observacao_interna: string | null;
};

export default function FormServico({ servico, categorias }: { servico: Servico | null; categorias: string[] }) {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(salvarServico, {});
  const v = estado.valores;
  const txt = (k: string, atual: string) => v?.[k] ?? atual;
  const marc = (k: string, atual: boolean) => (v ? v[k] === "on" : atual);
  const [unidade, setUnidade] = useState<Unidade>(servico?.unidade ?? "unitario");
  // Depois de um erro o formulário é restaurado com o que foi digitado; a unidade acompanha.
  useEffect(() => {
    if (v?.unidade) setUnidade(v.unidade as Unidade);
  }, [v]);
  const mensal = unidade === "mensal";

  return (
    // key: a cada erro o formulário é remontado com o que foi digitado (o React limpa os campos após enviar).
    <form key={estado.n ?? 0} action={enviar} className="cartao form" noValidate>
      {servico && <input type="hidden" name="id" value={servico.id} />}

      {estado.erro && (
        <div className="aviso erro" role="alert">
          {estado.erro}
        </div>
      )}

      <div className="linha-2">
        <div>
          <label className="campo" htmlFor="categoria">
            Categoria
          </label>
          <input
            id="categoria"
            name="categoria"
            className="entrada"
            list="categorias"
            required
            defaultValue={txt("categoria", servico?.categoria ?? "")}
            aria-describedby="categoria-dica"
          />
          <datalist id="categorias">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div id="categoria-dica" className="dica">
            Escolha uma existente ou digite uma nova.
          </div>
        </div>
        <div>
          <label className="campo" htmlFor="nome">
            Nome do serviço
          </label>
          <input id="nome" name="nome" className="entrada" required defaultValue={txt("nome", servico?.nome ?? "")} />
        </div>
      </div>

      <div className="linha-3">
        <div>
          <label className="campo" htmlFor="valor">
            Valor (R$)
          </label>
          <input
            id="valor"
            name="valor"
            className="entrada"
            inputMode="decimal"
            required
            placeholder="0,00"
            defaultValue={txt("valor", reaisCampo(servico ? Number(servico.valor) : null))}
          />
        </div>
        <div>
          <label className="campo" htmlFor="unidade">
            Unidade de cobrança
          </label>
          <select
            id="unidade"
            name="unidade"
            className="entrada"
            defaultValue={txt("unidade", servico?.unidade ?? "unitario")}
            onChange={(e) => setUnidade(e.target.value as Unidade)}
          >
            {Object.entries(UNIDADES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="campo" htmlFor="prazo">
            Prazo mínimo (meses)
          </label>
          <input
            id="prazo"
            name="prazo"
            type="number"
            min={1}
            max={60}
            className="entrada"
            disabled={!mensal}
            defaultValue={txt("prazo", String(servico?.prazo_minimo_meses ?? ""))}
            aria-describedby="prazo-dica"
          />
          <div id="prazo-dica" className="dica">
            {mensal ? "Deixe vazio se não houver prazo mínimo." : "Só para serviços mensais."}
          </div>
        </div>
      </div>

      <div>
        <label className="campo" htmlFor="observacao">
          Observação interna
        </label>
        <textarea
          id="observacao"
          name="observacao"
          className="entrada"
          rows={2}
          defaultValue={txt("observacao", servico?.observacao_interna ?? "")}
          aria-describedby="obs-dica"
        />
        <div id="obs-dica" className="dica">
          Só o time vê. Não vai para o cliente.
        </div>
      </div>

      <div>
        <label className="marcar">
          <input type="checkbox" name="complemento" defaultChecked={marc("complemento", servico?.complemento ?? false)} />
          É um complemento: só entra no orçamento junto de outro serviço
        </label>
        <label className="marcar">
          <input type="checkbox" name="visivel_comercial" defaultChecked={marc("visivel_comercial", servico?.visivel_comercial ?? true)} />
          Visível para o time comercial
        </label>
        <label className="marcar">
          <input type="checkbox" name="ativo" defaultChecked={marc("ativo", servico?.ativo ?? true)} />
          Ativo: aparece na hora de montar orçamento
        </label>
      </div>

      <div className="acoes">
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar"}
        </button>
        <Link href="/servicos" className="btn fantasma">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
