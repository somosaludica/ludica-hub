-- Lúdica HUB · Fase 3, parte 1: cobranças (parcelas da proposta aprovada), nota de débito e baixa.
-- Cada cobrança é de UM ambiente (quem fatura). O comercial e a pauta não veem cobranças.

create type situacao_cobranca as enum ('aberta', 'paga', 'cancelada');
create type situacao_nf as enum ('nao_solicitada', 'solicitada', 'emitida');
create type evento_cobranca as enum ('criada', 'envio_manual', 'baixa', 'estorno', 'cancelada', 'reaberta');

create table cobrancas (
  id uuid primary key default gen_random_uuid(),
  ambiente_id text not null references ambientes(id),
  numero int not null,                               -- nota de débito, sequencial por ambiente
  cliente_id uuid not null references clientes(id),
  orcamento_id uuid references orcamentos(id),       -- vazio em cobrança avulsa
  descricao text not null,                           -- "Site One Page · parcela 1 de 2"
  parcela int not null default 1 check (parcela >= 1),
  parcelas int not null default 1 check (parcelas >= parcela),
  vencimento date not null,
  valor numeric(12, 2) not null check (valor > 0),
  envio_automatico boolean not null default false,   -- régua (parte 2 da fase 3)
  situacao situacao_cobranca not null default 'aberta',
  pago_em date,
  valor_recebido numeric(12, 2) check (valor_recebido > 0),
  baixa_por uuid references perfis(id),
  nf_situacao situacao_nf not null default 'nao_solicitada',
  nf_numero text,
  criado_por uuid references perfis(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (ambiente_id, numero),
  check ((situacao = 'paga') = (pago_em is not null and valor_recebido is not null))
);
create index on cobrancas (ambiente_id, situacao, vencimento);
create index on cobrancas (cliente_id);
create index on cobrancas (orcamento_id);

create table cobranca_eventos (
  id bigint generated always as identity primary key,
  cobranca_id uuid not null references cobrancas(id) on delete cascade,
  tipo evento_cobranca not null,
  canal text,                                        -- 'whatsapp', 'email' ou vazio
  detalhe text,
  por uuid references perfis(id),
  em timestamptz not null default now()
);
create index on cobranca_eventos (cobranca_id);

create function regras_cobranca() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o orcamentos;
  livres text[] := array['nf_situacao', 'nf_numero', 'envio_automatico'];
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('cobranca_' || new.ambiente_id));
    select coalesce(max(numero), 0) + 1 into new.numero from cobrancas where ambiente_id = new.ambiente_id;
    if new.situacao <> 'aberta' then raise exception 'Cobrança nasce aberta.'; end if;
    if new.orcamento_id is not null then
      select * into o from orcamentos where id = new.orcamento_id;
      if o.situacao <> 'aprovado' then raise exception 'Só proposta aprovada gera cobrança.'; end if;
      if o.ambiente_id <> new.ambiente_id or o.cliente_id <> new.cliente_id then
        raise exception 'A cobrança precisa ser do mesmo ambiente e cliente da proposta.';
      end if;
    end if;
    return new;
  end if;

  if new.ambiente_id <> old.ambiente_id or new.numero <> old.numero or new.cliente_id <> old.cliente_id
     or new.orcamento_id is distinct from old.orcamento_id then
    raise exception 'Ambiente, número, cliente e proposta da cobrança não mudam.';
  end if;

  if new.situacao is distinct from old.situacao then
    if not (
      (old.situacao = 'aberta' and new.situacao in ('paga', 'cancelada')) or
      (old.situacao in ('paga', 'cancelada') and new.situacao = 'aberta')
    ) then
      raise exception 'Passagem de % para % não existe.', old.situacao, new.situacao;
    end if;
    -- Desfazer uma baixa ou um cancelamento mexe no caixa: só sócio.
    if new.situacao = 'aberta' and auth.uid() is not null and not tem_perfil(new.ambiente_id, '{socio}') then
      raise exception 'Só um sócio estorna a baixa ou reabre a cobrança.';
    end if;
    if new.situacao = 'paga' then
      new.baixa_por := auth.uid();
    else
      new.pago_em := null; new.valor_recebido := null; new.baixa_por := null;
    end if;
  elsif old.situacao <> 'aberta'
     and (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    -- Paga ou cancelada: só a nota fiscal e a chave de envio podem mudar.
    raise exception 'Cobrança % não pode ser alterada. Estorne ou reabra antes.', old.situacao;
  end if;
  return new;
end $$;
create trigger cobrancas_regras before insert or update on cobrancas for each row execute function regras_cobranca();

create function registra_cobranca() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into cobranca_eventos (cobranca_id, tipo, por) values (new.id, 'criada', auth.uid());
  elsif new.situacao is distinct from old.situacao then
    insert into cobranca_eventos (cobranca_id, tipo, por, detalhe) values (
      new.id,
      case when new.situacao = 'paga' then 'baixa' when new.situacao = 'cancelada' then 'cancelada'
           when old.situacao = 'paga' then 'estorno' else 'reaberta' end::evento_cobranca,
      auth.uid(),
      case when new.situacao = 'paga' then to_char(new.pago_em, 'DD/MM/YYYY') end);
  end if;
  return null;
end $$;
create trigger cobrancas_historico after insert or update on cobrancas for each row execute function registra_cobranca();

-- Quem registra um envio é sempre a própria pessoa; só o tipo 'envio_manual' entra pela API.
create function regras_evento_cobranca() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and pg_trigger_depth() = 1 then
    if new.tipo <> 'envio_manual' then raise exception 'Só envios manuais são registrados à mão.'; end if;
    new.por := auth.uid(); new.em := now();
  end if;
  return new;
end $$;
create trigger cobranca_eventos_regras before insert on cobranca_eventos for each row execute function regras_evento_cobranca();

alter table cobrancas enable row level security;
alter table cobranca_eventos enable row level security;

create policy cobrancas_ver on cobrancas for select to authenticated
  using (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy cobrancas_criar on cobrancas for insert to authenticated
  with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy cobrancas_alterar on cobrancas for update to authenticated
  using (tem_perfil(ambiente_id, '{socio,administrativo}'))
  with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
-- Apagar só o que nunca foi pago; o normal é cancelar, que mantém o número e o histórico.
create policy cobrancas_remover on cobrancas for delete to authenticated
  using (tem_perfil(ambiente_id, '{socio}') and situacao <> 'paga');

create policy cob_eventos_ver on cobranca_eventos for select to authenticated
  using (exists (select 1 from cobrancas c where c.id = cobranca_id));
create policy cob_eventos_criar on cobranca_eventos for insert to authenticated
  with check (exists (select 1 from cobrancas c where c.id = cobranca_id));

-- O administrativo preenche os dados que saem na nota de débito (antes só sócio alterava).
drop policy amb_dados_alterar on ambiente_dados;
create policy amb_dados_alterar on ambiente_dados for update to authenticated
  using (tem_perfil(ambiente_id, '{socio,administrativo}'))
  with check (tem_perfil(ambiente_id, '{socio,administrativo}'));

-- ...mas o limite de desconto e o prefixo dos documentos continuam sendo decisão de sócio.
create function protege_ambiente_dados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not tem_perfil(new.ambiente_id, '{socio}')
     and (new.desconto_sem_socio is distinct from old.desconto_sem_socio
          or new.prefixo_documentos is distinct from old.prefixo_documentos
          or new.emissor_provisorio is distinct from old.emissor_provisorio) then
    raise exception 'Só um sócio muda o limite de desconto, o prefixo e o emissor provisório.';
  end if;
  return new;
end $$;
create trigger ambiente_dados_protege before update on ambiente_dados for each row execute function protege_ambiente_dados();

grant select, insert, update, delete on cobrancas to authenticated, service_role;
grant select, insert on cobranca_eventos to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
