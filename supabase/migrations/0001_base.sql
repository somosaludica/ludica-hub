-- Lúdica HUB · esquema base (Fase 1)
-- Ambientes, pessoas e acessos, Tabela de Serviços, clientes e painel de leads.
-- Regras de negócio: documento de escopo (link no README). Rodar no SQL Editor do Supabase.

-- ============ Tipos ============
create type perfil_acesso as enum ('socio', 'administrativo', 'comercial', 'pauta');
create type tipo_cliente as enum ('artista', 'empresa');
create type idioma as enum ('pt', 'en', 'es');
create type tema as enum ('claro', 'escuro', 'sistema');
create type etapa_lead as enum ('novo', 'em_contato', 'proposta_enviada', 'fechado', 'perdido');
create type unidade_cobranca as enum (
  'unitario', 'mensal', 'diaria', 'por_hora', 'por_faixa',
  'por_video_musica', 'por_evento', 'por_pacote', 'por_formato_de_show'
);

-- ============ Ambientes ============
-- Três ambientes independentes no dinheiro (um CNPJ cada), com cadastro de clientes comum.
create table ambientes (
  id text primary key check (id in ('hub', 'music', 'mkt')),
  nome text not null,
  ordem int not null
);

-- Dados do emissor dos documentos. Enquanto MUSIC e HUB não têm CNPJ, saem pela Lúdica Marketing.
-- Os documentos já emitidos guardam o emissor da época (fase 2); trocar aqui só vale para os novos.
create table ambiente_dados (
  ambiente_id text primary key references ambientes(id),
  razao_social text,
  cnpj text,
  endereco text,
  conta_recebimento text,
  emissor_provisorio boolean not null default false,
  prefixo_documentos text not null,
  atualizado_em timestamptz not null default now()
);

-- ============ Pessoas e acessos ============
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  tema tema not null default 'claro',
  idioma idioma not null default 'pt',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- A permissão é sempre perfil + ambiente: a mesma pessoa pode ser sócia em um e não ter acesso a outro.
create table acessos (
  usuario_id uuid not null references perfis(id) on delete cascade,
  ambiente_id text not null references ambientes(id),
  perfil perfil_acesso not null,
  primary key (usuario_id, ambiente_id)
);

-- ============ Funções de permissão ============
-- security definer: leem acessos sem esbarrar no RLS da própria tabela.
create function perfil_em(amb text) returns perfil_acesso
language sql stable security definer set search_path = public as $$
  select a.perfil from acessos a join perfis p on p.id = a.usuario_id
  where a.usuario_id = auth.uid() and a.ambiente_id = amb and p.ativo
$$;

create function tem_perfil(amb text, perfis_ok perfil_acesso[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(perfil_em(amb) = any(perfis_ok), false)
$$;

-- Sócio em qualquer ambiente: vê os preços de todos (decisão de 19/11) e a lista de pessoas.
create function eh_socio_algum() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from acessos a join perfis p on p.id = a.usuario_id
    where a.usuario_id = auth.uid() and a.perfil = 'socio' and p.ativo
  )
$$;

-- Sócio ou administrativo em algum ambiente: vê todo o cadastro de clientes.
create function ve_todos_clientes() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from acessos a join perfis p on p.id = a.usuario_id
    where a.usuario_id = auth.uid() and a.perfil in ('socio', 'administrativo') and p.ativo
  )
$$;

-- Pode cadastrar cliente ou lead: sócio, administrativo ou comercial em algum ambiente.
create function pode_cadastrar() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from acessos a join perfis p on p.id = a.usuario_id
    where a.usuario_id = auth.uid() and a.perfil in ('socio', 'administrativo', 'comercial') and p.ativo
  )
$$;

