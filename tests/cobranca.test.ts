import { test } from "node:test";
import assert from "node:assert/strict";
import { dataValida, diasAte, dividir, numeroNota, numeroWhatsapp, plano, planoMensal, somaMeses, vistaCobranca } from "../src/lib/cobranca.ts";

const r = (i: number, n: number) => `parcela ${i} de ${n}`;

test("parcelas fecham com o total ao centavo", () => {
  assert.deepEqual(dividir(1000, 3), [333.33, 333.33, 333.34]);
  assert.deepEqual(dividir(2000, 2), [1000, 1000]);
  assert.equal(dividir(0.05, 3).reduce((a, b) => a + Math.round(b * 100), 0), 5);
  const p = plano(2400, 2, "2026-12-10", "Faixa Completa", r, false);
  assert.deepEqual(p.map((x) => [x.descricao, x.vencimento, x.valor]), [
    ["Faixa Completa · parcela 1 de 2", "2026-12-10", 1200],
    ["Faixa Completa · parcela 2 de 2", "2027-01-10", 1200],
  ]);
  assert.equal(plano(500, 1, "2026-12-10", "Mix", r, false)[0].descricao, "Mix");
  assert.deepEqual(plano(0, 2, "2026-12-10", "x", r, false), []);
});

test("mensal repete o valor e nasce com envio automático", () => {
  const p = planoMensal(2700, 3, "2027-01-31", "Gestão de Tráfego", (i, n) => `mês ${i} de ${n}`);
  assert.deepEqual(p.map((x) => x.vencimento), ["2027-01-31", "2027-02-28", "2027-03-31"]);
  assert.ok(p.every((x) => x.valor === 2700 && x.automatico));
  assert.equal(p[2].descricao, "Gestão de Tráfego · mês 3 de 3");
});

test("datas, situação e WhatsApp", () => {
  assert.equal(somaMeses("2024-01-31", 1), "2024-02-29");
  assert.equal(somaMeses("2026-11-15", 2), "2027-01-15");
  assert.ok(dataValida("2026-12-01"));
  assert.ok(!dataValida("2026-02-30"));
  assert.ok(!dataValida("01/12/2026"));
  const hoje = new Date("2026-11-23T00:00:00Z");
  assert.equal(vistaCobranca("aberta", "2026-11-22", hoje), "vencida");
  assert.equal(vistaCobranca("aberta", "2026-11-23", hoje), "a_vencer");
  assert.equal(vistaCobranca("paga", "2026-11-01", hoje), "paga");
  assert.equal(diasAte("2026-11-19", hoje), -4);
  assert.equal(diasAte("2026-11-28", hoje), 5);
  assert.equal(numeroNota("mkt", 7), "ND-MKT-0007");
  assert.equal(numeroWhatsapp("(11) 98888-1111"), "5511988881111");
  assert.equal(numeroWhatsapp("+55 11 98888-1111"), "5511988881111");
  assert.equal(numeroWhatsapp("123"), null);
});
