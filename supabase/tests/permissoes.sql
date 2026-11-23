-- Teste das permissões da Fase 1. Roda num Postgres local com o esquema auth mínimo (ver README),
-- depois da migração 0001 e da carga de serviços. Para no primeiro erro.
\set ON_ERROR_STOP on
\set QUIET on

create schema teste;
create function teste.igual(veio bigint, esperado bigint, msg text) returns void language plpgsql as $$
begin
  if veio is distinct from esperado then
    raise exception 'FALHOU: % (veio %, esperado %)', msg, veio, esperado;
  end if;
  raise notice 'ok  %', msg;
end $$;
create function teste.bloqueado(cmd text, msg text) returns void language plpgsql as $$
begin
  execute cmd;
  raise exception 'FALHOU: % (deveria ter sido bloqueado)', msg;
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok  % (bloqueado: %)', msg, sqlerrm;
end $$;
grant usage on schema teste to authenticated;
grant execute on all functions in schema teste to authenticated;

-- ---------- pessoas de exemplo ----------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'), ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005'), ('00000000-0000-0000-0000-000000000006');
insert into perfis (id, nome, email, ativo) values
  ('00000000-0000-0000-0000-000000000001', 'Bob', 'bob@exemplo', true),
  ('00000000-0000-0000-0000-000000000002', 'Rafa', 'rafa@exemplo', true),
  ('00000000-0000-0000-0000-000000000003', 'Administrativo', 'adm@exemplo', true),
  ('00000000-0000-0000-0000-000000000004', 'Comercial', 'com@exemplo', true),
  ('00000000-0000-0000-0000-000000000005', 'Pauta', 'pauta@exemplo', true),
  ('00000000-0000-0000-0000-000000000006', 'Ex-comercial', 'ex@exemplo', false);
insert into acessos (usuario_id, ambiente_id, perfil) values
  ('00000000-0000-0000-0000-000000000001', 'hub', 'socio'),
  ('00000000-0000-0000-0000-000000000001', 'music', 'socio'),
  ('00000000-0000-0000-0000-000000000001', 'mkt', 'socio'),
  ('00000000-0000-0000-0000-000000000002', 'hub', 'socio'),
  ('00000000-0000-0000-0000-000000000002', 'music', 'socio'),
  ('00000000-0000-0000-0000-000000000003', 'hub', 'administrativo'),
  ('00000000-0000-0000-0000-000000000003', 'music', 'administrativo'),
  ('00000000-0000-0000-0000-000000000003', 'mkt', 'administrativo'),
  ('00000000-0000-0000-0000-000000000004', 'hub', 'comercial'),
  ('00000000-0000-0000-0000-000000000004', 'music', 'comercial'),
  ('00000000-0000-0000-0000-000000000005', 'music', 'pauta'),
  ('00000000-0000-0000-0000-000000000006', 'music', 'comercial');

set role authenticated;

-- ================= Bob (sócio nos três) =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select teste.igual((select count(*) from servicos), 41, 'Bob vê os 41 serviços');
select teste.igual((select count(*) from ambiente_dados), 3, 'Bob vê os dados dos 3 ambientes');
select teste.igual((select count(*) from perfis), 6, 'Bob vê todas as pessoas');
-- Bob tira um serviço do comercial e cadastra um cliente com lead no HUB
update servicos set visivel_comercial = false where nome = 'Mix';
insert into clientes (id, nome, documento) values ('10000000-0000-0000-0000-000000000001', 'Cliente do Bob', '12345678901');
insert into leads (id, cliente_id, ambiente_id) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'hub');
select teste.bloqueado($$delete from acessos where usuario_id = '00000000-0000-0000-0000-000000000001' and ambiente_id = 'mkt'$$,
  'MKT não pode ficar sem sócio');
select teste.bloqueado($$update perfis set ativo = false where id = '00000000-0000-0000-0000-000000000001'$$,
  'Ninguém desativa a própria conta');

-- ================= Rafa (sócio em HUB e MUSIC) =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select teste.igual((select count(*) from servicos), 41, 'Rafa vê os preços de todos os ambientes, MKT incluído');
select teste.igual((select count(*) from ambiente_dados), 2, 'Rafa vê só os dados de HUB e MUSIC');
with u as (update servicos set valor = 1 where ambiente_id = 'mkt' returning 1)
  select teste.igual((select count(*) from u), 0, 'Rafa não altera preço do MKT');