-- ============ Tabela de Serviços ============
-- Cada ambiente tem a sua. O orçamento (fase 2) guarda o preço do dia; mudar aqui não altera o que já foi emitido.
create table servicos (
  id uuid primary key default gen_random_uuid(),
  ambiente_id text not null references ambientes(id),
  categoria text not null,
  nome text not null,
  valor numeric(12, 2) not null check (valor >= 0),
  unidade unidade_cobranca not null,
  prazo_minimo_meses int check (prazo_minimo_meses is null or prazo_minimo_meses > 0),
  complemento boolean not null default false,       -- só entra no orçamento junto de outro serviço
  visivel_comercial boolean not null default true,  -- o comercial só vê os serviços liberados
  ativo boolean not null default true,
  observacao_interna text,
  -- conteúdo que entra na proposta (usado na fase 2)
  proposta_titulo text,
  proposta_descricao text,
  proposta_incluso text,
  proposta_nao_incluso text,
  proposta_opcionais text,
  proposta_workflow text,
  proposta_prazo text,
  proposta_pagamento text,
  proposta_validade text,
  modelo_contrato_path text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- prazo mínimo só faz sentido em serviço mensal
  check (prazo_minimo_meses is null or unidade = 'mensal'),
  unique (ambiente_id, categoria, nome)
);

