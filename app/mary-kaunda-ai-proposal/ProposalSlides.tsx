"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import styles from "./proposal.module.css";

const onboardingUrl = "/mary-kaunda-ai-proposal/onboarding";
const testMaryUrl =
  "https://wa.me/260762402042?text=Hi%20Mary%2C%20I%20would%20like%20to%20test%20the%20Mary%20Kaunda%20AI%20assistant%20in%20real%20time.";

const slides = [
  {
    eyebrow: "15-minute institutional proposal",
    title: "Mary Kaunda AI Agent",
    subtitle:
      "A practical AI customer-service, sales and follow-up assistant for loan companies, delivery companies, clothing businesses, schools, clinics and service organisations.",
    time: "1 min",
    visual: "hero",
    bullets: ["Free 1-month trial", "Then USD 20 per month", "Built for WhatsApp and web-based customer handling"],
  },
  {
    eyebrow: "The business problem",
    title: "Customers do not wait for slow replies.",
    subtitle:
      "Many institutions are losing potential customers because enquiries are answered late, follow-ups are missed, and routine questions keep consuming staff time.",
    time: "1 min",
    visual: "problem",
    bullets: ["Delayed replies reduce trust", "Staff repeat the same information daily", "Quotations, payments and reminders are not always connected"],
  },
  {
    eyebrow: "Why this matters",
    title: "The real cost is not software. It is lost opportunity.",
    subtitle:
      "A lead that is not answered, qualified and followed up can easily become revenue for another company.",
    time: "1 min",
    visual: "cost",
    bullets: ["Missed customers", "Poor customer experience", "No clear record of who needs attention", "Unverified payments and delayed receipts"],
  },
  {
    eyebrow: "The proposed solution",
    title: "Mary becomes your first-line digital customer assistant.",
    subtitle:
      "Mary responds quickly, collects useful information, keeps the conversation organised and involves staff when human judgement is needed.",
    time: "1 min",
    visual: "assistant",
    bullets: ["Answers routine enquiries", "Qualifies leads", "Supports quotations, invoices, receipts and reminders", "Escalates sensitive cases to staff"],
  },
  {
    eyebrow: "Actual tasks Mary can do",
    title: "Mary is not just a chatbot.",
    subtitle:
      "She can support real customer-service and commercial workflows when configured with the institution's approved information.",
    time: "1.5 min",
    visual: "tasks",
    bullets: ["Review customer details and submitted information", "Send quotations and invoices", "Send payment reminders", "Send receipts after authorised verification", "Schedule follow-ups", "Maintain conversation history"],
  },
  {
    eyebrow: "Workflow demonstration",
    title: "One customer journey, clearly controlled.",
    subtitle:
      "Mary moves each customer from enquiry to next action without losing context.",
    time: "1 min",
    visual: "workflow",
    bullets: ["Enquiry", "Qualification", "Quotation or invoice", "Payment proof review", "Verified receipt", "Follow-up or human handover"],
  },
  {
    eyebrow: "Loan and microfinance use case",
    title: "Mary can organise loan enquiries before staff review.",
    subtitle:
      "She can explain approved products, collect basic details, list required documents and route qualified leads to loan officers. Formal credit decisions remain with authorised staff.",
    time: "1.5 min",
    visual: "finance",
    bullets: ["Pre-qualification support", "Document requirement guidance", "Repayment and product information", "Application-status support if integrated", "Human approval for credit decisions"],
  },
  {
    eyebrow: "Delivery, logistics and retail use case",
    title: "Mary can turn enquiries into organised orders.",
    subtitle:
      "For delivery and retail businesses, Mary can capture customer needs, explain approved prices, send quotations and follow up on incomplete orders.",
    time: "1 min",
    visual: "retail",
    bullets: ["Pickup and delivery details", "Product, size and colour questions", "Stock or tracking support where integrated", "Invoice and receipt workflows", "Follow-up on interested customers"],
  },
  {
    eyebrow: "Management visibility",
    title: "The institution sees what needs attention.",
    subtitle:
      "Mary's value is also managerial. Leads, payments, reminders, documents and human handovers become easier to supervise.",
    time: "1 min",
    visual: "dashboard",
    bullets: ["Lead pipeline", "Hot and stale conversations", "Quotation and payment follow-up", "Human takeover", "Management intelligence"],
  },
  {
    eyebrow: "Scale with control",
    title: "Designed for high-volume customer engagement.",
    subtitle:
      "Mary can be configured toward a target capacity of up to 2,500 client conversations at a time, subject to workflow complexity, integrations, messaging-provider limits and load testing.",
    time: "1 min",
    visual: "scale",
    bullets: ["Up to 2,500 as a capacity target", "24/7 routine engagement", "Human oversight retained", "Institution-controlled responses"],
  },
  {
    eyebrow: "Implementation plan",
    title: "Start controlled. Prove value. Then expand.",
    subtitle:
      "The safest deployment starts with one high-volume workflow, then expands after the trial demonstrates value.",
    time: "1.5 min",
    visual: "implementation",
    bullets: ["Business discovery", "Approved knowledge setup", "Brand and WhatsApp configuration", "Testing and staff review", "One-month free trial"],
  },
  {
    eyebrow: "Commercial proposal",
    title: "One month free. Then USD 20 per month.",
    subtitle:
      "This pricing makes the offer easy to test, low-risk for institutions and affordable for small to medium businesses.",
    time: "1 min",
    visual: "pricing",
    bullets: ["No cost for the first month", "USD 20/month after trial", "Customer engagement, follow-ups and admin workflow included", "Custom integrations can be scoped separately"],
  },
  {
    eyebrow: "Closing recommendation",
    title: "Deploy Mary where customer messages are currently being lost.",
    subtitle:
      "The first client should not be asked to believe in AI. They should be asked to test a practical customer-handling system for one month and judge the results.",
    time: "1 min",
    visual: "close",
    bullets: ["Choose one workflow", "Run the free trial", "Measure response speed, follow-up and conversion", "Continue only if the value is clear"],
  },
];

