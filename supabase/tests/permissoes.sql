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
select teste.igual((select count(*) from leads), 1, 'Administrativo vê os leads dos seus ambientes');
with u as (delete from servicos where nome = 'Master' returning 1)
  select teste.igual((select count(*) from u), 0, 'Administrativo não apaga serviço');
with u as (update ambiente_dados set cnpj = '1' returning 1)
  select teste.igual((select count(*) from u), 0, 'Administrativo não altera os dados do emissor');
select teste.igual((select count(*) from perfis), 1, 'Administrativo vê só o próprio perfil');

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

reset role;
\echo TODOS OS TESTES PASSARAM
