"use client";

import { useEffect } from "react";

let latestBusinessSnapshot: any = null;

function money(value: number) {
  return `K${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function paymentModal() {
  return Array.from(document.querySelectorAll<HTMLElement>(".biResponsiveModalCard"))
    .find((card) => card.querySelector("h2")?.textContent?.trim() === "Record payment") || null;
}

function directLabelText(label: HTMLLabelElement) {
  return Array.from(label.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function findPaidField(card: HTMLElement) {
  const markedInput = card.querySelector<HTMLInputElement>('input[data-bi-amount-paid="1"]');
  if (markedInput) {
    const label = markedInput.closest("label") as HTMLLabelElement | null;
    return label ? { label, input: markedInput } : null;
  }

  const labels = Array.from(card.querySelectorAll<HTMLLabelElement>("label"));
  const label = labels.find((candidate) => /^(Amount paid|Amount received)(\s*\(ZMW\))?$/i.test(directLabelText(candidate)));
  const input = label?.querySelector<HTMLInputElement>('input[type="number"]') || null;
  if (!label || !input) return null;

  label.dataset.biAmountPaidField = "1";
  input.dataset.biAmountPaid = "1";
  return { label, input };
}

function priorVerifiedPaid(card: HTMLElement) {
  if (!latestBusinessSnapshot?.leads || !Array.isArray(latestBusinessSnapshot?.payments)) return 0;
  const headerText = card.textContent || "";
  const phones = Array.from(String(headerText).matchAll(/(?:\+?260|0)\s*\d(?:[\s-]*\d){8}/g)).map((match) => normalizePhone(match[0]));
  const lead = latestBusinessSnapshot.leads.find((item: any) => phones.some((phone) => normalizePhone(String(item.phone || "")) === phone));
  if (!lead) return 0;
  return latestBusinessSnapshot.payments
    .filter((payment: any) => payment.lead_id === lead.id && payment.status === "VERIFIED")
    .reduce((sum: number, payment: any) => sum + Number(payment.amount_paid_zmw ?? payment.amount_zmw ?? 0), 0);
}

function refreshBalance(card: HTMLElement) {
  const totalInput = card.querySelector<HTMLInputElement>('input[data-bi-total-charged="1"]');
  const paidField = findPaidField(card);
  const paidInput = paidField?.input || null;
  const summary = card.querySelector<HTMLElement>("[data-bi-payment-balance]");
  if (!paidInput || !summary) return;

  const total = Number(totalInput?.value || card.dataset.biTotalChargedValue || 0);
  const paid = Number(paidInput.value || 0);
  const previous = priorVerifiedPaid(card);
  const totalValid = Number.isFinite(total) && total > 0;
  const paidValid = Number.isFinite(paid) && paid >= 0;
  const projectedCumulative = previous + (paidValid ? paid : 0);
  const balance = totalValid && paidValid ? total - projectedCumulative : 0;

  summary.replaceChildren();
  const rows: Array<[string, string]> = [
    ["Total charged", totalValid ? money(total) : "—"]
  ];
  if (previous > 0) rows.push(["Previously verified", money(previous)]);
  rows.push(
    ["This payment", paidValid && paid > 0 ? money(paid) : "K0.00"],
    [balance < 0 ? "Overpayment" : "Projected balance", totalValid && paidValid ? money(Math.abs(balance)) : "—"]
  );

  rows.forEach(([label, value], index) => {
    const row = document.createElement("div");
    if (index === rows.length - 1) row.className = balance < 0 ? "biFinanceBalance biFinanceBalanceError" : "biFinanceBalance";
    const left = document.createElement("span");
    left.textContent = label;
    const right = document.createElement("strong");
    right.textContent = value;
    row.append(left, right);
    summary.appendChild(row);
  });

  if (balance < 0) {
    summary.setAttribute("aria-label", `This payment would exceed the remaining balance by ${money(Math.abs(balance))}.`);
  } else if (totalValid && paidValid) {
    summary.setAttribute("aria-label", `Projected balance after verification ${money(balance)}.`);
  } else {
    summary.removeAttribute("aria-label");
  }
}

function enhancePaymentModal() {
  const card = paymentModal();
  if (!card) return;

  const paidField = findPaidField(card);
  const paidLabel = paidField?.label || null;
  const paidInput = paidField?.input || null;
  if (!paidLabel || !paidInput) return;

  for (const node of Array.from(paidLabel.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && /^\s*Amount received(?:\s*\(ZMW\))?\s*$/i.test(node.textContent || "")) {
      node.textContent = "Amount paid (ZMW)";
    }
  }
  paidLabel.dataset.biAmountPaidField = "1";
  paidInput.dataset.biAmountPaid = "1";
  paidInput.inputMode = "decimal";

  let totalInput = card.querySelector<HTMLInputElement>('input[data-bi-total-charged="1"]');
  if (!totalInput) {
    const totalLabel = document.createElement("label");
    totalLabel.className = "biFinanceField";
    totalLabel.dataset.biTotalChargedField = "1";
    totalLabel.appendChild(document.createTextNode("Total charged (ZMW)"));

    totalInput = document.createElement("input");
    totalInput.type = "number";
    totalInput.min = "0.01";
    totalInput.step = "0.01";
    totalInput.inputMode = "decimal";
    totalInput.placeholder = "Full amount charged to the client";
    totalInput.dataset.biTotalCharged = "1";
    totalInput.className = paidInput.className;
    totalInput.style.cssText = paidInput.style.cssText;
    totalInput.value = card.dataset.biTotalChargedValue || "";
    totalInput.addEventListener("input", () => {
      card.dataset.biTotalChargedValue = totalInput?.value || "";
      refreshBalance(card);
    });
    totalLabel.appendChild(totalInput);

    const hint = document.createElement("small");
    hint.className = "biFinanceHint";
    hint.textContent = "Enter the full charge and the payment received now. Verified instalments accumulate automatically. The projected balance assumes this payment is verified; the official invoice deducts verified payments only.";
    totalLabel.appendChild(hint);
    paidLabel.parentElement?.insertBefore(totalLabel, paidLabel);
  }

  let summary = card.querySelector<HTMLElement>("[data-bi-payment-balance]");
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "biFinanceSummary";
    summary.dataset.biPaymentBalance = "1";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    paidLabel.insertAdjacentElement("afterend", summary);
  }

  if (paidInput.dataset.biFinancePaidReady !== "1") {
    paidInput.dataset.biFinancePaidReady = "1";
    paidInput.addEventListener("input", () => refreshBalance(card));
  }

  refreshBalance(card);
}

function enhancePaymentRows(snapshot: any) {
  const article = Array.from(document.querySelectorAll<HTMLElement>("article")).find((item) => item.querySelector("h3")?.textContent?.trim() === "Payments");
  if (!article || !Array.isArray(snapshot?.payments)) return;
  for (const payment of snapshot.payments) {
    const suffix = `MM-${String(payment.id || "").slice(0, 8).toUpperCase()}`;
    const referenceNode = Array.from(article.querySelectorAll<HTMLElement>("div")).find((node) => (node.textContent || "").includes(suffix) && node.children.length === 0);
    const row = referenceNode?.closest<HTMLElement>(".biResponsiveOperationRow") || referenceNode?.parentElement?.parentElement;
    if (!row || row.dataset.biFinanceRowReady === "1") continue;
    const content = row.firstElementChild as HTMLElement | null;
    if (!content) continue;
    const total = Number(payment.total_charged_zmw ?? payment.amount_zmw ?? 0);
    const paid = Number(payment.amount_paid_zmw ?? payment.amount_zmw ?? 0);
    const balance = Number(payment.balance_zmw ?? Math.max(total - paid, 0));
    const detail = document.createElement("div");
    detail.className = "biFinanceRowDetail";
    detail.textContent = `Charged ${money(total)} · This payment ${money(paid)} · Balance ${money(balance)}`;
    content.appendChild(detail);
    row.dataset.biFinanceRowReady = "1";
  }
}

export function BusinessPaymentEnhancer() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || "GET").toUpperCase();
      if (url.endsWith("/api/admin/business") && method === "POST" && typeof init?.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          if (payload?.action === "payment") {
            const card = paymentModal();
            const totalInput = card?.querySelector<HTMLInputElement>('input[data-bi-total-charged="1"]');
            const paidInput = card?.querySelector<HTMLInputElement>('input[data-bi-amount-paid="1"]');
            const total = Number(totalInput?.value || card?.dataset.biTotalChargedValue || 0);
            const paid = Number(paidInput?.value || payload.amountZmw || 0);
            const next = { ...payload, totalChargedZmw: total, amountPaidZmw: paid };
            return nativeFetch("/api/admin/business/finance", { ...init, body: JSON.stringify(next) });
          }
          if (payload?.action === "verify_payment") {
            return nativeFetch("/api/admin/business/finance", { ...init, body: JSON.stringify(payload) });
          }
        } catch {
          // Fall through to the normal Business Intelligence endpoint.
        }
      }
      const response = await nativeFetch(input as RequestInfo | URL, init);
      if (url.endsWith("/api/admin/business") && method === "GET") {
        response.clone().json().then((snapshot) => {
          latestBusinessSnapshot = snapshot;
          window.setTimeout(() => enhancePaymentRows(snapshot), 0);
        }).catch(() => undefined);
      }
      return response;
    };
    window.fetch = wrappedFetch;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhancePaymentModal();
        if (latestBusinessSnapshot) enhancePaymentRows(latestBusinessSnapshot);
      });
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (window.fetch === wrappedFetch) window.fetch = nativeFetch;
    };
  }, []);

  return <style jsx global>{`
    .biFinanceField{display:grid;gap:6px;font-size:13px;font-weight:750}.biFinanceHint{font-size:11px;line-height:1.45;color:#71827e;font-weight:500}.biFinanceSummary{border:1px solid #d9e5e1;background:#f5faf8;border-radius:12px;padding:10px 12px;display:grid;gap:7px}.biFinanceSummary>div{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;color:#5d716b}.biFinanceSummary strong{color:#123f4d}.biFinanceBalance{padding-top:7px;border-top:1px solid #dbe8e4;font-size:13px!important;font-weight:800}.biFinanceBalanceError strong{color:#a13c3c!important}.biFinanceRowDetail{margin-top:5px;font-size:11.5px;line-height:1.4;color:#5d716b;font-weight:650}
    @media(max-width:560px){.biFinanceSummary{padding:10px}.biFinanceSummary>div{font-size:12px}.biFinanceRowDetail{font-size:11px}}
  `}</style>;
}
