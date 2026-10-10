import { profileFollow, profileRead } from "@/lib/application-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { profileRead as GET };
export { profileFollow as POST };
