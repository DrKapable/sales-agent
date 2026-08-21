import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MaryOnboardingForm } from "./onboarding-form";
import styles from "./onboarding.module.css";

export const metadata: Metadata = {
  title: "Organisation Onboarding | Mary Kaunda AI Agent",
  description: "Secure onboarding for registered organisations starting a Mary Kaunda AI customer-service deployment."
};

const testMaryUrl = "https://wa.me/260762402042?text=Hi%20Mary%2C%20I%20would%20like%20to%20ask%20about%20organisation%20onboarding.";

export default function MaryOnboardingPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/mary-kaunda-ai-proposal" className={styles.brand}>
          <Image src="/medminds-logo.png" alt="MedMinds General Dealers Limited" width={42} height={42} priority />
          <span>MedMinds General Dealers</span>
        </Link>
        <a href={testMaryUrl} target="_blank" rel="noreferrer" className={styles.navButton}>Ask Mary on WhatsApp</a>
      </nav>

      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Mary Kaunda organisation onboarding</span>
          <h1>Start your institutional setup in about five minutes.</h1>
          <p>
            Confirm registration, provide one authorised contact and upload one verification document.
            Mary will prepare the application for MedMinds and continue the handover on WhatsApp.
          </p>
        </div>
        <div className={styles.heroStatus}>
          <span>01</span><strong>Registered organisations only</strong>
          <span>02</span><strong>One authorised contact</strong>
          <span>03</span><strong>One registration document</strong>
        </div>
      </header>

      <div className={styles.contentGrid}>
        <aside className={styles.requirementsCard}>
          <span className={styles.eyebrow}>Have these ready</span>
          <h2>Simple onboarding requirements</h2>
          <ol>
            <li><span>1</span><div><strong>Registered company details</strong><small>Legal name, company type, registration number and town.</small></div></li>
            <li><span>2</span><div><strong>Authorised representative</strong><small>One director or representative&apos;s name, role, WhatsApp and email.</small></div></li>
            <li><span>3</span><div><strong>Registration document</strong><small>Certificate of incorporation or business registration certificate.</small></div></li>
            <li><span>4</span><div><strong>First workflow</strong><small>The main customer journey Mary should help with first.</small></div></li>
          </ol>
          <div className={styles.securityNote}>
            <strong>Private by design</strong>
            <span>Uploaded documents are stored securely for onboarding review and are never published as public links.</span>
          </div>
          <a href={testMaryUrl} target="_blank" rel="noreferrer" className={styles.textLink}>Need help? Ask Mary →</a>
        </aside>

        <MaryOnboardingForm />
      </div>

      <footer className={styles.footer}>
        <div><strong>MedMinds General Dealers Limited</strong><span>Secure institutional onboarding for Mary Kaunda AI Agent.</span></div>
        <div><a href="mailto:admin@medmindslc.online">admin@medmindslc.online</a><a href="https://wa.me/260977259132" target="_blank" rel="noreferrer">0977259132</a></div>
      </footer>
    </main>
  );
}
