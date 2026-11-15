select set_config('app.actor','fictional-demo',false);
insert into clients(id,code,name,purpose,retention_review) values
 ('10000000-0000-0000-0000-000000000001','C-1','Harbour Homewares','Freight quotation and contract administration',current_date+365),
 ('10000000-0000-0000-0000-000000000002','C-2','Harbour Hardware','',current_date-20),
 ('10000000-0000-0000-0000-000000000003','C-3','Southern Parts','Freight quotation and contract administration',current_date+180) on conflict do nothing;
insert into rates(id,code,contract,carrier,origin,destination,equipment,currency,buy_cents,valid_from,valid_to,source_ref,internal_note) values
 ('20000000-0000-0000-0000-000000000001','R-1','November North Asia','Demo Ocean','Shanghai','Auckland','40HC','USD',180000,current_date-10,current_date+10,'fictional-carrier-tariff-1','Includes freight surcharges only; local charges separate'),
 ('20000000-0000-0000-0000-000000000002','R-2','December North Asia','Demo Ocean','Shanghai','Auckland','40HC','USD',190000,current_date,current_date+45,'fictional-carrier-tariff-2','Includes freight surcharges only'),
 ('20000000-0000-0000-0000-000000000003','R-3','October Sydney','Demo Pacific','Sydney','Auckland','20GP','AUD',90000,current_date-40,current_date-5,'fictional-carrier-tariff-3','Expired'),
 ('20000000-0000-0000-0000-000000000004','R-4','Singapore rolling','Demo Straits','Singapore','Melbourne','40GP','USD',140000,current_date-5,current_date+60,'fictional-carrier-tariff-4','Freight only') on conflict do nothing;
insert into charges(id,code,name,location,basis,currency,buy_cents,valid_to,source_ref) values
 ('30000000-0000-0000-0000-000000000001','CH-1','Destination handling','Auckland','container','USD',25000,current_date+90,'fictional-local-tariff'),
 ('30000000-0000-0000-0000-000000000002','CH-2','Documentation','Auckland','shipment','USD',8000,current_date+90,'fictional-local-tariff'),
 ('30000000-0000-0000-0000-000000000003','CH-3','Local trucking','Auckland','shipment','NZD',30000,current_date+90,'fictional-trucking-tariff') on conflict do nothing;
insert into quotes(id,code,client_id,owner,sail_date,valid_until,currency,markup_bps,tax_bps,terms,coverage_confirmed,followup_on) values
 ('40000000-0000-0000-0000-000000000001','Q-101','10000000-0000-0000-0000-000000000001','Alex Morgan',current_date+7,current_date+7,'USD',2000,0,'Port to port. Freight surcharges included. Destination handling and documentation included. No inland haulage, insurance or customs service. Tax treatment requires operator review.',true,current_date-3),
 ('40000000-0000-0000-0000-000000000002','Q-102','10000000-0000-0000-0000-000000000002','Alex Chen',current_date+15,current_date+12,'USD',500,0,'',false,current_date-8),
 ('40000000-0000-0000-0000-000000000003','Q-103','10000000-0000-0000-0000-000000000003','Mere Wilson',current_date-2,current_date-3,'AUD',1000,0,'Expired draft for review',false,current_date-10) on conflict do nothing;
insert into quote_lines(id,quote_id,rate_id,description,quantity,unit_buy_cents,source_valid_from,source_valid_to,source_ref) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Shanghai to Auckland / 40HC / Demo Ocean',2,180000,current_date-10,current_date+10,'fictional-carrier-tariff-1'),
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Shanghai to Auckland / 40HC / Demo Ocean',1,180000,current_date-10,current_date+10,'fictional-carrier-tariff-1'),
 ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','Sydney to Auckland / 20GP / Demo Pacific',1,90000,current_date-40,current_date-5,'fictional-carrier-tariff-3') on conflict do nothing;
insert into quote_lines(id,quote_id,charge_id,description,quantity,unit_buy_cents,source_valid_to,source_ref) values
 ('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Destination handling',2,25000,current_date+90,'fictional-local-tariff'),
 ('50000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','Documentation',1,8000,current_date+90,'fictional-local-tariff') on conflict do nothing;
