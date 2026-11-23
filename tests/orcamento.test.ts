import { test } from "node:test";
import assert from "node:assert/strict";
import { diasDe, juntaLinhas, lerPercentual, lerQtd, numeroOrcamento, situacaoVista, totais, valoresDesconto } from "../src/lib/orcamento.ts";

test("totais do orçamento em centavos exatos", () => {
  assert.deepEqual(totais([{ quantidade: 3, valor_unitario: 33.33 }], 0), { subtotal: 99.99, desconto: 0, total: 99.99 });
  assert.deepEqual(totais([{ quantidade: 1, valor_unitario: 2000 }, { quantidade: 2, valor_unitario: 500 }], 10), { subtotal: 3000, desconto: 300, total: 2700 });
  assert.deepEqual(totais([{ quantidade: 1.5, valor_unitario: 150 }], 12.5), { subtotal: 225, desconto: 28.13, total: 196.87 });
  assert.deepEqual(totais([], 50), { subtotal: 0, desconto: 0, total: 0 });
  assert.deepEqual(totais([{ quantidade: 1, valor_unitario: 0.1 }, { quantidade: 1, valor_unitario: 0.2 }], 0).total, 0.3);
});

test("número, validade e leitura de campos", () => {
  assert.equal(numeroOrcamento("music", 12), "MUS-0012");
  const hoje = new Date("2026-11-20T00:00:00Z");
  assert.equal(situacaoVista("enviado", "2026-11-19", hoje), "expirado");
  assert.equal(situacaoVista("enviado", "2026-11-20", hoje), "enviado");
  assert.equal(situacaoVista("aprovado", "2026-11-01", hoje), "aprovado");
  assert.equal(diasDe("7 dias corridos"), 7);
  assert.equal(diasDe(null), 7);
  assert.equal(diasDe("sem prazo", 10), 10);
  assert.equal(juntaLinhas(["Hospedagem\nDomínio", "domínio\n\nSSL", null]), "Hospedagem\nDomínio\nSSL");
  assert.equal(lerQtd("1,5"), 1.5);
  assert.equal(lerQtd(""), 0);
  assert.equal(lerQtd("-1"), null);
  assert.equal(lerQtd("abc"), null);
});

test("vários descontos somam e as linhas fecham com o total", () => {
  // Giovanna: amigo 20% + sócio abre mão de 40% num serviço de R$ 10.000 -> paga R$ 4.000
  assert.deepEqual(valoresDesconto(10000, [20, 40]), [2000, 4000]);
  assert.equal(totais([{ quantidade: 1, valor_unitario: 10000 }], 60).total, 4000);
  // centavo de arredondamento fica na última linha
  const v = valoresDesconto(99.99, [33.33, 33.33]);
  assert.equal(Math.round((v[0] + v[1]) * 100) / 100, totais([{ quantidade: 1, valor_unitario: 99.99 }], 66.66).desconto);
  assert.deepEqual(valoresDesconto(500, []), []);
  assert.equal(lerPercentual("12,5"), 12.5);
  assert.equal(lerPercentual(""), 0);
  assert.equal(lerPercentual("101"), null);
  assert.equal(lerPercentual("abc"), null);
});
