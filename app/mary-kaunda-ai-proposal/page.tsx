import type { Metadata } from "next";
import ProposalSlides from "./ProposalSlides";

export const metadata: Metadata = {
  title: "Mary Kaunda AI Agent | 15-Minute Institutional Proposal",
  description:
    "A slide-view proposal for institutions considering Mary Kaunda AI Agent for customer service, sales, reminders, quotations, invoices and follow-up.",
};

export default function MaryKaundaProposalPage() {
  return <ProposalSlides />;
}
