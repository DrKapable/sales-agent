import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { listLeads } from "@/lib/store";
import type { Lead } from "@/lib/types";

type ArchivedChat = { lead: Lead; archivedAt: string };

declare global {
  var __medmindsArchivedChats: Map<string, string> | undefined;
}

const memoryArchived = globalThis.__medmindsArchivedChats ?? new Map<string, string>();
globalThis.__medmindsArchivedChats = memoryArchived;

let sql: NeonQueryFunction<false, false> | null = null;
let initialization: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureArchiveTable() {
  const db = database();
  if (!db) return;
  initialization ??= db.query(`CREATE TABLE IF NOT EXISTS archived_chats (
    phone TEXT PRIMARY KEY,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).then(() => undefined);
  await initialization;
}

async function archivedMap() {
  await ensureArchiveTable();
  const db = database();
  if (!db) return new Map(memoryArchived);
  const rows = await db.query(`SELECT phone, archived_at FROM archived_chats ORDER BY archived_at DESC`);
  return new Map(rows.map((row) => [String(row.phone), new Date(String(row.archived_at)).toISOString()]));
}

export async function listActiveLeads(): Promise<Lead[]> {
  const [leads, archived] = await Promise.all([listLeads(), archivedMap()]);
  return leads.filter((lead) => !archived.has(lead.phone));
}

export async function listArchivedLeads(): Promise<ArchivedChat[]> {
  const [leads, archived] = await Promise.all([listLeads(), archivedMap()]);
  return leads
    .filter((lead) => archived.has(lead.phone))
    .map((lead) => ({ lead, archivedAt: archived.get(lead.phone) as string }))
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export async function archiveChat(phone: string) {
  await ensureArchiveTable();
  const db = database();
  const archivedAt = new Date().toISOString();
  if (!db) {
    memoryArchived.set(phone, archivedAt);
    return archivedAt;
  }
  const rows = await db.query(`INSERT INTO archived_chats (phone, archived_at) VALUES ($1, NOW())
    ON CONFLICT (phone) DO UPDATE SET archived_at=NOW() RETURNING archived_at`, [phone]);
  return new Date(String(rows[0].archived_at)).toISOString();
}

export async function restoreChat(phone: string) {
  await ensureArchiveTable();
  const db = database();
  if (!db) {
    memoryArchived.delete(phone);
    return;
  }
  await db.query(`DELETE FROM archived_chats WHERE phone=$1`, [phone]);
}

export async function deleteChat(phone: string) {
  await ensureArchiveTable();
  const db = database();
  if (!db) throw new Error("Permanent deletion requires persistent database storage.");
  await db.query(`DELETE FROM messages WHERE phone=$1`, [phone]);
  await db.query(`DELETE FROM archived_chats WHERE phone=$1`, [phone]);
  await db.query(`DELETE FROM leads WHERE phone=$1`, [phone]);
}
