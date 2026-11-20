-- Lúdica HUB · Fase 2: pedidos de orçamento, orçamentos e propostas.
-- Cada orçamento pertence a UM ambiente (quem contrata e fatura). "Lúdica HUB" como assinatura é só apresentação.

create type situacao_orcamento as enum ('pedido', 'rascunho', 'enviado', 'aprovado', 'recusado');
create type categoria_desconto as enum ('nenhum', 'amigo', 'cliente', 'parceiro');
create type assinatura_proposta as enum ('ambiente', 'hub');
create type formato_proposta as enum ('one_page', 'completa', 'ambos');

-- Até quanto de desconto o administrativo envia sem um sócio. 0 = todo desconto passa por sócio.
alter table ambiente_dados add column desconto_sem_socio numeric(5, 2) not null default 0
  check (desconto_sem_socio between 0 and 100);

create table orcamentos (
  id uuid primary key default gen_random_uuid(),
  ambiente_id text not null references ambientes(id),
  numero int not null,                               -- sequencial por ambiente (MUS-0001)
  cliente_id uuid not null references clientes(id),
  lead_id uuid references leads(id) on delete set null,
  situacao situacao_orcamento not null default 'rascunho',
  pedido_por uuid not null references perfis(id) default auth.uid(),
  montado_por uuid references perfis(id),
  obs_negociacao text,
  desconto_categoria categoria_desconto not null default 'nenhum',
  desconto_percentual numeric(5, 2) not null default 0 check (desconto_percentual between 0 and 100),
  desconto_motivo text,
  assinatura assinatura_proposta not null default 'ambiente',
  formato formato_proposta not null default 'one_page',
  -- texto da proposta: nasce do cadastro do serviço e pode ser ajustado em cada orçamento
  titulo text,
  descricao text,
  incluso text,
  nao_incluso text,
  opcionais text,
  workflow text,
  entrega text,
  prazo text,
  pagamento text,
  validade_dias int not null default 7 check (validade_dias between 1 and 365),
  envio_automatico boolean not null default false,   -- régua de cobrança das parcelas (fase 3)
  enviado_em timestamptz,
  validade_ate date,                                 -- depois dessa data a proposta enviada conta como expirada
  respondido_em timestamptz,
  motivo_recusa text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ambiente_id, numero),
  check (desconto_categoria <> 'nenhum' or desconto_percentual = 0)
);
create index on orcamentos (ambiente_id, situacao);
create index on orcamentos (cliente_id);

-- Itens guardam o nome, a unidade e o preço do dia: mudar a Tabela de Serviços não altera o que já foi emitido.
create table orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos(id) on delete cascade,
  servico_id uuid references servicos(id) on delete set null,
  descricao text not null,
  unidade unidade_cobranca not null,
  quantidade numeric(8, 2) not null check (quantidade > 0),
  valor_unitario numeric(12, 2) not null check (valor_unitario >= 0),
  ordem int not null default 0
);
create index on orcamento_itens (orcamento_id);

create table orcamento_eventos (
  id bigint generated always as identity primary key,
  orcamento_id uuid not null references orcamentos(id) on delete cascade,
  de situacao_orcamento,
  para situacao_orcamento not null,
  por uuid references perfis(id),
  em timestamptz not null default now()
);

-- Número sequencial por ambiente, sem buracos por corrida.
create function numera_orcamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('orcamento_' || new.ambiente_id));
  select coalesce(max(numero), 0) + 1 into new.numero from orcamentos where ambiente_id = new.ambiente_id;
  return new;
end $$;
create trigger orcamentos_numero before insert on orcamentos for each row execute function numera_orcamento();

-- Caminho do orçamento e o que cada passagem faz.
create function regras_orcamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  gestor boolean := tem_perfil(new.ambiente_id, '{socio,administrativo}');
  limite numeric;
  fixos text[] := array['situacao', 'enviado_em', 'validade_ate', 'respondido_em', 'motivo_recusa', 'atualizado_em', 'montado_por'];
begin
  if tg_op = 'INSERT' then
    if new.situacao not in ('pedido', 'rascunho') then
      raise exception 'Orçamento nasce como pedido ou rascunho.';
    end if;
    if new.situacao = 'rascunho' then new.montado_por := auth.uid(); end if;
    return new;
  end if;

  new.atualizado_em := now();
  if new.ambiente_id <> old.ambiente_id or new.numero <> old.numero or new.cliente_id <> old.cliente_id
     or new.pedido_por <> old.pedido_por then
    raise exception 'Ambiente, número, cliente e autor do pedido não mudam.';
  end if;

  -- Proposta enviada, aprovada ou recusada não tem o conteúdo alterado: para mexer, volte para rascunho.
  if old.situacao in ('enviado', 'aprovado', 'recusado') and new.situacao = old.situacao
     and (to_jsonb(new) - fixos) is distinct from (to_jsonb(old) - fixos) then
    raise exception 'Proposta % não pode ser alterada. Volte para rascunho para editar.', old.situacao;
  end if;

  if new.situacao is distinct from old.situacao then
    if auth.uid() is not null and not gestor then
      raise exception 'Só sócio ou administrativo muda a situação do orçamento.';
    end if;
    if not (
      (old.situacao = 'pedido' and new.situacao = 'rascunho') or
      (old.situacao = 'rascunho' and new.situacao = 'enviado') or
      (old.situacao = 'enviado' and new.situacao in ('aprovado', 'recusado', 'rascunho')) or
      (old.situacao = 'recusado' and new.situacao = 'rascunho')
    ) then
      raise exception 'Passagem de % para % não existe.', old.situacao, new.situacao;
    end if;

    if new.situacao = 'rascunho' then
      new.montado_por := coalesce(new.montado_por, auth.uid());
      new.enviado_em := null; new.validade_ate := null; new.respondido_em := null; new.motivo_recusa := null;
    elsif new.situacao = 'enviado' then
      if not exists (select 1 from orcamento_itens i where i.orcamento_id = new.id) then
        raise exception 'Inclua pelo menos um serviço antes de enviar.';
      end if;
      select desconto_sem_socio into limite from ambiente_dados where ambiente_id = new.ambiente_id;
      if new.desconto_percentual > coalesce(limite, 0) and auth.uid() is not null
         and not tem_perfil(new.ambiente_id, '{socio}') then
        raise exception 'Desconto acima do permitido: precisa de um sócio para enviar.';
      end if;
      new.enviado_em := now();
      new.validade_ate := (now() at time zone 'America/Sao_Paulo')::date + new.validade_dias;
      update leads set etapa = 'proposta_enviada'
        where id = new.lead_id and etapa in ('novo', 'em_contato');
    elsif new.situacao = 'aprovado' then
      new.respondido_em := now();
      update leads set etapa = 'fechado' where id = new.lead_id and etapa <> 'fechado' and etapa <> 'perdido';
    elsif new.situacao = 'recusado' then
      new.respondido_em := now();
    end if;
  end if;
  return new;
