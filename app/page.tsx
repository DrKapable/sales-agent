import Link from "next/link";
import { TestChat } from "@/components/test-chat";
import { getSetupState } from "@/lib/env";

export default function Home() {
  const setup = getSetupState();
  return (
    <main>
      <nav className="nav shell">
        <Link href="/" className="brand"><span className="brandMark">M</span><span>MedMinds</span></Link>
        <Link href="/admin" className="button buttonGhost">Admin dashboard</Link>
      </nav>

      <section className="hero shell">
        <div className="heroCopy">
          <div className="eyebrow"><span className="statusDot" /> WhatsApp sales, made personal</div>
          <h1>Turn MedMinds enquiries into clear next steps.</h1>
          <p className="heroText">A focused sales assistant for Pa Gym, research support, tutorials, courses, and other approved MedMinds services.</p>
          <div className="heroActions">
            <a href="#simulator" className="button buttonPrimary">Test the agent</a>
            <Link href="/admin" className="button buttonSecondary">Manage leads</Link>
          </div>
          <div className="trustRow">
            <span>Verified pricing only</span><span>Human handover</span><span>Lead tracking</span>
          </div>
        </div>
        <div className="heroCard" aria-label="Sales workflow overview">
          <div className="miniHeader"><span className="avatar">MM</span><div><strong>MedMinds Assistant</strong><small>Typically replies instantly</small></div><span className="online">Online</span></div>
          <div className="message in">Hi 👋 What can I help you prepare for?</div>
          <div className="message out">I need help with my MPH proposal.</div>
          <div className="message in">Certainly. What stage is your proposal at, and when is it due?</div>
          <div className="flowTags"><span>Need identified</span><span>Lead qualified</span><span>Next step set</span></div>
        </div>
      </section>

      <section className="featureSection shell">
        <div className="sectionHeading"><span className="kicker">Purpose-built</span><h2>A sales process with sensible controls.</h2></div>
        <div className="featureGrid">
          <article><span className="featureNumber">01</span><h3>Understands the need</h3><p>Qualifies the client's programme, objective, service, and deadline without repeating questions.</p></article>
          <article><span className="featureNumber">02</span><h3>Uses approved offers</h3><p>Quotes only active packages configured by MedMinds. Unverified pricing is escalated.</p></article>
          <article><span className="featureNumber">03</span><h3>Moves the lead forward</h3><p>Tracks lead status and ends qualified conversations with one clear, low-pressure action.</p></article>
        </div>
      </section>

      <section id="simulator" className="simulatorSection">
        <div className="shell simulatorGrid">
          <div className="simulatorCopy">
            <span className="kicker">Conversation simulator</span>
            <h2>See how the assistant responds.</h2>
            <p>Use the test chat before connecting the Meta WhatsApp webhook. Test leads appear in the admin dashboard.</p>
            {!setup.aiConfigured && <div className="notice"><strong>AI setup required</strong><span>Deploy on Vercel or add an AI Gateway key to enable live replies.</span></div>}
          </div>
          <TestChat enabled={setup.aiConfigured} />
        </div>
      </section>

      <footer className="footer shell"><span>MedMinds Learning Centre</span><span>Sales Agent Console</span></footer>
    </main>
  );
}

