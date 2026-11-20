-- Lúdica HUB · ajustes da varredura de 19/11 (a 0001 já rodou em produção e não é editada).

-- 1. Funções: o Postgres libera execução para todo mundo por padrão. Visitante sem login conseguia
--    chamar as funções de permissão pela API (sempre respondiam "falso", mas não há motivo para expor).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 2. Servidor: a chave secreta (service_role) é usada só no servidor para convidar pessoas e, nas
--    próximas fases, para a régua de cobrança. Este projeto não libera tabelas sozinho, então ela
--    também precisa de permissão explícita.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 3. Data de alteração do serviço definida pelo banco, não pelo navegador.
create function marca_atualizacao() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
revoke execute on function marca_atualizacao() from public, anon;
create trigger servicos_atualizacao before update on servicos for each row execute function marca_atualizacao();
create trigger ambiente_dados_atualizacao before update on ambiente_dados for each row execute function marca_atualizacao();
