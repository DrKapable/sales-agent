import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./proposal.module.css";

export const metadata: Metadata = {
  title: "Mary Kaunda AI Agent | Institutional Proposal",
  description:
    "A formal proposal for organisations seeking a configurable AI customer engagement, sales, document and support assistant powered by the Mary Kaunda platform from MedMinds Learning Centre.",
};

const trialUrl =
  "https://wa.me/260762402042?text=Hi%20MedMinds%2C%20I%20would%20like%20to%20start%20the%20free%201-month%20Mary%20Kaunda%20AI%20Agent%20trial%20for%20my%20organisation.";

const actualTasks = [
  {
    label: "RESPOND",
    title: "Answer routine customer enquiries",
    text: "Mary can respond to approved questions on services, products, requirements, prices, operating hours and next steps at any time of day.",
  },
  {
    label: "REVIEW",
    title: "Review enquiry details and submitted information",
    text: "Mary can use information already supplied by a client, including configured document or attachment workflows, to organise the next appropriate action without repeatedly asking the same questions.",
  },
  {
    label: "QUALIFY",
    title: "Qualify and organise leads",
    text: "She can identify the customer's need, collect the next relevant detail, assign a lead stage or priority and preserve the conversation for staff follow-up.",
  },
  {
    label: "QUOTE",
    title: "Prepare and send quotations",
    text: "Configured commercial workflows can generate a formal PDF quotation and deliver it to the customer through WhatsApp once the required information is available.",
  },
  {
    label: "INVOICE",
    title: "Generate and send invoices",
    text: "Mary's platform can produce PDF invoices with the relevant amount and balance information and send them through the customer conversation workflow.",
  },
  {
    label: "RECEIPT",
    title: "Issue branded payment receipts",
    text: "After an authorised payment has been verified, the platform can generate and send a branded PDF receipt showing the amount paid and any remaining balance.",
  },
  {
    label: "REMIND",
    title: "Create reminders and follow-up actions",
    text: "Mary can schedule follow-up tasks around interested or payment-pending clients and help staff see which conversations are overdue, due today or upcoming.",
  },
  {
    label: "FOLLOW",
    title: "Continue conversations without restarting",
    text: "Conversation history and captured lead information allow Mary or staff to continue from the customer's previous stage instead of treating every message as a new enquiry.",
  },
  {
    label: "FILES",
    title: "Send approved client documents",
    text: "The platform supports customer documents within the conversation record, including configured quotations, invoices, receipts and other institution-approved documents.",
  },
  {
    label: "PAYMENT",
    title: "Track payment and balance context",
    text: "Configured payment records can preserve the total charge, amount paid, remaining balance and verification state for use in the appropriate customer workflow.",
  },
  {
    label: "HANDOVER",
    title: "Escalate to a human with context",
    text: "Complaints, disputes, sensitive decisions, exceptions and high-value leads can be handed to authorised staff without losing the conversation history.",
  },
  {
    label: "INSIGHT",
    title: "Give management a clearer customer pipeline",
    text: "The admin environment can organise leads, messages, follow-ups, priorities and customer records so management can see where attention is required.",
  },
];

const capabilities = [
  ["24/7", "Always-on first response", "Routine customer questions can receive useful guidance even outside normal working hours."],
  ["2500", "High-volume capacity target", "The platform can be configured toward a target of up to 2,500 simultaneous client conversations, subject to workflow complexity, messaging-provider limits, integrations and deployment capacity."],
  ["CONTROL", "Institution-controlled knowledge", "Products, services, prices, requirements, policies and escalation rules can be centrally approved so Mary operates within the institution's defined boundaries."],
  ["HUMAN", "Human oversight by design", "Mary supports staff rather than replacing authorised judgement. Sensitive or regulated decisions remain with the institution's designated personnel."],
  ["MEMORY", "Conversation continuity", "Customer history and lead context reduce repetitive questioning and make staff takeover more efficient."],
  ["DASH", "Operational visibility", "A shared management environment helps teams review conversations, follow-ups, documents, lead status and customer priorities."],
];

