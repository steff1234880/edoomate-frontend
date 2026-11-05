import React, { useState, useEffect, useCallback } from 'react'
import { courseService } from '../../services/courseService'
import { authService } from '../../services/authService'

/**
 * Subject Icon Component
 * Generates subject-themed SVG illustrations for Science, English, Maths, etc.
 */
function SubjectVector({ subject = '', className = '' }) {
  const s = String(subject).toUpperCase()
  if (s.includes('SCI')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M9 3H15M10 3V8.5L5.2 17.2C4.5 18.5 5.5 20 7 20H17C18.5 20 19.5 18.5 18.8 17.2L14 8.5V3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7.5 14.5H16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10" cy="17" r="1" fill="currentColor" />
        <circle cx="14" cy="16" r="1.2" fill="currentColor" />
      </svg>
    )
  }
  if (s.includes('ENG')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.5 2H20V22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 7H16M8 11H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (s.includes('MATH')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="4" y="2" width="16" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
        <line x1="8" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="11" r="1" fill="currentColor" />
        <circle cx="12" cy="11" r="1" fill="currentColor" />
        <circle cx="16" cy="11" r="1" fill="currentColor" />
        <circle cx="8" cy="15" r="1" fill="currentColor" />
        <circle cx="12" cy="15" r="1" fill="currentColor" />
        <circle cx="16" cy="15" r="1" fill="currentColor" />
        <circle cx="8" cy="19" r="1" fill="currentColor" />
        <circle cx="12" cy="19" r="1" fill="currentColor" />
        <circle cx="16" cy="19" r="1" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M22 10V16M2 10L12 5L22 10L12 15L2 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 12.5V17C6 19.5 8.7 21 12 21C15.3 21 18 19.5 18 17V12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Returns distinct colors and styling badges for subjects
 */
function getSubjectTheme(subject = '') {
  const s = String(subject).toUpperCase()
  if (s.includes('SCI')) {
    return {
      name: 'Science',
      badgeBg: '#ede9fe',
      badgeColor: '#6d28d9',
      cardBannerBg: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)',
      accentColor: '#7c3aed',
    }
  }
  if (s.includes('ENG')) {
    return {
      name: 'English',
      badgeBg: '#dcfce7',
      badgeColor: '#15803d',
      cardBannerBg: 'linear-gradient(135deg, #dcfce7 0%, #ccfbf1 100%)',
      accentColor: '#16a34a',
    }
  }
  if (s.includes('MATH')) {
    return {
      name: 'Maths',
      badgeBg: '#ffedd5',
      badgeColor: '#c2410c',
      cardBannerBg: 'linear-gradient(135deg, #ffedd5 0%, #fef3c7 100%)',
      accentColor: '#ea580c',
    }
  }
  return {
    name: subject || 'General',
    badgeBg: '#f1f5f9',
    badgeColor: '#334155',
    cardBannerBg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    accentColor: '#2563eb',
  }
}

/**
 * Resolves a reliable absolute image URL from an API course object
 */
function resolveCourseImageUrl(item, nestedCourse = {}) {
  const candidates = [
    item?.video_thumbnails_url,
    nestedCourse?.video_thumbnails_url,
    item?.thumbnail_url,
    nestedCourse?.thumbnail_url,
    item?.image_url,
    nestedCourse?.image_url,
    item?.image,
    nestedCourse?.image,
    item?.thumbnail,
    nestedCourse?.thumbnail,
    item?.video_thumbnail,
    nestedCourse?.video_thumbnail,
    item?.course_image,
    nestedCourse?.course_image,
    item?.cover_image,
    nestedCourse?.cover_image,
  ]

  for (const val of candidates) {
    if (typeof val === 'string') {
      const trimmed = val.trim()
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') continue

      // Absolute HTTP/HTTPS URL
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed
      }

      // Root-relative path
      if (trimmed.startsWith('/')) {
        return `https://edoomate.myieltspartner.com${trimmed}`
      }

      // Relative path containing storage
      if (trimmed.startsWith('storage/')) {
        return `https://edoomate.myieltspartner.com/${trimmed}`
      }

      // Plain filename (e.g. "KqDUsVTKAdAHN9vZDcxcXuREIdQ4kI9BAaEYQPMR.jpg")
      return `https://edoomate.myieltspartner.com/storage/video_thumbnails/${trimmed}`
    }
  }

  return null
}

