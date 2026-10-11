"use client";

import { useEffect, useState } from "react";
import { normalizeClientWhatsAppNumber } from "@/lib/direct-document-input";

type Kind = "quotation" | "receipt";
type Document = { id: string; documentNumber?: string; service?: string; amount_zmw?: number | string; amount_paid_zmw?: number | string; total_charged_zmw?: number | string; balance_zmw?: number | string; created_at?: string; details?: string };
type Readiness = { kind: Kind; template?: { status: string; components?: Array<{ format?: string }> } | null; error?: string };
const endpoint = "/api/admin/business/direct-documents";
const money = (value?: number | string) => `K${Number(value || 0).toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const documentNumber = (kind: Kind, doc: Document) => doc.documentNumber || `${kind === "receipt" ? "MM" : "QUO"}-${doc.id.slice(0, 8).toUpperCase()}`;

export function DirectClientDocuments() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [kind, setKind] = useState<Kind>("quotation");
  const [source, setSource] = useState<"new" | "saved">("new");
  const [documents, setDocuments] = useState<{ quotations: Document[]; receipts: Document[] }>({ quotations: [], receipts: [] });
  const [selected, setSelected] = useState<Document | null>(null);
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState("");
  const [details, setDetails] = useState("");
  const [reference, setReference] = useState("");
  const [verifiedBy, setVerifiedBy] = useState("");
  const [verified, setVerified] = useState(false);
  const [templates, setTemplates] = useState<Readiness[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const normalized = normalizeClientWhatsAppNumber(phone);
  const readiness = templates.find((item) => item.kind === kind);
  const approved = readiness?.template?.status === "APPROVED" && readiness.template.components?.some((item) => item.format === "DOCUMENT");
  const available = kind === "quotation" ? documents.quotations : documents.receipts;
  const balance = Math.round((Number(amount) - Number(paid)) * 100) / 100;

  async function request(url: string, body?: unknown) {
    const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to complete this action.");
    return data;
  }
  async function refreshTemplates() {
    setChecking(true);
    try { setTemplates((await request(endpoint)).templates || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to check templates."); }
    finally { setChecking(false); }
  }
  useEffect(() => { void refreshTemplates(); }, []);

  function changePhone(value: string) {
    setPhone(value); setSelected(null); setDocuments({ quotations: [], receipts: [] }); setError(""); setNotice("");
    setName(""); setService(""); setAmount(""); setPaid(""); setDetails(""); setReference(""); setVerified(false);
  }
  function changeKind(value: Kind) { setKind(value); setSelected(null); setVerified(false); setError(""); setNotice(""); }
  async function lookup() {
    setBusy(true); setError(""); setNotice(""); setSelected(null);
    try {
      const data = await request(`${endpoint}?phone=${encodeURIComponent(phone)}`);
      setDocuments({ quotations: data.quotations || [], receipts: data.receipts || [] });
      setName(data.lead?.name || ""); setService(data.lead?.service || "");
      if (!data.lead) setNotice("This number is new. Enter the client details to create a document.");
      else setNotice("Client found. Choose a saved document or create a new one.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to find documents."); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(endpoint, kind === "quotation"
        ? { action: "create_quotation", phone, name, service, amountZmw: Number(amount), details }
        : { action: "create_receipt", phone, name, service, totalChargedZmw: Number(amount), amountPaidZmw: Number(paid), reference, verifiedBy, verified });
      setPhone(data.phone); setSelected(data.document);
      setNotice(`${kind === "quotation" ? "Quotation" : "Verified receipt"} saved. Preview the PDF, then send it to +${data.phone}.`);
    } catch (e) { setError(`${e instanceof Error ? e.message : "Unable to save document."} If the connection failed, check saved documents before saving again.`); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(endpoint, { action: "send", phone, kind, documentId: selected.id });
      setNotice(`${documentNumber(kind, selected)} submitted to WhatsApp for +${data.phone}. Delivery confirmation is pending.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send document. It remains saved for retry."); }
    finally { setBusy(false); }
  }

  return <main className="directDocs">
    <header><div><a href="/admin">← Agent inbox</a><h1>Send quotations & receipts</h1><p>Enter a client's WhatsApp number. They do not need to have messaged Mary.</p></div></header>
    <div className="directDocsGrid">
      <section className="directDocsCard">
        <h2>Client & document</h2>
        <label>WhatsApp number<input type="tel" inputMode="tel" autoComplete="tel" placeholder="0979 259 015 or +260 979 259 015" value={phone} disabled={busy} onChange={(e) => changePhone(e.target.value)} /></label>
        <small>{normalized ? `Recipient: +${normalized}` : "Use a Zambian 09/07 number or include the international country code."}</small>
        <button className="secondary" type="button" disabled={!normalized || busy} onClick={() => void lookup()}>Find saved documents / client</button>
        <div className="directDocsChoices" aria-label="Document type">
          <button aria-pressed={kind === "quotation"} disabled={busy} onClick={() => changeKind("quotation")}>Quotation</button>
          <button aria-pressed={kind === "receipt"} disabled={busy} onClick={() => changeKind("receipt")}>Receipt</button>
        </div>
        <div className="directDocsChoices" aria-label="Document source">
          <button aria-pressed={source === "new"} disabled={busy} onClick={() => { setSource("new"); setSelected(null); setNotice(""); }}>Create new</button>
          <button aria-pressed={source === "saved"} disabled={busy} onClick={() => { setSource("saved"); setSelected(null); void lookup(); }}>Use saved</button>
        </div>
        {source === "saved" && <label>Saved {kind === "receipt" ? "verified receipts" : "quotations"}<select disabled={busy} value={selected?.id || ""} onChange={(e) => { setSelected(available.find((doc) => doc.id === e.target.value) || null); setNotice(""); setError(""); }}><option value="">{available.length ? "Choose a document" : "No saved documents for this number"}</option>{available.map((doc) => <option key={doc.id} value={doc.id}>{documentNumber(kind, doc)} · {money(kind === "receipt" ? doc.amount_paid_zmw ?? doc.amount_zmw : doc.amount_zmw)}{doc.service ? ` · ${doc.service}` : ""}</option>)}</select></label>}
        {source === "new" && !selected && <form onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy}><label>Client name<input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Service<input required minLength={2} maxLength={240} placeholder="e.g. Research proposal support" value={service} onChange={(e) => setService(e.target.value)} /></label>
            <label>{kind === "receipt" ? "Total charged" : "Quotation amount"} (ZMW)<input required type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            {kind === "quotation" ? <label>Scope & quotation details<textarea required minLength={3} maxLength={1800} rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Deliverables, timeline and agreed terms" /></label> : <>
              <label>Amount paid (ZMW)<input required type="number" inputMode="decimal" min="0.01" max={Number(amount) || 100000000} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
              <p className="directDocsBalance">Balance: {money(Math.max(balance, 0))}</p>
              <label>Payment reference<input required minLength={2} maxLength={160} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank transaction or mobile-money reference" /></label>
              <label>Verified by<input required minLength={2} maxLength={160} value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="Name of the staff member who checked payment" /></label>
              <label className="directDocsCheck"><input type="checkbox" required checked={verified} onChange={(e) => setVerified(e.target.checked)} />I have verified that this payment was received.</label>
            </>}
            <button type="submit" disabled={!normalized || busy}>{busy ? "Saving…" : "Save & preview PDF"}</button>
          </fieldset>
        </form>}
      </section>
      <section className="directDocsCard">
        <h2>Preview & send</h2>
        <div className="directDocsTemplate"><strong>{kind === "quotation" ? "Quotation" : "Receipt"} template: {checking ? "Checking…" : readiness?.template?.status || (readiness?.error ? "Unavailable" : "Checking…")}</strong><p>{approved ? "Ready to send a PDF to this number, including first-time clients." : "Documents can be saved now. Sending becomes available when Meta approves this template."}</p><button className="secondary" type="button" disabled={checking || busy} onClick={() => void refreshTemplates()}>Refresh template status</button></div>
        {selected ? <div className="directDocsReview"><h3>{documentNumber(kind, selected)}</h3><p><strong>{name || "Client"}</strong><br />WhatsApp: +{normalized}</p><p>{kind === "receipt" ? "Amount paid" : "Quoted amount"}: <strong>{money(kind === "receipt" ? selected.amount_paid_zmw ?? selected.amount_zmw : selected.amount_zmw)}</strong></p>
          {kind === "receipt" && <p>Total charged: {money(selected.total_charged_zmw ?? selected.amount_zmw)} · Balance: {money(selected.balance_zmw)}</p>}
          <a className="directDocsPreview" href={`${endpoint}?phone=${encodeURIComponent(phone)}&kind=${kind}&documentId=${selected.id}`} target="_blank" rel="noreferrer">Open branded PDF preview ↗</a>
          <button type="button" disabled={busy || !approved || !normalized} onClick={() => void send()}>{busy ? "Sending…" : "Send PDF with Meta template"}</button>
          <small>Meta acceptance confirms submission. Final delivery is recorded when WhatsApp confirms it.</small>
          {source === "new" && <button className="secondary" type="button" disabled={busy} onClick={() => { setSelected(null); setVerified(false); setReference(""); setNotice(""); }}>Create another document</button>}
        </div> : <p className="directDocsEmpty">Save a new document or choose a saved quotation or verified receipt. Preview it here before sending.</p>}
        {notice && <p className="directDocsNotice" role="status">{notice}</p>}
        {error && <p className="directDocsError" role="alert">{error}</p>}
      </section>
    </div>
    <style jsx>{`
      .directDocs{max-width:1180px;margin:0 auto;padding:24px clamp(12px,3vw,30px) 40px;color:#183f4b}.directDocs header{margin-bottom:20px}.directDocs h1{font-size:clamp(23px,3vw,32px);margin:14px 0 8px}.directDocs h2{font-size:18px;margin:0 0 16px}.directDocs header p,.directDocsEmpty{color:#5d716b;line-height:1.5}.directDocs a{color:#087d78}.directDocsGrid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.directDocsCard{padding:22px;background:white;border:1px solid #d7e3df;border-radius:16px;min-width:0}.directDocs label{display:grid;gap:7px;font-size:13px;font-weight:700;margin:14px 0 6px}.directDocs input,.directDocs textarea,.directDocs select{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #bfcfca;border-radius:9px;padding:10px;font:inherit;color:#183f4b;background:white}.directDocs textarea{resize:vertical}.directDocs small{display:block;line-height:1.5;color:#5d716b;font-size:12px}.directDocs button{min-height:44px;border:1px solid #087d78;border-radius:9px;padding:10px 14px;background:#087d78;color:white;font:inherit;font-size:13px;font-weight:750;cursor:pointer}.directDocs button:disabled{opacity:.55;cursor:default}.directDocs button.secondary{background:white;color:#087d78;margin-top:12px}.directDocsChoices{display:flex;gap:8px;margin:18px 0}.directDocsChoices button{flex:1;background:#f5f9f7;color:#42625a;border-color:#d7e3df}.directDocsChoices button[aria-pressed=true]{background:#183f4b;color:white;border-color:#183f4b}.directDocs fieldset{border:0;margin:0;padding:0;min-width:0}.directDocs form button[type=submit]{width:100%;margin-top:20px}.directDocsBalance{padding:12px;background:#f5faf8;border-radius:8px;font-weight:750}.directDocs label.directDocsCheck{display:flex;align-items:flex-start;gap:10px;line-height:1.5;margin-top:18px}.directDocsCheck input{width:18px;min-height:18px;height:18px;flex-shrink:0;margin:2px 0 0}.directDocsTemplate{padding:16px;background:#f1f7f5;border-radius:11px;font-size:13px}.directDocsTemplate p{line-height:1.5;color:#5d716b;margin-bottom:0}.directDocsReview{margin-top:20px;display:grid;gap:10px}.directDocsReview h3,.directDocsReview p{margin:0;line-height:1.6}.directDocsPreview{padding:12px;border:1px solid #bfcfca;border-radius:9px;text-align:center;font-size:13px;font-weight:700}.directDocsNotice,.directDocsError{padding:14px;border-radius:10px;font-size:13px;line-height:1.6;overflow-wrap:anywhere}.directDocsNotice{background:#eaf6ef;color:#205c3c}.directDocsError{background:#fff1ee;color:#983929}.directDocs input:focus-visible,.directDocs textarea:focus-visible,.directDocs select:focus-visible,.directDocs button:focus-visible,.directDocs a:focus-visible{outline:3px solid #b3ddd1;outline-offset:2px}@media(max-width:760px){.directDocs{padding-top:16px}.directDocsGrid{grid-template-columns:1fr;gap:14px}.directDocsCard{padding:16px}.directDocs input,.directDocs textarea,.directDocs select{font-size:16px}}
    `}</style>
  </main>;
}