const industries = [
  {
    label: "Microfinance & loan companies",
    title: "Turn loan enquiries into organised, qualified applications.",
    text: "Mary can explain approved loan products, eligibility requirements, application steps and required documents, while collecting basic enquiry details before staff review.",
    bullets: [
      "Pre-qualify enquiries without making the credit decision",
      "Explain repayment options and approved product requirements",
      "Collect applicant contact details and preferred loan type",
      "Send approved quotations, invoices, reminders or receipts where relevant",
      "Escalate sensitive, disputed or complex cases to loan officers",
      "Provide application-status support when connected to an approved system",
    ],
  },
  {
    label: "Delivery & logistics companies",
    title: "Give customers fast answers from booking to delivery.",
    text: "Mary can respond to delivery enquiries, collect pickup and destination details, explain service options and route exceptions to an operations team.",
    bullets: [
      "Capture delivery requests and customer details",
      "Explain service areas, operating hours and approved fees",
      "Support parcel-status queries when integrated with tracking data",
      "Generate or send approved quotations and invoices",
      "Escalate delayed, damaged or exceptional deliveries",
      "Follow up on incomplete booking enquiries",
    ],
  },
  {
    label: "Clothing, retail & e-commerce",
    title: "Convert product questions into purchase-ready conversations.",
    text: "Mary can help customers identify suitable products, answer routine questions and keep enquiries active until a customer is ready to buy or needs human assistance.",
    bullets: [
      "Recommend products using approved catalogue information",
      "Answer questions about sizes, colours, prices and promotions",
      "Check stock when connected to an approved inventory source",
      "Capture order interest and customer contact details",
      "Send payment documents and receipts through configured workflows",
      "Follow up on high-intent enquiries that did not complete a purchase",
    ],
  },
  {
    label: "Real estate & property services",
    title: "Respond to property leads before they move to another agent.",
    text: "Mary can identify budget, location and property preferences, then recommend approved listings or route the lead to the appropriate agent.",
    bullets: [
      "Qualify buyers and tenants by need and budget",
      "Share approved listing information and viewing requirements",
      "Capture viewing requests and reminders",
      "Send approved quotations or invoices where applicable",
      "Assign serious enquiries to property consultants",
      "Maintain conversation history for follow-up",
    ],
  },
  {
    label: "Education & training institutions",
    title: "Reduce repetitive admissions and programme enquiries.",
    text: "Mary can explain programmes, fees, entry requirements, application steps and deadlines using institution-approved information.",
    bullets: [
      "Answer admissions and programme FAQs",
      "Guide applicants through the next required step",
      "Capture prospective student details",
      "Send approved fee documents, reminders and receipts",
      "Escalate special admission cases to staff",
      "Follow up with applicants who have not completed the process",
    ],
  },
  {
    label: "Clinics, pharmacies & service businesses",
    title: "Keep routine customer service moving while staff focus on complex work.",
    text: "Mary can manage non-clinical or non-specialist enquiries, explain services, opening times and administrative requirements, and transfer sensitive matters to staff.",
    bullets: [
      "Answer approved service and operating-hour questions",
      "Capture booking or service enquiries",
      "Send administrative reminders or approved documents",
      "Route cases to the correct department",
      "Reduce repetitive front-desk messaging",
      "Maintain an auditable record of customer conversations",
    ],
  },
];

