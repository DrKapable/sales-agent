"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";

type ActiveClient = { phone: string; name: string; service: string };
type PaymentState = {
  status?: string;
  title?: string;
  amount?: number;
  link?: string;
  reference?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  customerEmail?: string;
};

function visiblePanel() {
  return Array.from(document.querySelectorAll<HTMLElement>(".conversationPanel")).find((panel) => {
    const rect = panel.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || null;
}

function activeClient(panel: HTMLElement | null): ActiveClient | null {
  if (!panel) return null;
  const identity = panel.querySelector<HTMLElement>(".clientIdentity");
  if (!identity) return null;
  const name = identity.querySelector<HTMLElement>("strong")?.textContent?.trim() || "";
  const meta = identity.querySelector<HTMLElement>(":scope > div > span")?.textContent || "";
  const [rawPhone, ...rest] = meta.split("·");
  const phone = String(rawPhone || "").replace(/\D/g, "");
  const service = rest.join("·").trim();
  if (!/^\d{8,15}$/.test(phone)) return null;
  return { phone, name: name === "Unnamed client" ? "" : name, service };
}

function money(value?: number) {
  return value == null ? "" : `K${Number(value).toLocaleString("en-ZM", { maximumFractionDigits: 2 })}`;
}

export function SampayPaymentEnhancer() {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [client, setClient] = useState<ActiveClient | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [momo, setMomo] = useState("");
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<PaymentState | null>(null);

  const sync = useCallback(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const nextPanel = visiblePanel();
    const nextClient = activeClient(nextPanel);
    setPanel(nextPanel);
    setActionsHost(nextPanel?.querySelector<HTMLElement>(".conversationActions") || null);
    setClient(nextClient);
  }, []);

  useEffect(() => {
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [sync]);

  useEffect(() => {
    if (!open || !client) return;
    setName(client.name);
    setMomo(client.phone);
    setService(client.service || "Research support");
    setNotice("");
    setError("");
    setPayment(null);
    void checkStatus(client.phone, true);
  }, [open, client?.phone]);

  async function checkStatus(phone: string, quiet = false) {
    if (!quiet) setBusy(true);
    try {
      const response = await fetch(`/api/admin/payment-requests?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to check payment status.");
      setPayment(data.payment || null);
      if (!quiet) setNotice(data.payment ? `Payment status: ${String(data.payment.status).toUpperCase()}` : "No payment request is recorded in this conversation yet.");
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : "Unable to check payment status.");
    } finally {
      if (!quiet) setBusy(false);
    }
  }

  async function createPayment() {
    if (!client) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: client.phone, customerName: name, customerEmail: email, customerPhone: momo, service })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create payment request.");
      if (data.directCheckout) {
        setPayment({ status: "checkout", title: data.service, amount: data.amountZmw, link: data.link });
        setNotice("Course checkout ready. Share the secure Sampay checkout with the client.");
      } else {
        setPayment(data.payment || null);
        setNotice(data.emailSent ? "Secure Sampay link created and emailed to the client." : "Secure Sampay link created. Share it in WhatsApp; email delivery was not confirmed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create payment request.");
    } finally { setBusy(false); }
  }

  async function copyLink() {
    if (!payment?.link) return;
    await navigator.clipboard.writeText(payment.link);
    setNotice("Payment link copied. Paste it into this WhatsApp conversation.");
  }

  if (!actionsHost || !client) return null;

  const trigger = createPortal(
    <button type="button" className="iconButton sampayAdminButton" aria-label="Open Sampay payment" onClick={() => setOpen(true)}>Sampay</button>,
    actionsHost
  );

  const modal = open ? createPortal(
    <div className="sampayAdminOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="sampayAdminModal" role="dialog" aria-modal="true" aria-label="Sampay payment workspace">
        <header>
          <div><span>SECURE PAYMENT</span><h2>Sampay payment</h2><p>Create or verify a client payment without leaving the chat.</p></div>
          <button type="button" aria-label="Close Sampay payment" onClick={() => setOpen(false)}>×</button>
        </header>

        <div className="sampayAdminBody">
          <div className="sampayCourseCard">
            <div><strong>AI-Enhanced Research Writing</strong><small>Current fee · K350</small></div>
            <a href="https://www.medmindslc.online/courses/ai-enhanced-research-writing" target="_blank" rel="noreferrer">Open course checkout</a>
            <p>Clients pay directly on the course checkout using Mobile Money or supported cards.</p>
          </div>

          <div className="sampaySectionTitle"><strong>Tailored service payment</strong><small>Uses the approved quotation/catalogue amount. The amount cannot be typed manually.</small></div>
          <div className="sampayFields">
            <label>Client name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></label>
            <label>Email for link & receipt<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" /></label>
            <label>Mobile Money number<input value={momo} onChange={(e) => setMomo(e.target.value)} inputMode="tel" placeholder="260..." /></label>
            <label>Service<input value={service} onChange={(e) => setService(e.target.value)} placeholder="Research Proposal" /></label>
          </div>

          {payment && <div className={`sampayStatusCard ${payment.status === "paid" ? "paid" : ""}`}>
            <div><span>STATUS</span><strong>{String(payment.status || "pending").toUpperCase()}</strong></div>
            <p>{payment.title || service}{payment.amount ? ` · ${money(payment.amount)}` : ""}</p>
            {payment.reference && <small>Reference: {payment.reference}</small>}
            {payment.paymentMethod && <small>Method: {payment.paymentMethod}</small>}
            {payment.link && <div className="sampayLinkRow"><input readOnly value={payment.link} /><button type="button" onClick={copyLink}>Copy link</button></div>}
          </div>}

          {notice && <div className="sampayNotice" role="status">{notice}</div>}
          {error && <div className="sampayError" role="alert">{error}</div>}

          <div className="sampayActions">
            <button type="button" className="secondary" disabled={busy} onClick={() => void checkStatus(client.phone)}>{busy ? "Checking…" : "Check payment"}</button>
            <button type="button" className="primary" disabled={busy || !name.trim() || !email.trim() || !momo.trim() || !service.trim()} onClick={createPayment}>{busy ? "Working…" : "Create secure link"}</button>
          </div>
          <p className="sampaySafety">Payment is confirmed only from the Research Portal/Sampay record. A screenshot or client message alone cannot mark a payment as paid. Official receipts are issued after verified payment.</p>
        </div>
      </section>
    </div>,
    document.body
  ) : null;

  return <>{trigger}{modal}<style jsx global>{`
    .sampayAdminOverlay{position:fixed;inset:0;z-index:2147483200;background:rgba(6,24,37,.72);display:grid;place-items:center;padding:18px}.sampayAdminModal{width:min(620px,100%);max-height:92dvh;overflow:hidden;border-radius:20px;background:#f5f8f7;box-shadow:0 22px 70px rgba(0,0,0,.3);color:#173b45}.sampayAdminModal>header{display:flex;justify-content:space-between;gap:16px;padding:18px 20px;background:#173f5a;color:white}.sampayAdminModal header span{font-size:10px;letter-spacing:.12em;color:#70d8ca;font-weight:900}.sampayAdminModal h2{margin:3px 0 4px;font-size:23px}.sampayAdminModal header p{margin:0;color:#d4e5eb;font-size:12px}.sampayAdminModal header button{width:38px;height:38px;border:1px solid rgba(255,255,255,.25);border-radius:50%;background:rgba(255,255,255,.08);color:white;font-size:24px}.sampayAdminBody{padding:16px;overflow:auto;max-height:calc(92dvh - 92px)}.sampayCourseCard{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:13px;border:1px solid #cde4df;border-radius:14px;background:#eef9f6}.sampayCourseCard strong,.sampayCourseCard small{display:block}.sampayCourseCard small{margin-top:3px;color:#607672}.sampayCourseCard a{align-self:center;padding:9px 11px;border-radius:9px;background:#0c796a;color:white;font-size:11px;font-weight:850}.sampayCourseCard p{grid-column:1/-1;margin:5px 0 0;color:#5d736e;font-size:11px}.sampaySectionTitle{margin:16px 1px 9px}.sampaySectionTitle strong,.sampaySectionTitle small{display:block}.sampaySectionTitle small{margin-top:3px;color:#6c7e7a;font-size:11px}.sampayFields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sampayFields label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#536b67}.sampayFields input{min-height:43px;border:1px solid #cfdbd8;border-radius:10px;background:white;padding:9px 10px;color:#173b45;outline:none}.sampayFields input:focus{border-color:#169887;box-shadow:0 0 0 2px rgba(22,152,135,.1)}.sampayStatusCard{margin-top:12px;padding:12px;border:1px solid #e1d6ac;border-radius:12px;background:#fff8dd}.sampayStatusCard.paid{border-color:#adddd1;background:#eaf8f4}.sampayStatusCard>div:first-child{display:flex;justify-content:space-between;align-items:center}.sampayStatusCard span{font-size:9px;font-weight:900;color:#71827e}.sampayStatusCard strong{font-size:12px}.sampayStatusCard p{margin:6px 0;font-size:13px;font-weight:800}.sampayStatusCard small{display:block;color:#61736f;font-size:10px}.sampayLinkRow{display:flex!important;gap:7px;margin-top:9px}.sampayLinkRow input{min-width:0;flex:1;border:1px solid #d2dfdb;border-radius:8px;padding:8px;font-size:10px;background:white}.sampayLinkRow button{border:0;border-radius:8px;background:#173f5a;color:white;padding:0 10px;font-weight:800}.sampayNotice,.sampayError{margin-top:10px;padding:9px 10px;border-radius:9px;font-size:11px;font-weight:700}.sampayNotice{background:#e7f6f2;color:#24675f}.sampayError{background:#fdeaea;color:#973e3e}.sampayActions{display:grid;grid-template-columns:.8fr 1.2fr;gap:9px;margin-top:13px}.sampayActions button{min-height:45px;border-radius:10px;font-weight:850}.sampayActions .secondary{border:1px solid #ccd9d6;background:white;color:#315a55}.sampayActions .primary{border:0;background:#0c796a;color:white}.sampayActions button:disabled{opacity:.5}.sampaySafety{margin:10px 2px 0;color:#70817d;font-size:10px;line-height:1.45}.sampayAdminButton{white-space:nowrap}
    @media(max-width:760px){.sampayAdminButton{display:none!important}.sampayAdminOverlay{padding:0;place-items:end center}.sampayAdminModal{width:100%;max-height:94dvh;border-radius:20px 20px 0 0}.sampayAdminBody{padding:13px 13px calc(18px + env(safe-area-inset-bottom));max-height:calc(94dvh - 88px)}.sampayAdminModal>header{padding:14px 15px}.sampayAdminModal h2{font-size:20px}.sampayAdminModal header p{display:none}.sampayFields{grid-template-columns:1fr}.sampayFields input{font-size:16px}.sampayCourseCard{grid-template-columns:1fr}.sampayCourseCard a{width:max-content}.sampayActions{position:sticky;bottom:0;padding-top:9px;background:linear-gradient(transparent,#f5f8f7 22%);grid-template-columns:1fr 1.25fr}}
  `}</style></>;
}