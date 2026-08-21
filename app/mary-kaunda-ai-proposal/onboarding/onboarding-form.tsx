"use client";

import { useState, type FormEvent } from "react";
import {
  monthlyEnquiryRanges,
  onboardingUseCases,
  organisationTypes
} from "@/lib/mary-onboarding-options";
import styles from "./onboarding.module.css";

type RegistrationAnswer = "" | "yes" | "no";
type SubmissionResult = {
  reference: string;
  whatsappUrl: string;
  notified: boolean;
};

export function MaryOnboardingForm() {
  const [registered, setRegistered] = useState<RegistrationAnswer>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = event.currentTarget;

    try {
      const response = await fetch("/api/public/mary-onboarding", {
        method: "POST",
        body: new FormData(form)
      });
      const payload = await response.json().catch(() => null) as (SubmissionResult & { error?: string }) | null;
      if (!response.ok || !payload?.reference || !payload.whatsappUrl) {
        setError(payload?.error || "The form could not be submitted. Please try again.");
        return;
      }
      setResult(payload);
    } catch {
      setError("The form could not reach Mary. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className={styles.successCard} aria-live="polite">
        <span className={styles.successIcon} aria-hidden="true">✓</span>
        <span className={styles.eyebrow}>Application received</span>
        <h2>Your secure onboarding reference is {result.reference}</h2>
        <p>
          Your company details and registration document have been saved securely.
          {result.notified
            ? " Mary has also sent the application details to MedMinds on WhatsApp."
            : " Please use the button below to notify Mary on WhatsApp."}
        </p>
        <div className={styles.successNext}>
          <strong>Final step</strong>
          <span>Open Mary, send the prepared confirmation message and continue the deployment conversation.</span>
        </div>
        <a href={result.whatsappUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>
          Continue with Mary on WhatsApp
        </a>
        <a href="/mary-kaunda-ai-proposal" className={styles.textLink}>Return to the proposal</a>
      </section>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.eligibilityFieldset}>
        <legend><span>Step 1</span> Confirm eligibility</legend>
        <p>This onboarding is currently available only to registered companies and organisations.</p>
        <div className={styles.choiceGrid}>
          <label className={registered === "yes" ? styles.choiceSelected : styles.choice}>
            <input
              type="radio"
              name="registered"
              value="yes"
              checked={registered === "yes"}
              onChange={() => setRegistered("yes")}
              required
            />
            <span><strong>Yes, registered</strong><small>I can provide an incorporation or business registration certificate.</small></span>
          </label>
          <label className={registered === "no" ? styles.choiceSelected : styles.choice}>
            <input
              type="radio"
              name="registered"
              value="no"
              checked={registered === "no"}
              onChange={() => setRegistered("no")}
              required
            />
            <span><strong>Not registered</strong><small>I do not yet have a formal registration certificate.</small></span>
          </label>
        </div>
      </fieldset>

      {registered === "no" ? (
        <section className={styles.ineligibleNotice} aria-live="polite">
          <span aria-hidden="true">!</span>
          <div>
            <h2>Registration is required before onboarding</h2>
            <p>
              Mary&apos;s institutional deployment is currently offered only to registered organisations.
              Complete registration with the appropriate authority, then return with your certificate.
            </p>
            <a href="/mary-kaunda-ai-proposal">Return to the proposal</a>
          </div>
        </section>
      ) : null}

      {registered === "yes" ? (
        <>
          <fieldset>
            <legend><span>Step 2</span> Company details</legend>
            <div className={styles.fieldGrid}>
              <label className={styles.fullField}>
                <span>Registered legal name <b>*</b></span>
                <input name="legalName" autoComplete="organization" maxLength={160} required placeholder="Name shown on the registration certificate" />
              </label>
              <label>
                <span>Trading name <small>Optional</small></span>
                <input name="tradingName" maxLength={160} placeholder="If different from the legal name" />
              </label>
              <label>
                <span>Organisation type <b>*</b></span>
                <select name="organisationType" required defaultValue="">
                  <option value="" disabled>Select type</option>
                  {organisationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>
                <span>Registration number <b>*</b></span>
                <input name="registrationNumber" maxLength={80} required placeholder="PACRA or equivalent number" />
              </label>
              <label>
                <span>TPIN <small>Optional</small></span>
                <input name="tpin" inputMode="numeric" maxLength={40} placeholder="Taxpayer identification number" />
              </label>
              <label className={styles.fullField}>
                <span>Business town / location <b>*</b></span>
                <input name="town" autoComplete="address-level2" maxLength={100} required placeholder="For example, Lusaka" />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend><span>Step 3</span> Authorised contact</legend>
            <p className={styles.fieldsetIntro}>One director or authorised representative is enough to begin.</p>
            <div className={styles.fieldGrid}>
              <label>
                <span>Full name <b>*</b></span>
                <input name="contactName" autoComplete="name" maxLength={140} required placeholder="Director or authorised representative" />
              </label>
              <label>
                <span>Role / title <b>*</b></span>
                <input name="contactRole" autoComplete="organization-title" maxLength={100} required placeholder="For example, Director" />
              </label>
              <label>
                <span>WhatsApp number <b>*</b></span>
                <input name="contactPhone" type="tel" autoComplete="tel" maxLength={30} required placeholder="+260..." />
              </label>
              <label>
                <span>Email address <b>*</b></span>
                <input name="contactEmail" type="email" autoComplete="email" maxLength={180} required placeholder="name@company.com" />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend><span>Step 4</span> Mary deployment</legend>
            <div className={styles.fieldGrid}>
              <label>
                <span>Primary workflow <b>*</b></span>
                <select name="useCase" required defaultValue="">
                  <option value="" disabled>What should Mary help with first?</option>
                  {onboardingUseCases.map((useCase) => <option key={useCase} value={useCase}>{useCase}</option>)}
                </select>
              </label>
              <label>
                <span>Estimated monthly enquiries <b>*</b></span>
                <select name="monthlyEnquiries" required defaultValue="">
                  <option value="" disabled>Select a range</option>
                  {monthlyEnquiryRanges.map((range) => <option key={range} value={range}>{range}</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend><span>Step 5</span> Registration document</legend>
            <p className={styles.fieldsetIntro}>Upload one clear, current verification document. It is stored privately and is not given a public link.</p>
            <div className={styles.fieldGrid}>
              <label>
                <span>Document being uploaded <b>*</b></span>
                <select name="documentKind" required defaultValue="">
                  <option value="" disabled>Select document</option>
                  <option value="Certificate of incorporation">Certificate of incorporation</option>
                  <option value="Business registration certificate">Business registration certificate</option>
                </select>
              </label>
              <label className={styles.fileField}>
                <span>Choose file <b>*</b></span>
                <input name="registrationDocument" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
                <small>PDF, JPG or PNG • maximum 4 MB</small>
              </label>
            </div>
          </fieldset>

          <label className={styles.consentRow}>
            <input type="checkbox" name="consent" required />
            <span>
              I am authorised to submit these details. I agree that MedMinds General Dealers Limited may securely store the information, verify the registration document and contact the organisation about Mary&apos;s onboarding.
            </span>
          </label>

          <label className={styles.honeypot} aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>

          {error ? <div className={styles.error} role="alert">{error}</div> : null}

          <div className={styles.submitRow}>
            <div><strong>Secure submission</strong><span>Your document is stored privately and Mary sends the application details to MedMinds on WhatsApp.</span></div>
            <button type="submit" disabled={submitting} className={styles.primaryButton}>
              {submitting ? "Submitting securely…" : "Submit and continue to Mary"}
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}
