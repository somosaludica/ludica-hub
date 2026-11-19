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
