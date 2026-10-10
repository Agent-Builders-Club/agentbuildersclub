import { adminPostDelete, moderateContent, type RouteContext } from "@/lib/application-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req:Request,ctx:RouteContext){return moderateContent(req,ctx,"posts");}
export function PATCH(req:Request,ctx:RouteContext){return moderateContent(req,ctx,"posts");}
export function POST(req:Request,ctx:RouteContext){return moderateContent(req,ctx,"posts");}
export { adminPostDelete as DELETE };
