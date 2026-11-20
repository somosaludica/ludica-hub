import Link from "next/link";

/** Página ou registro que não existe, ou que é de outro ambiente. */
export default function NaoEncontrado() {
  return (
    <div className="cartao pilha" style={{ maxWidth: 560 }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Não encontrado</h1>
      <p className="sub">
        Esse endereço não existe ou pertence a outro ambiente. Se você trocou de ambiente agora, volte e abra pela lista.
      </p>
      <div>
        <Link href="/" className="btn">
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
