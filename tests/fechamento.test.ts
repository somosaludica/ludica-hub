import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaMes, renunciaNoRecebido, somaMes } from "../src/lib/fechamento.ts";

const MUSIC = [{ socio: "rafa", percentual: 60 }, { socio: "bob", percentual: 40 }];
const base = { outrasEntradas: 0, aportes: 0, impostoPct: 6, reservaPct: 20, participacoes: MUSIC, renuncias: [] };

test("ordem do fechamento: entradas, imposto, reserva, saídas, distribuição", () => {
  const f = fechaMes({ ...base, recebido: 10000, saidas: { conta_fixa: 2000, custo_terceiros: 1500, comissao: 300, outras_saidas: 200, distribuicao: 1000 } });
  assert.equal(f.imposto, 600);
  assert.equal(f.reserva, 2000);
  assert.equal(f.resultadoAntes, 3400);
  assert.equal(f.resultadoMes, 2400);
  assert.deepEqual(f.socios.map((s) => s.parte), [2040, 1360]);
});

test("sócio que abre mão paga sozinho: Rafa recebe 60% do líquido do desconto", () => {
  // Serviço de R$ 10.000: amigo 20% + Bob abre mão de 40%. Cliente paga R$ 4.000.
  assert.equal(renunciaNoRecebido(4000, 40, 60), 4000);
  const f = fechaMes({ ...base, recebido: 4000, saidas: {}, renuncias: [{ socio: "bob", valor: 4000 }] });
  assert.equal(f.resultadoAntes, 2960); // 4.000 − 6% − 20%
  const [rafa, bob] = f.socios;
  // Sem a renúncia o Rafa teria 60% de 2.960 = 1.776. Recebe mais 60% de 2.960 (líquido dos 4.000) = 1.776.
  assert.equal(rafa.parte, 3552);
  assert.equal(bob.parte, -592);
  assert.equal(bob.renunciaLiquida, 2960);
  assert.equal(Math.round((rafa.parte + bob.parte) * 100) / 100, f.resultadoAntes);
});

test("as partes sempre fecham com o resultado, inclusive negativo e com centavos", () => {
  const f = fechaMes({ ...base, recebido: 1000.01, saidas: { conta_fixa: 5000 }, participacoes: [{ socio: "a", percentual: 33.33 }, { socio: "b", percentual: 33.33 }, { socio: "c", percentual: 33.34 }] });
  assert.ok(f.resultadoAntes < 0);
  assert.equal(Math.round(f.socios.reduce((x, s) => x + s.parte * 100, 0)), Math.round(f.resultadoAntes * 100));
});

test("sem participação completa não divide; aporte não é faturamento", () => {
  const f = fechaMes({ ...base, recebido: 1000, aportes: 5000, saidas: {}, participacoes: [{ socio: "rafa", percentual: 60 }] });
  assert.equal(f.participacaoCompleta, false);
  assert.deepEqual(f.socios, []);
  assert.equal(f.imposto, 60);
  assert.equal(f.aportes, 5000);
  assert.equal(renunciaNoRecebido(0, 40, 100), 0);
  assert.equal(somaMes("2026-11", 2), "2027-01");
  assert.equal(somaMes("2026-01", -1), "2025-12");
});
