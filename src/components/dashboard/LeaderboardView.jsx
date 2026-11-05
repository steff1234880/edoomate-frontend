import React, { useState, useEffect, useMemo, useCallback } from 'react'
import InitialsAvatar from '../common/InitialsAvatar'
import { getInitials } from '../../utils/avatarUtils'
import { authService } from '../../services/authService'
import { courseService } from '../../services/courseService'

export default function LeaderboardView({ onBack }) {
  const [leaderboardData, setLeaderboardData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [authError, setAuthError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Current authenticated user info
  const currentUser = authService.getUser()

  /**
   * Fetch real leaderboard data from GET /api/leaderboard
   */
  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')
    setAuthError(false)

    const token = authService.getToken()
    if (!token) {
      setAuthError(true)
      setIsLoading(false)
      return
    }

    try {
      const res = await courseService.getLeaderboard(token)
      if (res && res.success && res.data) {
        setLeaderboardData(res.data)
      } else {
        throw new Error(res?.message || 'Failed to retrieve leaderboard data.')
      }
    } catch (err) {
      console.error('[LeaderboardView] Error fetching leaderboard:', err)
      if (err.code === 'AUTH_EXPIRED' || err.code === 'AUTH_MISSING') {
        setAuthError(true)
      } else {
        setErrorMessage(
          err.message || 'Unable to connect to the Edoomate leaderboard. Please check your connection.'
        )
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  /**
   * Process raw students array from real API response without inventing mock fields
   */
  const processedStudents = useMemo(() => {
    if (!leaderboardData || !Array.isArray(leaderboardData.leaderboard)) {
      return []
    }

    return leaderboardData.leaderboard.map((item, index) => {
      // 1. Rank: API field or 1-based index
      const rank = typeof item.rank === 'number' ? item.rank : index + 1

      // 2. Student Name: use available API name fields safely
      const name =
        item.name ||
        item.full_name ||
        item.student_name ||
        (item.first_name ? `${item.first_name} ${item.last_name || ''}`.trim() : null) ||
        `Student #${rank}`

      // 3. Points/Score: ONLY include if actually supported by API
      const rawPoints = item.points ?? item.score ?? item.total_points ?? item.xp ?? null
      const hasPoints = rawPoints !== null && rawPoints !== undefined
      const pointsFormatted = hasPoints ? `${rawPoints} pts` : null

      // 4. Reliable logged-in student row match (Requirement 5)
      const isUser = Boolean(
        item.is_user ||
        item.isUser ||
        (currentUser?.id && (item.id === currentUser.id || item.user_id === currentUser.id || item.student_id === currentUser.id)) ||
        (currentUser?.email && item.email && item.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (typeof leaderboardData.your_rank === 'number' && rank === leaderboardData.your_rank) ||
        (currentUser?.full_name && name.toLowerCase() === currentUser.full_name.toLowerCase())
      )

      // 5. Trend: only if supported by API
      const trend = item.trend || null

      return {
        id: item.id || `student-rank-${rank}`,
        rank,
        name,
        hasPoints,
        points: rawPoints,
        pointsFormatted,
        trend,
        isUser,
        raw: item,
      }
    })
  }, [leaderboardData, currentUser])

  /**
   * Check if any student in the response has a points/score field
   */
  const hasAnyPoints = useMemo(() => {
    return processedStudents.some((s) => s.hasPoints)
  }, [processedStudents])

  /**
   * Check if any student in the response has trend data
   */
  const hasAnyTrends = useMemo(() => {
    return processedStudents.some((s) => Boolean(s.trend))
  }, [processedStudents])

  /**
   * Top 3 podium items (only if at least 3 students exist in real API response)
   */
  const podiumList = useMemo(() => {
    if (processedStudents.length < 3) return []
    const rank1 = processedStudents.find((s) => s.rank === 1) || processedStudents[0]
    const rank2 = processedStudents.find((s) => s.rank === 2) || processedStudents[1]
    const rank3 = processedStudents.find((s) => s.rank === 3) || processedStudents[2]
    // Visual order: Rank 2 (left), Rank 1 (center), Rank 3 (right)
    return [rank2, rank1, rank3].filter(Boolean)
  }, [processedStudents])

  /**
   * Table rows: students with rank > 3 if podium is shown, otherwise all students
   */
  const tableRows = useMemo(() => {
    if (processedStudents.length >= 3) {
      return processedStudents.filter((s) => s.rank > 3)
    }
    return processedStudents
  }, [processedStudents])

  /**
   * Filter table rows by search query
   */
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return tableRows
    const query = searchQuery.trim().toLowerCase()
    return tableRows.filter((student) => {
      const nameMatch = student.name.toLowerCase().includes(query)
      const initialsMatch = getInitials(student.name).toLowerCase().includes(query)
      const rankMatch = String(student.rank).includes(query)
      const pointsMatch = student.pointsFormatted ? student.pointsFormatted.toLowerCase().includes(query) : false
      return nameMatch || initialsMatch || rankMatch || pointsMatch
    })
  }, [tableRows, searchQuery])

  return (
    <div className="leaderboard-view-container animate-fade-in">
      {/* Header Section */}
      <div className="leaderboard-header-section d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2">
            {onBack && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-circle d-md-none me-1"
                onClick={onBack}
                title="Back to Dashboard"
                aria-label="Back to Dashboard"
                style={{ width: '32px', height: '32px', padding: 0 }}
              >
                ←
              </button>
            )}
            <h1 className="leaderboard-main-title mb-0">Leaderboard</h1>
          </div>
          <p className="leaderboard-subtitle text-muted mb-0 mt-1">
            Check your ranking and peer achievements in real-time.
            {leaderboardData?.school_name ? ` • ${leaderboardData.school_name}` : ''}
            {leaderboardData?.grade ? ` • Grade ${leaderboardData.grade}` : ''}
          </p>
        </div>

        {/* Right Header Actions: Search & Refresh */}
        <div className="d-flex align-items-center gap-2">
          {/* Refresh button */}
          <button
            type="button"
            className="btn btn-light rounded-circle d-flex align-items-center justify-content-center"
            onClick={fetchLeaderboard}
            disabled={isLoading}
            title="Refresh Leaderboard Data"
            aria-label="Refresh Leaderboard Data"
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
          >
            <span className={isLoading ? 'spinner-border spinner-border-sm text-primary' : ''}>
              {!isLoading && '🔄'}
            </span>
          </button>

          {/* Search box (when students exist) */}
          {processedStudents.length > 0 && (
            <div className="position-relative leaderboard-search-wrap">
              <span
                className="position-absolute start-0 top-50 translate-middle-y ps-3 text-muted d-flex align-items-center"
                style={{ pointerEvents: 'none' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                className="form-control rounded-pill leaderboard-search-input ps-5 pe-3"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                id="input-leaderboard-search"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-sm btn-link position-absolute end-0 top-50 translate-middle-y pe-3 text-muted text-decoration-none"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1. Loading State */}
      {isLoading && (
        <div className="text-center py-5">
          <div
            className="spinner-border text-primary mb-3"
            style={{ width: '2.5rem', height: '2.5rem' }}
            role="status"
          >
            <span className="visually-hidden">Loading leaderboard rankings...</span>
          </div>
          <h6 className="fw-semibold text-secondary">Loading leaderboard rankings...</h6>
          <p className="text-muted small">Fetching latest peer standing from Edoomate server</p>
        </div>
      )}

      {/* 2. Authentication Error State */}
      {!isLoading && authError && (
        <div className="card border-0 rounded-4 shadow-sm p-4 p-md-5 text-center my-4 bg-white">
          <div
            className="rounded-circle d-inline-flex align-items-center justify-content-center mx-auto mb-3"
            style={{ width: '56px', height: '56px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '1.5rem' }}
          >
            🔒
          </div>
          <h5 className="fw-bold text-dark mb-2">Session Expired or Missing</h5>
          <p className="text-muted small mb-4">
            Please log in again to access your live leaderboard rankings.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 py-2 fw-semibold"
              onClick={() => {
                window.location.hash = '#login'
              }}
            >
              Sign In Again
            </button>
          </div>
        </div>
      )}

      {/* 3. API Error & Retry State */}
      {!isLoading && !authError && errorMessage && (
        <div className="card border-0 rounded-4 shadow-sm p-4 p-md-5 text-center my-4 bg-white">
          <div
            className="rounded-circle d-inline-flex align-items-center justify-content-center mx-auto mb-3"
            style={{ width: '56px', height: '56px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '1.5rem' }}
          >
            ⚠️
          </div>
          <h5 className="fw-bold text-dark mb-2">Unable to Load Leaderboard</h5>
          <p className="text-muted small mb-4">{errorMessage}</p>
          <div>
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 py-2 fw-semibold"
              onClick={fetchLeaderboard}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* 4. Loaded Leaderboard Content */}
      {!isLoading && !authError && !errorMessage && leaderboardData && (
        <>
          {/* Standing Summary Card (Real API data) */}
          <div
            className="card border-0 rounded-4 p-3 p-md-4 mb-4 text-white position-relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.2)',
            }}
          >
            <div className="row align-items-center g-3">
              <div className="col-12 col-md-7">
                <span
                  className="badge rounded-pill px-3 py-1 mb-2 fw-semibold text-white"
                  style={{ fontSize: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                >
                  🏅 Real-Time Class Standings
                </span>
                <h3 className="fw-bold mb-1 text-white" style={{ fontSize: 'clamp(1.2rem, 2vw, 1.6rem)' }}>
                  {currentUser?.full_name || currentUser?.first_name || 'Student Standing'}
                </h3>
                <p className="mb-0 text-white small" style={{ maxWidth: '460px', lineHeight: 1.5, opacity: 0.9 }}>
                  {typeof leaderboardData.your_rank === 'number'
                    ? `You are currently holding rank #${leaderboardData.your_rank} among ${leaderboardData.total_students || 0} enrolled peers.`
                    : 'Track your academic rank and compete with classmates.'}
                </p>
              </div>

              <div className="col-12 col-md-5 text-md-end">
                <div className="d-inline-flex gap-3 text-center">
                  {/* Your Rank Badge */}
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '100px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                    }}
                  >
                    <div className="fs-3 fw-bold mb-0 text-white">
                      {typeof leaderboardData.your_rank === 'number' ? `#${leaderboardData.your_rank}` : '—'}
                    </div>
                    <span className="smaller fw-semibold text-white" style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                      Your Rank
                    </span>
                  </div>

                  {/* Total Students Badge */}
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '100px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                    }}
                  >
                    <div className="fs-3 fw-bold mb-0 text-white">
                      {typeof leaderboardData.total_students === 'number' ? leaderboardData.total_students : 0}
                    </div>
                    <span className="smaller fw-semibold text-white" style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                      Total Peers
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top 3 Podium (Only displayed if at least 3 students exist in real API response) */}
          {podiumList.length === 3 && (
            <div className="leaderboard-podium-section d-flex justify-content-center align-items-end gap-3 gap-md-5 my-4 py-2">
              {podiumList.map((student) => {
                const isFirst = student.rank === 1
                const avatarSize = isFirst ? 96 : 76

                // Subtle border rings matching podium ranks
                const borderStyle = isFirst
                  ? '4px solid #fbbf24' // Gold
                  : student.rank === 2
                  ? '3px solid #cbd5e1' // Silver
                  : '3px solid #fb923c' // Bronze

                const shadowStyle = isFirst
                  ? '0 0 0 4px rgba(251, 191, 36, 0.28), 0 10px 25px rgba(251, 191, 36, 0.2)'
                  : student.rank === 2
                  ? '0 0 0 3px rgba(203, 213, 225, 0.35)'
                  : '0 0 0 3px rgba(251, 146, 60, 0.25)'

                return (
                  <div
                    key={student.id}
                    className={`podium-card text-center d-flex flex-column align-items-center ${
                      isFirst
                        ? 'podium-first order-md-2'
                        : student.rank === 2
                        ? 'podium-second order-md-1'
                        : 'podium-third order-md-3'
                    }`}
                    style={{
                      marginBottom: isFirst ? '20px' : '0px',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    {/* Initials Avatar Wrap with Rank Badge */}
                    <div className="position-relative d-inline-block">
                      <InitialsAvatar
                        name={student.name}
                        size={avatarSize}
                        border={borderStyle}
                        style={{
                          boxShadow: shadowStyle,
                        }}
                        className="podium-avatar-initials"
                      />

                      {/* Rank Badge */}
                      <div
                        className="podium-rank-badge position-absolute rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                        style={{
                          top: isFirst ? '-4px' : '-2px',
                          right: isFirst ? '-4px' : '-2px',
                          width: isFirst ? '26px' : '22px',
                          height: isFirst ? '26px' : '22px',
                          backgroundColor: '#0070f3',
                          fontSize: isFirst ? '13px' : '11px',
                          border: '2px solid #ffffff',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
                          zIndex: 2,
                        }}
                      >
                        {student.rank}
                      </div>
                    </div>

                    {/* Student Name */}
                    <h3
                      className="podium-student-name mt-2 mb-1 fw-bold text-dark"
                      style={{
                        fontSize: isFirst ? '1.05rem' : '0.92rem',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {student.name}
                    </h3>

                    {/* Points Pill Badge (only if points supported) */}
                    {student.hasPoints && (
                      <div
                        className="podium-points-pill rounded-pill d-inline-flex align-items-center px-3 py-1 fw-bold"
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#0070f3',
                          fontSize: isFirst ? '0.86rem' : '0.8rem',
                          border: '1px solid rgba(0, 112, 243, 0.15)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                          lineHeight: 1.2,
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="#0070f3"
                          className="me-1"
                          style={{ flexShrink: 0 }}
                        >
                          <path d="M12 2L2 9L12 22L22 9L12 2Z" />
                        </svg>
                        <span>{student.pointsFormatted}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Table Rows or Empty State */}
          {processedStudents.length > 0 ? (
            <div className="leaderboard-table-wrap mx-auto" style={{ maxWidth: '820px' }}>
              {/* Column Headers */}
              <div
                className="d-flex align-items-center px-4 py-2 text-muted fw-semibold"
                style={{ fontSize: '0.82rem', letterSpacing: '0.03em' }}
              >
                <div style={{ width: '45px' }}>Rank</div>
                <div className="flex-grow-1 ps-2">Student</div>
                {hasAnyPoints && (
                  <div style={{ width: '100px', textAlign: 'right' }} className="pe-4">
                    Points
                  </div>
                )}
                {hasAnyTrends && (
                  <div style={{ width: '40px', textAlign: 'center' }}>Trend</div>
                )}
              </div>

              {/* Table Row Cards */}
              <div className="leaderboard-rows-list d-flex flex-column gap-2">
                {filteredRows.length > 0 ? (
                  filteredRows.map((student) => {
                    const isUserRow = Boolean(student.isUser)

                    return (
                      <div
                        key={student.id}
                        className={`leaderboard-row-card d-flex align-items-center px-4 py-3 rounded-4 ${
                          isUserRow ? 'leaderboard-user-highlight' : 'bg-white'
                        }`}
                        style={{
                          backgroundColor: isUserRow ? '#0070f3' : '#ffffff',
                          color: isUserRow ? '#ffffff' : '#0f172a',
                          boxShadow: isUserRow
                            ? '0 8px 24px rgba(0, 112, 243, 0.28)'
                            : '0 1px 4px rgba(0, 0, 0, 0.04)',
                          border: isUserRow ? 'none' : '1px solid rgba(0, 0, 0, 0.03)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                      >
                        {/* Rank Number */}
                        <div
                          className="fw-bold"
                          style={{
                            width: '45px',
                            fontSize: '1rem',
                            color: isUserRow ? '#ffffff' : '#0f172a',
                          }}
                        >
                          {student.rank}
                        </div>

                        {/* Student Circular Initials Avatar */}
                        <div className="d-flex align-items-center gap-3 flex-grow-1">
                          <InitialsAvatar
                            name={student.name}
                            size={42}
                            isUser={isUserRow}
                            className="leaderboard-row-avatar"
                          />

                          {/* Student Name */}
                          <div className="d-flex align-items-center gap-2">
                            <span
                              className="fw-bold"
                              style={{
                                fontSize: '0.96rem',
                                color: isUserRow ? '#ffffff' : '#0f172a',
                              }}
                            >
                              {student.name}
                            </span>
                            {isUserRow && (
                              <span
                                className="badge bg-white text-primary rounded-pill px-2 py-0 fw-bold"
                                style={{ fontSize: '0.7rem' }}
                              >
                                You
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Points (if present in API) */}
                        {hasAnyPoints && (
                          <div
                            className="fw-bold pe-4"
                            style={{
                              width: '100px',
                              textAlign: 'right',
                              fontSize: '0.96rem',
                              color: isUserRow ? '#ffffff' : '#0f172a',
                            }}
                          >
                            {student.pointsFormatted || '—'}
                          </div>
                        )}

                        {/* Trend Indicator (if present in API) */}
                        {hasAnyTrends && (
                          <div
                            style={{
                              width: '40px',
                              textAlign: 'center',
                              fontSize: '1.2rem',
                              fontWeight: 800,
                              lineHeight: 1,
                            }}
                          >
                            {student.trend === 'up' ? (
                              <span
                                style={{ color: isUserRow ? '#ffffff' : '#22c55e' }}
                                title="Ranking improved"
                                aria-label="Ranking improved"
                              >
                                ↑
                              </span>
                            ) : student.trend === 'down' ? (
                              <span
                                style={{ color: isUserRow ? '#ffffff' : '#ef4444' }}
                                title="Ranking dropped"
                                aria-label="Ranking dropped"
                              >
                                ↓
                              </span>
                            ) : (
                              <span
                                style={{ color: isUserRow ? '#ffffff' : '#94a3b8' }}
                                title="No change"
                                aria-label="No change"
                              >
                                —
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-5 bg-white rounded-4 shadow-sm">
                    <p className="text-muted mb-2">No students found matching "{searchQuery}"</p>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary rounded-pill px-3"
                      onClick={() => setSearchQuery('')}
                    >
                      Clear Search
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 5. Empty State (Requirement 6 - no mock data, real state) */
            <div className="card border-0 rounded-4 p-5 text-center bg-white shadow-sm my-3 mx-auto" style={{ maxWidth: '680px' }}>
              <div
                className="rounded-circle d-inline-flex align-items-center justify-content-center mx-auto mb-3"
                style={{
                  width: '68px',
                  height: '68px',
                  backgroundColor: '#eff6ff',
                  color: '#0070f3',
                  fontSize: '1.85rem',
                }}
              >
                🏆
              </div>
              <h5 className="fw-bold text-dark mb-2">No Detailed Class Leaderboard Yet</h5>
              <p className="text-muted small mx-auto mb-4" style={{ maxWidth: '440px', lineHeight: 1.6 }}>
                {typeof leaderboardData.your_rank === 'number'
                  ? `You are currently holding rank #${leaderboardData.your_rank} of ${leaderboardData.total_students || 0} students. Detailed individual student entries will display here as learning activity and test scores are registered.`
                  : 'Classroom leaderboard rankings will automatically populate as students complete course tests and lessons.'}
              </p>
              <div>
                <button
                  type="button"
                  className="btn btn-primary rounded-pill px-4 py-2 fw-semibold"
                  onClick={fetchLeaderboard}
                >
                  🔄 Refresh Rankings
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
