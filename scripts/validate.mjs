import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';

const db = new PGlite();
for (const file of ['db/migrations/0001_init.sql', 'db/migrations/0002_demo_seed.sql', 'db/migrations/0003_commerce_and_operations.sql']) {
  let sql = await fs.readFile(file, 'utf8');
  // PGlite includes gen_random_uuid but does not package the pgcrypto extension.
  sql = sql.replace(/create extension if not exists pgcrypto;?/ig, '');
  await db.exec(sql);
  console.log(`✓ migration ${file}`);
}
const admin = (await db.query("insert into admins(email,password_hash,display_name,role) values('owner@test.local','x','Owner','OWNER') returning id")).rows[0];
await db.query(`insert into workshops(public_code,slug,title,starts_at,ends_at,capacity,max_participants_per_order,max_registrations_per_phone,price_agorot,deposit_agorot,status,terms_version,privacy_version,cancellation_policy_version,created_by)
  values('EZTEST','test-workshop','Test Workshop',now()+interval '7 day',now()+interval '7 day 2 hour',2,2,2,10000,3000,'PUBLISHED','DRAFT-1','DRAFT-1','DRAFT-1',$1)`, [admin.id]);
const reserve = (await db.query(`select * from reserve_registration('EZTEST','Ada','Dancer','ada@example.com','050-1234567','','[{"firstName":"Ada","lastName":"Dancer"}]'::jsonb,null,false,'{}'::jsonb,'{}'::jsonb,'DRAFT-1','DRAFT-1','DRAFT-1','DEPOSIT',null,null,null)`)).rows[0];
if (reserve.registration_status !== 'SEAT_HELD' || reserve.amount_agorot !== 3000 || reserve.total_amount_agorot !== 10000) throw new Error('reservation/deposit calculation failed');
console.log('✓ atomic reservation and deposit calculation');

const deposit = (await db.query("insert into payments(registration_id,provider,status,amount_agorot,checkout_code,purpose) values($1,'mock','CREATED',3000,'deposit-checkout','WORKSHOP_DEPOSIT') returning id", [reserve.registration_id])).rows[0];
await db.query("select * from confirm_checkout_payment($1,'tx-deposit',3000,'OK','mock','{}'::jsonb)", [deposit.id]);
const afterDeposit = (await db.query('select status,amount_paid_agorot from registrations where id=$1', [reserve.registration_id])).rows[0];
if (afterDeposit.status !== 'DEPOSIT_PAID' || afterDeposit.amount_paid_agorot !== 3000) throw new Error('deposit confirmation failed');
console.log('✓ deposit payment confirmation');

const balance = (await db.query("insert into payments(registration_id,provider,status,amount_agorot,checkout_code,purpose) values($1,'mock','CREATED',7000,'balance-checkout','WORKSHOP_BALANCE') returning id", [reserve.registration_id])).rows[0];
await db.query("select * from confirm_checkout_payment($1,'tx-balance',7000,'OK','mock','{}'::jsonb)", [balance.id]);
const paid = (await db.query('select status,amount_paid_agorot from registrations where id=$1', [reserve.registration_id])).rows[0];
if (paid.status !== 'PAID' || paid.amount_paid_agorot !== 10000) throw new Error('balance confirmation failed');
console.log('✓ balance payment confirmation');

let fullError = '';
try {
  await db.query(`select * from reserve_registration('EZTEST','Extra','Dancer','extra@example.com','050-9999999','','[{"firstName":"One","lastName":"Dancer"},{"firstName":"Two","lastName":"Dancer"}]'::jsonb,null,false,'{}'::jsonb,'{}'::jsonb,'DRAFT-1','DRAFT-1','DRAFT-1','FULL',null,null,null)`);
} catch (error) { fullError = error.message; }
if (!fullError.includes('WORKSHOP_FULL')) throw new Error('capacity protection failed');
console.log('✓ capacity overbooking protection');

const passProduct = (await db.query("insert into pass_products(name,credits,price_agorot,validity_days) values('5 classes',5,40000,180) returning id")).rows[0];
const order = (await db.query("insert into commerce_orders(order_code,order_type,pass_product_id,full_name,email,phone,amount_agorot) values('ORD-TEST','PASS_PURCHASE',$1,'Ada Dancer','ada@example.com','050',40000) returning id", [passProduct.id])).rows[0];
const orderPayment = (await db.query("insert into payments(order_id,provider,status,amount_agorot,checkout_code,purpose) values($1,'mock','CREATED',40000,'order-checkout','PASS_PURCHASE') returning id", [order.id])).rows[0];
await db.query("select * from confirm_checkout_payment($1,'tx-order',40000,'OK','mock','{}'::jsonb)", [orderPayment.id]);
const issued = (await db.query("select status,metadata->>'issuedCode' code from commerce_orders where id=$1", [order.id])).rows[0];
if (issued.status !== 'PAID' || !issued.code) throw new Error('pass issuance failed');
console.log('✓ pass purchase and entitlement issuance');

const duplicate = await db.query("select * from confirm_checkout_payment($1,'tx-order',40000,'OK','mock','{}'::jsonb)", [orderPayment.id]);
if (duplicate.rows[0].entity_status !== 'PAID') throw new Error('idempotency failed');
console.log('✓ duplicate payment notification is idempotent');

const count = (await db.query("select count(*)::int count from information_schema.tables where table_schema='public'")).rows[0].count;
console.log(`✓ database schema loaded (${count} public tables)`);
console.log('\nALL VALIDATION TESTS PASSED');
await db.close();
