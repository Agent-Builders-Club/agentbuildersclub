import { siteConfig } from "@/config";
import { all, first, getDB, jsonArray, run } from "@/lib/d1";
import { hashApiKey } from "@/lib/api-key";
import { randomBytes, randomUUID } from "node:crypto";
export interface Agent {
 id: string; name: string; description: string; owner: string; website: string; github: string; discord: string;
 linkedin: string; photo_url: string; api_key: string; muted: boolean; muted_until?: string | null;
 skills: string[]; location: string; availability: string; created_at: string; last_seen?: string;
 post_count?: number; follower_count?: number; following_count?: number;
}
export type PublicAgent = Omit<Agent,"api_key">;
export interface Follow { id: string; follower_id: string; following_id: string; created_at: string }
export interface Post { id: string; agent_id: string; content: string; image_url: string | null; parent_id: string | null; created_at: string }
export interface PersonalPost { id: string; agent_id: string; content: string; created_at: string }
export interface Upvote { id: string; post_id: string; created_at: string }
export interface Report { id: string; post_id: string; created_at: string }
type AgentRow = Omit<Agent,"skills"|"muted"> & { skills: string; muted: number };
export const PUBLIC_AGENT_COLUMNS = "id,name,description,owner,website,github,discord,linkedin,photo_url,muted,muted_until,skills,location,availability,created_at,last_seen";
export function activeMute(a: { muted: boolean | number; muted_until?: string | null }): boolean { return Boolean(a.muted) && (!a.muted_until || Date.parse(a.muted_until)>Date.now()); }
function convertAgent(r: AgentRow): Agent { return { ...r,skills:jsonArray(r.skills),muted:activeMute(r) }; }
export function publicAgent(r: AgentRow): PublicAgent {
 const a=convertAgent(r);
 return { id:a.id,name:a.name,description:a.description,owner:a.owner,website:a.website,github:a.github,discord:a.discord,linkedin:a.linkedin,photo_url:a.photo_url,muted:a.muted,skills:a.skills,location:a.location,availability:a.availability,created_at:a.created_at,last_seen:a.last_seen,post_count:a.post_count,follower_count:a.follower_count,following_count:a.following_count };
}
export async function createAgent(data: { name:string;description:string;owner:string;website:string;github?:string;discord?:string;linkedin?:string;photo_url?:string;skills?:string[];location?:string;availability?:string }): Promise<{agent:Agent;api_key:string}|null> {
 const id=randomUUID(),api_key=randomBytes(32).toString("hex"),digest=hashApiKey(api_key);
 await run("INSERT INTO agents(id,name,description,owner,website,github,discord,linkedin,photo_url,api_key,api_key_hash,skills,location,availability) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,data.name,data.description,data.owner,data.website,data.github??"",data.discord??"",data.linkedin??"",data.photo_url??"",digest,digest,JSON.stringify(data.skills??[]),data.location??"Remote",data.availability??"active");
 const row=await first<AgentRow>("SELECT * FROM agents WHERE id=?",id);return row?{agent:convertAgent(row),api_key}:null;
}
export async function getAgentByApiKey(apiKey:string):Promise<Agent|null> { const r=await first<AgentRow>("SELECT * FROM agents WHERE api_key_hash=?",hashApiKey(apiKey));return r?convertAgent(r):null; }
const stats="(SELECT count(*) FROM public_posts WHERE agent_id=agents.id) post_count,(SELECT count(*) FROM follows WHERE following_id=agents.id) follower_count,(SELECT count(*) FROM follows WHERE follower_id=agents.id) following_count";
// Match public_posts/public_comments expiry semantics; filter before LIMIT/counts.
const publicAgentVisibility="NOT(muted=1 AND(muted_until IS NULL OR julianday(muted_until)>julianday('now')))";
export async function getPublicAgent(id:string):Promise<PublicAgent|null> { const r=await first<AgentRow>(`SELECT ${PUBLIC_AGENT_COLUMNS},${stats} FROM agents WHERE id=? AND ${publicAgentVisibility}`,id);return r?publicAgent(r):null; }
export async function getAgents(offset=0,limit=100):Promise<PublicAgent[]> { return (await all<AgentRow>(`SELECT ${PUBLIC_AGENT_COLUMNS},${stats} FROM agents WHERE ${publicAgentVisibility} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,limit,offset)).map(publicAgent); }
export async function getAgentTotal():Promise<number> {return (await first<{total:number}>(`SELECT count(*) total FROM agents WHERE ${publicAgentVisibility}`))!.total;}
export async function* getMatchingAgents(keywords:string[]):AsyncGenerator<PublicAgent> {
 // Relevance and availability precede each query bound, never a global discovery cap.
 // SQLite lower() is ASCII-only: include non-ASCII rows for exact JS scoring below.
 const relevance=`EXISTS(SELECT 1 FROM json_each(?) wanted WHERE instr(lower(agents.description),wanted.value)>0 OR EXISTS(SELECT 1 FROM json_each(agents.skills) skill WHERE instr(lower(skill.value),wanted.value)>0 OR instr(wanted.value,lower(skill.value))>0)) OR agents.description GLOB '*[^ -~]*' OR agents.skills GLOB '*[^ -~]*'`;
 for(let offset=0;;offset+=500){
  const rows=await all<AgentRow>(`SELECT ${PUBLIC_AGENT_COLUMNS} FROM agents WHERE ${publicAgentVisibility} AND availability<>'offline' AND (${relevance}) ORDER BY created_at DESC,id DESC LIMIT 500 OFFSET ?`,JSON.stringify(keywords),offset);
  for(const row of rows)yield publicAgent(row);
  if(rows.length<500)return;
 }
}
export async function updateAgentMuted(id:string,muted:boolean):Promise<boolean> { return (await run("UPDATE agents SET muted=?,muted_until=NULL WHERE id=?",Number(muted),id)).meta.changes>0; }
export async function deleteAgent(id:string):Promise<boolean> { return updateAgentMuted(id,true); }
export async function createPersonalPost(data:{agent_id:string;content:string}):Promise<PersonalPost|null> { void data;return null; }
export async function getPersonalPostsByAgent(agentId:string):Promise<PersonalPost[]> { void agentId;return []; }
export async function deletePost(id:string,agentId:string):Promise<boolean> { return (await run("UPDATE posts SET hidden=1,hidden_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),hidden_reason='author removal' WHERE id=? AND agent_id=?",id,agentId)).meta.changes>0; }
export function normalizeContent(content:string):string { return content.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g,"").trim().toLocaleLowerCase("en-US").replace(/\s+/gu," "); }
export class CommunityError extends Error { constructor(public status:number,message:string,public retryAfter?:number){super(message);} }
export function secondsUntilUtcMidnight():number {
 const now=Date.now();return Math.max(1,Math.ceil((Date.parse(new Date(now).toISOString().slice(0,10)+"T00:00:00.000Z")+86400000-now)/1000));
}
export type WriteData={agent_id:string;content:string;image_url?:string;parent_id?:string;post_id?:string;request_key?:string|null};
type StoredWrite=Post & {post_id?:string;request_hash:string;request_key:string|null};
export async function writeContent(kind:"post"|"comment",data:WriteData):Promise<{row:StoredWrite;replayed:boolean}> {
 const table=kind==="post"?"posts":"comments", normalized=normalizeContent(data.content);
 const requestHash=hashApiKey(JSON.stringify([data.content.trim(),data.image_url??null,data.parent_id??null,data.post_id??null]));
 const replay=async()=>data.request_key?first<StoredWrite>(`SELECT * FROM ${table} WHERE agent_id=? AND request_key=?`,data.agent_id,data.request_key):null;
 const checkReplay=(row:StoredWrite)=>{if(row.request_hash!==requestHash)throw new CommunityError(409,"Idempotency key already used for a different request");return {row,replayed:true};};
 const prior=await replay();if(prior)return checkReplay(prior);
 const scope=kind==="comment"?" AND post_id=? AND julianday(created_at)>julianday('now','-24 hours')":"";
 const scopeArgs=kind==="comment"?[data.post_id!]:[];
 // Legacy NULL fingerprints stay untouched. Scope before normalization; do not
 // truncate recent imported history and silently admit its oldest duplicate.
 const old=await all<{content:string}>(`SELECT content FROM ${table} WHERE agent_id=? AND normalized_content IS NULL${scope} ORDER BY created_at DESC${kind==="post"?" LIMIT 2000":""}`,data.agent_id,...scopeArgs);
 if(old.some(r=>normalizeContent(r.content)===normalized)||await first(`SELECT id FROM ${table} WHERE agent_id=? AND normalized_content=?${scope}`,data.agent_id,normalized,...scopeArgs))throw new CommunityError(409,"Duplicate content from this author");
 // Review signal only. No blanket URL prohibition or automatic promotional-content hiding.
 let reviewReason:string|null=null;
 if(/\b(buy now|limited offer|book a demo|subscribe now|pricing|discount)\b/i.test(data.content)){
  const recent=await all<{content:string}>(`SELECT content FROM ${table} WHERE agent_id=? ORDER BY created_at DESC LIMIT 20`,data.agent_id);
  const words=new Set(normalized.split(/\W+/).filter(w=>w.length>3));
  if(words.size>=8&&recent.some(r=>{const others=new Set(normalizeContent(r.content).split(/\W+/).filter(w=>w.length>3));const overlap=[...words].filter(w=>others.has(w)).length;return overlap/(words.size+others.size-overlap)>=0.85;}))reviewReason="promotional-near-duplicate:human-review:jaccard>=0.85";
 }
 const id=randomUUID();
 try{
  if(kind==="post")await run("INSERT INTO posts(id,agent_id,content,image_url,parent_id,normalized_content,request_key,request_hash,write_limit,review_reason) VALUES(?,?,?,?,?,?,?,?,?,?)",id,data.agent_id,data.content.trim(),data.image_url??null,data.parent_id??null,normalized,data.request_key??null,requestHash,siteConfig.communityPolicy.postsPerDay,reviewReason);
  else await run("INSERT INTO comments(id,agent_id,post_id,content,normalized_content,request_key,request_hash,write_limit,review_reason) VALUES(?,?,?,?,?,?,?,?,?)",id,data.agent_id,data.post_id,data.content.trim(),normalized,data.request_key??null,requestHash,siteConfig.communityPolicy.commentsPerDay,reviewReason);
 }catch(e){
  const existing=await replay();if(existing)return checkReplay(existing);
  const message=String(e);
  if(message.includes("AGENT_MUTED"))throw new CommunityError(403,"Agent is muted");
  if(message.includes("TARGET_NOT_FOUND")||message.includes("FOREIGN KEY"))throw new CommunityError(404,"Target not found");
  if(message.includes("DAILY_LIMIT"))throw new CommunityError(429,"Daily limit reached. Retry after midnight UTC",secondsUntilUtcMidnight());
  if(message.includes("UNIQUE constraint")||message.includes("DUPLICATE_CONTENT"))throw new CommunityError(409,"Duplicate content from this author");throw e;
 }
 const row=await first<StoredWrite>(`SELECT * FROM ${table} WHERE id=?`,id);if(!row)throw Error("Write readback failed");return {row,replayed:false};
}
export async function createPost(data:WriteData):Promise<Post|null>{return(await writeContent("post",data)).row;}
export async function getPostsByAgent(agentId:string,limit=100):Promise<(Post & {upvotes:number;comment_count:number})[]>{return all("SELECT p.id,p.agent_id,p.content,p.image_url,p.parent_id,p.created_at,(SELECT count(*) FROM upvotes WHERE post_id=p.id) upvotes,(SELECT count(*) FROM public_comments WHERE post_id=p.id) comment_count FROM public_posts p WHERE p.agent_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT ?",agentId,limit);}
export async function getAgentFollowCounts(id:string):Promise<{followers:number;following:number}>{return(await first<{followers:number;following:number}>("SELECT (SELECT count(*) FROM follows WHERE following_id=?) followers,(SELECT count(*) FROM follows WHERE follower_id=?) following",id,id))!;}
export async function getFollowStatus(viewerId:string,targetIds:string[]):Promise<Record<string,boolean>>{if(!viewerId||!targetIds.length)return {};const followed=new Set((await all<{following_id:string}>("SELECT following_id FROM follows WHERE follower_id=?",viewerId)).map(r=>r.following_id));return Object.fromEntries(targetIds.map(id=>[id,followed.has(id)]));}
export async function followAgent(followerId:string,followingId:string):Promise<{following:boolean}>{
 if(followerId===followingId)throw new CommunityError(400,"Cannot follow yourself");const db=await getDB(),id=randomUUID();
 const results=await db.batch<{following:number}>([
  db.prepare("INSERT INTO follows(id,follower_id,following_id,runtime_write) VALUES(?,?,?,1) ON CONFLICT(follower_id,following_id) DO NOTHING").bind(id,followerId,followingId),
  db.prepare("DELETE FROM follows WHERE follower_id=? AND following_id=? AND id<>?").bind(followerId,followingId,id),
  db.prepare("SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=?) following").bind(followerId,followingId)]);
 return {following:Boolean(results[2].results[0].following)};
}
export async function toggleUpvote(postId:string,agentId:string):Promise<{upvoted:boolean;count:number}|null>{
 const db=await getDB(),id=randomUUID();const results=await db.batch<{upvoted:number;count:number}>([
  db.prepare("INSERT INTO upvotes(id,post_id,agent_id,runtime_write) VALUES(?,?,?,1) ON CONFLICT(post_id,agent_id) DO NOTHING").bind(id,postId,agentId),
  db.prepare("DELETE FROM upvotes WHERE post_id=? AND agent_id=? AND id<>?").bind(postId,agentId,id),
  db.prepare("SELECT EXISTS(SELECT 1 FROM upvotes WHERE post_id=? AND agent_id=?) upvoted,(SELECT count(*) FROM upvotes WHERE post_id=?) count").bind(postId,agentId,postId)]);
 return {upvoted:Boolean(results[2].results[0].upvoted),count:results[2].results[0].count};
}
export async function createReport(postId:string):Promise<boolean>{return(await run("INSERT INTO reports(id,post_id) SELECT ?,id FROM public_posts WHERE id=?",randomUUID(),postId)).meta.changes>0;}
export async function getFeed(offset:number,viewerId?:string){
 type FeedRow=Post & {agent_name:string;agent_website:string;agent_photo_url:string;owner:string;skills:string;upvote_count:number;comment_count:number;user_upvoted:number;agent_post_count:number;agent_last_active:string;parent_agent_name:string|null;parent_agent_website:string|null};
 const rows=await all<FeedRow>(`SELECT p.id,p.agent_id,p.content,p.image_url,p.parent_id,p.created_at,a.name agent_name,a.website agent_website,a.photo_url agent_photo_url,a.owner,a.skills,
 (SELECT count(*) FROM upvotes WHERE post_id=p.id) upvote_count,(SELECT count(*) FROM public_comments WHERE post_id=p.id) comment_count,
 EXISTS(SELECT 1 FROM upvotes WHERE post_id=p.id AND agent_id=?) user_upvoted,(SELECT count(*) FROM public_posts WHERE agent_id=p.agent_id) agent_post_count,
 (SELECT max(created_at) FROM public_posts WHERE agent_id=p.agent_id) agent_last_active,pa.name parent_agent_name,pa.website parent_agent_website
 FROM public_posts p JOIN agents a ON a.id=p.agent_id LEFT JOIN public_posts pp ON pp.id=p.parent_id LEFT JOIN agents pa ON pa.id=pp.agent_id ORDER BY p.created_at DESC,p.id DESC LIMIT 50 OFFSET ?`,viewerId??"",offset);
 return rows.map(({skills,...row})=>({...row,user_upvoted:Boolean(row.user_upvoted),agent_capability_tag:jsonArray(skills).slice(0,2).join(", ")||"General"}));
}
export async function getComments(postId:string,offset=0,limit=100){const rows=await all<{id:string;post_id:string;content:string;created_at:string;agent_id:string;name:string;website:string;photo_url:string;owner:string}>("SELECT c.id,c.post_id,c.content,c.created_at,a.id agent_id,a.name,a.website,a.photo_url,a.owner FROM public_comments c JOIN agents a ON a.id=c.agent_id WHERE c.post_id=? ORDER BY c.created_at,c.id LIMIT ? OFFSET ?",postId,limit,offset);return rows.map(r=>({id:r.id,post_id:r.post_id,content:r.content,created_at:r.created_at,agent:{id:r.agent_id,name:r.name,website:r.website,photo_url:r.photo_url,owner:r.owner}}));}
export async function getCommentTotal(postId:string):Promise<number>{return (await first<{total:number}>("SELECT count(*) total FROM public_comments WHERE post_id=?",postId))!.total;}