export default function MaryKaundaProposalPage() {
  return (
    <main className={styles.page}>
      <div className={styles.ambientLayer} aria-hidden="true">
        <span className={`${styles.floatChip} ${styles.floatOne}`}>Quotation sent ✓</span>
        <span className={`${styles.floatChip} ${styles.floatTwo}`}>24/7 response</span>
        <span className={`${styles.floatChip} ${styles.floatThree}`}>Invoice ready</span>
        <span className={`${styles.floatChip} ${styles.floatFour}`}>Follow-up due</span>
        <span className={`${styles.floatChip} ${styles.floatFive}`}>Payment received ✓</span>
        <span className={`${styles.floatChip} ${styles.floatSix}`}>Human handover</span>
        <span className={`${styles.floatChip} ${styles.floatSeven}`}>Up to 2,500*</span>
      </div>

      <nav className={`${styles.shell} ${styles.nav}`}>
        <Link href="/" className={styles.brand}>
          <Image src="/medminds-logo.png" alt="MedMinds Learning Centre" width={42} height={42} priority />
          <span>MedMinds Learning Centre</span>
        </Link>
        <div className={styles.navLinks}>
          <a href="#tasks">What Mary does</a>
          <a href="#sectors">Sectors</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className={styles.navActions}>
          <a href={trialUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>Request free trial</a>
        </div>
      </nav>

      <section className={`${styles.shell} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Institutional AI customer service proposal</span>
          <h1>Respond faster. Follow up better. Serve more customers.</h1>
          <p className={styles.heroLead}>
            Mary Kaunda is a configurable AI customer engagement agent that can answer enquiries, qualify leads, organise follow-ups, prepare customer documents and involve human staff when a case requires authorised judgement.
          </p>
          <div className={styles.heroActions}>
            <a href={trialUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>Start 1-month free trial</a>
            <a href="#tasks" className={styles.secondaryButton}>See what Mary can do</a>
          </div>
          <div className={styles.heroTrust}>
            <span>WhatsApp-ready</span>
            <span>Human handover</span>
            <span>Institution-controlled information</span>
          </div>
          <div className={styles.capacityCallout}>
            <strong>Capacity target: up to 2,500 client conversations at a time*</strong>
            <span>*Subject to workflow complexity, external integrations, messaging-provider limits and deployment capacity. Load testing should precede any contractual service-level commitment.</span>
          </div>
        </div>
        <div className={styles.heroImageWrap}>
          <Image
            src="/medminds-hero-mary-kaunda-hq.webp"
            alt="Mary Kaunda, MedMinds AI customer engagement and sales assistant"
            fill
            priority
            sizes="(max-width: 980px) 100vw, 46vw"
          />
          <div className={styles.heroBadge}>
            <span className={styles.onlineDot} />
            <div><strong>Mary Kaunda</strong><span>AI customer engagement, sales and support assistant</span></div>
          </div>
        </div>
      </section>

      <div className={`${styles.shell} ${styles.statStrip}`}>
        <div><strong>24/7</strong><span>Always-on routine customer engagement.</span></div>
        <div><strong>Up to 2,500*</strong><span>Configurable high-volume client capacity target.</span></div>
        <div><strong>Documents</strong><span>Quotations, invoices, receipts and approved client files.</span></div>
        <div><strong>30 days free</strong><span>Test the workflow before the USD 20 monthly subscription.</span></div>
      </div>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>1. The operational problem</span><h2>Every unanswered message is a customer waiting for a decision.</h2></div>
          <p>
            Organisations lose potential business when enquiries are answered late, the same questions consume staff time, customers receive inconsistent information, or promising leads are forgotten after the first conversation. The practical requirement is a system that can respond quickly while preserving context, control and human oversight.
          </p>
        </div>
        <div className={styles.problemGrid}>
          <article className={styles.card}><span className={styles.cardNumber}>01</span><h3>Missed enquiries</h3><p>Customers who wait too long can leave before a staff member becomes available.</p></article>
          <article className={styles.card}><span className={styles.cardNumber}>02</span><h3>Administrative repetition</h3><p>Teams repeatedly explain prices, requirements, payment steps, order status and routine policies.</p></article>
          <article className={styles.card}><span className={styles.cardNumber}>03</span><h3>Broken follow-up</h3><p>Quotes, unpaid balances and high-intent enquiries can be lost when there is no structured next action.</p></article>
        </div>
        <div className={styles.solutionBand}>
          <strong>Proposed solution</strong>
          <p>
            Deploy Mary Kaunda as the organisation&apos;s first-line digital customer assistant. She handles approved routine communication, records useful lead information, supports commercial-document workflows, schedules follow-up and transfers exceptions to the appropriate human staff member. The institution retains control over products, prices, requirements, policies and decisions that require human authority.
          </p>
        </div>
      </section>

      <section id="tasks" className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>2. Actual tasks Mary can perform</span><h2>Practical work, not just conversational replies.</h2></div>
          <p>
            The current platform already contains customer messaging, lead management, document, payment-context, follow-up and human-handover workflows. Institution-specific deployments can enable the functions relevant to that organisation and keep sensitive approvals under authorised human control.
          </p>
        </div>
        <div className={styles.taskGrid}>
          {actualTasks.map((task) => (
            <article key={task.title} className={styles.taskCard}>
              <span className={styles.taskLabel}>{task.label}</span>
              <h3>{task.title}</h3>
              <p>{task.text}</p>
            </article>
          ))}
        </div>
        <div className={styles.workflowLine}>
          <span>Enquiry</span><b>→</b><span>Qualification</span><b>→</b><span>Quotation / Invoice</span><b>→</b><span>Follow-up</span><b>→</b><span>Verified Receipt</span><b>→</b><span>Human Handover when needed</span>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>3. Operational capability</span><h2>Built for scale without removing institutional control.</h2></div>
          <p>
            Mary can absorb repetitive first-line communication while staff retain authority over sensitive decisions, approvals, disputes and exceptional cases. This makes the system suitable for organisations that want speed without giving an automated agent unrestricted control.
          </p>
        </div>
        <div className={styles.capabilityGrid}>
          {capabilities.map(([icon, title, text]) => (
            <article key={title} className={styles.capabilityCard}>
              <span className={styles.capabilityIcon}>{icon}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section} ${styles.demoSection}`}>
        <div className={styles.splitCopy}>
          <span className={styles.kicker}>4. How the conversation works</span>
          <h2>One useful next step at a time.</h2>
          <p>
            Mary is designed to identify what the customer wants, use information already provided, answer the immediate question and move the conversation toward the next appropriate action. She does not need to overwhelm a client with a long menu of information.
          </p>
          <p>
            The same logic can be configured around a loan enquiry, delivery booking, retail order, property lead, admission enquiry, invoice follow-up or another customer journey.
          </p>
        </div>
        <div className={styles.chatMock} aria-label="Illustrative Mary Kaunda commercial conversation">
          <div className={styles.chatHeader}><span className={styles.avatar}>MK</span><div><strong>Mary Kaunda</strong><span>Customer assistant • online</span></div></div>
          <div className={styles.chatBody}>
            <div className={styles.bubbleClient}>Please send me the quotation we discussed.</div>
            <div className={styles.bubbleMary}>I have your service details. I can prepare the approved quotation for this request now.</div>
            <div className={styles.systemBubble}>Quotation prepared • PDF document</div>
            <div className={styles.bubbleMary}>Your quotation is ready and has been sent here. Once the next step is confirmed, I can keep this conversation organised for follow-up.</div>
            <div className={styles.bubbleClient}>Thank you. Remind me tomorrow.</div>
            <div className={styles.bubbleMary}>Noted. I&apos;ll keep the follow-up action attached to this enquiry so the team can continue from here.</div>
          </div>
          <div className={styles.chatFooter}>Illustrative workflow. Document, reminder and payment actions remain subject to the institution&apos;s approved configuration and channel rules.</div>
        </div>
      </section>

      <section id="sectors" className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>5. Sector applications</span><h2>One platform, configured around different customer journeys.</h2></div>
          <p>
            The strongest use cases are organisations with repeated questions, high enquiry volumes, document-heavy customer processes, payment follow-up or cases that need qualification before staff involvement.
          </p>
        </div>
        <div className={styles.industryGrid}>
          {industries.map((industry) => (
            <article key={industry.label} className={styles.industryCard}>
              <span className={styles.industryLabel}>{industry.label}</span>
              <h3>{industry.title}</h3>
              <p>{industry.text}</p>
              <ul>{industry.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>6. Expected institutional benefits</span><h2>More responsive service with a clearer customer pipeline.</h2></div>
          <p>
            The value is operational as well as commercial. Mary can reduce repetitive frontline work while helping the organisation keep customer enquiries, documents, payment context and follow-up activity connected.
          </p>
        </div>
        <div className={styles.benefitGrid}>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>SPEED</span><h3>Faster first response</h3><p>Customers can receive useful guidance instead of waiting for a staff member to become available.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>CONSISTENCY</span><h3>Approved information</h3><p>The agent can be restricted to institution-approved products, prices, requirements and escalation rules.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>DOCUMENTS</span><h3>Less document friction</h3><p>Configured quotations, invoices, receipts and customer documents stay connected to the relevant conversation.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>EFFICIENCY</span><h3>Reduced repetitive work</h3><p>Staff spend less time repeating routine information and more time on work requiring human judgement.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>FOLLOW-UP</span><h3>Fewer forgotten leads</h3><p>Scheduled follow-up tasks make overdue, due-today and upcoming customer actions easier to see.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>CONTEXT</span><h3>Continuous conversations</h3><p>Conversation history reduces repeated questions and helps staff understand what the customer was already told.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>CONTROL</span><h3>Human takeover</h3><p>Staff can intervene in sensitive, complex or high-value conversations and resume automation when appropriate.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>SCALE</span><h3>High-volume design target</h3><p>The architecture can be configured toward a target of up to 2,500 concurrent client conversations, with capacity validated for the institution&apos;s specific workload.</p></article>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.screenshotBand}>
          <div className={styles.screenshotFrame}>
            <Image src="/pwa-screenshot-mobile.png" alt="Mobile view of the current MedMinds Mary Kaunda platform" fill sizes="(max-width: 980px) 100vw, 50vw" />
          </div>
          <div className={styles.screenshotCopy}>
            <span className={styles.kicker}>7. Existing working implementation</span>
            <h3>Mary Kaunda already operates inside the MedMinds customer workflow.</h3>
            <p>
              The current platform includes public chat, WhatsApp integration, lead handling, conversation history, staff takeover, customer documents, commercial-document delivery, payment receipts, follow-up tools and an administrator environment. This provides a practical base for deployment under another institution&apos;s brand, products and operating rules.
            </p>
            <div className={styles.screenshotNote}>
              The image shows the current mobile platform experience. Institution-specific deployments can use the client&apos;s own identity, approved content, escalation contacts and customer journey.
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section} ${styles.implementation}`}>
        <div className={styles.splitCopy}>
          <span className={styles.kicker}>8. Proposed implementation</span>
          <h2>A controlled onboarding process before the live trial.</h2>
          <p>
            The system should not be released with generic answers. Each institution first defines what Mary may say, which tasks she may execute, what information she should collect and which cases must be referred to staff.
          </p>
          <ol className={styles.steps}>
            <li><div><strong>Business discovery</strong><span>Identify services, recurring enquiries, customer journey, document needs, escalation contacts and prohibited responses.</span></div></li>
            <li><div><strong>Knowledge and workflow configuration</strong><span>Add approved products, services, prices, requirements, FAQs, document rules and follow-up logic.</span></div></li>
            <li><div><strong>Brand and channel setup</strong><span>Configure the institution&apos;s identity, WhatsApp or website channel and staff access.</span></div></li>
            <li><div><strong>Testing and capacity validation</strong><span>Test common enquiries, document delivery, edge cases, human handover and expected message volumes before public use.</span></div></li>
            <li><div><strong>One-month free trial</strong><span>Run the solution in a real operating environment and review customer and staff experience before subscription.</span></div></li>
          </ol>
        </div>
        <aside className={styles.governanceBox}>
          <h3>Human control remains explicit</h3>
          <p>Mary supports staff; she should not silently assume authority that belongs to the institution. Safeguards can include:</p>
          <ul className={styles.featureList}>
            <li>Approved catalogue, pricing and policy information rather than unrestricted claims</li>
            <li>Verified-payment requirement before an official receipt is issued</li>
            <li>Human escalation for complaints, disputes, exceptions and sensitive decisions</li>
            <li>Conversation records that allow staff to review what the customer was told</li>
            <li>Access-controlled administration for institutional staff</li>
            <li>Configurable rules on which documents and actions Mary may execute</li>
            <li>For loan companies, Mary can support enquiry and pre-qualification while formal credit decisions remain with the institution&apos;s authorised process</li>
          </ul>
        </aside>
      </section>

      <section id="pricing" className={`${styles.shell} ${styles.section}`}>
        <div className={styles.pricingPanel}>
          <div>
            <span className={styles.kicker}>9. Commercial proposal</span>
            <h2>One month free. Then USD 20 per month.</h2>
            <p>
              The free trial allows the institution to evaluate response quality, document workflows, staff handover, customer acceptance and practical usefulness in its own environment before paying the standard subscription.
            </p>
          </div>
          <div className={styles.priceCard}>
            <span className={styles.trial}>FIRST MONTH FREE</span>
            <div className={styles.price}>$20 <small>/ month thereafter</small></div>
            <ul>
              <li>Institution-branded Mary Kaunda agent</li>
              <li>Approved service and FAQ configuration</li>
              <li>Customer conversation and lead handling</li>
              <li>Quotation, invoice and receipt workflows where configured</li>
              <li>Follow-up task and reminder workflow</li>
              <li>Human handover and staff inbox</li>
              <li>Ongoing standard platform access</li>
            </ul>
            <a href={trialUrl} target="_blank" rel="noreferrer" className={styles.priceButton}>Request the free trial</a>
            <div className={styles.priceFootnote}>Third-party messaging charges, external-system integrations, custom enterprise work and dedicated capacity requirements may be subject to provider costs or a separately agreed scope.</div>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.finalCta}`}>
        <div>
          <span className={styles.kicker}>10. Recommendation</span>
          <h2>Start with one high-volume workflow and prove the value.</h2>
          <p>
            Begin with the institution&apos;s busiest customer journey, configure Mary around a controlled set of approved actions, and use the one-month trial to measure response speed, staff workload, follow-up completion, customer experience and conversion. Expand only after the first workflow demonstrates clear operational value.
          </p>
        </div>
        <a href={trialUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>Start free trial</a>
      </section>

      <footer className={`${styles.shell} ${styles.footer}`}>
        <span>Proposal by MedMinds Learning Centre • Mary Kaunda AI Agent</span>
        <a href={trialUrl} target="_blank" rel="noreferrer">Discuss institutional deployment →</a>
      </footer>

      <div className={styles.mobileTrialBar}>
        <div><strong>1 month free</strong><span>Then $20/month</span></div>
        <a href={trialUrl} target="_blank" rel="noreferrer">Start trial</a>
      </div>
    </main>
  );
}
