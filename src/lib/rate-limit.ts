import { first } from "@/lib/d1";
import { hashApiKey } from "@/lib/api-key";
import { siteConfig } from "@/config";
export type RateLimitAction = "register" | "post" | "comment" | "upvote" | "follow" | "report" | "skill" | "contact" | "rsvp";
const LIMITS: Record<RateLimitAction,[number,number]> = {
 register:[3600,1],post:[86400,siteConfig.communityPolicy.postsPerDay],comment:[86400,siteConfig.communityPolicy.commentsPerDay],upvote:[60,20],follow:[60,20],report:[3600,10],skill:[86400,3],contact:[3600,3],rsvp:[3600,10]
};
// Content creation uses insert-time triggers instead; this helper is for other actions.
export async function checkRateLimit(keyType:"ip"|"api_key"|"agent_id",keyValue:string,action:RateLimitAction):Promise<{allowed:boolean;retryAfter?:number}> {
 const [seconds,max]=LIMITS[action], now=new Date().toISOString(),reset=new Date(Date.now()+seconds*1000).toISOString();
 const row=await first<{count:number;reset_at:string}>(`INSERT INTO rate_limit_buckets(key_hash,action,count,reset_at) VALUES(?,?,1,?) ON CONFLICT(key_hash,action) DO UPDATE SET count=CASE WHEN julianday(rate_limit_buckets.reset_at)<=julianday(?) THEN 1 ELSE min(rate_limit_buckets.count+1,?) END,reset_at=CASE WHEN julianday(rate_limit_buckets.reset_at)<=julianday(?) THEN excluded.reset_at ELSE rate_limit_buckets.reset_at END RETURNING count,reset_at`,hashApiKey(`${keyType}:${keyValue}`),action,reset,now,max+1,now);
 if(!row)throw Error("Rate limit unavailable");return {allowed:row.count<=max,retryAfter:Math.max(1,Math.ceil((Date.parse(row.reset_at)-Date.now())/1000))};
}
export function getClientIP(req:Request):string { return req.headers.get("cf-connecting-ip")?.trim() || "unknown"; }
