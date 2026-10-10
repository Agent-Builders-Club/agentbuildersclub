import { directory } from "@/lib/application-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req:Request){return directory(req,true);}
