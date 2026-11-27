-- Lúdica HUB · Fase 3, parte 3: financeiro no formato do controle antigo da Music.
-- Fluxo por mês de referência, rateio (valor total × parte do ambiente), em atraso / a confirmar, fora do fluxo,
-- comprovante de pagamento, apuração de lucro por recebimento e quem cobre a falta de caixa.

-- ---------- Lançamentos ----------
alter table lancamentos
  add column mes_ref date check (extract(day from mes_ref) = 1),          -- mês a que a conta pertence
  add column rubrica text,                                                -- Aluguel, IPTU, Energia… (texto digitado)
  add column valor_total numeric(12, 2) check (valor_total > 0),          -- valor cheio da conta; `valor` é a parte do ambiente
  add column parte_pct numeric(9, 6) not null default 100 check (parte_pct > 0 and parte_pct <= 100),
  add column aviso text check (aviso in ('em_atraso', 'a_confirmar')),    -- marcado à mão; atraso por data é calculado
  add column fora_do_fluxo boolean not null default false,                -- fica só como histórico, fora dos totais
  add column comprovante_caminho text,                                    -- arquivo no bucket `comprovantes`
  add column comprovante_nome text,
  add column sem_comprovante boolean not null default false,              -- pago e não vai ter comprovante
  -- apuração do lucro, só para entrada de faturamento recebida (congelada no dia do recebimento)
  add column apur_imposto_pct numeric(5, 2) check (apur_imposto_pct between 0 and 100),
  add column apur_reserva_pct numeric(5, 2) check (apur_reserva_pct between 0 and 100),
  add column apur_custos numeric(12, 2) not null default 0 check (apur_custos >= 0),
  add column apur_partes jsonb,
  add column apur_obs text;
update lancamentos set mes_ref = date_trunc('month', coalesce(pago_em, vencimento))::date, valor_total = valor;
alter table lancamentos alter column vencimento drop not null;

-- Conta paga pode ficar sem a data do pagamento (o antigo tinha várias assim); provisionada nunca tem data.
do $$
declare n text;
begin
  select conname into n from pg_constraint
   where conrelid = 'lancamentos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%pago_em is not null%';
  if n is not null then execute format('alter table lancamentos drop constraint %I', n); end if;
end $$;
alter table lancamentos add constraint lancamentos_pago_check check (situacao = 'paga' or pago_em is null);
create index on lancamentos (ambiente_id, mes_ref);

-- ---------- Cobranças: a mesma apuração, congelada na baixa ----------
alter table cobrancas
  add column apur_imposto_pct numeric(5, 2) check (apur_imposto_pct between 0 and 100),
  add column apur_reserva_pct numeric(5, 2) check (apur_reserva_pct between 0 and 100),
  add column apur_custos numeric(12, 2) not null default 0 check (apur_custos >= 0),
  add column apur_partes jsonb,
  add column apur_obs text;

-- ---------- Ambiente: quem cobre a falta de caixa e os atalhos de rateio ----------
alter table ambiente_dados
  add column cobertura_socio_id uuid references perfis(id),   -- MUSIC: o que falta sai da conta da Lúdica Marketing = aporte do Bob
  add column cobertura_nome text,
  add column rateios jsonb not null default '[]';             -- [{"nome": "Contas do escritório", "pct": 50}, …]

-- Imposto, reserva e participação de hoje, para congelar num recebimento.
create function apur_congela(amb text, out imposto numeric, out reserva numeric, out partes jsonb)
language sql stable security definer set search_path = public as $$
  select d.imposto_pct, d.reserva_pct,
         (select jsonb_object_agg(p.socio_id, p.percentual) from participacoes p where p.ambiente_id = amb)
    from ambiente_dados d where d.ambiente_id = amb;
$$;

create or replace function regras_lancamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  amb text := coalesce(new.ambiente_id, old.ambiente_id);
  c record;
begin
  if tg_op <> 'INSERT' and mes_fechado(old.ambiente_id, old.mes_ref) then
    raise exception 'O mês deste lançamento está fechado. Um sócio precisa reabrir.';
  end if;
  if tg_op <> 'DELETE' then
    if new.situacao = 'provisionada' then new.pago_em := null; else new.aviso := null; end if;
    new.mes_ref := date_trunc('month', coalesce(new.mes_ref, new.pago_em, new.vencimento,
                                                (now() at time zone 'America/Sao_Paulo')::date))::date;
    new.valor_total := coalesce(new.valor_total, new.valor);
    if mes_fechado(new.ambiente_id, new.mes_ref) then
      raise exception 'O mês de destino está fechado. Um sócio precisa reabrir.';
    end if;
    if tg_op = 'UPDATE' and (new.ambiente_id <> old.ambiente_id or new.tipo <> old.tipo) then
      raise exception 'Ambiente e tipo do lançamento não mudam.';
    end if;
    if new.socio_id is not null and not exists (
      select 1 from acessos a where a.usuario_id = new.socio_id and a.ambiente_id = new.ambiente_id and a.perfil = 'socio') then
      raise exception 'Distribuição e aporte são de um sócio deste ambiente.';
    end if;
    -- Entrada de faturamento recebida: congela imposto, reserva e participação do dia.
    if new.categoria = 'outras_entradas' and new.situacao = 'paga' then
      if new.apur_imposto_pct is null or new.apur_reserva_pct is null then
        select * into c from apur_congela(new.ambiente_id);
        new.apur_imposto_pct := coalesce(new.apur_imposto_pct, c.imposto);
        new.apur_reserva_pct := coalesce(new.apur_reserva_pct, c.reserva);
        new.apur_partes := coalesce(new.apur_partes, c.partes);
      end if;
    else
      new.apur_imposto_pct := null; new.apur_reserva_pct := null; new.apur_partes := null;
    end if;
  end if;
  if (coalesce(new.categoria, old.categoria) in ('distribuicao', 'aporte') or (tg_op = 'UPDATE' and old.categoria in ('distribuicao', 'aporte')))
     and auth.uid() is not null and not tem_perfil(amb, '{socio}') then
    raise exception 'Só um sócio lança distribuição de lucros ou aporte.';
  end if;
  return coalesce(new, old);
