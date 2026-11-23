-- Lúdica HUB · vários descontos por orçamento, que somam.
-- Ex.: amigo 20% + o sócio abre mão da parte dele 40% = 60% sobre o valor cheio.
-- O desconto "sócio" guarda QUEM abriu mão: no fechamento ele sai só da parte desse sócio (fase 3).

create type tipo_desconto as enum ('amigo', 'cliente', 'parceiro', 'socio');

create table orcamento_descontos (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos(id) on delete cascade,
  tipo tipo_desconto not null,
  percentual numeric(5, 2) not null check (percentual > 0 and percentual <= 100),
  motivo text,
  socio_id uuid references perfis(id),          -- só no tipo 'socio': quem abre mão da parte dele
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  check ((tipo = 'socio') = (socio_id is not null))
);
create index on orcamento_descontos (orcamento_id);

-- orcamentos.desconto_percentual passa a ser a SOMA das linhas (mantida pelo banco).
-- desconto_categoria e desconto_motivo ficam como o que o comercial pediu.
alter table orcamentos drop constraint orcamentos_check;

insert into orcamento_descontos (orcamento_id, tipo, percentual, motivo)
select id, desconto_categoria::text::tipo_desconto, desconto_percentual, desconto_motivo
from orcamentos where desconto_percentual > 0 and desconto_categoria <> 'nenhum';

create function regras_desconto_orcamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o orcamentos;
begin
  select * into o from orcamentos where id = coalesce(new.orcamento_id, old.orcamento_id);
  if o.situacao not in ('pedido', 'rascunho') then
    raise exception 'Os descontos só mudam enquanto o orçamento é pedido ou rascunho.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and (new.tipo <> old.tipo or new.socio_id is distinct from old.socio_id or new.orcamento_id <> old.orcamento_id) then
    raise exception 'Para trocar o tipo do desconto, remova a linha e crie outra.';
  end if;
  if new.tipo = 'socio' then
    if not exists (select 1 from acessos a join perfis p on p.id = a.usuario_id
                   where a.usuario_id = new.socio_id and a.ambiente_id = o.ambiente_id and a.perfil = 'socio' and p.ativo) then
      raise exception 'Só um sócio deste ambiente abre mão da parte dele.';
    end if;
    -- Ninguém abre mão da parte de outro sócio.
    if auth.uid() is not null and auth.uid() <> new.socio_id then
      raise exception 'Só o próprio sócio abre mão da parte dele.';
    end if;
  end if;
  return new;
end $$;
create trigger descontos_regras before insert or update or delete on orcamento_descontos
  for each row execute function regras_desconto_orcamento();

create function soma_descontos_orcamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  alvo uuid := coalesce(new.orcamento_id, old.orcamento_id);
  soma numeric;
begin
  select coalesce(sum(percentual), 0) into soma from orcamento_descontos where orcamento_id = alvo;
  if soma > 100 then
    raise exception 'A soma dos descontos passa de 100%%.';
  end if;
  update orcamentos set desconto_percentual = soma where id = alvo and desconto_percentual is distinct from soma;
  return null;
end $$;
create trigger descontos_soma after insert or update or delete on orcamento_descontos
  for each row execute function soma_descontos_orcamento();

-- O total de desconto não é mais digitado no orçamento: só muda pela soma das linhas.
create function protege_total_desconto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.desconto_percentual is distinct from old.desconto_percentual
     and new.desconto_percentual is distinct from (select coalesce(sum(percentual), 0) from orcamento_descontos where orcamento_id = new.id) then
    raise exception 'O desconto total é a soma das linhas de desconto.';
  end if;
  return new;
end $$;
create trigger orcamentos_total_desconto before update of desconto_percentual on orcamentos
  for each row execute function protege_total_desconto();

alter table orcamento_descontos enable row level security;
create policy descontos_ver on orcamento_descontos for select to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id));
create policy descontos_criar on orcamento_descontos for insert to authenticated
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and tem_perfil(o.ambiente_id, '{socio,administrativo}')));
create policy descontos_alterar on orcamento_descontos for update to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and tem_perfil(o.ambiente_id, '{socio,administrativo}')))
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and tem_perfil(o.ambiente_id, '{socio,administrativo}')));
create policy descontos_remover on orcamento_descontos for delete to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and tem_perfil(o.ambiente_id, '{socio,administrativo}')));

grant select, insert, update, delete on orcamento_descontos to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
