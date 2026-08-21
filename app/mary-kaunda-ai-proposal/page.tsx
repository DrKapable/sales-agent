import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./proposal.module.css";

export const metadata: Metadata = {
  title: "Mary Kaunda AI Agent | Institutional Proposal",
  description:
    "A formal proposal for organisations seeking a WhatsApp-based AI customer engagement, sales and support assistant powered by the Mary Kaunda platform from MedMinds Learning Centre.",
};

const trialUrl =
  "https://wa.me/260762402042?text=Hi%20MedMinds%2C%20I%20would%20like%20to%20start%20the%20free%201-month%20Mary%20Kaunda%20AI%20Agent%20trial%20for%20my%20organisation.";

const capabilities = [
  ["24/7", "Always-on customer response", "Mary can answer routine enquiries immediately, reducing missed opportunities outside normal working hours."],
  ["QUALIFY", "Lead qualification", "She collects the next relevant detail, identifies the customer need and helps move serious enquiries toward the correct service or staff member."],
  ["CATALOG", "Controlled product and service information", "Approved products, services, prices, requirements and policies can be managed centrally so responses stay aligned with the institution's current information."],
  ["FOLLOW", "Automated follow-up", "Interested customers who go quiet can be followed up using relevant, low-pressure messages based on the stage of the conversation."],
  ["HANDOVER", "Human escalation", "Complaints, complex cases, exceptional requests and high-value leads can be transferred to designated staff with the conversation context preserved."],
  ["INBOX", "Shared customer inbox", "Staff can review conversation history, reply directly, pause AI responses and resume the agent when appropriate."],
  ["PIPELINE", "Lead and sales pipeline", "Enquiries can be organised by status, priority and assigned staff member, making it easier to see which customers need action."],
  ["FILES", "Documents and client records", "Configured workflows can support quotations, receipts and client documents while maintaining a traceable customer record."],
  ["INSIGHT", "Business visibility", "Management can use captured enquiries, lead activity and conversation data to identify common questions, demand patterns and follow-up priorities."],
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
      "Escalate delayed, damaged or exceptional deliveries",
      "Follow up on quotations and incomplete booking enquiries",
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
      "Capture viewing requests",
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
      "Route cases to the correct department",
      "Reduce repetitive front-desk messaging",
      "Maintain an auditable record of customer conversations",
    ],
  },
];

