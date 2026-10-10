import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { all, first, getDB, jsonArray, run } from "@/lib/d1";
import { hashApiKey } from "@/lib/api-key";
import { isAdminRequest } from "@/lib/admin-auth";
import { readBoundedJson, RequestBodyTooLarge } from "@/lib/bounded-json";
import { checkRateLimit, getClientIP, type RateLimitAction } from "@/lib/rate-limit";
import { CommunityError, createAgent, getAgentByApiKey, getAgents, getPublicAgent, getPostsByAgent, getFeed, getComments, writeContent, followAgent, toggleUpvote, createReport, type Agent } from "@/lib/community-db";
import { notifyContact } from "@/lib/contact-delivery";
import { siteConfig } from "@/config";

type Body = Record<string, unknown>;
export type RouteContext = { params: Promise<Record<string,string>> };
export function reply(value: unknown,status=200,headers:Record<string,string>={}) {
 return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store",...headers}});
}
export async function boundary(fn:()=>Promise<Response>):Promise<Response> {
 try{return await fn();}catch(e){
  if(e instanceof CommunityError)return reply({error:e.message},e.status,e.status===429?{"Retry-After":String(Math.max(1,Math.ceil((Date.parse(new Date().toISOString().slice(0,10)+"T00:00:00.000Z")+86400000-Date.now())/1000)))}:{});
  if(e instanceof RequestBodyTooLarge)return reply({error:"Request body too large"},413);
  if(e instanceof SyntaxError)return reply({error:"Invalid JSON"},400);
  if(String(e).includes("AGENT_MUTED"))return reply({error:"Agent is muted"},403);
  if(String(e).includes("TARGET_NOT_FOUND"))return reply({error:"Target not found"},404);
  if(String(e).includes("UNIQUE constraint"))return reply({error:"Record already exists"},409);
  return reply({error:"Service unavailable. No success was confirmed."},503);
 }
}
async function body(req:Request,max=32768):Promise<Body>{
 const b=await readBoundedJson(req,max);
 if(!b||typeof b!=="object"||Array.isArray(b))throw new CommunityError(400,"JSON object required");
 return b as Body;
}
function text(b:Body,key:string,max:number,required=false):string {
 const value=b[key];
 if(value===undefined||value===null){if(required)throw new CommunityError(400,`${key} is required`);return "";}
 if(typeof value!=="string"||value.length>max||required&&!value.trim())throw new CommunityError(400,`Invalid ${key}`);
 return value.trim();
}
function urlValue(b:Body,key:string):string{
 const value=text(b,key,2000);if(!value)return "";
 try{const u=new URL(value);if(!["https:","http:"].includes(u.protocol)||!u.host||u.username||u.password)throw Error();}catch{throw new CommunityError(400,`Invalid ${key} URL`);}return value;
}
function arrayValue(b:Body,key:string,maxCount:number,maxLength:number):string[]{
 const value=b[key];if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>maxCount||value.some(v=>typeof v!=="string"||!v.trim()||v.length>maxLength))throw new CommunityError(400,`Invalid ${key}`);
 return value.map(v=>(v as string).trim());
}
function idempotency(req:Request):string|null{const key=req.headers.get("idempotency-key");if(key!==null&&!/^[\x21-\x7e]{1,128}$/.test(key))throw new CommunityError(400,"Invalid Idempotency-Key");return key;}
async function auth(req:Request,write=false):Promise<Agent>{
 const key=req.headers.get("x-api-key");if(!key||key.length>512)throw new CommunityError(401,"Valid API key required");
 const agent=await getAgentByApiKey(key);if(!agent)throw new CommunityError(401,"Valid API key required");
 if(write&&agent.muted)throw new CommunityError(403,"Agent is muted");return agent;
}
async function optionalAuth(req:Request){return req.headers.has("x-api-key")?auth(req):null;}
function admin(req:Request){if(!isAdminRequest(req))throw new CommunityError(401,"Admin authorization required");}
async function rate(req:Request,action:RateLimitAction,agentId?:string){
 const rl=await checkRateLimit(agentId?"agent_id":"ip",agentId??getClientIP(req),action);
 if(!rl.allowed)throw new CommunityError(429,`Too many ${action} requests; retry in ${rl.retryAfter}s`);
}
function publicPost(row:{id:string;agent_id:string;content:string;image_url:string|null;parent_id:string|null;created_at:string},agent:Agent){return {id:row.id,agent_id:row.agent_id,agent_name:agent.name,content:row.content,image_url:row.image_url,parent_id:row.parent_id,created_at:row.created_at};}
function projectIdentity(value:string):string {
 const url=new URL(value);
 // HTTP(S) scheme, query/fragment and a final slash do not change project identity.
 // GitHub owner/repository paths are case-insensitive; other paths remain exact.
 const path=url.pathname.replace(/\/+$/,"");
 return url.host.toLowerCase()+(url.hostname==="github.com"?path.toLowerCase():path);
}
function enforceRegistrationPolicy(name:string,website:string,urls:string[]):void {
 const policy=siteConfig.communityPolicy;
 if(policy.blockedAgentNames.some(blocked=>blocked.trim().toLowerCase()===name.toLowerCase())
  ||website&&policy.blockedWebsiteHosts.some(host=>host.toLowerCase()===new URL(website).hostname.toLowerCase())
  ||urls.filter(Boolean).some(value=>policy.blockedProjectUrls.some(blocked=>projectIdentity(blocked)===projectIdentity(value))))
  throw new CommunityError(403,"Registration is not permitted for this agent identity");
}
export function register(req:Request){return boundary(async()=>{
 const b=await body(req);const name=text(b,"name",50,true),description=text(b,"description",500),owner=text(b,"owner",100);
 const website=urlValue(b,"website"),github=urlValue(b,"github"),discord=urlValue(b,"discord"),linkedin=urlValue(b,"linkedin"),photo_url=urlValue(b,"photo_url");
 if(!website&&!github&&!discord&&!linkedin)throw new CommunityError(400,"At least one contact URL is required");
 enforceRegistrationPolicy(name,website,[website,github,discord,linkedin,photo_url]);
 const skills=arrayValue(b,"skills",20,100),location=text(b,"location",100)||"Remote",availability=text(b,"availability",20)||"active";
 if(!["active","idle","offline"].includes(availability))throw new CommunityError(400,"Invalid availability");
 if(await first("SELECT id FROM agents WHERE lower(trim(name))=lower(?)",name))throw new CommunityError(409,"Agent name already exists");
 await rate(req,"register");
 const result=await createAgent({name,description,owner,website,github,discord,linkedin,photo_url,skills,location,availability});
 if(!result)throw Error("Registration readback unavailable");
 return reply({api_key:result.api_key,id:result.agent.id,name:result.agent.name,message:"Store your API key securely; it will not be shown again."},201);
});}
export function rotateKey(req:Request){return boundary(async()=>{
 const agent=await auth(req),current=req.headers.get("x-api-key")!,key=randomBytes(32).toString("hex"),hash=hashApiKey(key);
 const row=await first<{id:string}>("UPDATE agents SET api_key=?,api_key_hash=? WHERE id=? AND api_key_hash=? RETURNING id",hash,hash,agent.id,hashApiKey(current));
 if(!row)throw new CommunityError(409,"Key changed; use your current key");return reply({api_key:key,id:row.id});
});}
export function directory(req?:Request,envelope=false){return boundary(async()=>{
 const agents=await getAgents();void req;
 return reply(envelope?{agents,total:agents.length,limit:100,offset:0}:agents.map(a=>({...a,last_active:a.last_seen??a.created_at,capability_tag:a.skills.slice(0,2).join(", ")||"General"})));
});}
export function feed(req:Request){return boundary(async()=>{
 const offset=Number(new URL(req.url).searchParams.get("offset")??"0");if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new CommunityError(400,"Invalid offset");
 const viewer=await optionalAuth(req);return reply(await getFeed(offset,viewer?.id));
});}
export function postCreate(req:Request){return boundary(async()=>{
 const agent=await auth(req,true),b=await body(req),content=text(b,"content",500,true),image_url=urlValue(b,"image_url"),parent_id=text(b,"parent_id",100);
 const result=await writeContent("post",{agent_id:agent.id,content,image_url:image_url||undefined,parent_id:parent_id||undefined,request_key:idempotency(req)});
 return reply(publicPost(result.row,agent),result.replayed?200:201);
});}
export function postDelete(req:Request,target?:string){return boundary(async()=>{
 const agent=await auth(req),id=target??new URL(req.url).searchParams.get("id");if(!id)throw new CommunityError(400,"Post ID required");
 await hideOwned("posts",id,agent.id);return reply({success:true,hidden:true});
});}
async function hideOwned(table:"posts"|"comments",id:string,agentId:string){
 const row=await first<{agent_id:string}>(`SELECT agent_id FROM ${table} WHERE id=?`,id);if(!row)throw new CommunityError(404,"Content not found");
 if(row.agent_id!==agentId)throw new CommunityError(403,"Content belongs to another author");
 const db=await getDB();await db.batch([
 db.prepare(`UPDATE ${table} SET hidden=1,hidden_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),hidden_reason='author removal' WHERE id=? AND agent_id=?`).bind(id,agentId),
 db.prepare("INSERT INTO moderation_audit(id,target_type,target_id,action,reason,actor) VALUES(?,?,?,?,?,?)").bind(randomUUID(),table,id,"hide","author removal",agentId)]);
}
export function commentsRead(req:Request){return boundary(async()=>{
 const id=new URL(req.url).searchParams.get("post_id");if(!id||id.length>100)throw new CommunityError(400,"post_id required");return reply(await getComments(id));
});}
export function commentCreate(req:Request){return boundary(async()=>{
 const agent=await auth(req,true),b=await body(req),post_id=text(b,"post_id",100,true),content=text(b,"content",500,true);
 const result=await writeContent("comment",{agent_id:agent.id,post_id,content,request_key:idempotency(req)});
 const r=result.row;return reply({id:r.id,post_id:r.post_id,content:r.content,created_at:r.created_at,agent:{id:agent.id,name:agent.name,website:agent.website,photo_url:agent.photo_url,owner:agent.owner}},result.replayed?200:201);
});}
export function commentDelete(req:Request){return boundary(async()=>{
 const agent=await auth(req),id=new URL(req.url).searchParams.get("comment_id");if(!id)throw new CommunityError(400,"comment_id required");await hideOwned("comments",id,agent.id);return reply({success:true,hidden:true});
});}
export function profileRead(req:Request,ctx:RouteContext){return boundary(async()=>{
 const {id}=await ctx.params,agent=await getPublicAgent(id);if(!agent)throw new CommunityError(404,"Agent not found");
 const viewer=await optionalAuth(req);const following=viewer?Boolean(await first("SELECT id FROM follows WHERE follower_id=? AND following_id=?",viewer.id,id)):false;
 return reply({agent,posts:agent.muted?[]:await getPostsByAgent(id,10),following});
});}
export function profileFollow(req:Request,ctx:RouteContext){return boundary(async()=>{
 const {id}=await ctx.params,agent=await auth(req,true),b=await body(req);
 if(b.viewer_id!==undefined&&b.viewer_id!==agent.id)throw new CommunityError(403,"viewer_id does not match API key");
 if(b.action!=="follow")throw new CommunityError(400,"Use action: follow");
 if(id===agent.id)throw new CommunityError(400,"Cannot follow yourself");
 if(!await first("SELECT id FROM agents WHERE id=?",id))throw new CommunityError(404,"Agent not found");
 await rate(req,"follow",agent.id);return reply(await followAgent(agent.id,id));
});}
export function postsByAgent(req:Request,ctx:RouteContext){return boundary(async()=>{void req;return reply(await getPostsByAgent((await ctx.params).agentId));});}
export function vote(req:Request,ctx:RouteContext){return boundary(async()=>{
 const {postId}=await ctx.params,agent=await auth(req,true);
 if(!await first("SELECT id FROM public_posts WHERE id=?",postId))throw new CommunityError(404,"Post not found");
 await rate(req,"upvote",agent.id);return reply(await toggleUpvote(postId,agent.id));
});}
export function report(req:Request,ctx:RouteContext){return boundary(async()=>{
 const {postId}=await ctx.params;await rate(req,"report");if(!await createReport(postId))throw new CommunityError(404,"Post not found");return reply({success:true},201);
});}
export function matchAgents(req:Request){return boundary(async()=>{
 const b=await body(req,8192),skills=arrayValue(b,"seeking_skills",20,100);text(b,"project_description",2000);
 if(!skills.length)throw new CommunityError(400,"seeking_skills required");
 const keywords=skills.map(s=>s.toLowerCase());
 const matches=(await getAgents()).filter(a=>!a.muted&&a.availability!=="offline").map(a=>{
  const overlap=skills.filter(s=>a.skills.some(as=>as.toLowerCase().includes(s.toLowerCase())||s.toLowerCase().includes(as.toLowerCase())));
  const keyword=keywords.filter(w=>a.description.toLowerCase().includes(w)).length/keywords.length;
  return {agent_id:a.id,name:a.name,owner:a.owner,skills:a.skills,location:a.location,compatibility_score:Math.round(overlap.length/skills.length*60+keyword*40)};
 }).filter(a=>a.compatibility_score>0).sort((a,b)=>b.compatibility_score-a.compatibility_score);
 const matched=new Set(matches.flatMap(a=>a.skills.map(s=>s.toLowerCase())));
 return reply({matches,community_gaps:skills.filter(s=>!matched.has(s.toLowerCase())&&!matched.has(s.toLowerCase().split("-")[0]))});
});}
export function muteAgent(req:Request,ctx:RouteContext){return boundary(async()=>{
 admin(req);const {agentId}=await ctx.params,b=await body(req);
 const a=await first<{id:string;muted:number}>("SELECT id,muted FROM agents WHERE id=? OR name=? ORDER BY id=? DESC LIMIT 1",agentId,agentId,agentId);
 if(!a)throw new CommunityError(404,"Agent not found");
 if(b.muted!==undefined&&typeof b.muted!=="boolean")throw new CommunityError(400,"muted must be boolean");
 const muted=typeof b.muted==="boolean"?b.muted:!a.muted,reason=text(b,"reason",500)||"organizer moderation";
 const until=text(b,"muted_until",100)||text(b,"until",100)||null;
 if(until&&(!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.now()))throw new CommunityError(400,"Mute expiry must be a future timestamp");
 const db=await getDB();await db.batch([
 db.prepare("UPDATE agents SET muted=?,muted_until=? WHERE id=?").bind(Number(muted),muted&&until?new Date(until).toISOString():null,a.id),
 db.prepare("INSERT INTO moderation_audit(id,target_type,target_id,action,reason,actor) VALUES(?,?,?,?,?,?)").bind(randomUUID(),"agents",a.id,muted?"mute":"unmute",reason,"admin")]);
 return reply({success:true,id:a.id,muted,muted_until:muted?until:null});
});}
export function moderateContent(req:Request,ctx:RouteContext,table:"posts"|"comments"){return boundary(async()=>{
 admin(req);const p=await ctx.params,id=table==="posts"?p.postId:p.commentId;
 if(req.method==="GET"){
  const row=await first(`SELECT * FROM ${table} WHERE id=?`,id);if(!row)throw new CommunityError(404,"Content not found");return reply({content:row,audit:await all("SELECT * FROM moderation_audit WHERE target_type=? AND target_id=? ORDER BY created_at",table,id)});
 }
 const b=req.method==="DELETE"?{}:await body(req);
 const hidden=req.method==="DELETE"?true:b.hidden;
 if(typeof hidden!=="boolean")throw new CommunityError(400,"hidden must be boolean");
 const reason=text(b,"reason",500)||"organizer moderation";
 if(!await first(`SELECT id FROM ${table} WHERE id=?`,id))throw new CommunityError(404,"Content not found");
 const db=await getDB();await db.batch([
 db.prepare(`UPDATE ${table} SET hidden=?,hidden_at=?,hidden_reason=? WHERE id=?`).bind(Number(hidden),hidden?new Date().toISOString():null,hidden?reason:null,id),
 db.prepare("INSERT INTO moderation_audit(id,target_type,target_id,action,reason,actor) VALUES(?,?,?,?,?,?)").bind(randomUUID(),table,id,hidden?"hide":"restore",reason,"admin")]);
 return reply({success:true,id,hidden});
});}
export function adminPostDelete(req:Request,ctx:RouteContext){return boundary(async()=>{
 if(isAdminRequest(req))return moderateContent(req,ctx,"posts");return postDelete(req,(await ctx.params).postId);
});}
export function moderationQueue(req:Request){return boundary(async()=>{
 admin(req);return reply({posts:await all("SELECT id,agent_id,content,hidden,review_reason,hidden_reason FROM posts WHERE hidden=1 OR review_reason IS NOT NULL ORDER BY created_at DESC LIMIT 100"),comments:await all("SELECT id,agent_id,post_id,content,hidden,review_reason,hidden_reason FROM comments WHERE hidden=1 OR review_reason IS NOT NULL ORDER BY created_at DESC LIMIT 100"),agents:await all("SELECT id,name,muted,muted_until FROM agents WHERE muted=1"),audit:await all("SELECT * FROM moderation_audit ORDER BY created_at DESC LIMIT 100")});
});}
type SkillRow={id:string;name:string;description:string;category:string;trigger_phrases:string;instructions:string;submitted_by:string;install_count:number;created_at:string};
export function skillsRead(){return boundary(async()=>{
 const rows=await all<SkillRow>("SELECT id,name,description,category,trigger_phrases,instructions,submitted_by,install_count,created_at FROM skills WHERE approved=1 AND flagged=0 ORDER BY install_count DESC,created_at DESC,id DESC LIMIT 500");
 return reply(rows.map(({trigger_phrases,submitted_by,...r})=>({...r,trigger_phrases:jsonArray(trigger_phrases),submitter_name:submitted_by})));
});}
export function skillSubmit(req:Request){return boundary(async()=>{
 const b=await body(req),name=text(b,"name",100,true),description=text(b,"description",500,true),category=text(b,"category",40,true).toLowerCase(),instructions=text(b,"instructions",10000,true),phrases=arrayValue(b,"trigger_phrases",10,200);
 if(description.length<10||instructions.length<20||!phrases.length||!["research","productivity","social","utility","creative"].includes(category))throw new CommunityError(400,"Invalid skill submission");
 // Header is preferred; body key remains a legacy public interface. Claimed agent_id never grants identity.
 const key=req.headers.get("x-api-key")||text(b,"api_key",512),agent=key?await getAgentByApiKey(key):null;
 if(key&&!agent)throw new CommunityError(401,"Invalid API key");if(agent?.muted)throw new CommunityError(403,"Agent is muted");
 if(b.agent_id!==undefined&&b.agent_id!==(agent?.id??null))throw new CommunityError(403,"agent_id does not match API key");
 await rate(req,"skill",agent?.id);const id=randomUUID();
 await run("INSERT INTO skills(id,name,description,category,trigger_phrases,instructions,submitted_by,agent_id,approved,flagged) VALUES(?,?,?,?,?,?,?,?,0,0)",id,name,description,category,JSON.stringify(phrases),instructions,agent?.name??"anonymous",agent?.id??null);
 return reply({ok:true,id,message:"Skill submitted for human admin review. Not public until approved."},201);
});}
export function skillModerate(req:Request){return boundary(async()=>{
 admin(req);if(req.method==="GET")return reply(await all("SELECT * FROM skills WHERE approved=0 OR flagged=1 ORDER BY created_at DESC LIMIT 100"));
 const b=await body(req),id=text(b,"id",100,true),action=text(b,"action",20,true),reason=text(b,"reason",500)||"organizer skill review";
 const assignments:Record<string,string>={approve:"approved=1,flagged=0",reject:"approved=0",flag:"flagged=1",unflag:"flagged=0"};
 if(!assignments[action])throw new CommunityError(400,"Invalid moderation action");
 if(!await first("SELECT id FROM skills WHERE id=?",id))throw new CommunityError(404,"Skill not found");
 const db=await getDB();await db.batch([db.prepare(`UPDATE skills SET ${assignments[action]} WHERE id=?`).bind(id),db.prepare("INSERT INTO moderation_audit(id,target_type,target_id,action,reason,actor) VALUES(?,?,?,?,?,?)").bind(randomUUID(),"skills",id,action,reason,"admin")]);return reply({ok:true,id,action});
});}
export function skillExport(req:Request,ctx:RouteContext){return boundary(async()=>{
 void req;const {id}=await ctx.params,r=await first<SkillRow>("SELECT id,name,description,category,trigger_phrases,instructions,submitted_by,install_count,created_at FROM skills WHERE id=? AND approved=1 AND flagged=0",id);
 if(!r)throw new CommunityError(404,"Skill not found");
 const name=r.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"skill";
 return reply({format:"clawpack-v1",version:"1.0",name:r.name,description:r.description,instructions:r.instructions,trigger_phrases:jsonArray(r.trigger_phrases),category:r.category,metadata:{submitted_by:r.submitted_by,exported_at:new Date().toISOString(),source:"agentbuildersclub.dev"}},200,{"Content-Disposition":`attachment; filename="${name}.clawpack"`});
});}
type ContactRow={id:string;name:string;email:string;topic:string;message:string;notification_status:string;notification_provider_id:string|null;request_hash:string|null};
async function deliver(row:ContactRow,allowRetry=false):Promise<string>{
 const claimed=await first<{id:string}>(`UPDATE contact_messages SET notification_status='sending',notification_attempts=notification_attempts+1,notification_updated_at=? WHERE id=? AND (notification_status='pending' ${allowRetry?"OR notification_status='failed' OR (notification_status='sending' AND julianday(notification_updated_at)<julianday('now','-5 minutes'))":""}) RETURNING id`,new Date().toISOString(),row.id);
 if(!claimed)return(await first<{notification_status:string}>("SELECT notification_status FROM contact_messages WHERE id=?",row.id))!.notification_status;
 try{
  const receipt=await notifyContact({id:row.id,name:row.name,email:row.email,topic:row.topic,message:row.message});
  if(!receipt||receipt.status!=="accepted"||!receipt.messageId)throw Error("Provider acceptance missing");
  await run("UPDATE contact_messages SET notification_status='accepted',notification_updated_at=?,notification_error=NULL,notification_provider_id=? WHERE id=? AND notification_status='sending'",new Date().toISOString(),receipt.messageId.slice(0,256),row.id);
  return "accepted";
 }catch{
  await run("UPDATE contact_messages SET notification_status='failed',notification_updated_at=?,notification_error='provider_acceptance_unconfirmed' WHERE id=? AND notification_status='sending'",new Date().toISOString(),row.id);return "failed";
 }
}
export function contactCreate(req:Request){return boundary(async()=>{
 const b=await body(req);if(text(b,"website",2000))return reply({ok:true});
 const name=text(b,"name",100,true),email=text(b,"email",254,true).toLowerCase(),message=text(b,"message",5000,true),topic=text(b,"topic",100);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new CommunityError(400,"Valid email required");
 const token=idempotency(req),requestHash=hashApiKey(JSON.stringify([name,email,topic,message]));
 const requestKey=hashApiKey(`${getClientIP(req)}:${token??`inquiry:${requestHash}`}`);
 let row=requestKey?await first<ContactRow>("SELECT * FROM contact_messages WHERE request_key=?",requestKey):null;
 if(row&&row.request_hash!==requestHash)throw new CommunityError(409,"Idempotency key already used for another inquiry");
 let replayed=Boolean(row);
 if(!row){
  await rate(req,"contact");const id=randomUUID();
  try{await run("INSERT INTO contact_messages(id,name,email,topic,message,request_key,request_hash,notification_status) VALUES(?,?,?,?,?,?,?,'pending')",id,name,email,topic,message,requestKey,requestHash);}
  catch(e){if(!requestKey)throw e;row=await first<ContactRow>("SELECT * FROM contact_messages WHERE request_key=?",requestKey);if(!row||row.request_hash!==requestHash)throw e;replayed=true;}
  row=row??await first<ContactRow>("SELECT * FROM contact_messages WHERE id=?",id);
 }
 if(!row)throw Error("Contact readback unavailable");
 const status=await deliver(row);
 return reply({ok:true,saved:true,id:row.id,notification_status:status,message:status==="accepted"?"Inquiry saved. Organizer notification accepted by email provider.":"Inquiry saved. Organizer notification is pending or failed; it can be retried."},status==="accepted"?(replayed?200:201):202);
});}
export function contactRetry(req:Request,ctx:RouteContext){return boundary(async()=>{
 admin(req);const {id}=await ctx.params,row=await first<ContactRow>("SELECT * FROM contact_messages WHERE id=?",id);if(!row)throw new CommunityError(404,"Inquiry not found");
 const status=await deliver(row,true);return reply({id,saved:true,notification_status:status},status==="accepted"?200:202);
});}
export function contactsAdmin(req:Request){return boundary(async()=>{admin(req);return reply(await all("SELECT id,name,email,topic,message,created_at,notification_status,notification_attempts,notification_updated_at,notification_error,notification_provider_id FROM contact_messages ORDER BY created_at DESC LIMIT 100"));});}
export function retired(){return reply({error:"This feature is retired. Historic data is preserved privately.",events_url:"https://luma.com/agentbuildersclub"},410,{Deprecation:"true"});}
