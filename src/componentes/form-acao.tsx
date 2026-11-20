"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Resposta de uma ação de formulário: a mensagem de erro e o que a pessoa tinha digitado. */
export type Estado = { erro?: string; valores?: [string, string][]; link?: { titulo: string; url: string } };

/**
 * Formulário padrão do sistema. Os campos são escritos na própria página (com os textos do idioma);
 * este componente envia para a ação do servidor, mostra o erro e, quando há erro, devolve aos campos
 * o que foi digitado (o React limpa o formulário depois de cada envio).
 */
export default function FormAcao({
  acao,
  children,
  className = "cartao form",
  tLink,
}: {
  /** Textos da caixa de link de acesso (só para ações que devolvem um link). */
  tLink?: { explica: string; copiar: string; copiado: string };
  acao: (anterior: Estado, dados: FormData) => Promise<Estado>;
  children: React.ReactNode;
  className?: string;
}) {
  const [estado, enviar] = useActionState(acao, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = ref.current;
    if (!form || !estado.valores) return;
    const mapa = new Map<string, string[]>();
    for (const [k, v] of estado.valores) mapa.set(k, [...(mapa.get(k) ?? []), v]);
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
      if (!el.name || el.type === "hidden" || el.type === "file" || el.type === "password") continue;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        el.checked = (mapa.get(el.name) ?? []).includes(el.value);
      } else if (mapa.has(el.name)) {
        el.value = mapa.get(el.name)![0];
      }
    }
    form.querySelector<HTMLElement>("[role=alert]")?.scrollIntoView({ block: "nearest" });
  }, [estado]);

  return (
    <form ref={ref} action={enviar} className={className} noValidate>
      {estado.erro && (
        <div className="aviso erro" role="alert">
          {estado.erro}
        </div>
      )}
      {estado.link && tLink && <CaixaLink link={estado.link} t={tLink} />}
      {children}
    </form>
  );
}

/** Botão de enviar que mostra o texto de espera enquanto a ação roda. */
export function BotaoEnviar({ rotulo, enviando, className = "btn" }: { rotulo: string; enviando: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? enviando : rotulo}
    </button>
  );
}

function CaixaLink({ link, t }: { link: { titulo: string; url: string }; t: { explica: string; copiar: string; copiado: string } }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => setCopiado(false), [link.url]);
  return (
    <div className="aviso ok" role="status">
      <strong>{link.titulo}</strong>
      <p className="sub" style={{ margin: "4px 0 8px", color: "inherit" }}>{t.explica}</p>
      <div className="link-caixa">
        <input className="entrada" readOnly value={link.url} aria-label={link.titulo} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link.url);
              setCopiado(true);
            } catch {
              /* sem permissão de área de transferência: o campo fica selecionável */
            }
          }}
        >
          {copiado ? t.copiado : t.copiar}
        </button>
      </div>
    </div>
  );
}
