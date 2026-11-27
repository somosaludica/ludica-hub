import { test } from "node:test";
import assert from "node:assert/strict";
import { apura, aporteDoMes, estadoDe, parteDoAmbiente, porMes, posicao, renunciaNoRecebido, resultadoReal, somaMes, type Mov, type Recebimento } from "../src/lib/financeiro.ts";

const PARTES = [{ socio: "bob", percentual: 40 }, { socio: "rafa", percentual: 60 }];
const rec = (o: Partial<Recebimento>): Recebimento => ({ id: "r", origem: "lancamento", data: "2026-08-17", descricao: "LUKA", receita: 8400, impostoPct: 6, reservaPct: 20, custos: 0, partes: null, renuncias: [], obs: null, ...o });
const mov = (o: Partial<Mov>): Mov => ({ id: "m", origem: "lancamento", tipo: "saida", categoria: "conta_fixa", rubrica: null, descricao: "x", mes: "2026-08", vencimento: null, pagoEm: null, valor: 0, valorTotal: 0, pct: 100, estado: "pago", fora: false, comprovante: null, comprovanteNome: null, conta: null, socio: null, obs: null, ...o });

test("apuração do recebimento, igual ao controle antigo (LUKA: 8.400 → 6.216 → Rafa 3.729,60 / Bob 2.486,40)", () => {
  const a = apura(rec({}), PARTES);
  assert.deepEqual([a.imp, a.res, a.cus, a.lucro], [504, 1680, 0, 6216]);
  assert.deepEqual(a.partes, [{ socio: "rafa", valor: 3729.6 }, { socio: "bob", valor: 2486.4 }]);
});

test("custo do projeto sai antes de dividir; participação congelada no recebimento vale mais que a atual", () => {
  const a = apura(rec({ custos: 400, partes: [{ socio: "bob", percentual: 100 }] }), PARTES);
  assert.equal(a.lucro, 5816);
  assert.deepEqual(a.partes, [{ socio: "bob", valor: 5816 }]);
});

test("sem participação somando 100% não divide", () => {
  assert.equal(apura(rec({}), [{ socio: "rafa", percentual: 60 }]).completa, false);
});

test("sócio que abre mão paga sozinho: o outro recebe sobre o líquido do desconto", () => {
  // Serviço de 1.000 com 40% de desconto do Bob: recebido 600, renúncia 400 (líquida de 26% = 296).
  assert.equal(renunciaNoRecebido(600, 40, 40), 400);
  const a = apura(rec({ receita: 600, renuncias: [{ socio: "bob", valor: 400 }] }), PARTES);
  assert.equal(a.lucro, 444);
  assert.deepEqual(a.partes, [{ socio: "rafa", valor: 444 }, { socio: "bob", valor: 0 }]); // Rafa: 60% de 740; Bob: 40% de 740 − 296
});

test("estado da conta: atraso por data, aviso à mão, paga", () => {
  assert.equal(estadoDe({ situacao: "provisionada", aviso: null, vencimento: "2026-11-25" }, "2026-11-27"), "em_atraso");
  assert.equal(estadoDe({ situacao: "provisionada", aviso: null, vencimento: "2026-11-27" }, "2026-11-27"), "a_vencer");
  assert.equal(estadoDe({ situacao: "provisionada", aviso: "em_atraso", vencimento: null }, "2026-11-27"), "em_atraso");
  assert.equal(estadoDe({ situacao: "provisionada", aviso: "a_confirmar", vencimento: "2026-01-01" }, "2026-11-27"), "a_confirmar");
  assert.equal(estadoDe({ situacao: "paga", aviso: null, vencimento: "2026-01-01" }, "2026-11-27"), "pago");
});

test("rateio: aluguel de 13.000 pela metragem dá 4.942,96 para a Music", () => {
  assert.equal(parteDoAmbiente(13000, 38.0227753703517), 4942.96);
  assert.equal(parteDoAmbiente(199.9, 50), 99.95);
});

test("posição dos sócios com os números reais da Music em 27/11/2026", () => {
  const movs: Mov[] = [
    mov({ id: "e1", tipo: "entrada", categoria: "outras_entradas", valor: 8400 }),
    mov({ id: "e2", tipo: "entrada", categoria: "outras_entradas", valor: 8400, mes: "2026-09" }),
    mov({ id: "c", valor: 8212.02 }),                                                    // contas e custos pagos no fluxo
    mov({ id: "f", valor: 4942.96, fora: true }),                                        // aluguel antecipado: fora do fluxo
    mov({ id: "a", valor: 457.12, estado: "em_atraso" }),
    mov({ id: "d1", categoria: "distribuicao", socio: "rafa", valor: 5880.8 }),
    mov({ id: "d2", categoria: "distribuicao", socio: "bob", valor: 4972.8 }),
  ];
  const p = posicao({ movs, recs: [rec({}), rec({ id: "r2", data: "2026-09-15" })], participacoes: PARTES, cobertura: "bob" });
  assert.deepEqual([p.recebido, p.imposto, p.pagas, p.distribuido], [16800, 1008, 8212.02, 10853.6]);
  assert.deepEqual([p.antes, p.caixa, p.coberto], [7579.98, -3273.62, 3273.62]);
  assert.deepEqual([p.fundo, p.falta, p.emAtraso, p.naoRetirado], [-4852.02, 4852.02, 457.12, 1578.4]);
  const [rafa, bob] = p.socios;
  assert.deepEqual(rafa, { socio: "rafa", pct: 60, direito: 7459.2, retirado: 5880.8, saldo: 1578.4, falta: 2911.21, aportado: 0, posicao: -1332.81 });
  assert.deepEqual(bob, { socio: "bob", pct: 40, direito: 4972.8, retirado: 4972.8, saldo: 0, falta: 1940.81, aportado: 3273.62, posicao: 1332.81 });
});

test("resumo por mês: contas pelo mês de referência, imposto pela data do recebimento", () => {
  const linhas = porMes([
    mov({ tipo: "entrada", categoria: "outras_entradas", valor: 8400 }),
    mov({ valor: 100 }), mov({ valor: 50, estado: "a_vencer" }), mov({ valor: 999, fora: true }),
    mov({ categoria: "distribuicao", socio: "rafa", valor: 3880.8 }),
    mov({ valor: 70, mes: "2026-09", estado: "em_atraso" }),
  ], [rec({})], PARTES);
  assert.deepEqual(linhas[0], { mes: "2026-08", faturado: 8400, recebido: 8400, contas: 150, pagas: 100, abertas: 50, imposto: 504, distribuido: 3880.8 });
  assert.equal(resultadoReal(linhas[0]), 3915.2);
  assert.equal(linhas[1].abertas, 70);
});

test("aporte necessário no mês: o que o fundo não cobre, pela participação", () => {
  assert.deepEqual(aporteDoMes(6007.34, -4852.02, PARTES), { disponivel: 0, falta: 6007.34, socios: [{ socio: "rafa", pct: 60, valor: 3604.4 }, { socio: "bob", pct: 40, valor: 2402.94 }] });
  assert.equal(aporteDoMes(500, 800, PARTES).falta, 0);
});

test("soma de meses vira o ano", () => {
  assert.equal(somaMes("2026-11", 2), "2027-01");
});