function Visual({ type }: { type: string }) {
  if (type === "hero") {
    return (
      <div className={styles.heroVisual}>
        <Image src="/medminds-logo.png" alt="MedMinds Learning Centre" width={190} height={90} priority />
        <div className={styles.heroVisualText}>
          <span>AI employee</span>
          <strong>Mary Kaunda</strong>
          <p>Customer support • sales follow-up • document workflow</p>
        </div>
      </div>
    );
  }

  if (type === "pricing") {
    return (
      <div className={styles.priceBox}>
        <span>FREE TRIAL</span>
        <strong>30 days</strong>
        <p>Then USD 20/month</p>
        <a href={onboardingUrl}>Request onboarding</a>
      </div>
    );
  }

  if (type === "workflow") {
    return (
      <div className={styles.flowDiagram}>
        {slides[5].bullets.map((item) => (
          <div key={item}>{item}</div>
        ))}
      </div>
    );
  }

  if (type === "dashboard") {
    return (
      <div className={styles.dashboardMock}>
        <div><strong>83</strong><span>Leads</span></div>
        <div><strong>8</strong><span>Hot leads</span></div>
        <div><strong>K28,460</strong><span>Quoted value</span></div>
        <div><strong>80</strong><span>Follow-ups due</span></div>
      </div>
    );
  }

  if (type === "tasks") {
    return (
      <div className={styles.taskTiles}>
        {['Quote', 'Invoice', 'Receipt', 'Reminder', 'Review', 'Handover'].map((item) => <span key={item}>{item}</span>)}
      </div>
    );
  }

  if (type === "scale") {
    return (
      <div className={styles.scaleVisual}>
        <strong>2,500</strong>
        <span>client conversations</span>
        <p>capacity target after workflow and infrastructure validation</p>
      </div>
    );
  }

  if (type === "implementation") {
    return (
      <ol className={styles.stepList}>
        <li>Discover</li>
        <li>Configure</li>
        <li>Test</li>
        <li>Trial</li>
        <li>Expand</li>
      </ol>
    );
  }

  return (
    <div className={styles.symbolVisual}>
      <span>{type === "problem" ? "!" : type === "cost" ? "K" : type === "finance" ? "$" : type === "retail" ? "✓" : "→"}</span>
    </div>
  );
}

export default function ProposalSlides() {
  const [index, setIndex] = useState(0);
  const current = slides[index];
  const progress = useMemo(() => Math.round(((index + 1) / slides.length) * 100), [index]);

  const next = () => setIndex((value) => Math.min(value + 1, slides.length - 1));
  const previous = () => setIndex((value) => Math.max(value - 1, 0));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") next();
      if (event.key === "ArrowLeft") previous();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.ambientLayer} aria-hidden="true">
        <span className={`${styles.floatChip} ${styles.floatOne}`}>Quotation sent ✓</span>
        <span className={`${styles.floatChip} ${styles.floatTwo}`}>24/7 response</span>
        <span className={`${styles.floatChip} ${styles.floatThree}`}>Invoice ready</span>
        <span className={`${styles.floatChip} ${styles.floatFour}`}>Follow-up due</span>
        <span className={`${styles.floatChip} ${styles.floatFive}`}>Payment received ✓</span>
      </div>

      <section className={styles.slideShell} aria-live="polite">
        <header className={styles.topBar}>
          <div className={styles.brandLockup}>
            <Image src="/medminds-logo.png" alt="MedMinds Learning Centre" width={42} height={42} />
            <div>
              <strong>Mary Kaunda AI Agent</strong>
              <span>15-minute institutional proposal</span>
            </div>
          </div>
          <div className={styles.timerPill}>{current.time}</div>
        </header>

        <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>

        <article className={styles.slideCard}>
          <div className={styles.slideCopy}>
            <span className={styles.eyebrow}>{current.eyebrow}</span>
            <h1>{current.title}</h1>
            <p className={styles.subtitle}>{current.subtitle}</p>
            <ul className={styles.bullets}>
              {current.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className={styles.slideVisual}>
            <Visual type={current.visual} />
          </div>
        </article>

        <footer className={styles.controls}>
          <button type="button" onClick={previous} disabled={index === 0}>← Previous</button>
          <div className={styles.slideCounter}>
            <strong>{index + 1}</strong> / {slides.length}
            <span>{progress}% complete</span>
          </div>
          {index === slides.length - 1 ? (
            <a href={testMaryUrl} target="_blank" rel="noreferrer" className={styles.ctaButton}>Test Mary on WhatsApp</a>
          ) : (
            <button type="button" onClick={next}>Next →</button>
          )}
        </footer>

        <nav className={styles.dots} aria-label="Slide navigation">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Go to slide ${slideIndex + 1}`}
              aria-current={slideIndex === index ? "step" : undefined}
              onClick={() => setIndex(slideIndex)}
            />
          ))}
        </nav>
      </section>
    </main>
  );
}
