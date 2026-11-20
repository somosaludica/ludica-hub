import { test } from "node:test";
import assert from "node:assert/strict";
import { textos, idiomaDoPedido } from "../src/lib/i18n.ts";

test("todo texto existe e não está vazio nos três idiomas", () => {
  for (const idioma of ["pt", "en", "es"] as const) {
    const t = textos(idioma) as Record<string, unknown>;
    for (const [chave, valor] of Object.entries(t)) {
      if (typeof valor === "string") assert.ok(valor.trim(), `${idioma}.${chave} vazio`);
      else if (typeof valor === "function") assert.ok(String((valor as (...a: unknown[]) => string)(2, 3)).trim(), `${idioma}.${chave}`);
      else for (const [k, v] of Object.entries(valor as Record<string, string>)) assert.ok(v.trim(), `${idioma}.${chave}.${k}`);
    }
  }
});

test("idioma antes do login: cookie, depois navegador, depois português", () => {
  assert.equal(idiomaDoPedido("es", "en-US,en;q=0.9"), "es");
  assert.equal(idiomaDoPedido(undefined, "en-US,en;q=0.9"), "en");
  assert.equal(idiomaDoPedido(undefined, "fr-FR,es;q=0.8"), "es");
  assert.equal(idiomaDoPedido("xx", null), "pt");
});
