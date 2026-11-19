-- Cria o primeiro sócio (Bob) com acesso aos três ambientes.
-- Antes: Supabase > Authentication > Users > Add user > Create new user, com o e-mail do Bob
-- e "Auto Confirm User" marcado. Copie o "User UID" que aparece e cole abaixo no lugar de COLE-AQUI.
-- Depois disso, os demais (Rafa, administrativo, comercial) são convidados pela tela de Usuários.

insert into perfis (id, nome, email)
select id, 'Bob', email from auth.users where id = 'COLE-AQUI';

insert into acessos (usuario_id, ambiente_id, perfil) values
  ('COLE-AQUI', 'hub', 'socio'),
  ('COLE-AQUI', 'music', 'socio'),
  ('COLE-AQUI', 'mkt', 'socio');