end $$;

create function apura_cobranca() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.situacao = 'paga' then
    if new.apur_imposto_pct is null or new.apur_reserva_pct is null then
      select * into c from apur_congela(new.ambiente_id);
      new.apur_imposto_pct := coalesce(new.apur_imposto_pct, c.imposto);
      new.apur_reserva_pct := coalesce(new.apur_reserva_pct, c.reserva);
      new.apur_partes := coalesce(new.apur_partes, c.partes);
    end if;
  else
    new.apur_imposto_pct := null; new.apur_reserva_pct := null; new.apur_partes := null;
  end if;
  return new;
end $$;
-- O nome começa com "cobrancas_a" para rodar antes de cobrancas_regras.
create trigger cobrancas_apura before insert or update on cobrancas for each row execute function apura_cobranca();

-- Cobrança paga: além da nota fiscal, a apuração pode ser ajustada (igual ao resto da 0006).
create or replace function regras_cobranca() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o orcamentos;
  livres text[] := array['nf_situacao', 'nf_numero', 'envio_automatico', 'apur_imposto_pct', 'apur_reserva_pct', 'apur_custos', 'apur_obs'];
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
    -- Paga ou cancelada: só a nota fiscal, a chave de envio e a apuração podem mudar.
    raise exception 'Cobrança % não pode ser alterada. Estorne ou reabra antes.', old.situacao;
  end if;
  return new;
end $$;

-- Mês fechado também trava o ajuste da apuração.
create or replace function cobranca_mes_fechado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if mes_fechado(old.ambiente_id, old.pago_em) then raise exception 'O mês desta cobrança está fechado.'; end if;
    return old;
  end if;
  if (new.pago_em is distinct from old.pago_em or new.valor_recebido is distinct from old.valor_recebido
      or new.apur_imposto_pct is distinct from old.apur_imposto_pct or new.apur_reserva_pct is distinct from old.apur_reserva_pct
      or new.apur_custos is distinct from old.apur_custos)
     and (mes_fechado(old.ambiente_id, old.pago_em) or mes_fechado(new.ambiente_id, new.pago_em)) then
    raise exception 'O mês deste pagamento está fechado. Um sócio precisa reabrir.';
  end if;
  return new;
end $$;

-- Quem cobre a falta de caixa é decisão de sócio (junta com as travas que já existiam).
create or replace function protege_ambiente_dados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not tem_perfil(new.ambiente_id, '{socio}')
     and (new.desconto_sem_socio is distinct from old.desconto_sem_socio
          or new.prefixo_documentos is distinct from old.prefixo_documentos
          or new.emissor_provisorio is distinct from old.emissor_provisorio
          or new.imposto_pct is distinct from old.imposto_pct
          or new.reserva_pct is distinct from old.reserva_pct
          or new.cobertura_socio_id is distinct from old.cobertura_socio_id
          or new.cobertura_nome is distinct from old.cobertura_nome) then
    raise exception 'Só um sócio muda limite de desconto, prefixo, emissor provisório, imposto, reserva e quem cobre o caixa.';
  end if;
  if new.cobertura_socio_id is not null and not exists (
    select 1 from acessos a where a.usuario_id = new.cobertura_socio_id and a.ambiente_id = new.ambiente_id and a.perfil = 'socio') then
    raise exception 'Quem cobre o caixa precisa ser sócio deste ambiente.';
  end if;
  return new;
end $$;

-- ---------- Comprovantes: bucket fechado, pasta = ambiente, só sócio e administrativo do ambiente ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 4194304, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy comprovantes_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and tem_perfil((storage.foldername(name))[1], '{socio,administrativo}'));
create policy comprovantes_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and tem_perfil((storage.foldername(name))[1], '{socio,administrativo}'));
create policy comprovantes_trocar on storage.objects for update to authenticated
  using (bucket_id = 'comprovantes' and tem_perfil((storage.foldername(name))[1], '{socio,administrativo}'))
  with check (bucket_id = 'comprovantes' and tem_perfil((storage.foldername(name))[1], '{socio,administrativo}'));
create policy comprovantes_remover on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and tem_perfil((storage.foldername(name))[1], '{socio,administrativo}'));

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
