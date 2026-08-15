import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { BrandLogo } from "@/components/brand-logo";

const reviewsUrl = "https://maps.app.goo.gl/4kL9cCutoRFFs3aD8";
const whatsappUrl = "https://wa.me/260762402042?text=Hi%20MedMinds%2C%20I%20would%20like%20some%20assistance.";

export default function Home() {
  return (
    <main className="homePage">
      <nav className="nav shell homeNav">
        <Link href="/" className="brand brandLogoLink" aria-label="MedMinds Learning Centre home"><BrandLogo priority /></Link>
        <div className="homeNavActions">
          <a href={reviewsUrl} target="_blank" rel="noreferrer" className="homeNavLink">Google reviews</a>
          <button type="button" className="button buttonPrimary homeNavChat" data-medminds-open-chat>Talk to us</button>
        </div>
      </nav>

      <section className="hero shell homeHero homeHeroWithImage">
        <div className="heroCopy">
          <div className="eyebrow">MedMinds Learning Centre</div>
          <h1>Medical learning, research support and digital solutions.</h1>
          <p className="heroText">Tell us what you need. We can help you understand the available service, pricing and next steps, then connect you with the right MedMinds team member when necessary.</p>
          <div className="heroActions">
            <button type="button" className="button buttonPrimary" data-medminds-open-chat>Chat with Mary Kaunda</button>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="button buttonSecondary">WhatsApp us</a>
          </div>
          <div className="trustRow">
            <span>Clear service information</span><span>Human support available</span><span>Secure client follow-up</span>
          </div>
        </div>

        <div className="heroVisual" aria-label="Mary Kaunda, MedMinds sales assistant">
          <Image
            src="/medminds-hero-mary-kaunda-hq.webp"
            alt="Mary Kaunda from MedMinds Learning Centre with research, learning and digital service highlights"
            width={1672}
            height={941}
            priority
            sizes="(max-width: 760px) 100vw, (max-width: 1100px) 52vw, 56vw"
          />
        </div>
      </section>

      <section id="services" className="featureSection shell homeServices">
        <div className="sectionHeading"><div><span className="kicker">What we do</span><h2>Support built around real academic and professional needs.</h2></div></div>
        <div className="featureGrid homeFeatureGrid">
          <article><h3>Medical learning</h3><p>Pa Gym, exam-focused notes, question practice, OSCE preparation, tutorials and selected courses.</p><button type="button" className="serviceChatLink" data-medminds-open-chat>Ask about learning support →</button></article>
          <article><h3>Research support</h3><p>Research topics, proposals, dissertations, data analysis, editing and other approved research services.</p><button type="button" className="serviceChatLink" data-medminds-open-chat>Ask about research support →</button></article>
          <article><h3>Digital solutions</h3><p>Software development, websites, business automation and selected systems developed by MedMinds.</p><button type="button" className="serviceChatLink" data-medminds-open-chat>Ask about digital solutions →</button></article>
        </div>
      </section>

      <section className="homeTrust shell">
        <div><span className="kicker">A real team behind the chat</span><h2>Start online. Speak to a person whenever the case needs one.</h2></div>
        <p>Mary Kaunda handles routine enquiries and helps organise the next step. Research, sales, customer-support, legal and technical matters can be referred to the appropriate team member.</p>
      </section>

      <section className="homeCta shell">
        <div><span className="kicker">Ready to ask?</span><h2>Tell us what you need.</h2><p>Use the chat for a quick answer, or continue directly on the MedMinds business WhatsApp line.</p></div>
        <div className="homeCtaActions"><button type="button" className="button buttonPrimary" data-medminds-open-chat>Open chat</button><a href={whatsappUrl} target="_blank" rel="noreferrer" className="button buttonSecondary">Open WhatsApp</a></div>
      </section>

      <footer className="footer shell homeFooter">
        <span>© {new Date().getFullYear()} MedMinds Learning Centre</span>
        <div className="homeFooterLinks"><a href={reviewsUrl} target="_blank" rel="noreferrer">Reviews</a><Link href="/admin" className="staffAccess" aria-label="MedMinds staff access">Staff access</Link></div>
      </footer>
      <Script src="/medminds-chat.js" strategy="afterInteractive" />
    </main>
  );
}