export default function MaryKaundaProposalPage() {
  return (
    <main className={styles.page}>
      <nav className={`${styles.shell} ${styles.nav}`}>
        <Link href="/" className={styles.brand}>
          <Image src="/medminds-logo.png" alt="MedMinds Learning Centre" width={42} height={42} priority />
          <span>MedMinds Learning Centre</span>
        </Link>
        <div className={styles.navActions}>
          <Link href="/" className={styles.textLink}>Main website</Link>
          <a href={trialUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>Request free trial</a>
        </div>
      </nav>

      <section className={`${styles.shell} ${styles.hero}`}>
        <div>
          <span className={styles.eyebrow}>Formal institutional proposal</span>
          <h1>Meet Mary Kaunda: an AI customer engagement and sales agent for your organisation.</h1>
          <p className={styles.heroLead}>
            Mary Kaunda is a configurable AI assistant designed to help organisations respond to customers, qualify enquiries, explain approved products and services, follow up interested clients and involve human staff when a case requires personal attention.
          </p>
          <div className={styles.heroActions}>
            <a href={trialUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>Start 1-month free trial</a>
            <a href="#pricing" className={styles.secondaryButton}>View pricing</a>
          </div>
          <div className={styles.heroTrust}>
            <span>WhatsApp-ready</span>
            <span>Human handover</span>
            <span>Institution-controlled information</span>
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
            <strong>Mary Kaunda</strong>
            <span>AI customer engagement, sales and support assistant</span>
          </div>
        </div>
      </section>

      <div className={`${styles.shell} ${styles.statStrip}`}>
        <div><strong>24/7 availability</strong><span>Routine enquiries can be handled even when the office is closed.</span></div>
        <div><strong>One shared inbox</strong><span>AI and staff can work from the same customer conversation history.</span></div>
        <div><strong>Structured follow-up</strong><span>Interested customers are less likely to disappear without a next action.</span></div>
        <div><strong>30 days free</strong><span>Institutions can test the workflow before starting the monthly subscription.</span></div>
      </div>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>1. Background and business need</span><h2>Customers expect fast answers. Most teams cannot be online all the time.</h2></div>
          <p>
            Organisations lose potential business when enquiries are answered late, customer questions are repeated across different staff members, promising leads are not followed up, or frontline teams spend too much time responding to routine questions. The challenge is not simply messaging volume. It is maintaining speed, consistency, context and a clear path from enquiry to action.
          </p>
        </div>
        <div className={styles.problemGrid}>
          <article className={styles.card}><span className={styles.cardNumber}>01</span><h3>Missed enquiries</h3><p>Customers who wait too long for a response may contact a competitor before a staff member becomes available.</p></article>
          <article className={styles.card}><span className={styles.cardNumber}>02</span><h3>Inconsistent answers</h3><p>Different staff members may provide different information on pricing, requirements, availability or process.</p></article>
          <article className={styles.card}><span className={styles.cardNumber}>03</span><h3>Weak follow-up</h3><p>High-intent customers can be lost because no one remembers to continue the conversation at the right time.</p></article>
        </div>
        <div className={styles.solutionBand}>
          <strong>Proposed solution</strong>
          <p>
            Deploy Mary Kaunda as the organisation's first-line digital customer assistant. She handles routine communication, records useful lead information, moves the customer toward the next appropriate step and transfers exceptions to a human member of staff. The institution retains control over its approved products, prices, requirements, policies and escalation rules.
          </p>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>2. What Mary Kaunda can do</span><h2>More than a chatbot: a managed customer workflow.</h2></div>
          <p>
            Mary is designed around the full enquiry cycle: respond, understand, qualify, guide, follow up and hand over. This makes the system useful for institutions where WhatsApp and online enquiries are an important source of customers.
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
          <span className={styles.kicker}>3. How the conversation works</span>
          <h2>Mary does not need to overwhelm a customer with information.</h2>
          <p>
            The current Mary Kaunda workflow is designed to identify what the customer wants, ask only the next useful question, provide approved information and use a clear next step. If a customer has already provided information, the conversation can continue without repeatedly asking the same questions.
          </p>
          <p>
            For institutions, the same approach can be adapted to the organisation's own customer journey, such as a loan enquiry, delivery booking, clothing order, property lead or training application.
          </p>
        </div>
        <div className={styles.chatMock} aria-label="Illustrative Mary Kaunda customer conversation">
          <div className={styles.chatHeader}><span className={styles.avatar}>MK</span><div><strong>Mary Kaunda</strong><span>Customer assistant • online</span></div></div>
          <div className={styles.chatBody}>
            <div className={styles.bubbleClient}>Hi, I want to know about your delivery service.</div>
            <div className={styles.bubbleMary}>Certainly. Is this a local delivery within your city, or an inter-city delivery?</div>
            <div className={styles.bubbleClient}>Local. I need a parcel picked up this afternoon.</div>
            <div className={styles.bubbleMary}>For a local pickup, I can help organise the enquiry. What area should the parcel be collected from?</div>
            <div className={styles.bubbleClient}>Town centre.</div>
            <div className={styles.bubbleMary}>Thank you. I have the pickup area. I can now guide you on the approved service option or connect you with the delivery team if the request needs confirmation.</div>
          </div>
          <div className={styles.chatFooter}>Illustrative conversation. Actual responses are configured to the institution's approved information and workflow.</div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>4. Sector applications</span><h2>One platform, adapted to different customer journeys.</h2></div>
          <p>
            The agent is most useful where customers repeatedly ask similar questions, where enquiries need qualification before staff involvement, and where a delayed response can mean a lost sale. The examples below show how the same core system can be configured for different organisations.
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
          <div><span className={styles.kicker}>5. Expected institutional benefits</span><h2>Designed to improve responsiveness without removing human oversight.</h2></div>
          <p>
            The value is operational as well as commercial. Mary can absorb repetitive first-line communication while staff concentrate on decisions, exceptions, service delivery and high-value customer interactions.
          </p>
        </div>
        <div className={styles.benefitGrid}>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>SPEED</span><h3>Faster first response</h3><p>Customers can receive immediate acknowledgement and useful guidance instead of waiting for a staff member to become available.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>CONSISTENCY</span><h3>Approved information</h3><p>The agent can be restricted to institution-approved products, prices, requirements and escalation rules.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>CONVERSION</span><h3>Better lead progression</h3><p>Enquiries are moved toward a clear next step rather than ending after a generic answer.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>EFFICIENCY</span><h3>Reduced repetitive work</h3><p>Frontline teams spend less time repeating routine information and more time on cases that require human judgement.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>FOLLOW-UP</span><h3>Fewer forgotten leads</h3><p>Structured reminders and follow-up workflows help the organisation return to interested customers at the appropriate stage.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>CONTEXT</span><h3>Continuous conversations</h3><p>Conversation history is preserved so staff can understand what the customer has already asked and what has already been explained.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>CONTROL</span><h3>Human takeover</h3><p>Staff can intervene in sensitive, complex or high-value conversations and return control to Mary when appropriate.</p></article>
          <article className={styles.benefitCard}><span className={styles.benefitMetric}>VISIBILITY</span><h3>Management insight</h3><p>Captured enquiries can help identify recurring customer questions, lead volumes, follow-up needs and service demand.</p></article>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section}`}>
        <div className={styles.screenshotBand}>
          <div className={styles.screenshotFrame}>
            <Image src="/pwa-screenshot-mobile.png" alt="Mobile view of the current MedMinds Mary Kaunda platform" fill sizes="(max-width: 980px) 100vw, 50vw" />
          </div>
          <div className={styles.screenshotCopy}>
            <span className={styles.kicker}>6. Existing working implementation</span>
            <h3>Mary Kaunda is already implemented within the MedMinds customer workflow.</h3>
            <p>
              The current platform includes a public customer chat experience, WhatsApp integration, lead handling, conversation history, staff takeover, follow-up tools and an administrator environment. This provides a practical base that can be adapted to another institution's brand, services and operating rules.
            </p>
            <div className={styles.screenshotNote}>
              The image shows the current mobile platform experience. Institution-specific deployments can use the client's own identity, approved content and customer journey.
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.section} ${styles.implementation}`}>
        <div className={styles.splitCopy}>
          <span className={styles.kicker}>7. Proposed implementation</span>
          <h2>A controlled onboarding process before the live trial.</h2>
          <p>
            The system should not be released with generic answers. Each institution first defines what Mary is allowed to say, which services she supports, what information she should collect and which cases must be referred to staff.
          </p>
          <ol className={styles.steps}>
            <li><div><strong>Business discovery</strong><span>Identify services, common enquiries, customer journey, escalation contacts and prohibited responses.</span></div></li>
            <li><div><strong>Knowledge configuration</strong><span>Add the institution's approved products, services, prices, requirements, policies and frequently asked questions.</span></div></li>
            <li><div><strong>Brand and channel setup</strong><span>Configure the institution's name, agent identity, WhatsApp or website channel and staff access.</span></div></li>
            <li><div><strong>Testing and approval</strong><span>Test common enquiries, edge cases, handover behaviour and customer tone before public use.</span></div></li>
            <li><div><strong>One-month free trial</strong><span>Run the solution in a real operating environment and review customer and staff experience before subscription.</span></div></li>
          </ol>
        </div>
        <aside className={styles.governanceBox}>
          <h3>Built around controlled automation</h3>
          <p>Mary is intended to support staff, not silently replace institutional judgement. Important safeguards can include:</p>
          <ul className={styles.featureList}>
            <li>Approved catalogue and policy information rather than unrestricted claims</li>
            <li>Human escalation for complaints, disputes, exceptions and sensitive decisions</li>
            <li>Conversation records that allow staff to review what the customer was told</li>
            <li>Access-controlled administration for institutional staff</li>
            <li>Configurable rules on what the agent may or may not handle</li>
            <li>For loan companies, Mary can support enquiry and pre-qualification while formal credit decisions remain with the institution's authorised process</li>
          </ul>
        </aside>
      </section>

      <section id="pricing" className={`${styles.shell} ${styles.section}`}>
        <div className={styles.pricingPanel}>
          <div>
            <span className={styles.kicker}>8. Commercial proposal</span>
            <h2>Test Mary for one full month before paying a subscription.</h2>
            <p>
              The free trial allows the institution to evaluate response quality, staff workflow, customer acceptance and practical usefulness in its own environment. After the trial, the standard Mary Kaunda subscription is USD 20 per month.
            </p>
          </div>
          <div className={styles.priceCard}>
            <span className={styles.trial}>FIRST MONTH FREE</span>
            <div className={styles.price}>$20 <small>/ month thereafter</small></div>
            <ul>
              <li>Institution-branded Mary Kaunda agent</li>
              <li>Approved service and FAQ configuration</li>
              <li>Customer conversation handling</li>
              <li>Lead capture and follow-up workflow</li>
              <li>Human handover and staff inbox</li>
              <li>Ongoing standard platform access</li>
            </ul>
            <div className={styles.priceFootnote}>Standard subscription pricing shown. Third-party messaging charges or institution-specific external system integrations, where required, may be subject to the relevant provider or a separate agreed scope.</div>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.finalCta}`}>
        <div>
          <span className={styles.kicker}>9. Recommendation</span>
          <h2>Start with one customer-facing workflow and measure the result.</h2>
          <p>
            We recommend beginning with the institution's highest-volume enquiry channel, configuring Mary around a limited set of approved services, and using the one-month trial to evaluate response speed, staff workload, lead progression and customer feedback. Expansion can follow only after the initial workflow is proven useful.
          </p>
        </div>
        <a href={trialUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>Request free trial</a>
      </section>

      <footer className={`${styles.shell} ${styles.footer}`}>
        <span>Proposal by MedMinds Learning Centre • Mary Kaunda AI Agent</span>
        <a href={trialUrl} target="_blank" rel="noreferrer">Discuss institutional deployment →</a>
      </footer>
    </main>
  );
}
