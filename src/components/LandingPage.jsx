import React from 'react'
import heroCardImg from '../assets/hero-card-hd.png'

export default function LandingPage({ onNavigateLogin }) {
  return (
    <main className="landing-wrapper">
      <div className="container-xl px-3 px-sm-4 px-lg-3">
        <div className="row align-items-center justify-content-center g-4 g-lg-5 hero-main-row">
          {/* Left Column: Visual with Character Card & Floating Badges */}
          <div className="col-12 col-md-8 col-lg-6 col-xl-5 d-flex justify-content-center justify-content-lg-center hero-visual-col">
            <div className="hero-card-container">
              {/* Floating Sparkle Badge */}
              <div className="sparkle-badge" aria-label="Featured badge">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="sparkle-icon"
                >
                  <path
                    d="M10 2L11.5 7.5L17 9L11.5 10.5L10 16L8.5 10.5L3 9L8.5 7.5L10 2Z"
                    fill="white"
                  />
                  <path
                    d="M17.5 3.5L18.3 6L21 6.8L18.3 7.6L17.5 10.1L16.7 7.6L14 6.8L16.7 6L17.5 3.5Z"
                    fill="white"
                  />
                  <path
                    d="M16 14L16.7 16L19 16.6L16.7 17.2L16 19.5L15.3 17.2L13 16.6L15.3 16L16 14Z"
                    fill="white"
                  />
                </svg>
              </div>

              {/* Main Card with Character Illustration */}
              <div className="hero-card">
                <img
                  src={heroCardImg}
                  alt="Edoo Mate Tutor"
                  className="hero-card-image img-fluid"
                />
              </div>

              {/* Floating App Tiles Badge */}
              <div className="tiles-badge" aria-label="Apps badge">
                <div className="tile-square tile-green"></div>
                <div className="tile-square tile-blue"></div>
                <div className="tile-square tile-red"></div>
                <div className="tile-square tile-yellow"></div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Content */}
          <div className="col-12 col-md-10 col-lg-6 col-xl-6 d-flex justify-content-center justify-content-lg-start hero-text-col">
            <div className="hero-content">
              {/* Logo */}
              <div className="brand-logo" id="edoomate-logo">
                <span className="brand-edoo">edoo</span>
                <span className="brand-mate">mate</span>
              </div>

              {/* Main Headline */}
              <h1 className="hero-title">
                <div>Learn smarter,</div>
                <div>
                  <span className="grow-tag">grow faster.</span>
                </div>
              </h1>

              {/* Subtitle */}
              <p className="hero-subtitle">
                The ultimate platform to boost your knowledge and skills in record time.
              </p>

              {/* CTA Button: Connects to Login */}
              <div>
                <button
                  type="button"
                  className="cta-button"
                  id="get-started-btn"
                  onClick={onNavigateLogin}
                >
                  <span>Get Started</span>
                  <span className="cta-arrow" aria-hidden="true">→</span>
                </button>
              </div>

              {/* Login Link: Connects to Login */}
              <div className="login-prompt">
                Already have an account?
                <button
                  type="button"
                  className="login-link btn btn-link p-0 align-baseline"
                  onClick={onNavigateLogin}
                  id="login-link-btn"
                >
                  Log in
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
