-- Lúdica HUB · Fase 3, parte 2: lançamentos, participação dos sócios e fechamento do mês.
-- Regime de caixa: entrada é o que foi RECEBIDO no mês (baixa das cobranças); saída é o que foi PAGO no mês.
-- Imposto e fundo de reserva incidem sobre o faturamento recebido. Financeiro: só sócio e administrativo do ambiente.

alter table ambiente_dados
  add column imposto_pct numeric(5, 2) not null default 6 check (imposto_pct between 0 and 100),
  add column reserva_pct numeric(5, 2) not null default 20 check (reserva_pct between 0 and 100);

create type tipo_lancamento as enum ('entrada', 'saida');
create type categoria_lancamento as enum (
  'conta_fixa', 'custo_terceiros', 'comissao', 'distribuicao', 'outras_saidas',   -- saídas
  'outras_entradas', 'aporte'                                                      -- entradas
);
create type situacao_lancamento as enum ('provisionada', 'paga');

-- Quanto do lucro do ambiente cabe a cada sócio (MUSIC: Rafa 60 / Bob 40; MKT: Bob 100; HUB: 30 / 70).
create table participacoes (
  ambiente_id text not null references ambientes(id),
  socio_id uuid not null references perfis(id),
  percentual numeric(5, 2) not null check (percentual > 0 and percentual <= 100),
  primary key (ambiente_id, socio_id)
);

create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  ambiente_id text not null references ambientes(id),
  tipo tipo_lancamento not null,
  categoria categoria_lancamento not null,
  descricao text not null,
  fornecedor text,
  orcamento_id uuid references orcamentos(id) on delete set null,   -- custo com terceiros de uma venda
  socio_id uuid references perfis(id),                               -- distribuição de lucros e aporte
  vencimento date not null,
  valor numeric(12, 2) not null check (valor > 0),
  situacao situacao_lancamento not null default 'provisionada',
  pago_em date,
  conta_origem text,                                                 -- de qual conta saiu
  observacao text,
  criado_por uuid references perfis(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  check ((situacao = 'paga') = (pago_em is not null)),
  check ((tipo = 'entrada') = (categoria in ('outras_entradas', 'aporte'))),
  check ((categoria in ('distribuicao', 'aporte')) = (socio_id is not null))
);
create index on lancamentos (ambiente_id, vencimento);
create index on lancamentos (ambiente_id, pago_em);

-- Mês fechado: guarda a fotografia do resultado, para o número fechado não mudar depois.
create table meses_fechados (
  ambiente_id text not null references ambientes(id),
  mes date not null check (extract(day from mes) = 1),
  resultado jsonb not null,
  fechado_por uuid references perfis(id) default auth.uid(),
  fechado_em timestamptz not null default now(),
  primary key (ambiente_id, mes)
);
create table fechamento_eventos (
  id bigint generated always as identity primary key,
  ambiente_id text not null references ambientes(id),
  mes date not null,
  tipo text not null check (tipo in ('fechou', 'reabriu')),
  por uuid references perfis(id),
  em timestamptz not null default now()
);

create function mes_fechado(amb text, dia date) returns boolean
language sql stable security definer set search_path = public as $$
  select dia is not null and exists (
    select 1 from meses_fechados m where m.ambiente_id = amb and m.mes = date_trunc('month', dia)::date);
$$;

-- Participações: só sócio do ambiente recebe parte, e a soma não passa de 100%.
create function regras_participacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    if not exists (select 1 from acessos a where a.usuario_id = new.socio_id and a.ambiente_id = new.ambiente_id and a.perfil = 'socio') then
      raise exception 'Só sócio do ambiente tem participação no lucro.';
    end if;
    if (select coalesce(sum(percentual), 0) from participacoes
        where ambiente_id = new.ambiente_id and socio_id <> new.socio_id) + new.percentual > 100 then
      raise exception 'A soma das participações passa de 100%%.';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger participacoes_regras before insert or update or delete on participacoes for each row execute function regras_participacao();

-- Lançamentos: mês fechado não muda; distribuição e aporte são decisão de sócio.
create function regras_lancamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  amb text := coalesce(new.ambiente_id, old.ambiente_id);
begin
  if tg_op <> 'INSERT' and mes_fechado(old.ambiente_id, coalesce(old.pago_em, old.vencimento)) then
    raise exception 'O mês deste lançamento está fechado. Um sócio precisa reabrir.';
  end if;
  if tg_op <> 'DELETE' then
    if mes_fechado(new.ambiente_id, coalesce(new.pago_em, new.vencimento)) then
      raise exception 'O mês de destino está fechado. Um sócio precisa reabrir.';
    end if;
    if tg_op = 'UPDATE' and (new.ambiente_id <> old.ambiente_id or new.tipo <> old.tipo) then
      raise exception 'Ambiente e tipo do lançamento não mudam.';
    end if;
    if new.situacao = 'provisionada' then new.pago_em := null; end if;
    if new.socio_id is not null and not exists (
      select 1 from acessos a where a.usuario_id = new.socio_id and a.ambiente_id = new.ambiente_id and a.perfil = 'socio') then
      raise exception 'Distribuição e aporte são de um sócio deste ambiente.';
    end if;
  end if;
  if (coalesce(new.categoria, old.categoria) in ('distribuicao', 'aporte') or (tg_op = 'UPDATE' and old.categoria in ('distribuicao', 'aporte')))
     and auth.uid() is not null and not tem_perfil(amb, '{socio}') then
    raise exception 'Só um sócio lança distribuição de lucros ou aporte.';
  end if;
  return coalesce(new, old);
