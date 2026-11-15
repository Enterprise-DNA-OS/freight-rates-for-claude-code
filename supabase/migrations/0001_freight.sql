create table clients (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null check(length(trim(name))>0),
 purpose text not null default '', retention_review date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table import_batches (
 id uuid primary key default gen_random_uuid(), source_key text not null unique, source_name text not null, actor text not null,
 source_data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table rates (
 id uuid primary key default gen_random_uuid(), code text not null unique, contract text not null, carrier text not null,
 origin text not null, destination text not null, equipment text not null check(equipment in ('20GP','40GP','40HC')),
 currency text not null check(currency in ('USD','NZD','AUD','EUR','GBP','SGD','CAD')),
 buy_cents bigint not null check(buy_cents between 0 and 1000000000), valid_from date not null, valid_to date not null,
 source_ref text not null, source_key text unique, batch_id uuid references import_batches(id), internal_note text not null default '',
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(valid_to>=valid_from), check(origin<>destination)
);
create index rates_batch_idx on rates(batch_id);
create index rates_lane_idx on rates(origin,destination,equipment) where active;
create index rates_expiry_idx on rates(valid_to) where active;
create table charges (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 location text not null, basis text not null check(basis in ('container','shipment')),
 currency text not null check(currency in ('USD','NZD','AUD','EUR','GBP','SGD','CAD')),
 buy_cents bigint not null check(buy_cents between 0 and 1000000000), valid_to date not null, source_ref text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table quotes (
 id uuid primary key default gen_random_uuid(), code text not null unique, client_id uuid not null references clients(id),
 owner text not null check(length(trim(owner))>0), status text not null default 'draft' check(status in ('draft','approved','won','lost','withdrawn')),
 sail_date date not null, valid_until date not null, currency text not null check(currency in ('USD','NZD','AUD','EUR','GBP','SGD','CAD')),
 markup_bps integer not null check(markup_bps between 0 and 100000), tax_bps integer not null check(tax_bps between 0 and 10000),
 terms text not null, coverage_confirmed boolean not null default false, followup_on date not null,
 decision_evidence text, approved_by text, approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index quotes_client_idx on quotes(client_id);
create index quotes_followup_idx on quotes(followup_on) where status in ('draft','approved');
create table quote_lines (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references quotes(id),
 rate_id uuid references rates(id), charge_id uuid references charges(id), description text not null,
 quantity integer not null check(quantity between 1 and 1000), unit_buy_cents bigint not null check(unit_buy_cents between 0 and 1000000000),
 source_valid_from date, source_valid_to date not null, source_ref text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(num_nonnulls(rate_id,charge_id)=1)
);
create index lines_quote_idx on quote_lines(quote_id);
create index lines_rate_idx on quote_lines(rate_id);
create index lines_charge_idx on quote_lines(charge_id);
create table notes (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references quotes(id), actor text not null, body text not null check(length(trim(body))>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index notes_quote_idx on notes(quote_id);
create table audit_log (
 id uuid primary key default gen_random_uuid(), entity text not null, record_id uuid not null, action text not null,
 actor text not null, before_record jsonb, after_record jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index audit_record_idx on audit_log(record_id,created_at);
create function stamp() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
create function audit_write() returns trigger language plpgsql as $$
begin
 insert into audit_log(entity,record_id,action,actor,before_record,after_record)
 values(TG_TABLE_NAME,new.id,TG_OP,coalesce(nullif(current_setting('app.actor',true),''),'database-owner'),case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end$$;
create function immutable_record() returns trigger language plpgsql as $$begin raise exception 'Append-only record';end$$;
create function quote_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Quotes cannot be deleted';end if;
 if old.status<>'draft' and (to_jsonb(new)-array['status','decision_evidence','updated_at']) is distinct from (to_jsonb(old)-array['status','decision_evidence','updated_at']) then raise exception 'Approved quote terms are frozen';end if;
 if new.status is distinct from old.status then
  if not ((old.status='draft' and new.status in ('approved','withdrawn')) or (old.status='approved' and new.status in ('won','lost','withdrawn'))) then raise exception 'Invalid quote transition';end if;
  if coalesce(length(trim(new.decision_evidence)),0)=0 then raise exception 'Decision evidence required';end if;
  if new.status='approved' then
   if not new.coverage_confirmed or length(trim(new.terms))=0 or new.valid_until<current_date or new.sail_date<current_date or new.approved_by is null or new.approved_at is null then raise exception 'Quote terms, dates, charge coverage and approval required';end if;
   if not exists(select 1 from quote_lines where quote_id=new.id and rate_id is not null) then raise exception 'Freight line required';end if;
   if exists(select 1 from quote_lines where quote_id=new.id and (source_valid_to<greatest(new.valid_until,new.sail_date) or source_valid_from>new.sail_date)) then raise exception 'Source rate does not cover quote or sailing date';end if;
   if exists(select 1 from quote_lines l join rates r on r.id=l.rate_id where l.quote_id=new.id and not r.active) then raise exception 'Source rate superseded; prepare a fresh quote';end if;
  end if;
  if new.status='won' and (old.valid_until<current_date or old.sail_date<current_date) then raise exception 'Expired quotation cannot be marked won';end if;
 end if;
 return new;
end$$;
create trigger quote_guard before update or delete on quotes for each row execute function quote_guard();
create function line_guard() returns trigger language plpgsql as $$
declare q uuid; s text;
begin
 if TG_OP<>'INSERT' then raise exception 'Quote lines are immutable; prepare a fresh quote';end if;
 q=new.quote_id; select status into s from quotes where id=q for update;
 if s<>'draft' then raise exception 'Quote lines are frozen';end if;
 return new;
end$$;
create trigger line_guard before insert or update or delete on quote_lines for each row execute function line_guard();
do $$declare t text;begin
 foreach t in array array['clients','rates','charges','quotes','quote_lines','notes','import_batches'] loop
  execute format('create trigger stamp before update on %I for each row execute function stamp()',t);
  execute format('create trigger audit after insert or update on %I for each row execute function audit_write()',t);
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public',t);
 end loop;
 foreach t in array array['notes','import_batches','audit_log'] loop
  execute format('create trigger immutable before update or delete on %I for each row execute function immutable_record()',t);
 end loop;
end$$;
alter table audit_log enable row level security;
revoke all on audit_log from public;
create view rate_book with (security_invoker=true) as
 select code,contract,carrier,origin,destination,equipment,currency,buy_cents,valid_from,valid_to,valid_to-current_date as days_left,active,source_ref from rates;
create view quote_totals with (security_invoker=true) as
 with costs as (select quote_id,sum(quantity::numeric*unit_buy_cents)::bigint as buy_cents,count(*) as lines from quote_lines group by quote_id),
 net as (select q.*,c.name as client,coalesce(x.buy_cents,0) as buy_cents,coalesce(x.lines,0) as lines,
 round(coalesce(x.buy_cents,0)::numeric*(10000+q.markup_bps)/10000)::bigint as net_cents
 from quotes q join clients c on c.id=q.client_id left join costs x on x.quote_id=q.id)
 select n.*,net_cents-buy_cents as profit_cents,round(net_cents::numeric*tax_bps/10000)::bigint as tax_cents,
 net_cents+round(net_cents::numeric*tax_bps/10000)::bigint as total_cents from net n;
create view quote_review with (security_invoker=true) as
 select code,client,owner,status,currency,buy_cents,net_cents,profit_cents,tax_cents,total_cents,valid_until,sail_date,followup_on from quote_totals;
create view attention with (security_invoker=true) as
 select 'rate' as kind,code,contract as name,case when valid_to<current_date then 'Expired tariff' else 'Tariff expires within 14 days' end as issue,valid_to as due from rates where active and valid_to<=current_date+14
 union all select 'quote',code,owner,'Follow-up overdue',followup_on from quotes where status in ('draft','approved') and followup_on<current_date
 union all select 'quote',code,owner,'Quote validity expired',valid_until from quotes where status in ('draft','approved') and valid_until<current_date;
create view compliance_findings with (security_invoker=true) as
 select 'quote' as kind,q.code,'PRICE_SCOPE' as rule,'Record terms and confirm all applicable charges and tax treatment' as finding from quotes q where status in ('draft','approved') and (not coverage_confirmed or length(trim(terms))=0)
 union all select 'quote',q.code,'SOURCE_VALIDITY','Source rate does not cover sailing and quote validity' from quotes q where status in ('draft','approved') and exists(select 1 from quote_lines l where l.quote_id=q.id and (l.source_valid_to<greatest(q.valid_until,q.sail_date) or l.source_valid_from>q.sail_date))
 union all select 'quote',q.code,'RATE_SUPERSEDED','Rate changed after quote preparation; review before relying on the quote' from quotes q where status in ('draft','approved') and exists(select 1 from quote_lines l join rates r on r.id=l.rate_id where l.quote_id=q.id and not r.active)
 union all select 'client',code,'RETENTION_REVIEW','Set or revisit lawful purpose and retention decision' from clients where length(trim(purpose))=0 or retention_review is null or retention_review<=current_date;
revoke all on rate_book,quote_totals,quote_review,attention,compliance_findings from public;
