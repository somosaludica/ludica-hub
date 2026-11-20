import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px" }} className="pilha">
      <h1 style={{ margin: 0, fontSize: 24 }}>Página não encontrada</h1>
      <div>
        <Link href="/" className="btn">
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
