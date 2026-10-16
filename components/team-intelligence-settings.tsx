"use client";

import { useEffect, useState } from "react";
import type { TeamMember, TeamRole } from "@/lib/internal-team-registry";

const blank = { id: undefined as string | undefined, name: "", phone: "", role: "sales" as TeamRole, active: true, dailyBriefEnabled:true, priorityAlertsEnabled:true };
export function TeamIntelligenceSettings() {
  const [members,setMembers] = useState<TeamMember[]>([]);
  const [form,setForm] = useState({...blank});
  const [password,setPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  async function reload() {
    const response=await fetch("/api/admin/team-intelligence", {cache:"no-store"});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load the staff directory.");
    setMembers(data.members);
  }
  useEffect(()=>{reload().catch((cause)=>setError(cause instanceof Error?cause.message:"Cannot load staff directory."));},[]);
  async function save() {
    if(!form.name.trim() || !form.phone.trim() || !password || busy) return;
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/admin/team-intelligence",{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...form,adminPassword:password})
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || "Could not save this team member.");
      setPassword("");setForm({...blank});
      await reload();
      setNotice("Staff access saved. Mary will recognise this WhatsApp number and apply the selected role.");
    } catch(cause){setError(cause instanceof Error?cause.message:"Could not save staff access.");}
    finally{setBusy(false);}
  }
  function edit(member:TeamMember) {
    setForm({id:member.id,name:member.name,phone:member.phone,role:member.role,active:member.active,dailyBriefEnabled:member.dailyBriefEnabled,priorityAlertsEnabled:member.priorityAlertsEnabled});
    setNotice("");setError("");
  }
  return <details className="teamIntelligenceSettings">
    <summary>Team WhatsApp access <span>{members.length} configured</span></summary>
    <div className="teamSettingsContent">
      <p>Mary recognises staff from the sender's registered WhatsApp number. Directors see all business reports; sales and support see only their assigned leads; marketing sees aggregate trends. Team conversations are excluded from client statistics.</p>
      <div className="teamAccessList">
        {members.map(member=><div key={member.id} className="teamAccessMember">
          <div><strong>{member.name}</strong><small>{member.phone} · {member.role} · {member.active?"Active":"Disabled"} · Brief {member.dailyBriefEnabled?"On":"Off"} · Alerts {member.priorityAlertsEnabled?"On":"Off"}</small></div>
          <button onClick={()=>edit(member)} type="button">Edit</button>
        </div>)}
      </div>
      <div className="teamSettingsForm">
        <h3>{form.id?"Update staff member":"Add staff member"}</h3>
        <label>Name<input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} placeholder="Full staff name" /></label>
        <label>WhatsApp number (international format)<input value={form.phone} onChange={(event)=>setForm({...form,phone:event.target.value})} placeholder="+260..." /></label>
        <label>Role<select value={form.role} onChange={(event)=>setForm({...form,role:event.target.value as TeamRole})}>
          <option value="director">Director</option><option value="sales">Sales</option><option value="marketing">Marketing</option><option value="support">Customer support</option>
        </select></label>
        <label className="teamAccessCheck"><input type="checkbox" checked={form.dailyBriefEnabled} onChange={(event)=>setForm({...form,dailyBriefEnabled:event.target.checked})} />Morning brief</label>
        <label className="teamAccessCheck"><input type="checkbox" checked={form.priorityAlertsEnabled} onChange={(event)=>setForm({...form,priorityAlertsEnabled:event.target.checked})} />Priority alerts</label>
        <label className="teamAccessCheck"><input type="checkbox" checked={form.active} onChange={(event)=>setForm({...form,active:event.target.checked})} />Access active</label>
        <label>Confirm administrator password<input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} autoComplete="current-password" /></label>
        <div className="teamAccessActions">
          <button type="button" disabled={busy||!password||!form.name.trim()||!form.phone.trim()} onClick={()=>void save()}>{busy?"Saving…":"Save staff access"}</button>
          <button type="button" onClick={()=>{setForm({...blank});setPassword("");setError("");}}>Clear form</button>
        </div>
      </div>
      {error&&<p role="alert" className="teamAccessError">{error}</p>}
      {notice&&<p role="status" className="teamAccessNotice">{notice}</p>}
    </div>
    <style jsx>{`
      .teamIntelligenceSettings{max-width:1440px;margin:9px auto;padding:0 12px;border-radius:12px;border:1px solid #d3e5df;background:white;color:#254e4a}
      summary{font-size:13px;cursor:pointer;padding:12px 4px;font-weight:800}summary span{font-weight:500;color:#65827d;font-size:11px;margin-left:10px}
      .teamSettingsContent{border-top:1px solid #e4efea;padding:13px 1px 18px;font-size:12px}
      p{line-height:1.55}
      .teamAccessList{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin:12px 0}
      .teamAccessMember{border:1px solid #d9e7e2;padding:10px;border-radius:10px;display:flex;justify-content:space-between;gap:8px;align-items:center}
      .teamAccessMember strong,.teamAccessMember small{display:block}.teamAccessMember small{font-size:11px;color:#687c76;margin-top:3px}
      .teamSettingsForm{display:flex;flex-wrap:wrap;align-items:end;gap:9px;background:#f5faf8;padding:12px;border-radius:10px}
      .teamSettingsForm h3{width:100%;font-size:14px;margin:0}
      .teamSettingsForm label{display:grid;gap:5px;font-size:12px;flex:1 1 190px}
      .teamSettingsForm input:not([type=checkbox]),select{width:100%;min-height:38px;border-radius:8px;border:1px solid #cbded8;padding:7px;background:white;color:#244640}
      .teamAccessCheck{display:flex!important;align-items:center;gap:8px;flex:0 0 auto!important;min-height:38px}
      .teamAccessActions{display:flex;gap:8px}
      button{cursor:pointer;min-height:34px;border-radius:8px;border:1px solid #cbded8;background:#fff;color:#12584f;padding:7px 11px;font-weight:750}
      .teamAccessActions button:first-child{background:#087d78;color:white;border-color:#087d78}
      button:disabled{opacity:.5;cursor:not-allowed}
      .teamAccessError{color:#9f2828;font-weight:700}.teamAccessNotice{color:#087d78;font-weight:700}
    `}</style>
  </details>;
}