with u as (update servicos set valor = valor where ambiente_id = 'music' returning 1)
  select teste.igual((select count(*) from u), 15, 'Rafa altera os serviços do MUSIC');
select teste.bloqueado($$insert into acessos values ('00000000-0000-0000-0000-000000000004', 'mkt', 'comercial')$$,
  'Rafa não dá acesso ao MKT');
select teste.bloqueado($$update perfis set ativo = false where id = '00000000-0000-0000-0000-000000000001'$$,
  'Rafa não desativa o Bob, que tem acesso ao MKT');
select teste.bloqueado($$update perfis set ativo = false where id = '00000000-0000-0000-0000-000000000003'$$,
  'Rafa não desativa quem também trabalha no MKT');
update perfis set ativo = false where id = '00000000-0000-0000-0000-000000000004';
select teste.igual((select count(*) from perfis where id = '00000000-0000-0000-0000-000000000004' and not ativo), 1,
  'Rafa desativa o comercial de HUB e MUSIC');
update perfis set ativo = true where id = '00000000-0000-0000-0000-000000000004';
select teste.igual((select count(*) from acessos where ambiente_id = 'mkt'), 0, 'Rafa não vê quem acessa o MKT');

-- ================= Administrativo (nos três) =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select teste.igual((select count(*) from servicos), 41, 'Administrativo vê os serviços dos seus ambientes');
select teste.igual((select count(*) from clientes), 1, 'Administrativo vê todo o cadastro de clientes');
select teste.igual((select count(*) from perfis), 6, 'Administrativo vê as pessoas do time (para atribuir leads)');
update perfis set ativo = false where id = '00000000-0000-0000-0000-000000000004';
select teste.igual((select count(*) from perfis where id = '00000000-0000-0000-0000-000000000004' and ativo), 1, 'Administrativo não desativa ninguém');
select teste.bloqueado($$insert into leads (cliente_id, ambiente_id, responsavel_id) values ('10000000-0000-0000-0000-000000000001', 'mkt', '00000000-0000-0000-0000-000000000004')$$,
  'Lead não pode ter responsável sem acesso ao ambiente');
select teste.bloqueado($$insert into leads (cliente_id, ambiente_id, responsavel_id) values ('10000000-0000-0000-0000-000000000001', 'music', '00000000-0000-0000-0000-000000000005')$$,
  'Pauta não pode ser responsável por lead');
select teste.bloqueado($$update leads set etapa = 'perdido' where id = '20000000-0000-0000-0000-000000000001'$$, 'Lead perdido exige motivo');
select teste.igual((select count(*) from leads), 1, 'Administrativo vê os leads dos seus ambientes');
with u as (delete from servicos where nome = 'Master' returning 1)
  select teste.igual((select count(*) from u), 0, 'Administrativo não apaga serviço');
with u as (update ambiente_dados set cnpj = '1' returning 1)
  select teste.igual((select count(*) from u), 0, 'Administrativo não altera os dados do emissor');

-- ================= Comercial (HUB e MUSIC) =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select teste.igual((select count(*) from servicos), 23, 'Comercial vê só os serviços liberados de HUB e MUSIC (9 + 15 - Mix)');
select teste.igual((select count(*) from servicos where ambiente_id = 'mkt'), 0, 'Comercial não vê preços do MKT');
select teste.igual((select count(*) from clientes), 0, 'Comercial não vê clientes dos outros');
select teste.igual((select count(*) from leads), 0, 'Comercial não vê leads dos outros');
insert into clientes (id, nome) values ('10000000-0000-0000-0000-000000000002', 'Lead do comercial');
insert into leads (id, cliente_id, ambiente_id, valor_estimado)
  values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'music', 6000);
select teste.igual((select count(*) from clientes), 1, 'Comercial vê o cliente que cadastrou');
update leads set etapa = 'em_contato' where id = '20000000-0000-0000-0000-000000000002';
update leads set etapa = 'fechado' where id = '20000000-0000-0000-0000-000000000002';
select teste.igual((select count(*) from lead_eventos), 3, 'Mudanças de etapa ficam no histórico');
select teste.igual((select count(*) from leads where fechado_em is not null), 1, 'Lead fechado ganha data de fechamento');
select teste.bloqueado($$insert into leads (cliente_id, ambiente_id, responsavel_id) values ('10000000-0000-0000-0000-000000000002', 'music', '00000000-0000-0000-0000-000000000001')$$,
  'Comercial não cria lead em nome de outra pessoa');
