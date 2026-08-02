import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createCustomerAuthService } from "../src/customer-auth-service.mjs";
import { createCustomerOrdersService } from "../src/customer-orders-service.mjs";

const connectionString=process.env.DATABASE_URL;
const ADMIN={role:"ADMIN",userId:"00000000-0000-4000-8000-000000000001",providerId:null};
const PROVIDER_A="00000000-0000-4000-8000-000000000201";
const PROVIDER_B="00000000-0000-4000-8000-000000000202";

function address(){return{line1:"Calle cliente 8",city:"Granada",postalCode:"18001",country:"ES"}}

test("el enlace de un solo uso crea una sesión y permite al cliente gestionar sus pedidos",{skip:!connectionString},async t=>{
 const database=createDatabase({connectionString,maxConnections:5,statementTimeoutMs:5000,logger:{error(){}}});
 t.after(()=>database.close());
 const suffix=randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 const customerId=randomUUID(),checkoutId=randomUUID(),orderAId=randomUUID(),orderBId=randomUUID(),itemId=randomUUID(),requestId=randomUUID();
 const email=`cliente-${suffix.toLowerCase()}@example.test`;
 await database.withContext(ADMIN,async tx=>{
  await tx.query(`INSERT INTO users(id,email,display_name,status,email_verified_at,two_factor_enabled) VALUES($1,$2,'Cliente privado','ACTIVE',now(),false)`,[customerId,email]);
  await tx.query(`INSERT INTO checkout_batches(id,customer_user_id,checkout_reference,currency,customer_name,contact_email,shipping_address,status,submitted_at) VALUES($1,$2,$3,'EUR','Cliente privado',$4,$5::jsonb,'SUBMITTED',now())`,[checkoutId,customerId,`AL-CHECKOUT-${suffix}`,email,JSON.stringify(address())]);
  const orderSql=`INSERT INTO provider_orders(id,checkout_id,provider_id,customer_user_id,order_number,status,currency,subtotal_cents,shipping_cents,total_cents,preparation_min_days,preparation_max_days,customer_name,contact_email,shipping_address) VALUES($1,$2,$3,$4,$5,'PENDING_CONFIRMATION','EUR',$6,$7,$8,$9,$10,'Cliente privado',$11,$12::jsonb)`;
  await tx.query(orderSql,[orderAId,checkoutId,PROVIDER_A,customerId,`AL-CUSTOMER-A-${suffix}`,4800,500,5300,3,7,email,JSON.stringify(address())]);
  await tx.query(orderSql,[orderBId,checkoutId,PROVIDER_B,customerId,`AL-CUSTOMER-B-${suffix}`,3200,400,3600,4,9,email,JSON.stringify(address())]);
  await tx.query(`INSERT INTO order_items(id,order_id,provider_id,customer_user_id,item_type,product_name,quantity,unit_price_cents,line_total_cents,currency,personalization) VALUES($1,$2,$3,$4,'CUSTOM','Bordado privado',1,4800,4800,'EUR',$5::jsonb)`,[itemId,orderAId,PROVIDER_A,customerId,JSON.stringify({name:"Adriana"})]);
  await tx.query(`INSERT INTO custom_requests(id,order_id,order_item_id,provider_id,customer_user_id,title,brief,status,quoted_price_cents,currency) VALUES($1,$2,$3,$4,$5,'Bordado con nombre','El taller ha preparado un presupuesto que debe aprobar únicamente el cliente.','QUOTED',4800,'EUR')`,[requestId,orderAId,itemId,PROVIDER_A,customerId]);
 });
 const auth=createCustomerAuthService({database,systemContext:ADMIN,accessTtlMinutes:30,sessionTtlHours:24});
 const issued=await auth.issueAccess({customerUserId:customerId,checkoutId});
 assert.match(issued.accessToken,/^[A-Za-z0-9_-]{32,180}$/);
 await database.withContext(ADMIN,async tx=>{
  const result=await tx.query("SELECT token_hash FROM customer_order_access_tokens WHERE id=$1",[issued.accessId]);
  assert.equal(result.rows[0].token_hash.length,64);
  assert.notEqual(result.rows[0].token_hash,issued.accessToken);
 });
 const consumed=await auth.consumeAccess(issued.accessToken,{userAgent:"Atelier test browser"});
 assert.equal(consumed.user.id,customerId);
 assert.match(consumed.sessionToken,/^[A-Za-z0-9_-]{32,180}$/);
 await assert.rejects(()=>auth.consumeAccess(issued.accessToken),error=>error?.code==="CUSTOMER_ACCESS_INVALID");
 const session=await auth.authenticate(consumed.sessionToken);
 assert.equal(session.context.role,"CUSTOMER");
 assert.equal(session.context.userId,customerId);
 const service=createCustomerOrdersService({database});
 const orders=await service.list(session.context);
 assert.equal(orders.length,2);
 assert.deepEqual(new Set(orders.map(order=>order.provider.id)),new Set([PROVIDER_A,PROVIDER_B]));
 const detail=await service.get(session.context,orderAId);
 assert.equal(detail.items.length,1);
 assert.equal(detail.customRequests[0].status,"QUOTED");
 const message=await service.addCustomMessage(session.context,requestId,{body:"Confirmo el color y la escritura indicados en la solicitud."});
 assert.equal(message.authorRole,"CUSTOMER");
 const approved=await service.approveQuote(session.context,requestId,{expectedVersion:detail.customRequests[0].version});
 assert.equal(approved.status,"APPROVED");
 assert.equal(approved.quotedPriceCents,4800);
 const cancelled=await service.cancelOrder(session.context,orderBId,{expectedVersion:orders.find(order=>order.id===orderBId).version});
 assert.equal(cancelled.status,"CANCELLED");
 await assert.rejects(()=>service.cancelOrder(session.context,orderAId,{expectedVersion:orders.find(order=>order.id===orderAId).version+1}),error=>["ORDER_VERSION_CONFLICT","ORDER_CANNOT_BE_CANCELLED"].includes(error?.code));
 const requestDetail=await service.getCustomRequest(session.context,requestId);
 assert.equal(requestDetail.request.status,"APPROVED");
 assert.equal(requestDetail.messages.some(item=>item.authorRole==="CUSTOMER"),true);
 await database.withContext(ADMIN,async tx=>{
  const events=await tx.query("SELECT event_type FROM order_events WHERE order_id=$1",[orderAId]);
  assert.equal(events.rows.some(row=>row.event_type==="CUSTOM_REQUEST_STATUS_APPROVED"),true);
  const sessions=await tx.query("SELECT token_hash,user_agent_hash FROM customer_sessions WHERE id=$1",[consumed.session.id]);
  assert.equal(sessions.rows[0].token_hash.length,64);
  assert.notEqual(sessions.rows[0].token_hash,consumed.sessionToken);
  assert.equal(sessions.rows[0].user_agent_hash.length,64);
 });
 assert.equal(await auth.revoke(consumed.sessionToken),true);
 assert.equal(await auth.authenticate(consumed.sessionToken),null);
});
