import { test } from "node:test";
import assert from "node:assert/strict";
import { reais, cpfValido, cnpjValido, documentoValido, diasAteAniversario, avisoAniversario } from "../src/lib/formatos.ts";

test("reais no formato brasileiro", () => {
  assert.equal(reais(1234.5), "R$ 1.234,50");
  assert.equal(reais(0), "R$ 0,00");
  assert.equal(reais(null), "R$ —");
});

test("CPF e CNPJ pelos dígitos verificadores", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("529.982.247-24"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cnpjValido("11.222.333/0001-81"), true);
  assert.equal(cnpjValido("11.222.333/0001-80"), false);
  assert.equal(documentoValido(""), true);
  assert.equal(documentoValido("123"), false);
});

test("dias até o aniversário", () => {
  const hoje = new Date(Date.UTC(2026, 10, 19));
  assert.equal(diasAteAniversario("1995-11-19", hoje), 0);
  assert.equal(diasAteAniversario("1995-11-26", hoje), 7);
  assert.equal(diasAteAniversario("1995-11-18", hoje), 364);
  assert.equal(diasAteAniversario("2000-01-01", hoje), 43);
});

test("aniversário em 29 de fevereiro cai em 28 no ano comum", () => {
  assert.equal(diasAteAniversario("2000-02-29", new Date(Date.UTC(2027, 1, 27))), 1);
});

test("aviso sai uma semana antes e um dia antes", () => {
  const hoje = new Date(Date.UTC(2026, 10, 19));
  assert.equal(avisoAniversario("1990-11-26", hoje), "semana");
  assert.equal(avisoAniversario("1990-11-20", hoje), "amanha");
  assert.equal(avisoAniversario("1990-11-22", hoje), null);
  assert.equal(avisoAniversario(null, hoje), null);
});

test("lê valores digitados em reais", async () => {
  const { lerReais, reaisCampo } = await import("../src/lib/formatos.ts");
  assert.equal(lerReais("1.500,00"), 1500);
  assert.equal(lerReais("150"), 150);
  assert.equal(lerReais("R$ 150,5"), 150.5);
  assert.equal(lerReais("0,99"), 0.99);
  assert.equal(lerReais("1500.00"), null);
  assert.equal(lerReais("abc"), null);
  assert.equal(lerReais(""), null);
  assert.equal(lerReais("-10"), null);
  assert.equal(reaisCampo(1500), "1.500,00");
});

test("hoje em São Paulo não vira o dia antes da hora", async () => {
  const { hojeSP, dataCurta } = await import("../src/lib/formatos.ts");
  // 01:30 UTC do dia 20 ainda é dia 19 em São Paulo (UTC-3)
  assert.equal(hojeSP(new Date("2026-11-20T01:30:00Z")).toISOString().slice(0, 10), "2026-11-19");
  assert.equal(hojeSP(new Date("2026-11-20T03:30:00Z")).toISOString().slice(0, 10), "2026-11-20");
  assert.equal(dataCurta("1990-03-07"), "07/03");
  assert.equal(dataCurta("1990-03-07", true), "07/03/1990");
});