select teste.bloqueado($$insert into leads (cliente_id, ambiente_id) values ('10000000-0000-0000-0000-000000000002', 'mkt')$$,
  'Comercial não cria lead em ambiente sem acesso');
select teste.bloqueado($$update leads set responsavel_id = '00000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000002'$$,
  'Comercial não passa o lead para outra pessoa');
select teste.bloqueado($$delete from lead_eventos$$, 'Ninguém apaga o histórico de etapas');
select teste.bloqueado($$insert into leads (cliente_id, ambiente_id) values ('10000000-0000-0000-0000-000000000001', 'music')$$,
  'Comercial não abre lead em cliente de outra pessoa');
select teste.bloqueado($$update leads set cliente_id = '10000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000002'$$,
  'Comercial não troca o lead para cliente de outra pessoa');
select teste.bloqueado($$insert into acessos values ('00000000-0000-0000-0000-000000000004', 'mkt', 'socio')$$,
  'Comercial não se promove');
select teste.bloqueado($$insert into clientes (nome, documento) values ('Documento inválido', '123')$$,
  'CPF ou CNPJ com número errado de dígitos é recusado');

-- ================= Pauta (MUSIC) =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select teste.igual((select count(*) from servicos), 0, 'Pauta não vê serviços nem valores');
select teste.igual((select count(*) from clientes), 0, 'Pauta não vê o cadastro de clientes');
select teste.igual((select count(*) from leads), 0, 'Pauta não vê leads');
select teste.bloqueado($$insert into clientes (nome) values ('x')$$, 'Pauta não cadastra cliente');

-- ================= Conta desativada =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
select teste.igual((select count(*) from servicos), 0, 'Conta desativada não vê nada');

-- ================= De volta ao Bob =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select teste.igual((select count(*) from clientes), 2, 'Bob vê o cliente que o comercial cadastrou');
select teste.igual((select count(*) from leads), 2, 'Bob vê todos os leads');

-- ================= Orçamentos (fase 2) =================
-- Comercial (HUB e MUSIC) pede orçamento para o cliente dele.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
insert into orcamentos (id, ambiente_id, cliente_id, situacao, desconto_categoria, desconto_motivo)
  values ('30000000-0000-0000-0000-000000000001', 'music', '10000000-0000-0000-0000-000000000002', 'pedido', 'parceiro', 'parceiro antigo');
insert into orcamento_itens (orcamento_id, servico_id, descricao, unidade, quantidade, valor_unitario)
  select '30000000-0000-0000-0000-000000000001', id, 'nome inventado', 'unitario', 2, 1 from servicos where ambiente_id = 'music' and nome = 'Master';
select teste.igual((select count(*) from orcamento_itens where descricao = 'Master' and valor_unitario = 500 and unidade = 'por_faixa'), 1,
  'No pedido do comercial, nome, unidade e preço vêm da tabela');
select teste.igual((select count(*) from servicos where nome = 'Mix'), 0, 'Mix segue oculto para o comercial');
select teste.bloqueado($$insert into orcamentos (ambiente_id, cliente_id, situacao) values ('music', '10000000-0000-0000-0000-000000000002', 'rascunho')$$,
  'Comercial não cria orçamento direto, só pedido');
select teste.bloqueado($$insert into orcamentos (ambiente_id, cliente_id, situacao) values ('music', '10000000-0000-0000-0000-000000000001', 'pedido')$$,
  'Comercial não pede orçamento para cliente de outra pessoa');
select teste.bloqueado($$insert into orcamentos (ambiente_id, cliente_id, situacao) values ('mkt', '10000000-0000-0000-0000-000000000002', 'pedido')$$,
  'Comercial não pede orçamento em ambiente sem acesso');