-- ============ Clientes e leads ============
-- Cadastro único para os três ambientes. Orçamentos, contratos e valores ficam em cada ambiente.
create table clientes (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_cliente not null default 'artista',
  nome text not null,
  documento text unique,             -- CPF ou CNPJ, só dígitos
  email text,
  whatsapp text,
  aceita_whatsapp boolean not null default false,  -- consentimento para avisos de cobrança
  nascimento date,
  idioma_documentos idioma not null default 'pt',  -- idioma das propostas, notas e mensagens
  origem text,
  indicado_por text,
  indicador_recebe_comissao boolean not null default false,
  instagram text,
  spotify text,
  youtube text,
  tiktok text,
  outros_links text,
  foto_path text,
  observacoes text,
  criado_por uuid references perfis(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  check (documento is null or documento ~ '^[0-9]{11}$|^[0-9]{14}$')
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  ambiente_id text not null references ambientes(id),
  responsavel_id uuid not null references perfis(id) default auth.uid(),
  etapa etapa_lead not null default 'novo',
  servico_interesse_id uuid references servicos(id),
  valor_estimado numeric(12, 2) check (valor_estimado is null or valor_estimado >= 0),
  ultimo_contato date,
  motivo_perda text,
  observacoes text,
  criado_em timestamptz not null default now(),
  fechado_em timestamptz
);
create index on leads (ambiente_id, etapa);
create index on leads (responsavel_id);

-- Histórico imutável das mudanças de etapa: base da taxa de conversão do painel.
create table lead_eventos (
  id bigint generated always as identity primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  de etapa_lead,
  para etapa_lead not null,
  por uuid references perfis(id),
  em timestamptz not null default now()
);

create function registra_etapa_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into lead_eventos (lead_id, de, para, por) values (new.id, null, new.etapa, auth.uid());
  elsif new.etapa is distinct from old.etapa then
    insert into lead_eventos (lead_id, de, para, por) values (new.id, old.etapa, new.etapa, auth.uid());
    new.fechado_em := case when new.etapa = 'fechado' then now() else null end;
  end if;
  return new;
end $$;

create trigger leads_etapa_ins after insert on leads for each row execute function registra_etapa_lead();
create trigger leads_etapa_upd before update of etapa on leads for each row execute function registra_etapa_lead();

-- Cliente "recorrente" é calculado (dois ou mais serviços pagos) quando existir a cobrança, na fase 3.

-- ============ RLS ============
alter table ambientes enable row level security;
alter table ambiente_dados enable row level security;
alter table perfis enable row level security;
alter table acessos enable row level security;
alter table servicos enable row level security;
alter table clientes enable row level security;
alter table leads enable row level security;
alter table lead_eventos enable row level security;

-- Ambientes: todo usuário logado vê os nomes.
create policy ambientes_ver on ambientes for select to authenticated using (true);

-- Dados do emissor: sócio altera; administrativo lê (precisa para orçamento e cobrança).
create policy amb_dados_ver on ambiente_dados for select to authenticated
  using (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy amb_dados_alterar on ambiente_dados for update to authenticated
  using (tem_perfil(ambiente_id, '{socio}')) with check (tem_perfil(ambiente_id, '{socio}'));

-- Perfis: cada um vê e altera o seu (nome, tema, idioma). Sócios veem e ativam ou desativam os demais.
create policy perfis_ver on perfis for select to authenticated
  using (id = auth.uid() or eh_socio_algum());
create policy perfis_alterar_proprio on perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy perfis_alterar_socio on perfis for update to authenticated
  using (eh_socio_algum()) with check (eh_socio_algum());
-- Contas novas são criadas pelo servidor (convite), com a chave de serviço, que ignora o RLS.

-- Ninguém muda o próprio "ativo" nem o e-mail pela tela; só um sócio, e nunca o próprio "ativo".
create function protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'O e-mail da conta não pode ser alterado por aqui.';
  end if;
  if new.ativo is distinct from old.ativo and (new.id = auth.uid() or not eh_socio_algum()) then
    raise exception 'Só um sócio ativa ou desativa outra pessoa.';
  end if;
  if old.ativo and not new.ativo and auth.uid() is not null then
    -- só desativa quem não tem acesso a ambiente onde você não é sócio
    if exists (select 1 from acessos a where a.usuario_id = new.id and not tem_perfil(a.ambiente_id, '{socio}')) then
      raise exception 'Você só desativa pessoas dos ambientes em que é sócio.';
    end if;
    -- e nunca o último sócio ativo de um ambiente (rede de segurança: a regra acima já impede na prática)
    if exists (
      select 1 from acessos a where a.usuario_id = new.id and a.perfil = 'socio'
      and not exists (select 1 from acessos b join perfis q on q.id = b.usuario_id
                      where b.ambiente_id = a.ambiente_id and b.perfil = 'socio' and q.ativo and b.usuario_id <> new.id)
    ) then
      raise exception 'Essa pessoa é o único sócio ativo de um ambiente.';
    end if;
  end if;
  return new;
end $$;
create trigger perfis_protege before update on perfis for each row execute function protege_perfil();

-- Acessos: cada um vê os seus; sócio de um ambiente vê e define os acessos daquele ambiente.
create policy acessos_ver on acessos for select to authenticated
  using (usuario_id = auth.uid() or tem_perfil(ambiente_id, '{socio}'));
create policy acessos_criar on acessos for insert to authenticated
  with check (tem_perfil(ambiente_id, '{socio}'));
create policy acessos_alterar on acessos for update to authenticated
  using (tem_perfil(ambiente_id, '{socio}')) with check (tem_perfil(ambiente_id, '{socio}'));
create policy acessos_remover on acessos for delete to authenticated
  using (tem_perfil(ambiente_id, '{socio}'));

-- Um ambiente nunca fica sem sócio.
create function garante_um_socio() returns trigger
language plpgsql security definer set search_path = public as $$
declare amb text := coalesce(old.ambiente_id, new.ambiente_id);
begin
  if old.perfil = 'socio' and (tg_op = 'DELETE' or new.perfil <> 'socio') then
    if not exists (select 1 from acessos b join perfis q on q.id = b.usuario_id
                   where b.ambiente_id = amb and b.perfil = 'socio' and q.ativo and b.usuario_id <> old.usuario_id) then
      raise exception 'O ambiente % precisa ter pelo menos um sócio.', amb;
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger acessos_um_socio before update or delete on acessos for each row execute function garante_um_socio();

-- Serviços: sócio vê os preços de todos os ambientes; administrativo vê os do seu ambiente;
-- comercial vê só os ativos liberados para ele; pauta não vê.
create policy servicos_ver on servicos for select to authenticated using (
  eh_socio_algum()
  or tem_perfil(ambiente_id, '{socio,administrativo}')
  or (tem_perfil(ambiente_id, '{comercial}') and visivel_comercial and ativo)
);
create policy servicos_criar on servicos for insert to authenticated
  with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy servicos_alterar on servicos for update to authenticated
  using (tem_perfil(ambiente_id, '{socio,administrativo}'))
  with check (tem_perfil(ambiente_id, '{socio,administrativo}'));
create policy servicos_remover on servicos for delete to authenticated
  using (tem_perfil(ambiente_id, '{socio}'));

-- Clientes do comercial: os que ele cadastrou ou de que é responsável por algum lead.
create function cliente_do_comercial(cli uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = cli and c.criado_por = auth.uid())
      or exists (select 1 from leads l where l.cliente_id = cli and l.responsavel_id = auth.uid())
$$;

create policy clientes_ver on clientes for select to authenticated
  using (ve_todos_clientes() or cliente_do_comercial(id));
create policy clientes_criar on clientes for insert to authenticated
  with check (pode_cadastrar() and criado_por = auth.uid());
create policy clientes_alterar on clientes for update to authenticated
  using (ve_todos_clientes() or cliente_do_comercial(id))
  with check (ve_todos_clientes() or cliente_do_comercial(id));
create policy clientes_remover on clientes for delete to authenticated
  using (eh_socio_algum());

-- Leads: sócio e administrativo veem todos do ambiente; o comercial vê e mexe só nos seus.
create policy leads_ver on leads for select to authenticated using (
  tem_perfil(ambiente_id, '{socio,administrativo}')
  or (tem_perfil(ambiente_id, '{comercial}') and responsavel_id = auth.uid())
);
-- O comercial só abre lead em cliente que ele mesmo cadastrou; para trabalhar um cliente da base,
-- um sócio ou o administrativo cria o lead e o atribui a ele.
create policy leads_criar on leads for insert to authenticated with check (
  tem_perfil(ambiente_id, '{socio,administrativo}')
  or (tem_perfil(ambiente_id, '{comercial}') and responsavel_id = auth.uid()
      and exists (select 1 from clientes c where c.id = cliente_id and c.criado_por = auth.uid()))
);
create policy leads_alterar on leads for update to authenticated
  using (
    tem_perfil(ambiente_id, '{socio,administrativo}')
    or (tem_perfil(ambiente_id, '{comercial}') and responsavel_id = auth.uid())
  )
  with check (
    tem_perfil(ambiente_id, '{socio,administrativo}')
    or (tem_perfil(ambiente_id, '{comercial}') and responsavel_id = auth.uid() and cliente_do_comercial(cliente_id))
  );
create policy leads_remover on leads for delete to authenticated
  using (tem_perfil(ambiente_id, '{socio}'));

-- Histórico: só leitura, para quem vê o lead.
create policy lead_eventos_ver on lead_eventos for select to authenticated
  using (exists (select 1 from leads l where l.id = lead_id));

-- ============ Dados iniciais ============
insert into ambientes (id, nome, ordem) values
  ('hub', 'HUB', 1), ('music', 'MUSIC', 2), ('mkt', 'MKT', 3);

insert into ambiente_dados (ambiente_id, razao_social, emissor_provisorio, prefixo_documentos) values
  ('hub', 'Lúdica Marketing', true, 'HUB'),
  ('music', 'Lúdica Marketing', true, 'MUS'),
  ('mkt', 'Lúdica Marketing', false, 'MKT');

-- ============ Acesso pela API ============
-- O projeto não expõe tabelas novas sozinho: cada migração libera o que precisa.
-- Só usuários logados (authenticated) acessam; o RLS acima decide o quê.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- O histórico de leads nunca é editado nem apagado pela API.
revoke insert, update, delete on lead_eventos from authenticated;
