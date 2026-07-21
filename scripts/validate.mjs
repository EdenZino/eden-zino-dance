import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';

const db = new PGlite();
const migrationFiles = (await fs.readdir('db/migrations'))
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort()
  .map((file) => `db/migrations/${file}`);
for (const file of migrationFiles) {
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

// P0: secure access and administrator hardening schema.
const securityTables = (await db.query("select count(*)::int count from information_schema.tables where table_schema='public' and table_name in ('admin_password_reset_tokens','admin_login_challenges','customer_magic_tokens','customer_sessions')")).rows[0].count;
if (securityTables !== 4) throw new Error('security tables missing');
const legalColumns = (await db.query("select count(*)::int count from information_schema.columns where table_name='legal_documents' and column_name in ('approved_at','approved_by','approval_note')")).rows[0].count;
if (legalColumns !== 3) throw new Error('legal approval fields missing');
const environmentColumns = (await db.query("select count(*)::int count from information_schema.columns where (table_name='payments' and column_name='provider_environment') or (table_name='refunds' and column_name='provider_environment')")).rows[0].count;
if (environmentColumns !== 2) throw new Error('provider environment fields missing');
console.log('✓ secure portal, password reset, MFA and legal approval schema');
const themeSetting = (await db.query("select public_theme from business_settings where singleton=true")).rows[0]?.public_theme;
if (themeSetting !== 'CLASSIC') throw new Error('public theme migration/default failed');
await db.query("update business_settings set public_theme='MODERN' where singleton=true");
const updatedTheme = (await db.query("select public_theme from business_settings where singleton=true")).rows[0]?.public_theme;
if (updatedTheme !== 'MODERN') throw new Error('public theme update failed');
console.log('✓ classic/modern public theme setting');
const paletteDefault = (await db.query("select classic_palette from business_settings where singleton=true")).rows[0]?.classic_palette;
if (paletteDefault !== 'ROSIN') throw new Error('classic palette migration/default failed');
for (const palette of ['PLUM','OCEAN','SAGE','MIDNIGHT','ROSIN']) {
  await db.query('update business_settings set classic_palette=$1 where singleton=true', [palette]);
  const selected = (await db.query('select classic_palette from business_settings where singleton=true')).rows[0]?.classic_palette;
  if (selected !== palette) throw new Error(`classic palette update failed: ${palette}`);
}
let invalidPaletteError = '';
try { await db.query("update business_settings set classic_palette='NEON' where singleton=true"); } catch (error) { invalidPaletteError = error.message; }
if (!invalidPaletteError) throw new Error('classic palette constraint failed');
console.log('✓ five selectable Classic color palettes and database constraint');

const galleryAsset = (await db.query("insert into uploaded_assets(object_key,public_url,file_name,content_type,size_bytes,uploaded_by) values('gallery/test/image.webp','https://example.test/image.webp','image.webp','image/webp',1234,$1) returning id", [admin.id])).rows[0];
const galleryItem = (await db.query("insert into gallery_items(asset_id,media_type,title,alt_text,display_order,is_published,created_by) values($1,'IMAGE','Test gallery item','A dancer in the studio',10,true,$2) returning id", [galleryAsset.id, admin.id])).rows[0];
const galleryPublic = (await db.query("select g.id,a.public_url from gallery_items g join uploaded_assets a on a.id=g.asset_id where g.is_published=true order by g.display_order")).rows;
if (galleryPublic.length !== 1 || galleryPublic[0].id !== galleryItem.id) throw new Error('gallery publishing schema failed');
await db.query('delete from uploaded_assets where id=$1', [galleryAsset.id]);
const galleryCascade = (await db.query('select count(*)::int count from gallery_items where id=$1', [galleryItem.id])).rows[0].count;
if (galleryCascade !== 0) throw new Error('gallery asset cascade deletion failed');
console.log('✓ image/video gallery publishing and deletion schema');

// v1.6: editable split Hero defaults and WhatsApp shutdown migration.
const homeContent = (await db.query("select value from site_content where key='home'")).rows[0]?.value || {};
if (homeContent.heroTitleTop !== 'COME DANCE WITH' || homeContent.heroTitleMain !== 'EDEN ZINO' || homeContent.heroImageSource !== 'GALLERY') throw new Error('hero editor defaults migration failed');
await db.query("insert into notification_jobs(registration_id,channel,template_key,status) values($1,'WHATSAPP','TEST_DISABLED_WHATSAPP','PENDING')", [reserve.registration_id]);
let whatsappMigration = await fs.readFile('db/migrations/0008_email_hero_and_whatsapp.sql', 'utf8');
await db.exec(whatsappMigration);
const whatsappState = (await db.query("select status from notification_jobs where template_key='TEST_DISABLED_WHATSAPP'")).rows[0]?.status;
if (whatsappState !== 'CANCELLED') throw new Error('WhatsApp shutdown migration failed');
console.log('✓ editable split Hero defaults and WhatsApp queue shutdown');

// P0: truthful notification status must not masquerade as sent.
await db.query("insert into notification_jobs(registration_id,channel,template_key,status,last_error) values($1,'EMAIL','TEST_CONFIGURATION','CONFIGURATION_ERROR','EMAIL_PROVIDER_NOT_CONFIGURED')", [reserve.registration_id]);
const notificationState = (await db.query("select status from notification_jobs where template_key='TEST_CONFIGURATION'")).rows[0].status;
if (notificationState !== 'CONFIGURATION_ERROR') throw new Error('notification delivery state failed');
console.log('✓ notification configuration failures remain visible');

// P0: waitlist invitations reserve their offered capacity and cannot over-invite.
const workshopId = (await db.query("select id from workshops where public_code='EZTEST'")).rows[0].id;
await db.query("insert into waitlist_entries(workshop_id,first_name,last_name,email,phone,participant_count) values($1,'Next','Dancer','next@example.com','0501111111',1)", [workshopId]);
const cancelState = (await db.query("select * from cancel_registration_atomic($1,'Customer cancellation',$2)", [reserve.registration_id, admin.id])).rows[0];
if (cancelState.registration_status !== 'REFUND_PENDING' || cancelState.refundable_agorot !== 10000) throw new Error('atomic cancellation failed');
const allocation = (await db.query("select * from allocate_registration_refund($1,10000,'Customer cancellation',$2,true)", [reserve.registration_id, admin.id])).rows;
if (allocation.length !== 2 || allocation.reduce((sum,row)=>sum+row.amount_agorot,0) !== 10000) throw new Error('atomic refund allocation failed');
let duplicateAllocationError='';
try { await db.query("select * from allocate_registration_refund($1,1,'duplicate',$2,true)", [reserve.registration_id, admin.id]); } catch (error) { duplicateAllocationError=error.message; }
if (!duplicateAllocationError.includes('INVALID_REFUND_AMOUNT')) throw new Error('duplicate refund allocation protection failed');
const firstRefund = (await db.query("select * from complete_refund_atomic($1,'refund-part-1','{}'::jsonb)", [allocation[0].refund_id])).rows[0];
if (firstRefund.registration_status !== 'REFUND_PENDING') throw new Error('split refund prematurely closed cancellation');
const finalRefund = (await db.query("select * from complete_refund_atomic($1,'refund-part-2','{}'::jsonb)", [allocation[1].refund_id])).rows[0];
if (finalRefund.registration_status !== 'CANCELLED' || finalRefund.refunded_total !== 10000) throw new Error('refund completion failed');
const repeatCompletion = (await db.query("select * from complete_refund_atomic($1,'refund-part-2','{}'::jsonb)", [allocation[1].refund_id])).rows[0];
if (repeatCompletion.refunded_total !== 10000) throw new Error('refund completion idempotency failed');
const invitation = (await db.query("select * from invite_next_waitlist($1,'invite-token-1',24)", [workshopId])).rows;
if (invitation.length !== 1) throw new Error('waitlist invitation failed');
const duplicateInvitation = (await db.query("select * from invite_next_waitlist($1,'invite-token-2',24)", [workshopId])).rows;
if (duplicateInvitation.length !== 0) throw new Error('waitlist over-invitation protection failed');
console.log('✓ atomic cancellation, split refund, idempotency and waitlist capacity hold');

// P0: transfers lock capacity and reject silent price changes.
const sourceWorkshop = (await db.query(`insert into workshops(public_code,slug,title,starts_at,ends_at,capacity,max_participants_per_order,max_registrations_per_phone,price_agorot,status,terms_version,privacy_version,cancellation_policy_version,created_by)
  values('EZSRC','source-workshop','Source',now()+interval '10 day',now()+interval '10 day 2 hour',2,2,2,10000,'PUBLISHED','DRAFT-1','DRAFT-1','DRAFT-1',$1) returning id`, [admin.id])).rows[0];
const targetWorkshop = (await db.query(`insert into workshops(public_code,slug,title,starts_at,ends_at,capacity,max_participants_per_order,max_registrations_per_phone,price_agorot,status,terms_version,privacy_version,cancellation_policy_version,created_by)
  values('EZTGT','target-workshop','Target',now()+interval '11 day',now()+interval '11 day 2 hour',1,2,2,10000,'PUBLISHED','DRAFT-1','DRAFT-1','DRAFT-1',$1) returning id`, [admin.id])).rows[0];
const expensiveWorkshop = (await db.query(`insert into workshops(public_code,slug,title,starts_at,ends_at,capacity,max_participants_per_order,max_registrations_per_phone,price_agorot,status,terms_version,privacy_version,cancellation_policy_version,created_by)
  values('EZEXP','expensive-workshop','Expensive',now()+interval '12 day',now()+interval '12 day 2 hour',2,2,2,12000,'PUBLISHED','DRAFT-1','DRAFT-1','DRAFT-1',$1) returning id`, [admin.id])).rows[0];
const transferReg = (await db.query(`select * from reserve_registration('EZSRC','Move','Me','move@example.com','0502222222','','[{"firstName":"Move","lastName":"Me"}]'::jsonb,null,false,'{}'::jsonb,'{}'::jsonb,'DRAFT-1','DRAFT-1','DRAFT-1','FULL',null,null,null)`)).rows[0];
const transferPayment = (await db.query("insert into payments(registration_id,provider,status,amount_agorot,checkout_code,purpose) values($1,'mock','CREATED',10000,'transfer-checkout','WORKSHOP_FULL') returning id", [transferReg.registration_id])).rows[0];
await db.query("select * from confirm_checkout_payment($1,'tx-transfer',10000,'OK','mock','{}'::jsonb)", [transferPayment.id]);
const transfer = (await db.query("select * from transfer_registration_atomic($1,$2,$3)", [transferReg.registration_id,targetWorkshop.id,admin.id])).rows[0];
if (transfer.target_workshop_id !== targetWorkshop.id) throw new Error('atomic transfer failed');
let priceError='';
try { await db.query("select * from transfer_registration_atomic($1,$2,$3)", [transferReg.registration_id,expensiveWorkshop.id,admin.id]); } catch (error) { priceError=error.message; }
if (!priceError.includes('TRANSFER_PRICE_MISMATCH')) throw new Error('transfer price protection failed');
console.log('✓ atomic transfer capacity and price protection');

const count = (await db.query("select count(*)::int count from information_schema.tables where table_schema='public'")).rows[0].count;
console.log(`✓ database schema loaded (${count} public tables)`);
console.log('\nALL VALIDATION TESTS PASSED');
await db.close();
