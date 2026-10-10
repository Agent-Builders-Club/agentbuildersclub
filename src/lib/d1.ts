import { getCloudflareContext } from "@opennextjs/cloudflare";

// Structural subset of the real Workers D1 API; no query-builder compatibility layer.
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; [key: string]: unknown };
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
export interface Database {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}
export async function getDB(): Promise<Database> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("D1 DB binding unavailable");
  return db;
}
export async function first<T>(sql: string, ...values: unknown[]): Promise<T | null> {
  return (await getDB()).prepare(sql).bind(...values).first<T>();
}
export async function all<T>(sql: string, ...values: unknown[]): Promise<T[]> {
  return (await (await getDB()).prepare(sql).bind(...values).all<T>()).results;
}
export async function run(sql: string, ...values: unknown[]) {
  return (await getDB()).prepare(sql).bind(...values).run();
}
export function jsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(v => typeof v !== "string")) throw new Error("Invalid stored array");
  return parsed as string[];
}
