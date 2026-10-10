import { cache } from "react";
import { getPublicAgent,getPostsByAgent,type PublicAgent,type Post } from "@/lib/community-db";
export type Profile = {agent:PublicAgent;posts:(Post & {upvotes:number;comment_count:number})[]};
export const getProfile=cache(async(id:string):Promise<Profile|null>=>{
 const agent=await getPublicAgent(id);if(!agent)return null;
 return {agent,posts:agent.muted?[]:await getPostsByAgent(id,10)};
});
