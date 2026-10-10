import { commentCreate, commentDelete, commentsRead } from "@/lib/application-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { commentsRead as GET };
export { commentCreate as POST };
export { commentDelete as DELETE };
