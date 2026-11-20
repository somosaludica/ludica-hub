"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Nave from "./nave";
import styles from "./carregando.module.css";

/**
 * Indicador de carregamento padrão do sistema: depois de um clique que busca algo no servidor
 * (link interno, botão de enviar), a nave da Lúdica gira junto do cursor até a resposta chegar.
 * No celular ela aparece onde o dedo tocou.
 *
 * Como sabe que terminou: conta as requisições abertas depois do clique (páginas e ações do Next
 * passam todas pelo fetch) e desliga quando zera ou quando a página muda. Se nada for buscado
 * em 400 ms, o clique não carregava nada e o indicador nem chega a aparecer.
 */
export default function Carregando() {
  const pathname = usePathname();
  const [ativo, setAtivo] = useState(false);
  const pos = useRef({ x: -100, y: -100 });
  const caixa = useRef<HTMLDivElement>(null);
  const estado = useRef({ ativo: false, abertas: 0, viuFetch: false, inicio: 0 });
  const timers = useRef<number[]>([]);

  const limpar = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const parar = () => {
    limpar();
    estado.current = { ativo: false, abertas: 0, viuFetch: false, inicio: 0 };
    setAtivo(false);
  };

  // Página nova carregada: acabou.
  useEffect(() => {
    parar();
  }, [pathname]);

  useEffect(() => {
    // Conta requisições abertas enquanto o indicador está ligado.
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const e = estado.current;
      const conta = e.ativo;
      if (conta) {
        e.abertas++;
        e.viuFetch = true;
      }
      try {
        return await original(...args);
      } finally {
        if (conta && estado.current.ativo) {
          estado.current.abertas--;
          if (estado.current.abertas <= 0) {
            // pequena folga para a tela atualizar antes de esconder
            timers.current.push(window.setTimeout(() => estado.current.abertas <= 0 && parar(), 120));
          }
        }
      }
    };

    const mover = (ev: PointerEvent) => {
      pos.current = { x: ev.clientX, y: ev.clientY };
      if (caixa.current) caixa.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 16}px)`;
    };

    const clicar = (ev: MouseEvent) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const alvo = (ev.target as Element | null)?.closest?.("a, button, [data-carrega]");
      if (!alvo || alvo.closest("[data-sem-carregar]")) return;
      // O Link do Next cancela o clique para navegar sem recarregar: isso conta como carregamento.
      if (ev.defaultPrevented && !(alvo instanceof HTMLAnchorElement)) return;

      if (alvo instanceof HTMLAnchorElement) {
        if (alvo.target === "_blank" || alvo.hasAttribute("download")) return;
        const url = new URL(alvo.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname && url.search === location.search) return; // mesma página ou âncora
      } else if (alvo instanceof HTMLButtonElement) {
        if (alvo.disabled || alvo.type !== "submit" || !alvo.form) return;
        if (!alvo.form.checkValidity()) return;
      }

      limpar();
      estado.current = { ativo: true, abertas: 0, viuFetch: false, inicio: Date.now() };
      if (caixa.current) caixa.current.style.transform = `translate(${pos.current.x + 14}px, ${pos.current.y + 16}px)`;
      setAtivo(true);
      // Nada foi buscado: o clique não carregava nada.
      timers.current.push(window.setTimeout(() => !estado.current.viuFetch && parar(), 400));
      // Rede de segurança: nunca fica girando para sempre.
      timers.current.push(window.setTimeout(parar, 20000));
    };

    window.addEventListener("pointermove", mover, { passive: true });
    window.addEventListener("pointerdown", mover, { passive: true });
    document.addEventListener("click", clicar);
    // Envio de formulário pelo Enter também conta.
    const enviar = (ev: SubmitEvent) => {
      if (ev.defaultPrevented || estado.current.ativo) return;
      limpar();
      estado.current = { ativo: true, abertas: 0, viuFetch: false, inicio: Date.now() };
      setAtivo(true);
      timers.current.push(window.setTimeout(() => !estado.current.viuFetch && parar(), 400));
      timers.current.push(window.setTimeout(parar, 20000));
    };
    document.addEventListener("submit", enviar);
    return () => {
      window.fetch = original;
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerdown", mover);
      document.removeEventListener("click", clicar);
      document.removeEventListener("submit", enviar);
      limpar();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(styles.ocupado, ativo);
  }, [ativo]);

  return (
    <>
      <div ref={caixa} className={styles.caixa} data-ativo={ativo || undefined}>
        <Nave className={styles.nave} />
      </div>
      <span className={styles.leitor} role="status" aria-live="polite">
        {ativo ? "Carregando…" : ""}
      </span>
    </>
  );
}
