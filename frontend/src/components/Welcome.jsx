import AIOrb from './AIOrb.jsx'
import { translate } from '../services/translations.js'

// SCREEN 1: WELCOME
// Full-screen split hero: headline + CTA on the left, a glowing AI
// orb visual on the right. Entry point of the kiosk - starting a
// session is still just this one onStart() call.

export default function Welcome({ preferredLanguage = 'en', onStart, onEnroll }) {
  return (
    <section className="screen screen--welcome">
      <div className="hero-split">
        <div className="hero-left">
          <p className="eyebrow">{translate(preferredLanguage, 'welcomeEyebrow')}</p>
          <h1 className="hero-headline">
            {translate(preferredLanguage, 'welcomeTitle')}
          </h1>
          <p className="hero-desc">
            {translate(preferredLanguage, 'welcomeDesc')}
          </p>

          <div className="hero-cta-group">
            <button className="btn btn--primary btn--lg" onClick={onStart}>
              {translate(preferredLanguage, 'startBanking')}
            </button>
            <button
              className="btn btn--secondary btn--lg hero-enroll-btn"
              onClick={onEnroll}
              type="button"
            >
              👤 {translate(preferredLanguage, 'newRegistration')}
            </button>
          </div>
        </div>

        <div className="hero-right">
          <span className="hero-right__tag">{translate(preferredLanguage, 'aiReady')}</span>
          <AIOrb state="idle" size={280} />
        </div>

        <div className="hero-trust-row">
          <span className="trust-chip">
            <span className="trust-chip__dot" aria-hidden="true" />
            {translate(preferredLanguage, 'secure')}
          </span>
          <span className="trust-chip">
            <span className="trust-chip__dot" aria-hidden="true" />
            {translate(preferredLanguage, 'voiceEnabled')}
          </span>
          <span className="trust-chip">
            <span className="trust-chip__dot" aria-hidden="true" />
            {translate(preferredLanguage, 'multilingual')}
          </span>
        </div>
      </div>
    </section>
  )
}
