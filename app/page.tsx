import Link from "next/link";
import Script from "next/script";
import { BrandLogo } from "@/components/brand-logo";

export default function Home() {
  return (
    <main className="homePage">
      <nav className="nav shell homeNav">
        <Link href="/" className="brand brandLogoLink" aria-label="MedMinds Learning Centre home"><BrandLogo priority /></Link>
        <div className="homeNavStatus"><span className="statusDot" /> Sales assistant online</div>
      </nav>

      <section className="hero shell homeHero">
        <span className="floatingOrb orbOne" aria-hidden="true" />
        <span className="floatingOrb orbTwo" aria-hidden="true" />
        <span className="floatingRing" aria-hidden="true" />
        <span className="floatingChip chipOne" aria-hidden="true">Pa Gym</span>
        <span className="floatingChip chipTwo" aria-hidden="true">Research support</span>
        <span className="floatingChip chipThree" aria-hidden="true">Tutorials</span>

        <div className="heroCopy">
          <div className="eyebrow"><span className="statusDot" /> MedMinds, ready when you are</div>
          <h1>Learning, research and academic support in one place.</h1>
          <p className="heroText">Ask about Pa Gym, proposal and dissertation support, data analysis, tutorials, courses or other MedMinds services. Our sales assistant can guide you immediately.</p>
          <div className="heroActions">
            <button type="button" className="button buttonPrimary" data-medminds-open-chat>Chat with MedMinds</button>
            <a href="#services" className="button buttonSecondary">Explore services</a>
          </div>
          <div className="trustRow">
            <span>Approved pricing</span><span>Human support when needed</span><span>Available on MedMinds platforms</span>
          </div>
        </div>

        <div className="heroCard brandHeroCard" aria-label="Example MedMinds conversation">
          <div className="miniHeader"><span className="avatar logoAvatar"><BrandLogo compact /></span><div><strong>MedMinds Assistant</strong><small>Online</small></div><span className="online">● Live</span></div>
          <div className="message in">Hi 👋 What can I help you with today?</div>
          <div className="message out">How much is a Master's research proposal?</div>
          <div className="message in">Master's proposal support is within the approved K2,000 to K3,000 range, depending on the deadline and applicable adjustments. When do you need it?</div>
          <div className="flowTags"><span>Ask naturally</span><span>Get a clear answer</span><span>Choose the next step</span></div>
        </div>
      </section>

      <section id="services" className="featureSection shell">
        <div className="sectionHeading"><div><span className="kicker">What we support</span><h2>Practical help for study, research and professional work.</h2></div></div>
        <div className="featureGrid">
          <article><span className="featureNumber">01</span><h3>Pa Gym</h3><p>Exam-focused theory, question practice and OSCE preparation for medical and health-profession learners.</p><button type="button" className="serviceChatLink" data-medminds-open-chat>Ask about Pa Gym →</button></article>
          <article><span className="featureNumber">02</span><h3>Research support</h3><p>Proposal and dissertation support, data analysis, editing and other approved academic research services.</p><button type="button" className="serviceChatLink" data-medminds-open-chat>Ask about research →</button></article>
          <article><span className="featureNumber">03</span><h3>Tutorials and digital services</h3><p>Tutorials, courses, presentations, software, websites and selected MedMinds digital solutions.</p><button type="button" className="serviceChatLink" data-medminds-open-chat>Ask what is available →</button></article>
        </div>
      </section>

      <section className="homeCta shell">
        <div><span className="kicker">Need help choosing?</span><h2>Start with one question.</h2><p>The assistant uses the same approved MedMinds service catalogue used by our WhatsApp sales workflow.</p></div>
        <button type="button" className="button buttonPrimary" data-medminds-open-chat>Open chat</button>
      </section>

      <footer className="footer shell homeFooter">
        <span>© {new Date().getFullYear()} MedMinds Learning Centre</span>
        <Link href="/admin" className="staffAccess" aria-label="MedMinds staff access">Staff access</Link>
      </footer>
      <Script src="/medminds-chat.js" strategy="afterInteractive" />
    </main>
  );
}
