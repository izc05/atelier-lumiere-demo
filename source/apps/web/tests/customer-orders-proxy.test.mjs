import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createCustomerOrdersWebHandler } from "../src/customer-orders-proxy.mjs";

const ACCESS="customer_access_token_1234567890abcdef1234567890abcdef";
const SESSION="customer_session_token_1234567890abcdef1234567890abcdef";
const REQUEST_ID="53000000-0000-4000-8000-000000000001";
async function read(stream){if(!stream)return"";const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks).toString("utf8")}
async function start(handler){const server=createServer(handler);server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();return{baseUrl:`http://127.0.0.1:${address.port}`,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}}

test("el proxy convierte el enlace en cookie HttpOnly y no filtra la sesión",async t=>{
 const calls=[];
 const fetchImpl=async(target,options={})=>{const url=new URL(target);const body=await read(options.body);const authorization=options.headers?.get?.("Authorization")??options.headers?.Authorization;calls.push({path:url.pathname,method:options.method??"GET",body,authorization});
  if(url.pathname==="/api/customer/access/consume")return new Response(JSON.stringify({checkoutId:"50000000-0000-4000-8000-000000000001",user:{id:"00000000-0000-4000-8000-000000000003",displayName:"Cliente",email:"cliente@example.test"},session:{id:"60000000-0000-4000-8000-000000000001",expiresAt:new Date(Date.now()+3600000).toISOString()},sessionToken:SESSION}),{status:200,headers:{"Content-Type":"application/json"}});
  if(url.pathname==="/api/customer/session")return new Response(JSON.stringify({user:{displayName:"Cliente"},session:{expiresAt:new Date(Date.now()+3600000).toISOString()}}),{status:200,headers:{"Content-Type":"application/json"}});
  if(url.pathname===`/api/customer/custom-requests/${REQUEST_ID}/approve`)return new Response(JSON.stringify({request:{id:REQUEST_ID,status:"APPROVED"}}),{status:200,headers:{"Content-Type":"application/json"}});
  return new Response(JSON.stringify({orders:[]}),{status:200,headers:{"Content-Type":"application/json"}});
 };
 const handler=createCustomerOrdersWebHandler({baseHandler:(_req,res)=>{res.writeHead(200,{"Content-Type":"text/plain"});res.end("PRIVATE")},apiInternalUrl:"http://api.internal:4000",fetchImpl,logger:{error(){}}});
 const server=await start(handler);t.after(server.close);
 const anonymous=await fetch(`${server.baseUrl}/mis-pedidos/`,{redirect:"manual"});assert.equal(anonymous.status,302);assert.equal(anonymous.headers.get("location"),"/pedido/acceso/");
 const activation=await fetch(`${server.baseUrl}/internal/customer/access`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:ACCESS})});assert.equal(activation.status,200);const payload=await activation.json();assert.equal(JSON.stringify(payload).includes(SESSION),false);const setCookie=activation.headers.get("set-cookie");assert.match(setCookie,/atelier_customer_session=/);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);assert.equal(calls[0].body,JSON.stringify({token:ACCESS}));
 const privatePage=await fetch(`${server.baseUrl}/mis-pedidos/`,{headers:{Cookie:`atelier_customer_session=${SESSION}`}});assert.equal(privatePage.status,200);assert.equal(await privatePage.text(),"PRIVATE");assert.equal(calls.at(-1).authorization,`Bearer ${SESSION}`);
 const approveBody=JSON.stringify({expectedVersion:2});const approve=await fetch(`${server.baseUrl}/internal/customer/custom-requests/${REQUEST_ID}/approve`,{method:"POST",headers:{Cookie:`atelier_customer_session=${SESSION}`,"Content-Type":"application/json"},body:approveBody});assert.equal(approve.status,200);assert.equal(calls.at(-1).body,approveBody);assert.equal(calls.at(-1).authorization,`Bearer ${SESSION}`);assert.equal((await approve.text()).includes(SESSION),false);
 const logout=await fetch(`${server.baseUrl}/internal/customer/session`,{method:"DELETE",headers:{Cookie:`atelier_customer_session=${SESSION}`}});assert.equal(logout.status,200);assert.match(logout.headers.get("set-cookie"),/Max-Age=0/);assert.match(logout.headers.get("set-cookie"),/HttpOnly/);
});