end $$;
create trigger orcamentos_regras before insert or update on orcamentos for each row execute function regras_orcamento();

create function registra_situacao_orcamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into orcamento_eventos (orcamento_id, de, para, por) values (new.id, null, new.situacao, auth.uid());
  elsif new.situacao is distinct from old.situacao then
    insert into orcamento_eventos (orcamento_id, de, para, por) values (new.id, old.situacao, new.situacao, auth.uid());
  end if;
  return null;
end $$;
create trigger orcamentos_historico after insert or update on orcamentos for each row execute function registra_situacao_orcamento();

-- Itens: só mudam enquanto o orçamento é pedido ou rascunho; serviço tem de ser do mesmo ambiente.
-- No pedido do comercial o nome, a unidade e o preço vêm sempre da tabela (ele não define preço).
create function regras_item_orcamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o orcamentos;
  s servicos;
begin
  select * into o from orcamentos where id = coalesce(new.orcamento_id, old.orcamento_id);
  if o.situacao not in ('pedido', 'rascunho') then
    raise exception 'Os itens só mudam enquanto o orçamento é pedido ou rascunho.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.servico_id is not null then
    select * into s from servicos where id = new.servico_id;
    if s.ambiente_id is distinct from o.ambiente_id then
      raise exception 'O serviço precisa ser do mesmo ambiente do orçamento.';
    end if;
  end if;
  if auth.uid() is not null and not tem_perfil(o.ambiente_id, '{socio,administrativo}') then
    if s.id is null or not (s.ativo and s.visivel_comercial) then
      raise exception 'Serviço não liberado para o comercial.';
    end if;
    new.descricao := s.nome; new.unidade := s.unidade; new.valor_unitario := s.valor;
  end if;
  return new;
end $$;
create trigger itens_regras before insert or update or delete on orcamento_itens for each row execute function regras_item_orcamento();

-- ============ RLS ============
alter table orcamentos enable row level security;
alter table orcamento_itens enable row level security;
alter table orcamento_eventos enable row level security;

-- Sócio e administrativo veem os orçamentos do ambiente; o comercial, só os pedidos que ele fez. Pauta não vê.
create policy orcamentos_ver on orcamentos for select to authenticated using (
  tem_perfil(ambiente_id, '{socio,administrativo}')
  or (tem_perfil(ambiente_id, '{comercial}') and pedido_por = auth.uid())
);
create policy orcamentos_criar on orcamentos for insert to authenticated with check (
  pedido_por = auth.uid() and (
    tem_perfil(ambiente_id, '{socio,administrativo}')
    or (tem_perfil(ambiente_id, '{comercial}') and situacao = 'pedido' and cliente_do_comercial(cliente_id))
  )
);
-- O comercial pede; não monta, não muda desconto aplicado nem situação depois de enviado o pedido.
create policy orcamentos_alterar on orcamentos for update to authenticated
  using (tem_perfil(ambiente_id, '{socio,administrativo}'))
  with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy orcamentos_remover on orcamentos for delete to authenticated
  using (tem_perfil(ambiente_id, '{socio}') and situacao <> 'aprovado');

create policy itens_ver on orcamento_itens for select to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id));
create policy itens_criar on orcamento_itens for insert to authenticated with check (
  exists (select 1 from orcamentos o where o.id = orcamento_id and (
    tem_perfil(o.ambiente_id, '{socio,administrativo}')
    or (o.situacao = 'pedido' and o.pedido_por = auth.uid() and tem_perfil(o.ambiente_id, '{comercial}'))
  ))
);
create policy itens_alterar on orcamento_itens for update to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and tem_perfil(o.ambiente_id, '{socio,administrativo}')))
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and tem_perfil(o.ambiente_id, '{socio,administrativo}')));
create policy itens_remover on orcamento_itens for delete to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and tem_perfil(o.ambiente_id, '{socio,administrativo}')));

create policy orc_eventos_ver on orcamento_eventos for select to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id));

-- ============ Acesso pela API ============
grant select, insert, update, delete on orcamentos, orcamento_itens to authenticated, service_role;
grant select on orcamento_eventos to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
