import { neon } from "@neondatabase/serverless";
import type { Lead } from "@/lib/types";

type Guest = { phone: string; guest_name: string };
export function tagWalimaGuests(leads: Lead[], guests: Guest[]): Lead[] {
  // The organiser's sample is not a guest invitation.
  const byPhone=new Map(guests.filter(g=>g.phone!=="260977259132").map(g=>[g.phone,g.guest_name]));
  return leads.map(lead=>({...lead,isWalimaGuest:byPhone.has(lead.phone),walimaGuestName:byPhone.get(lead.phone) ?? null}));
}
export async function withWalimaGuestLabels(leads:Lead[]) {
  if(!process.env.DATABASE_URL) return tagWalimaGuests(leads,[]);
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql.query(`SELECT phone,guest_name FROM walima_guest_context WHERE campaign=$1`,["walima-2026-12-28-lota-v1"]);
  return tagWalimaGuests(leads,rows.map(row=>({phone:String(row.phone),guest_name:String(row.guest_name)})));
}
