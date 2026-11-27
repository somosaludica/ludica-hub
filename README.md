# Lúdica HUB

Sistema de gestão da Lúdica em três ambientes independentes no dinheiro (HUB, MUSIC e MKT, um CNPJ cada), com cadastro de clientes comum: Tabela de Serviços, clientes e leads, orçamentos e contratos, cobrança com régua automática, financeiro e agendas.

- Escopo (regras de negócio): https://claude.ai/artifact/WiwjLBkcr3pcC2V1x3zA7F
- Protótipo das telas: https://claude.ai/artifact/CtwJzAjeGd8L98aofBEu6K
- Tabela de Serviços (carga inicial): https://claude.ai/artifact/BKbZzM6uw6PTf5jhC2Hhqx

Mesma base técnica do Lúdica OS (Next.js, Supabase, Vercel), em repositório e projeto Supabase separados: este sistema guarda faturamento e contratos, e o OS dá acesso a clientes. A ligação entre os dois fica para a fase de integrações.

## Configuração (uma vez)

1. **Supabase → New project.** Região South America (São Paulo). Guarde a senha do banco num lugar seguro.
2. **SQL Editor:** rode os arquivos de `supabase/migrations/` em ordem numérica (cada um uma única vez) e, depois da 0001, `supabase/seed/servicos.sql`. Depois da 0008 e com o Rafa cadastrado como sócio do MUSIC, `supabase/seed/music_financeiro_antigo.sql` traz os dados do controle financeiro antigo da Music (pode rodar de novo sem duplicar).
3. **Authentication → Users → Add user:** crie o usuário do Bob com "Auto Confirm User" marcado. Troque o e-mail em `supabase/primeiro_socio.sql` e rode no SQL Editor.
4. **Authentication → Sign In / Providers:** desligue "Allow new users to sign up". Só entra quem um sócio convidar.
5. **Vercel → Add New Project:** importe este repositório e configure as variáveis de `.env.example`. A `SUPABASE_SECRET_KEY` vai só na Vercel.
6. **Supabase → Authentication → URL Configuration:** em Site URL, o endereço da Vercel; em Redirect URLs, `https://SEU-ENDERECO/auth/confirmar` e `http://localhost:3000/auth/confirmar`.

## Desenvolvimento

```
npm install
cp .env.example .env.local   # e preencha
npm run dev
npm test                      # regras de formato
npm run test:banco            # migrações e permissões num Postgres 16 local
```

`test:banco` sobe um Postgres temporário com um esquema `auth` mínimo, roda as migrações, a carga de serviços e `supabase/tests/permissoes.sql`, que entra como cada perfil (sócio, administrativo, comercial, pauta, conta desativada) e confere o que cada um vê e altera. Precisa dos binários do Postgres 16 (`PG_BIN` aponta para eles) e não roda como root.

## Fases

1. Base: login, ambientes, perfis e permissões, Tabela de Serviços, clientes e painel de leads. **(no ar)**
2. Comercial: pedido de orçamento e proposta **(no ar)**; PDF nos dois formatos, link para o cliente e contrato com assistente de IA (a fazer).
3. Cobrança e financeiro: cobranças, nota de débito, envio manual e baixa **(no ar)**; financeiro no formato do controle antigo da Music (Resumo, Fluxo mensal, Fechamento do mês, Sócios e lucros), com mês de referência, rateio, comprovante, apuração por recebimento, fundo de reserva e posição dos sócios **(no ar)**; régua automática, comissões, resumo do ano e metas (a fazer). Os arquivos dos comprovantes antigos da Music ficaram no sistema antigo: cada lançamento guarda o nome do arquivo para anexar de novo.
4. Agendas e pauta: sala de reunião, estúdio, sessões, pauta de produção, agenda da casa.
5. Integrações: nota fiscal, assinatura eletrônica, Lúdica OS.

## Deixado para o final (decisão do Bob, 20/11)

Não fazer antes das fases de orçamento, cobrança, financeiro e agendas estarem prontas:

- Acabamento de design das telas (revisão visual geral).
- Foto do cliente e botão da foto do grupo de WhatsApp (depende do armazenamento de arquivos e do modelo que o Bob vai mandar).
- Tela de dados de cada ambiente (razão social, CNPJ, endereço do emissor). Até lá os documentos saem com "Lúdica Marketing".
