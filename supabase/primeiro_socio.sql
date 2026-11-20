-- Cria o primeiro sócio com acesso aos três ambientes.
-- Antes: Authentication > Users > Add user > Create new user, com "Auto Confirm User" marcado.
-- Depois troque SEU-EMAIL abaixo pelo mesmo e-mail (só uma vez) e rode.
-- Os demais (Rafa, administrativo, comercial) serão convidados pela tela de Usuários.

with u as (select id, email from auth.users where email = lower('SEU-EMAIL'))
insert into perfis (id, nome, email) select id, 'Bob', email from u;

insert into acessos (usuario_id, ambiente_id, perfil)
select p.id, a.id, 'socio' from perfis p cross join ambientes a where p.nome = 'Bob';

select p.nome, p.email, a.ambiente_id, a.perfil from perfis p join acessos a on a.usuario_id = p.id;