export default function MyCoursesView({ onBack, onSelectCourse, initialSearch = '' }) {
  const [courses, setCourses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [authError, setAuthError] = useState(null) // 'AUTH_MISSING' | 'AUTH_EXPIRED' | null
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [selectedFilter, setSelectedFilter] = useState('all')

  const fetchMyCourses = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    setAuthError(null)

    const token = authService.getToken()
    if (!token) {
      setAuthError('AUTH_MISSING')
      setIsLoading(false)
      return
    }

    try {
      const response = await courseService.getMyLearningCourses(token)

      // Normalize backend response:
      // Endpoint returns: { success: true, message: "...", data: { active_courses: [], expired_courses: [] } }
      // Or an array directly: { success: true, data: [...] }
      let list = []
      if (Array.isArray(response?.data)) {
        list = response.data
      } else if (response?.data && typeof response.data === 'object') {
        const active = Array.isArray(response.data.active_courses)
          ? response.data.active_courses.map((c) => ({ ...c, _is_expired: false, _is_active_enrollment: true }))
          : []

        // Set of active course IDs to avoid showing repurchased/renewed courses as expired
        const activeIds = new Set(
          active.map((c) => Number(c.course_id ?? c.course?.id ?? c.id)).filter(Boolean)
        )

        const expired = Array.isArray(response.data.expired_courses)
          ? response.data.expired_courses
              .filter((c) => {
                const cId = Number(c.course_id ?? c.course?.id ?? c.id)
                return !activeIds.has(cId)
              })
              .map((c) => ({ ...c, _is_expired: true, _is_active_enrollment: false }))
          : []

        list = [...active, ...expired]
      }

      // Map raw API objects to standardized view models
      const baseFormatted = list.map((item) => {
        const nestedCourse = item.course && typeof item.course === 'object' ? item.course : {}

        const id = item.course_id ?? nestedCourse.id ?? item.id

        // Title: only if provided
        const title = item.title ?? nestedCourse.title ?? item.name ?? null

        // Thumbnail: resolved dynamically from all API fields (absolute or relative)
        const rawThumb = resolveCourseImageUrl(item, nestedCourse)

        // Progress: only if explicitly provided in API response as a number
        let progress = null
        if (typeof item.progress === 'number') {
          progress = Math.min(100, Math.max(0, item.progress))
        } else if (typeof item.progress_percentage === 'number') {
          progress = Math.min(100, Math.max(0, item.progress_percentage))
        } else if (typeof item.percentage === 'number') {
          progress = Math.min(100, Math.max(0, item.percentage))
        } else if (typeof nestedCourse.progress === 'number') {
          progress = Math.min(100, Math.max(0, nestedCourse.progress))
        }

        // Determine expiration strictly using authoritative backend source flags and dates
        const isFromActive = item._is_active_enrollment === true
        const expiryCheck = courseService.checkExpiryDate(item, isFromActive)
        const isExpired = Boolean(
          (!isFromActive && item._is_expired) ||
          expiryCheck.isExpired
        )

        // Status: only if available in API response
        let status = null
        if (isExpired) {
          status = 'Expired'
        } else if (item.status_name) {
          status = item.status_name
        } else if (item.status_text) {
          status = item.status_text
        } else if (typeof item.status === 'string') {
          status = item.status
        } else if (item.status === 1) {
          status = 'Active'
        } else if (item.status === 0) {
          status = 'Inactive'
        } else if (nestedCourse.status_name) {
          status = nestedCourse.status_name
        } else if (nestedCourse.status === 1) {
          status = 'Active'
        }

        // Optional metadata from API
        const grade = item.grade ?? nestedCourse.grade ?? null
        const subject = item.subject ?? nestedCourse.subject ?? null
        const lessonsCount =
          item.course_details?.total_lessons ??
          nestedCourse.course_details?.total_lessons ??
          item.total_lessons ??
          nestedCourse.total_lessons ??
          null

        return {
          raw: item,
          id: id || `api-course-${Math.random()}`,
          title,
          thumbnail: rawThumb,
          progress,
          status,
          grade,
          subject,
          lessons: lessonsCount ? `${lessonsCount} Lessons` : null,
          isExpired,
        }
      })

      // Immediately display available courses
      setCourses(baseFormatted)

      // Concurrently enrich each course with authoritative backend metadata (GET /api/course/{id})
      // to ensure exact course thumbnail (video_thumbnails_url), subject, grade, and metrics
      Promise.all(
        baseFormatted.map(async (c) => {
          if (!c.id) return c
          try {
            const cleanId = String(c.id).replace(/^api-/, '')
            const detail = await courseService.getCourseDetails(cleanId, token)
            if (detail) {
              const enrichedThumb = resolveCourseImageUrl(detail) || c.thumbnail
              return {
                ...c,
                title: c.title || detail.title,
                thumbnail: enrichedThumb,
                grade: c.grade || detail.grade,
                subject: c.subject || detail.subject,
                lessons: c.lessons || (detail.course_details?.total_lessons ? `${detail.course_details.total_lessons} Lessons` : null),
                raw: { ...detail, ...c.raw },
              }
            }
          } catch (e) {
            // Keep baseFormatted item on network failure
          }
          return c
        })
      ).then((enriched) => {
        setCourses(enriched)
      })
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') {
        setAuthError('AUTH_EXPIRED')
      } else if (err.code === 'AUTH_MISSING') {
        setAuthError('AUTH_MISSING')
      } else {
        setErrorMessage(err.message || 'Unable to fetch enrolled courses.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMyCourses()
  }, [fetchMyCourses])

  const handleReLogin = () => {
    authService.logout()
    window.location.hash = '#login'
  }

  // Filter according to search query and category
  const filteredCourses = courses.filter((course) => {
    const courseTitle = course.title || ''
    const courseGrade = course.grade || ''
    const courseSubject = course.subject || ''
    const matchesSearch =
      !searchQuery.trim() ||
      courseTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      courseGrade.toLowerCase().includes(searchQuery.toLowerCase()) ||
      courseSubject.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    if (selectedFilter === 'all') return true
    if (selectedFilter === 'active') return !course.isExpired
    if (selectedFilter === 'expired') return Boolean(course.isExpired)
    return true
  })

  return (
    <div className="my-courses-view animate-fade-in">
      {/* Top Header & Search Bar */}
      <div className="d-flex flex-wrap align-items-center justify-content-between p-3 bg-white border-bottom rounded-4 mb-4 shadow-sm gap-2 gap-md-3">
        <div className="d-flex align-items-center gap-2 gap-sm-3 min-w-0">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            onClick={onBack}
            id="btn-back-dashboard"
            aria-label="Back to Dashboard"
            title="Back to Dashboard"
            style={{ width: '32px', height: '32px', padding: 0 }}
          >
            ←
          </button>
          <div className="min-w-0">
            <h4 className="mb-0 fw-bold fs-6 text-dark my-learning-header-title">My Learning</h4>
            <span className="text-muted small my-learning-header-sub">
              Real-time progress and enrolled courses
            </span>
          </div>
        </div>

        {/* Live Search Input */}
        <div
          className="search-bar-wrap position-relative w-100"
          style={{ minWidth: '200px', maxWidth: '360px', flex: 1 }}
        >
          <input
            type="text"
            className="form-control form-control-sm rounded-pill ps-4 pe-4 bg-light border-0"
            placeholder="Search enrolled courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="course-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="btn btn-sm btn-link position-absolute end-0 top-50 translate-middle-y text-muted text-decoration-none pe-3"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* 1. Missing Authentication State */}
      {authError === 'AUTH_MISSING' && (
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-4">
          <div className="display-5 mb-3">🔒</div>
          <h4 className="fw-bold text-dark mb-2">Authentication Required</h4>
          <p className="text-muted small mb-4" style={{ maxWidth: '420px', margin: '0 auto' }}>
            Please log in to your student account to view your enrolled courses and learning curriculum.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              onClick={() => {
                window.location.hash = '#login'
              }}
              id="btn-login-redirect"
            >
              Log In to Edoomate →
            </button>
          </div>
        </div>
      )}

      {/* 2. Expired Authentication State */}
      {authError === 'AUTH_EXPIRED' && (
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-4">
          <div className="display-5 mb-3">⏳</div>
          <h4 className="fw-bold text-dark mb-2">Session Expired</h4>
          <p className="text-muted small mb-4" style={{ maxWidth: '420px', margin: '0 auto' }}>
            Your login session has expired. Please log in again to continue accessing your enrolled courses.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              onClick={handleReLogin}
              id="btn-relogin-redirect"
            >
              Log In Again →
            </button>
          </div>
        </div>
      )}

      {/* 3. API Error State */}
      {!authError && errorMessage && (
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-4">
          <div className="display-5 mb-3 text-danger">⚠️</div>
          <h5 className="fw-bold text-dark mb-2">Unable to Load Enrolled Courses</h5>
          <p className="text-muted small mb-4" style={{ maxWidth: '440px', margin: '0 auto' }}>
            {errorMessage}
          </p>
          <div className="d-flex justify-content-center gap-2">
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              onClick={fetchMyCourses}
              id="btn-retry-my-learning"
            >
              🔄 Try Again
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary rounded-pill px-4"
              onClick={onBack}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* 4. Loading State */}
      {isLoading && !authError && !errorMessage && (
        <div className="text-center py-5">
          <div
            className="spinner-border text-primary mb-3"
            style={{ width: '2.5rem', height: '2.5rem' }}
            role="status"
          >
            <span className="visually-hidden">Loading courses from API...</span>
          </div>
          <h6 className="fw-semibold text-secondary">Fetching your enrolled courses...</h6>
          <p className="text-muted small">Connecting to Edoomate server</p>
        </div>
      )}

      {/* 5. Loaded State */}
      {!isLoading && !authError && !errorMessage && (
        <>
          {/* Filter Tabs if multiple courses */}
          {courses.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mb-4 align-items-center">
              <span className="small fw-bold text-secondary me-2">Filter:</span>
              {[
                { key: 'all', label: `All (${courses.length})` },
                { key: 'active', label: `Active (${courses.filter((c) => !c.isExpired).length})` },
                { key: 'expired', label: `Expired (${courses.filter((c) => c.isExpired).length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`btn btn-sm rounded-pill px-3 ${
                    selectedFilter === tab.key
                      ? 'btn-primary fw-semibold'
                      : 'btn-outline-secondary bg-white'
                  }`}
                  onClick={() => setSelectedFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Empty Courses State */}
          {courses.length === 0 ? (
            <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-3">
              <div className="display-4 mb-3">🎓</div>
              <h4 className="fw-bold text-dark mb-2">No Enrolled Courses Found</h4>
              <p className="text-muted small mb-4" style={{ maxWidth: '420px', margin: '0 auto' }}>
                You are not currently enrolled in any courses on your student account. Explore our full course catalog to start learning!
              </p>
              <div className="d-flex justify-content-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary rounded-pill px-4 fw-semibold"
                  onClick={() => {
                    window.location.hash = '#explore'
                  }}
                  id="btn-explore-catalog"
                >
                  🔍 Explore Courses
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary rounded-pill px-4"
                  onClick={onBack}
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          ) : filteredCourses.length === 0 ? (
            /* Search filter yielded no results */
            <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-3">
              <div className="display-5 mb-2">🔍</div>
              <h5 className="fw-bold">No enrolled courses match "{searchQuery}"</h5>
              <p className="text-muted small mb-3">Try searching for a different term or clear the search query.</p>
              <div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-4"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search
                </button>
              </div>
            </div>
          ) : (
            /* Course Cards Grid */
            <div className="row g-4">
              {filteredCourses.map((course) => (
                <div key={course.id} className="col-12 col-md-6 col-lg-4">
                  <div
                    className="course-card h-100 cursor-pointer d-flex flex-column"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const act = course.progress && course.progress > 0 ? 'resume' : 'start'
                      onSelectCourse(course.raw || course, act)
                    }}
                  >
                    {/* Thumbnail Wrap */}
                    <div className="course-card-thumb-wrap position-relative">
                      {/* Grade Badge: only if available */}
                      {course.grade && (
                        <span className="course-grade-badge">GRADE {course.grade}</span>
                      )}

                      {/* Course Status Badge: only if available */}
                      {course.status && (
                        <span
                          className={`badge position-absolute top-0 end-0 m-2 rounded-pill px-2 py-1 ${
                            course.isExpired
                              ? 'bg-secondary'
                              : course.status.toLowerCase() === 'active' ||
                                course.status.toLowerCase() === 'enrolled'
                              ? 'bg-success'
                              : 'bg-primary'
                          }`}
                          style={{ fontSize: '0.68rem', zIndex: 2 }}
                        >
                          {course.status}
                        </span>
                      )}

                      {/* Thumbnail Image: only if available in API response */}
                      {course.thumbnail ? (
                        <img
                          src={course.thumbnail}
                          alt={course.title || 'Course thumbnail'}
                          className="course-card-thumb"
                          loading="lazy"
                          onError={(e) => {
                            // On load failure, hide broken image and reveal vector banner fallback
                            e.currentTarget.style.display = 'none'
                            if (e.currentTarget.nextElementSibling) {
                              e.currentTarget.nextElementSibling.style.display = 'flex'
                            }
                          }}
                        />
                      ) : null}

                      {/* Theme-aware Vector Banner Fallback */}
                      {(() => {
                        const theme = getSubjectTheme(course.subject)
                        return (
                          <div
                            className="course-card-thumb align-items-center justify-content-center"
                            style={{
                              display: course.thumbnail ? 'none' : 'flex',
                              background: theme.cardBannerBg,
                              color: theme.accentColor,
                              minHeight: '105px',
                            }}
                          >
                            <SubjectVector subject={course.subject} />
                          </div>
                        )
                      })()}
                    </div>

                    {/* Course Card Body */}
                    <div className="course-card-body d-flex flex-column pt-3 flex-grow-1">
                      {/* Course Title: only if available */}
                      {course.title ? (
                        <h4 className="course-card-title mb-1">{course.title}</h4>
                      ) : (
                        <h4 className="course-card-title mb-1 text-muted fst-italic">Untitled Course</h4>
                      )}

                      {/* Lessons & Subject Meta: only if available */}
                      {(course.lessons || course.subject) && (
                        <div className="course-card-meta small text-muted mb-2">
                          {course.lessons && <span>{course.lessons}</span>}
                          {course.lessons && course.subject && (
                            <span className="meta-separator">•</span>
                          )}
                          {course.subject && <span>{course.subject}</span>}
                        </div>
                      )}

                      {/* Course Progress: only for active, non-expired courses when progress is available */}
                      {!course.isExpired && course.progress !== null && (
                        <div className="course-mini-progress mb-3">
                          <div
                            className="d-flex justify-content-between small text-muted mb-1"
                            style={{ fontSize: '0.75rem' }}
                          >
                            <span>Progress</span>
                            <span className="fw-semibold text-dark">{course.progress}%</span>
                          </div>
                          <div className="progress" style={{ height: '6px', borderRadius: '4px' }}>
                            <div
                              className="progress-bar bg-success rounded-pill"
                              role="progressbar"
                              style={{ width: `${course.progress}%` }}
                              aria-valuenow={course.progress}
                              aria-valuemin="0"
                              aria-valuemax="100"
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="mt-auto pt-2">
                        <button
                          type="button"
                          className="course-card-btn primary-btn w-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            const act = !course.isExpired && course.progress && course.progress > 0 ? 'resume' : 'start'
                            onSelectCourse(course.raw || course, act)
                          }}
                        >
                          {!course.isExpired && course.progress && course.progress > 0
                            ? 'Resume Learning'
                            : 'Start Learning'}{' '}
                          →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
