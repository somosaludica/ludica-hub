"use client";

/** Abre a impressão do navegador, que também salva em PDF. A página esconde menu e botões ao imprimir. */
export default function BotaoImprimir({ rotulo }: { rotulo: string }) {
  return (
    <button type="button" className="btn fantasma" onClick={() => window.print()}>
      {rotulo}
    </button>
  );
}