update orcamentos set situacao = 'rascunho' where id = '30000000-0000-0000-0000-000000000001';
select teste.igual((select count(*) from orcamentos where situacao = 'pedido'), 1, 'Comercial não muda a situação do pedido');
select teste.bloqueado($$insert into orcamento_itens (orcamento_id, servico_id, descricao, unidade, quantidade, valor_unitario)
  select '30000000-0000-0000-0000-000000000001', id, 'x', 'unitario', 1, 1 from servicos where ambiente_id = 'hub' limit 1$$,
  'Item precisa ser de serviço do mesmo ambiente');

-- Administrativo monta: preço próprio vale, desconto precisa de sócio para enviar.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select teste.igual((select count(*) from orcamentos), 1, 'Administrativo vê o pedido do comercial');
select teste.igual((select numero from orcamentos where id = '30000000-0000-0000-0000-000000000001')::bigint, 1, 'Numeração começa em 1 no ambiente');
update orcamentos set situacao = 'rascunho' where id = '30000000-0000-0000-0000-000000000001';
insert into orcamento_descontos (orcamento_id, tipo, percentual, motivo) values ('30000000-0000-0000-0000-000000000001', 'amigo', 10, 'amiga da casa');
select teste.igual((select desconto_percentual from orcamentos where id = '30000000-0000-0000-0000-000000000001')::bigint, 10, 'O total de desconto é a soma das linhas');
select teste.bloqueado($$insert into orcamento_descontos (orcamento_id, tipo, percentual, socio_id) values ('30000000-0000-0000-0000-000000000001', 'socio', 40, '00000000-0000-0000-0000-000000000001')$$,
  'Administrativo não abre mão da parte de um sócio');
select teste.bloqueado($$insert into orcamento_descontos (orcamento_id, tipo, percentual) values ('30000000-0000-0000-0000-000000000001', 'socio', 40)$$,
  'Desconto de sócio precisa dizer qual sócio');
select teste.bloqueado($$update orcamentos set desconto_percentual = 5 where id = '30000000-0000-0000-0000-000000000001'$$, 'O total de desconto não é digitado direto');
update orcamento_itens set valor_unitario = 450 where orcamento_id = '30000000-0000-0000-0000-000000000001';
select teste.igual((select count(*) from orcamento_itens where valor_unitario = 450), 1, 'Quem monta ajusta o preço no orçamento');
select teste.bloqueado($$update orcamentos set situacao = 'enviado' where id = '30000000-0000-0000-0000-000000000001'$$,
  'Administrativo não envia desconto acima do limite sem sócio');
select teste.bloqueado($$update orcamentos set situacao = 'aprovado' where id = '30000000-0000-0000-0000-000000000001'$$,
  'Rascunho não pula direto para aprovado');
select teste.bloqueado($$delete from orcamento_eventos$$, 'Histórico do orçamento não é apagado');

-- Descontos somam; cada sócio só abre mão da própria parte.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select teste.bloqueado($$insert into orcamento_descontos (orcamento_id, tipo, percentual, socio_id) values ('30000000-0000-0000-0000-000000000001', 'socio', 40, '00000000-0000-0000-0000-000000000001')$$,
  'Rafa não abre mão da parte do Bob');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into orcamento_descontos (orcamento_id, tipo, percentual, socio_id) values ('30000000-0000-0000-0000-000000000001', 'socio', 40, '00000000-0000-0000-0000-000000000001');
select teste.igual((select desconto_percentual from orcamentos where id = '30000000-0000-0000-0000-000000000001')::bigint, 50, 'Amigo 10% + parte do sócio 40% somam 50%');
select teste.bloqueado($$insert into orcamento_descontos (orcamento_id, tipo, percentual) values ('30000000-0000-0000-0000-000000000001', 'parceiro', 60)$$,
  'A soma dos descontos não passa de 100%');
select teste.bloqueado($$insert into orcamento_descontos (orcamento_id, tipo, percentual, socio_id) values ('30000000-0000-0000-0000-000000000001', 'socio', 5, '00000000-0000-0000-0000-000000000003')$$,
  'Quem não é sócio do ambiente não entra como sócio que abre mão');

-- Sócio envia; conteúdo trava; aprovar fecha o lead.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update orcamentos set lead_id = (select id from leads where cliente_id = '10000000-0000-0000-0000-000000000002' and ambiente_id = 'music' limit 1)
  where id = '30000000-0000-0000-0000-000000000001';
