import React from 'react'
import { authService } from '../services/authService'
import loginLogoCard from '../assets/login-logo-card.png'

export default function DashboardPlaceholder({ onLogout }) {
  const user = authService.getUser()
  const username = user?.username || user?.email || user?.name || 'Learner'

  const handleSignOut = () => {
    authService.logout()
    if (onLogout) onLogout()
  }

  return (
    <div className="dashboard-placeholder-wrapper">
      <nav className="dashboard-navbar d-flex align-items-center justify-content-between px-4 py-3 border-bottom bg-white shadow-sm">
        <div className="d-flex align-items-center gap-3">
          <img
            src={loginLogoCard}
            alt="Edoo Mate Logo"
            style={{ width: '40px', height: '40px', borderRadius: '10px' }}
          />
          <div className="brand-logo mb-0" style={{ fontSize: '1.5rem' }}>
            <span className="brand-edoo">edoo</span>
            <span className="brand-mate">mate</span>
          </div>
        </div>
        <div className="d-flex align-items-center gap-3">
          <span className="text-muted small d-none d-sm-inline">
            Signed in as <strong>{username}</strong>
          </span>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm rounded-pill px-3 fw-semibold"
            onClick={handleSignOut}
            id="dashboard-logout-btn"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="dashboard-content container py-5 text-center">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6">
            <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5 bg-white">
              <div className="display-4 mb-3">🎓</div>
              <h2 className="fw-bold mb-2">Welcome to Edoomate, {username}!</h2>
              <p className="text-muted mb-4">
                You have successfully authenticated via the Edoomate Login API.
                Your full learning dashboard is currently under preparation by the team.
              </p>

              <div className="p-3 bg-light rounded-3 text-start small mb-4">
                <div className="text-secondary fw-semibold mb-1">Session Status:</div>
                <div className="text-success fw-medium">● Authenticated</div>
                <div className="text-secondary mt-2 fw-semibold">Token:</div>
                <div className="text-muted text-truncate font-monospace">
                  {authService.getToken() ? 'Bearer Token Active' : 'Session Active'}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary rounded-pill px-4 py-2 fw-semibold"
                onClick={handleSignOut}
              >
                Sign Out & Return Home
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
