import { postCreate, postDelete } from "@/lib/application-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { postCreate as POST };
export function DELETE(req:Request){return postDelete(req);}