end $$;
create trigger lancamentos_regras before insert or update or delete on lancamentos for each row execute function regras_lancamento();

-- Baixa (ou estorno) de cobrança em mês fechado também fica travada.
create function cobranca_mes_fechado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if mes_fechado(old.ambiente_id, old.pago_em) then raise exception 'O mês desta cobrança está fechado.'; end if;
    return old;
  end if;
  if (new.pago_em is distinct from old.pago_em or new.valor_recebido is distinct from old.valor_recebido)
     and (mes_fechado(old.ambiente_id, old.pago_em) or mes_fechado(new.ambiente_id, new.pago_em)) then
    raise exception 'O mês deste pagamento está fechado. Um sócio precisa reabrir.';
  end if;
  return new;
end $$;
create trigger cobrancas_mes_fechado before update or delete on cobrancas for each row execute function cobranca_mes_fechado();

-- Fechar e reabrir ficam registrados; a fotografia do mês não é editada (para corrigir, reabre e fecha de novo).
create function regras_mes_fechado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then raise exception 'Mês fechado não é editado: reabra e feche de novo.'; end if;
  if tg_op = 'INSERT' then
    if new.mes > date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date then
      raise exception 'Não dá para fechar um mês que ainda não começou.';
    end if;
    new.fechado_por := auth.uid(); new.fechado_em := now();
    insert into fechamento_eventos (ambiente_id, mes, tipo, por) values (new.ambiente_id, new.mes, 'fechou', auth.uid());
    return new;
  end if;
  insert into fechamento_eventos (ambiente_id, mes, tipo, por) values (old.ambiente_id, old.mes, 'reabriu', auth.uid());
  return old;
end $$;
create trigger meses_fechados_regras before insert or update or delete on meses_fechados for each row execute function regras_mes_fechado();

-- Imposto e reserva: só sócio muda (junta com as travas que já existiam).
create or replace function protege_ambiente_dados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not tem_perfil(new.ambiente_id, '{socio}')
     and (new.desconto_sem_socio is distinct from old.desconto_sem_socio
          or new.prefixo_documentos is distinct from old.prefixo_documentos
          or new.emissor_provisorio is distinct from old.emissor_provisorio
          or new.imposto_pct is distinct from old.imposto_pct
          or new.reserva_pct is distinct from old.reserva_pct) then
    raise exception 'Só um sócio muda limite de desconto, prefixo, emissor provisório, imposto e reserva.';
  end if;
  return new;
end $$;

alter table participacoes enable row level security;
alter table lancamentos enable row level security;
alter table meses_fechados enable row level security;
alter table fechamento_eventos enable row level security;

create policy participacoes_ver on participacoes for select to authenticated using (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy participacoes_criar on participacoes for insert to authenticated with check (tem_perfil(ambiente_id, '{socio}'));
create policy participacoes_alterar on participacoes for update to authenticated
  using (tem_perfil(ambiente_id, '{socio}')) with check (tem_perfil(ambiente_id, '{socio}'));
create policy participacoes_remover on participacoes for delete to authenticated using (tem_perfil(ambiente_id, '{socio}'));

create policy lancamentos_ver on lancamentos for select to authenticated using (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy lancamentos_criar on lancamentos for insert to authenticated with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy lancamentos_alterar on lancamentos for update to authenticated
  using (tem_perfil(ambiente_id, '{socio,administrativo}')) with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy lancamentos_remover on lancamentos for delete to authenticated using (tem_perfil(ambiente_id, '{socio,administrativo}'));

-- Fechar: sócio ou administrativo. Reabrir: só sócio.
create policy meses_ver on meses_fechados for select to authenticated using (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy meses_fechar on meses_fechados for insert to authenticated with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy meses_reabrir on meses_fechados for delete to authenticated using (tem_perfil(ambiente_id, '{socio}'));
create policy fech_eventos_ver on fechamento_eventos for select to authenticated using (tem_perfil(ambiente_id, '{socio,administrativo}'));

grant select, insert, update, delete on participacoes, lancamentos to authenticated, service_role;
grant select, insert, delete on meses_fechados to authenticated, service_role;
grant select on fechamento_eventos to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
