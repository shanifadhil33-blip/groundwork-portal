import Link from 'next/link';
import { Mark } from '../components/public/chrome';
import { LandingExperience, CopyConfig } from '../components/landing/experience';
import { HeroMedia } from '../components/landing/media';
import { SequenceFrames } from '../components/landing/sequence';
import { DEFAULT_HERO, heroBootstrap } from '../lib/landing/hero';
import '../components/landing/landing.css';
function Actions() {
  return <div className="lx-actions"><Link className="lx-button lx-primary" href="/demo">Try the demo</Link><Link className="lx-button lx-secondary" href="/sign-in">Sign in</Link></div>;
}
export default function Landing() {
  return <div className="lx-root" data-hero={DEFAULT_HERO} suppressHydrationWarning>
    <script dangerouslySetInnerHTML={{ __html: heroBootstrap }} />
    <a className="lx-skip" href="#main">Skip to content</a>
    <header className="lx-header"><Link href="/" className="lx-brand" aria-label="Groundwork home"><Mark />Groundwork</Link><nav aria-label="Public navigation"><Link href="/sign-in" className="lx-header-link">Sign in</Link><Link href="/demo" className="lx-button lx-primary">Try the demo</Link></nav></header>
    <main id="main" className="lx-main">
      <div className="lx-story">
      <div className="lx-scene" aria-hidden="true"><div className="lx-scene-sticky"><div className="lx-visual"><SequenceFrames /><HeroMedia /><LandingExperience /></div></div></div>
      <section className="lx-hero" aria-label="Introduction"><div className="lx-hero-copy"><h1>Run every work order from request <span className="lx-highlight">to done.</span></h1><p>A client portal and back office for facility service companies.</p><Actions /></div></section>
      <section className="lx-rise" aria-label="A building taking shape"><p className="lx-reveal-text">A request becomes a plan.<br />A plan becomes progress.</p></section>
      <section className="lx-workflow" aria-label="How Groundwork works"><div className="lx-legend"><span><i className="lx-open" />Open</span><span><i className="lx-scheduled" />Scheduled</span><span><i className="lx-done" />Done</span></div><div className="lx-steps lx-reveal-text">
        <article><span className="lx-number">01</span><h2>Requests come in</h2><p>Clients send requests straight to your team, with the details in one place.</p></article>
        <article><span className="lx-number">02</span><h2>Your team schedules and works them</h2><p>Assign the work, set a date, and keep each job moving.</p></article>
        <article><span className="lx-number">03</span><h2>Clients see progress</h2><p>Every client sees the updates on their jobs, from open to done.</p></article>
      </div></section>
      </div>
      <section className="lx-agent"><div className="lx-agent-copy lx-reveal-text"><h2>Your AI agents can work here too.</h2><p>Outside agents connect over MCP with scoped keys and the same permissions as your team.</p><CopyConfig /></div></section>
      <section className="lx-finale" aria-label="Try Groundwork"><div className="lx-reveal-text"><h2>Every job,<br />every building,<br /><span className="lx-highlight">one place.</span></h2><Actions /><p className="lx-note">No sign up needed. Each visitor gets a private sandbox.</p></div></section>
    </main>
    <footer className="lx-footer"><span className="lx-footer-brand">Groundwork</span><nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
  </div>;
}
