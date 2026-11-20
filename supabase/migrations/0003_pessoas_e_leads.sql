-- Lúdica HUB · apoio às telas de Usuários, Clientes e Leads.

-- 1. O administrativo precisa ver o nome de quem cuida de cada lead e escolher o responsável.
--    (Até aqui só os sócios viam as outras pessoas.)
create policy perfis_ver_admin on perfis for select to authenticated
  using (ve_todos_clientes());
create policy acessos_ver_admin on acessos for select to authenticated
  using (tem_perfil(ambiente_id, '{administrativo}'));

-- 2. O responsável por um lead precisa trabalhar naquele ambiente (sócio, administrativo ou comercial, ativo).
create function confere_responsavel_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from acessos a join perfis p on p.id = a.usuario_id
    where a.usuario_id = new.responsavel_id and a.ambiente_id = new.ambiente_id
      and a.perfil in ('socio', 'administrativo', 'comercial') and p.ativo
  ) then
    raise exception 'O responsável pelo lead precisa ter acesso a este ambiente.';
  end if;
  return new;
end $$;
create trigger leads_responsavel before insert or update of responsavel_id, ambiente_id on leads
  for each row execute function confere_responsavel_lead();

-- 3. Lead perdido sempre guarda o motivo: é o que alimenta a análise de perdas.
alter table leads add constraint leads_motivo_perda
  check (etapa <> 'perdido' or nullif(trim(motivo_perda), '') is not null);

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
