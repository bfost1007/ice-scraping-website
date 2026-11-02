import "./homepage.css";
import { PLAN_RATES, PERIOD_DAYS } from "./lib/service-pricing";

// Advertised semester prices from the supplied homepage prototype.
const semesterCleanings = PERIOD_DAYS.Semester;
const plans = [
  { name: "Basic", coverage: "Front and back windshield", semester: PLAN_RATES.Basic.Semester },
  { name: "Full", coverage: "All 6 windows plus mirrors", semester: PLAN_RATES.Premium.Semester },
];

export default function Home() {
  return (
    <div className="prototype-home public-shell">
      <header className="public-header gut">
        <a className="public-brand" href="#top">Blake <b>Scrapes</b></a>
        <nav className="public-links" aria-label="Main navigation">
          <a href="#services">Services</a>
          <a href="#how-it-works">How it works</a>
          <a className="signup-link" href="/signup">Reserve a spot</a>
          <a className="public-login-btn" href="/login">Staff Login</a>
        </nav>
      </header>

      <main>
        <section className="public-hero" id="top">
          <div>
            <div className="public-kicker">Winter vehicle service · Rexburg, Idaho</div>
            <h1>Wake up to a clear windshield.</h1>
            <p>Reliable weekday morning ice and frost scraping for busy students who want less stress before class.</p>
            <a className="public-cta" href="/signup">Request Service&nbsp; →</a>
            <div className="public-meta"><span>Monday–Friday</span><span>Goal: cleared by 8:30 AM</span><span>Rexburg apartment communities</span></div>
          </div>
          <div className="hero-art" aria-hidden="true"><span className="hero-snow">✳</span><span className="hero-tag">A clearer start to your day</span></div>
        </section>

        <section className="public-section white" id="services">
          <div className="public-inner">
            <div className="public-kicker">Choose your service</div>
            <h2>Clear windows, simple pricing.</h2>
            <p className="public-intro">Weekday ice and frost scraping at Rexburg apartment complexes. Semester averages below are based on {semesterCleanings} weekday cleanings; Blake confirms your service dates before you begin.</p>
            <div className="service-cards">
              {plans.map((plan) => (
                <article className="service-card" key={plan.name}>
                  <h3>{plan.name}</h3><p>{plan.coverage}</p>
                  <div className="service-rate">${(plan.semester / semesterCleanings).toFixed(2)} <small>per weekday cleaning</small></div>
                  <div className="semester-total">${plan.semester} for the semester, through Dec. 15</div>
                </article>
              ))}
            </div>
            <div className="service-extra"><span><b>Weekly:</b> 5 weekday cleanings · Basic $15 ($3/day) · Full $18 ($3.60/day)</span><span><b>One-time:</b> Basic $5 · Full $7 per visit</span></div>
            <p className="form-hint" style={{ marginTop: 12 }}>Basic covers the front and back windshield. Full covers all six windows plus mirrors. Service is window scraping—not full-vehicle snow removal, cleaning, or detailing.</p>
          </div>
        </section>

        <section className="public-section" id="how-it-works">
          <div className="public-inner">
            <div className="public-kicker">Getting started</div>
            <h2>From request to ready-for-class.</h2>
            <p className="public-intro">Here’s what happens after you send your service request.</p>
            <div className="public-steps">
              <div className="public-step"><b>1. Request service</b><span>Share your contact, apartment/building, parking setup, vehicle details, plan, and first service date.</span></div>
              <div className="public-step"><b>2. Blake reviews it</b><span>Blake reviews your request, confirms the plan and weekday schedule, and follows up before service starts.</span></div>
              <div className="public-step"><b>3. Weekday morning service</b><span>Your route is planned Monday–Friday, with a goal of having cars cleared by 8:30 AM. Early classes can be noted for priority.</span></div>
            </div>
            <div className="service-cards" style={{ marginTop: 28 }}>
              <article className="service-card"><h3>Parking changes?</h3><p>If your spot changes, update Blake. If you opt in to evening messages, Blake can ask for a pin for the following day. A pin sent the night before is the worker’s location for the next morning.</p></article>
              <article className="service-card"><h3>Weather can change</h3><p>Snow, sleet, or refreezing can cover glass again after it has been scraped. Regular service is weekdays only; weekend or holiday service needs to be confirmed in advance.</p></article>
            </div>
          </div>
        </section>

        <section className="public-bottom"><div><h2>Ready for a less stressful morning?</h2><p>Request service for the current semester.</p></div><a className="public-cta" href="/signup">Reserve a spot&nbsp; →</a></section>
      </main>

      <footer className="public-footer"><div className="public-footer-inner"><span>© 2026 Blake Scrapes · Rexburg, Idaho</span><span>Weekday ice and frost scraping</span></div></footer>
    </div>
  );
}
