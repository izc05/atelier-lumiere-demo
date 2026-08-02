import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createPublicBlogService } from "../src/public-blog-service.mjs";

const connectionString=process.env.DATABASE_URL;
const ADMIN={role:"ADMIN",userId:"00000000-0000-4000-8000-000000000001",providerId:null};
const PROVIDER_ID="00000000-0000-4000-8000-000000000201";
const USER_ID="00000000-0000-4000-8000-000000000101";
const PREVIEW=Buffer.from("RIFF1234WEBPpublic-blog-preview","ascii");

test("el blog público muestra solo historias publicadas y previews seguras",{skip:!connectionString},async t=>{
 const database=createDatabase({connectionString,maxConnections:5,statementTimeoutMs:5000,logger:{error(){}}});
 t.after(()=>database.close());
 const suffix=randomUUID().slice(0,8);const publishedId=randomUUID();const draftId=randomUUID();const coverId=randomUUID();
 await database.withContext(ADMIN,async tx=>{
  await tx.query(`INSERT INTO blog_posts(id,provider_id,slug,title,excerpt,body_markdown,category,status,created_by,updated_by,submitted_at,approved_by,approved_at,published_by,published_at)
   VALUES($1,$2,$3,$4,$5,$6,'Procesos artesanales','PUBLISHED',$7,$7,now(),$8,now(),$8,now())`,[
   publishedId,PROVIDER_ID,`historia-publica-${suffix}`,`Historia pública ${suffix}`,
   "Una historia completa sobre el trabajo manual y el origen de una pieza artesanal.",
   "## El proceso\n\nCada material se selecciona y trabaja lentamente en el taller hasta conseguir una pieza única.",USER_ID,ADMIN.userId]);
  await tx.query(`INSERT INTO blog_posts(id,provider_id,slug,title,excerpt,body_markdown,category,status,created_by,updated_by)
   VALUES($1,$2,$3,$4,'Borrador privado','Contenido privado que nunca debe aparecer en la lectura pública.','Procesos artesanales','DRAFT',$5,$5)`,[
   draftId,PROVIDER_ID,`borrador-${suffix}`,`Borrador ${suffix}`,USER_ID]);
  await tx.query(`INSERT INTO blog_post_media(id,provider_id,post_id,placement,mime_type,original_filename,storage_key,size_bytes,checksum_sha256,status,alt_text,preview_storage_key,preview_mime_type,preview_size_bytes,preview_checksum_sha256,preview_width,preview_height,uploaded_by,ready_at)
   VALUES($1,$2,$3,'COVER','image/png','portada.png',$4,68,repeat('a',64),'READY','Portada artesanal',$5,'image/webp',$6,repeat('b',64),1200,750,$7,now())`,[
   coverId,PROVIDER_ID,publishedId,`private/${publishedId}/original.png`,`private/${publishedId}/preview.webp`,PREVIEW.length,USER_ID]);
  await tx.query(`INSERT INTO blog_post_tags(provider_id,post_id,tag_slug) VALUES($1,$2,'hecho-a-mano')`,[PROVIDER_ID,publishedId]);
 });
 const storage={async openPreview(key,range){assert.match(key,/preview\.webp$/);return{stream:Readable.from(PREVIEW),statusCode:range?206:200,sizeBytes:PREVIEW.length,start:0,end:PREVIEW.length-1}}};
 const service=createPublicBlogService({database,storage});
 const list=await service.list({query:suffix});
 assert.equal(list.length,1);assert.equal(list[0].id,publishedId);assert.equal(list[0].provider.displayName,"Taller de prueba A");
 assert.equal(JSON.stringify(list).includes("propietaria-a@"),false);assert.equal(JSON.stringify(list).includes("storage"),false);
 const detail=await service.get("taller-prueba-a",`historia-publica-${suffix}`);
 assert.equal(detail.id,publishedId);assert.equal(detail.tags[0],"hecho-a-mano");assert.equal(JSON.stringify(detail).includes("review"),false);
 await assert.rejects(()=>service.get("taller-prueba-a",`borrador-${suffix}`),error=>error.code==="BLOG_POST_NOT_FOUND");
 const opened=await service.openPreview(publishedId,coverId,"bytes=0-7");assert.equal(opened.statusCode,206);assert.equal(opened.mimeType,"image/webp");
 await database.withContext(ADMIN,tx=>tx.query("UPDATE providers SET status='SUSPENDED' WHERE id=$1",[PROVIDER_ID]));
 assert.equal((await service.list({query:suffix})).length,0);
 await database.withContext(ADMIN,tx=>tx.query("UPDATE providers SET status='ACTIVE' WHERE id=$1",[PROVIDER_ID]));
});
