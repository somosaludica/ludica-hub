# Lúdica HUB — instruções para o Claude

Sistema de gestão da Lúdica (HUB, MUSIC, MKT). Construído e mantido pelo Bob (sócio) com o Claude.

## Fontes da verdade
- Escopo (regras de negócio): https://claude.ai/artifact/WiwjLBkcr3pcC2V1x3zA7F
- Protótipo das telas: https://claude.ai/artifact/CtwJzAjeGd8L98aofBEu6K
- Se o código, o escopo e o protótipo divergirem, pergunte ao Bob antes de mudar qualquer um.

## Stack
- Next.js 16 (App Router, `src/`), React 19, TypeScript, CSS Modules + `src/app/globals.css` (tokens da marca e modo noturno).
- Supabase: banco, login e arquivos. Clientes em `src/lib/supabase/`. `src/proxy.ts` renova a sessão e protege as páginas.
- Vercel para publicar. Variáveis em `.env.example`.

## Regras que não podem quebrar
1. **Permissão é perfil + ambiente**, garantida por RLS no banco, nunca só na tela. Perfis: sócio, administrativo, comercial, pauta. Toda tabela nova nasce com `enable row level security`, políticas que usam `tem_perfil()` e um teste em `supabase/tests/permissoes.sql`.
2. **Ambientes são independentes no dinheiro.** Faturamento, orçamentos, contratos, cobranças e lançamentos têm `ambiente_id` e só aparecem para quem tem acesso àquele ambiente. O cadastro de clientes é comum.
3. **Pauta nunca vê valores.** Nem preço de serviço, nem orçamento, nem financeiro.
4. **O comercial só vê os próprios leads e clientes** e os serviços marcados como visíveis para ele. Pede orçamento; quem monta é sócio ou administrativo.
5. Um ambiente nunca fica sem sócio ativo. Ninguém desativa a própria conta.
6. Histórico (etapas de lead, e nas próximas fases envios de cobrança e reabertura de mês) é imutável pela API.
7. A chave secreta do Supabase nunca vai para o código do navegador nem para o repositório.
8. **Descontos somam** sobre o valor cheio, em linhas (`orcamento_descontos`). O desconto de tipo `socio` é o sócio abrindo mão da parte dele: só o próprio sócio cria, e no fechamento ele sai SÓ da parte desse sócio (os outros recebem como se o desconto não existisse). O fechamento da fase 3 precisa respeitar isso.

## Banco
- Migrações numeradas em `supabase/migrations/NNNN_nome.sql`; nunca editar uma que já rodou em produção, criar a próxima.
- Toda migração que cria tabela, sequência ou função libera o acesso para `authenticated` (nunca `anon`), como no fim da 0001.
- Rodar `npm run test:banco` antes de enviar qualquer migração.

## Estilo
- Interface em português, inglês e espanhol. **Nenhuma tela escreve texto direto no código**: tudo vem de `src/lib/i18n.ts`, sempre nos três idiomas (o TypeScript e `tests/i18n.test.ts` cobram). Não se traduz o que é dado digitado (nomes e categorias de serviço, clientes) nem o formato dos valores em reais. Tom direto.
- Cores da logo: preto #0E0F15 e laranja #F3901F; vinho #7B1418 e creme #F7F1E6. Laranja nunca é texto nem linha fina sobre fundo claro.
- Acessível: botões de verdade, alvos de 44px, texto com contraste 4,5:1, bordas de campo 3:1, foco visível.
- No celular: menu recolhível, tabelas viram cartões, formulários em uma coluna.
- Tamanhos compactos (decisão de 19/11): texto 13–14px, títulos de página 24px, botões e campos com 44px de altura. Não aumentar sem falar com o Bob.
- Formulários: usar `FormAcao` e `BotaoEnviar` (`src/componentes/form-acao.tsx`) com `falha()` de `src/lib/form.ts`, que devolvem o que foi digitado quando há erro. Gravação que volta sem linha (RLS filtra em silêncio) é erro.
- Convite é por link de acesso gerado no servidor (sem e-mail até existir SMTP próprio). Só gera link para alguém quem é sócio de TODOS os ambientes dessa pessoa: o link entra como ela.
- Carregando: todo clique que busca algo no servidor mostra a nave da Lúdica girando junto do cursor (`src/app/carregando.tsx`, já ligado para links internos e botões de enviar). Não criar outro indicador; para um clique que não deve mostrar, use `data-sem-carregar`; para um elemento que deve mostrar e não é link nem botão, `data-carrega`.
