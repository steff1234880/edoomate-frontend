import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/authService'
import { courseService } from '../services/courseService'

export default function TermsConditionsPage() {
  const navigate = useNavigate()
  const [termsData, setTermsData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true
    const fetchTerms = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const token = authService.getToken()
        const data = await courseService.getTermsAndConditions(token)
        if (isMounted) {
          setTermsData(data)
        }
      } catch (err) {
        if (isMounted) {
          console.warn('Failed to load terms & conditions from API:', err)
          setError(err.message || 'Unable to load Terms & Conditions. Please try again.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchTerms()
    return () => {
      isMounted = false
    }
  }, [])

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div
      className="terms-page-wrapper min-vh-100"
      style={{
        backgroundColor: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Navigation Bar */}
      <header
        className="sticky-top bg-white border-bottom shadow-xs px-3 px-md-4 py-3"
        style={{ zIndex: 1020, borderColor: '#e2e8f0' }}
      >
        <div className="container-fluid d-flex align-items-center justify-content-between" style={{ maxWidth: '960px' }}>
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center border"
              style={{
                width: '40px',
                height: '40px',
                minWidth: '40px',
                backgroundColor: '#ffffff',
                borderColor: '#cbd5e1',
              }}
              onClick={handleBack}
              aria-label="Go Back"
              id="btn-terms-back"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <h1 className="h5 fw-bold text-dark mb-0" style={{ fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
                Terms & Conditions
              </h1>
              <span className="text-secondary smaller" style={{ fontSize: '0.78rem' }}>
                Edoo Mate Agreement & Platform Terms
              </span>
            </div>
          </div>

          {termsData?.last_updated && (
            <span className="badge bg-light text-secondary border px-3 py-1.5 rounded-pill d-none d-sm-inline-block small">
              Updated: {termsData.last_updated}
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container-fluid py-4 px-3 px-md-4" style={{ maxWidth: '960px' }}>
        {isLoading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <div className="fw-semibold text-dark">Loading Terms & Conditions...</div>
            <div className="text-muted small mt-1">Retrieving official agreement from Edoomate server</div>
          </div>
        ) : error ? (
          <div className="card border-danger border-opacity-25 shadow-sm p-4 text-center my-4 bg-white rounded-4">
            <div className="text-danger mb-2">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h5 className="fw-bold text-dark mb-1">Unable to Load Terms & Conditions</h5>
            <p className="text-secondary small mb-3">{error}</p>
            <div>
              <button
                type="button"
                className="btn btn-primary rounded-pill px-4 fw-semibold"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          </div>
        ) : termsData ? (
          <div className="card border-0 shadow-xs rounded-4 bg-white p-3 p-sm-4 p-md-5 mb-5">
            {/* Header Info Banner */}
            <div
              className="p-3.5 p-sm-4 rounded-4 mb-4 border"
              style={{
                backgroundColor: '#eff6ff',
                borderColor: '#bfdbfe',
              }}
            >
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <span className="badge bg-primary text-white px-3 py-1.5 rounded-pill fw-semibold" style={{ fontSize: '0.78rem' }}>
                  Official Platform Agreement
                </span>
                {termsData.effective_date && (
                  <span className="text-muted smaller" style={{ fontSize: '0.8rem' }}>
                    <strong>Effective Date:</strong> {termsData.effective_date}
                  </span>
                )}
              </div>
              <h2 className="h4 fw-bold text-dark mb-2" style={{ color: '#1e3a8a' }}>
                {termsData.title || 'Terms & Conditions'}
              </h2>
              {termsData.subtitle && (
                <p className="text-secondary mb-2" style={{ fontSize: '0.92rem', lineHeight: '1.55' }}>
                  {termsData.subtitle}
                </p>
              )}
              {termsData.applies_to && (
                <div className="smaller text-muted" style={{ fontSize: '0.8rem' }}>
                  <strong>Applies to:</strong> {termsData.applies_to}
                  {termsData.governing_law && ` • Governing Law: ${termsData.governing_law}`}
                </div>
              )}
            </div>

            {/* Sections Content Flow */}
            <div className="terms-sections d-flex flex-column gap-4">
              {Array.isArray(termsData.sections) && termsData.sections.length > 0 ? (
                termsData.sections.map((sec, idx) => (
                  <section key={idx} className="terms-section pb-2 border-bottom border-light-subtle">
                    <h3
                      className="fw-bold text-dark mb-2.5 d-flex align-items-center gap-2"
                      style={{ fontSize: '1.08rem', color: '#0f172a' }}
                    >
                      {sec.heading}
                    </h3>
                    <div className="d-flex flex-column gap-2">
                      {Array.isArray(sec.points) &&
                        sec.points.map((pt, pIdx) => (
                          <div
                            key={pIdx}
                            className="text-secondary"
                            style={{
                              fontSize: '0.88rem',
                              lineHeight: '1.65',
                              color: '#334155',
                            }}
                            dangerouslySetInnerHTML={{ __html: pt }}
                          />
                        ))}
                    </div>
                  </section>
                ))
              ) : (
                <p className="text-secondary small">No terms sections available.</p>
              )}
            </div>

            {/* Company Info Footer Box */}
            {termsData.company_info && (
              <div
                className="mt-5 p-3.5 p-sm-4 rounded-3 border"
                style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}
              >
                <h4 className="fw-bold text-dark fs-6 mb-2">Company & Contact Information</h4>
                <div className="text-secondary small d-flex flex-column gap-1" style={{ fontSize: '0.84rem' }}>
                  {termsData.company_info.name && <div><strong>Entity:</strong> {termsData.company_info.name}</div>}
                  {termsData.company_info.registration && <div><strong>Registration:</strong> {termsData.company_info.registration}</div>}
                  {termsData.company_info.address && <div><strong>Registered Address:</strong> {termsData.company_info.address}</div>}
                  {termsData.company_info.email && (
                    <div>
                      <strong>Email:</strong>{' '}
                      <a href={termsData.company_info.email_link || `mailto:${termsData.company_info.email}`} className="text-primary text-decoration-none">
                        {termsData.company_info.email}
                      </a>
                    </div>
                  )}
                  {termsData.company_info.website && (
                    <div>
                      <strong>Website:</strong>{' '}
                      <a href={termsData.company_info.website_link || `https://${termsData.company_info.website}`} target="_blank" rel="noopener noreferrer" className="text-primary text-decoration-none">
                        {termsData.company_info.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  )
}