update leads set etapa = 'em_contato' where id = '20000000-0000-0000-0000-000000000002';
update orcamentos set situacao = 'enviado' where id = '30000000-0000-0000-0000-000000000001';
select teste.igual((select count(*) from orcamentos where situacao = 'enviado' and validade_ate is not null and enviado_em is not null), 1,
  'Enviar grava a data e a validade');
select teste.igual((select count(*) from leads l join orcamentos o on o.lead_id = l.id where o.id = '30000000-0000-0000-0000-000000000001' and l.etapa = 'proposta_enviada'), 1,
  'Enviar a proposta move o lead para Proposta enviada');
select teste.bloqueado($$update orcamentos set titulo = 'outro' where id = '30000000-0000-0000-0000-000000000001'$$,
  'Proposta enviada não tem o conteúdo alterado');
select teste.bloqueado($$delete from orcamento_descontos where orcamento_id = '30000000-0000-0000-0000-000000000001'$$, 'Descontos de proposta enviada não mudam');
select teste.bloqueado($$update orcamento_itens set valor_unitario = 1 where orcamento_id = '30000000-0000-0000-0000-000000000001'$$,
  'Itens de proposta enviada não mudam');
update orcamentos set situacao = 'aprovado' where id = '30000000-0000-0000-0000-000000000001';
select teste.igual((select count(*) from leads l join orcamentos o on o.lead_id = l.id where o.id = '30000000-0000-0000-0000-000000000001' and l.etapa = 'fechado'), 1,
  'Aprovar a proposta fecha o lead');
select teste.igual((select count(*) from orcamento_eventos where orcamento_id = '30000000-0000-0000-0000-000000000001'), 4,
  'Cada passagem do orçamento fica no histórico');
with d as (delete from orcamentos where id = '30000000-0000-0000-0000-000000000001' returning 1)
  select teste.igual((select count(*) from d), 0, 'Orçamento aprovado não é apagado');

-- Quem não deve ver.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select teste.igual((select count(*) from orcamentos), 1, 'Comercial acompanha o próprio pedido');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select teste.igual((select count(*) from orcamentos), 0, 'Pauta não vê orçamentos');
select teste.igual((select count(*) from orcamento_itens), 0, 'Pauta não vê valores de orçamento');
select teste.igual((select count(*) from orcamento_descontos), 0, 'Pauta não vê descontos');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into orcamentos (id, ambiente_id, cliente_id) values ('30000000-0000-0000-0000-000000000002', 'hub', '10000000-0000-0000-0000-000000000001');
select teste.bloqueado($$insert into orcamentos (ambiente_id, cliente_id) values ('mkt', '10000000-0000-0000-0000-000000000001')$$,
  'Rafa não cria orçamento no MKT');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into orcamentos (id, ambiente_id, cliente_id) values ('30000000-0000-0000-0000-000000000003', 'mkt', '10000000-0000-0000-0000-000000000001');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select teste.igual((select count(*) from orcamentos), 2, 'Rafa vê orçamentos de HUB e MUSIC, não os do MKT');

-- ================= Logado sem cadastro (conta criada por fora do convite) =================
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ff';
select teste.igual((select count(*) from servicos), 0, 'Conta sem cadastro não vê serviços');
select teste.igual((select count(*) from clientes), 0, 'Conta sem cadastro não vê clientes');
select teste.igual((select count(*) from perfis), 0, 'Conta sem cadastro não vê pessoas');
select teste.bloqueado($$insert into clientes (nome) values ('x')$$, 'Conta sem cadastro não cadastra nada');

reset role;
-- ================= Visitante e servidor =================
select teste.igual((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute'))::bigint, 0, 'Visitante não executa nenhuma função');
select teste.igual((select count(*) from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon')::bigint, 0, 'Visitante não tem permissão em nenhuma tabela');
select teste.igual((select has_table_privilege('service_role', 'perfis', 'insert'))::int::bigint, 1, 'Servidor consegue cadastrar pessoas (convite)');
update servicos set valor = valor where nome = 'Mix';
select teste.igual((select count(*) from servicos where nome = 'Mix' and atualizado_em > criado_em)::bigint, 1, 'Alterar um serviço atualiza a data no banco');
\echo TODOS OS TESTES PASSARAM
