import React, { useState, useEffect, useMemo, useRef } from 'react'
import { courseService } from '../../services/courseService'

/**
 * Subject Icon Component
 * Generates subject-themed SVG illustrations for Science, English, Maths, etc.
 */
function SubjectVector({ subject = '', className = '' }) {
  const s = String(subject).toUpperCase()
  if (s.includes('SCI')) {
    // Science beaker / flask
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
    // English book / speech
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
    // Maths calculator / symbols
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
  // Generic graduation / study cap
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
    cardBannerBg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
    accentColor: '#2563eb',
  }
}

export default function CourseExplorationView({ onSelectCourse, onOpenDetails, onBack }) {
  // 1. Search Query with Debouncing
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // 2. Grade Filters
  const [gradesList, setGradesList] = useState(['All', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'])
  const [selectedGrade, setSelectedGrade] = useState('All')

  // 3. API Data & State
  const [allCourses, setAllCourses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // In-memory cache to prevent duplicate API requests
  const courseCacheRef = useRef({})

  // Favorites state persisted in localStorage
  const [favoriteIds, setFavoriteIds] = useState(() => {
    try {
      const stored = localStorage.getItem('edoomate_favourite_courses')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchTerm])

  // Load available grades list from backend API
  useEffect(() => {
    let isMounted = true
    async function fetchGrades() {
      try {
        const grades = await courseService.getGrades()
        if (isMounted && Array.isArray(grades) && grades.length > 0) {
          // Prepend 'All' filter if not present
          const uniqueGrades = Array.from(new Set(['All', ...grades]))
          setGradesList(uniqueGrades)
        }
      } catch (err) {
        console.warn('Using default grades:', err.message)
      }
    }
    fetchGrades()
    return () => {
      isMounted = false
    }
  }, [])

  // Fetch real courses from Backend API
  const fetchCourses = async (gradeFilter = selectedGrade) => {
    // Check cache first to avoid duplicate requests
    const cacheKey = gradeFilter || 'All'
    if (courseCacheRef.current[cacheKey]) {
      setAllCourses(courseCacheRef.current[cacheKey])
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use API-supported grade parameter or fetch all
      const coursesData = await courseService.searchCourses({
        grade: gradeFilter === 'All' ? '' : gradeFilter,
      })

      if (Array.isArray(coursesData)) {
        courseCacheRef.current[cacheKey] = coursesData
        setAllCourses(coursesData)
      } else {
        setAllCourses([])
      }
      setError(null)
      setIsLoading(false)
    } catch (err) {
      console.warn('Search API request note:', err)
      // Check if error is a 404 or "No courses found" - treat as a normal empty state, not an error banner
      const isNotFoundOrEmpty =
        err.code === 'HTTP_404' ||
        err.status === 404 ||
        /404/i.test(err.message || '') ||
        /no courses? found/i.test(err.message || '') ||
        /no subjects? found/i.test(err.message || '')

      if (isNotFoundOrEmpty) {
        courseCacheRef.current[cacheKey] = []
        setAllCourses([])
        setError(null)
      } else {
        setError(err.message || 'Unable to load subjects and courses from the server.')
      }
      setIsLoading(false)
    }
  }

  // Initial load and refetch on grade filter change
  useEffect(() => {
    fetchCourses(selectedGrade)
  }, [selectedGrade])

  // Toggle favorite course
  const toggleFavorite = (courseId, e) => {
    e.stopPropagation()
    setFavoriteIds((prev) => {
      const next = prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
      try {
        localStorage.setItem('edoomate_favourite_courses', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Filter courses by debounced search term and grade
  const filteredCourses = useMemo(() => {
    return allCourses.filter((course) => {
      // 1. Grade Filter (client-side verification to ensure 100% precision)
      if (selectedGrade !== 'All') {
        const gradeStr = String(course.grade || '').trim().toUpperCase()
        const selectedStr = String(selectedGrade).trim().toUpperCase()
        if (gradeStr !== selectedStr) {
          return false
        }
      }

      // 2. Search Term Filter across title, subject, and description
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase().trim()
        const titleMatch = (course.title || '').toLowerCase().includes(q)
        const subjectMatch = (course.subject || '').toLowerCase().includes(q)
        const descMatch = (course.description || '')
          .replace(/<[^>]*>?/gm, '')
          .toLowerCase()
          .includes(q)

        if (!titleMatch && !subjectMatch && !descMatch) {
          return false
        }
      }

      return true
    })
  }, [allCourses, selectedGrade, debouncedSearch])

  // Open course details or start learning
  const handleCardClick = (course) => {
    if (onOpenDetails) {
      onOpenDetails(course)
    } else if (onSelectCourse) {
      onSelectCourse(course)
    }
  }

  return (
    <div className="search-screen-container pb-5" id="search-screen-root">
      {/* Top Header: Title & Back Button */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 className="search-title mb-0" id="search-page-title">
          Search
        </h1>

        {onBack && (
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
        )}
      </div>

      {/* Rounded Search Input Field */}
      <div className="search-bar-section mb-4">
        <div className="position-relative w-100">
          {/* Magnifying Glass Search Icon */}
          <div
            className="position-absolute start-0 top-50 translate-middle-y ps-3 text-muted d-flex align-items-center"
            style={{ pointerEvents: 'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="20" y1="20" x2="16" y2="16" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Search Input matching exact placeholder "Search subject or course" */}
          <input
            type="text"
            className="form-control search-input-field"
            placeholder="Search subject or course"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            id="search-subject-course-input"
            autoComplete="off"
          />

          {/* Clear Search Button (✕) */}
          {searchTerm && (
            <button
              type="button"
              className="btn btn-sm btn-link text-muted position-absolute end-0 top-50 translate-middle-y pe-3 border-0 text-decoration-none"
              onClick={() => setSearchTerm('')}
              title="Clear search"
              id="btn-clear-search"
            >
              <span className="fs-6 fw-bold">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter by Grades Section */}
      <div className="filter-grades-section mb-4">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="fs-6 fw-bold text-dark mb-0" style={{ letterSpacing: '-0.01em' }}>
            Filter by grades
          </h2>
          {selectedGrade !== 'All' && (
            <button
              type="button"
              className="btn btn-link btn-sm text-primary text-decoration-none p-0 fw-semibold"
              style={{ fontSize: '0.8rem' }}
              onClick={() => setSelectedGrade('All')}
            >
              Reset grade
            </button>
          )}
        </div>

        {/* Grade Pills (I, II, III, IV, V, VI, etc.) with Selected Grade Blue Background & White Text */}
        <div className="search-grades-scroll" id="grades-filter-bar">
          {gradesList.map((grade) => {
            const isSelected = selectedGrade === grade
            return (
              <button
                key={grade}
                type="button"
                className={`grade-filter-pill ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedGrade(grade)}
                id={`grade-pill-${grade}`}
                title={`Filter by Grade ${grade}`}
              >
                {grade}
              </button>
            )
          })}
        </div>
      </div>

      {/* Error Feedback State */}
      {error && (
        <div className="alert alert-danger rounded-4 py-3 px-4 d-flex align-items-center justify-content-between mb-4 shadow-sm" role="alert">
          <div>
            <span className="fw-bold me-2">⚠️ Error:</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="btn btn-danger btn-sm rounded-pill px-3"
            onClick={() => fetchCourses(selectedGrade)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Header: Count & Active Filter Indicator */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <span className="fw-bold text-dark fs-6">Courses & Subjects</span>
          {!isLoading && (
            <span className="badge bg-light text-muted border rounded-pill px-2 py-1" style={{ fontSize: '0.75rem' }}>
              {filteredCourses.length} {filteredCourses.length === 1 ? 'course' : 'courses'}
            </span>
          )}
        </div>

        {(debouncedSearch || selectedGrade !== 'All') && !isLoading && (
          <button
            type="button"
            className="btn btn-link btn-sm text-muted text-decoration-none p-0"
            style={{ fontSize: '0.8rem' }}
            onClick={() => {
              setSearchTerm('')
              setSelectedGrade('All')
            }}
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Loading State Spinner */}
      {isLoading ? (
        <div className="text-center py-5 my-4" id="search-loading-state">
          <div className="spinner-border text-primary mb-3" style={{ width: '2.5rem', height: '2.5rem' }} role="status">
            <span className="visually-hidden">Loading courses...</span>
          </div>
          <p className="text-muted fw-semibold small">Fetching subjects and courses from Edoomate API...</p>
        </div>
      ) : filteredCourses.length === 0 ? (
        /* Empty State */
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-3" id="search-empty-state">
          <div className="display-6 mb-3">🔍</div>
          <h5 className="fw-bold text-dark mb-1">No subjects or courses found</h5>
          <p className="text-muted small mb-3">
            {debouncedSearch
              ? `No results match "${debouncedSearch}"${selectedGrade !== 'All' ? ` in Grade ${selectedGrade}` : ''}.`
              : `No courses currently available for Grade ${selectedGrade}.`}
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary btn-sm rounded-pill px-4 py-2 fw-semibold"
              onClick={() => {
                setSearchTerm('')
                setSelectedGrade('All')
              }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        /* Course Grid - Responsive Cards (Science, English, Maths, etc.) with real API data */
        <div className="row g-3 g-md-4" id="search-courses-grid">
          {filteredCourses.map((course) => {
            const isFav = favoriteIds.includes(course.id)
            const theme = getSubjectTheme(course.subject)
            const cleanDescription = (course.description || '')
              .replace(/<[^>]*>?/gm, '')
              .trim() || 'Comprehensive course lessons and interactive unit tests.'
            const lessonCount = course.course_details?.total_lessons || course.duration || 1
            const durationText = course.course_details?.total_duration || `${course.duration || 30} mins`
            const isFree = course.is_free || parseFloat(course.price || '0') === 0

            return (
              <div key={course.id} className="col-12 col-sm-6 col-lg-4 col-xl-3">
                <div
                  className="search-course-card"
                  onClick={() => handleCardClick(course)}
                  id={`course-card-${course.id}`}
                  title={`View ${course.title}`}
                >
                  {/* Top Thumbnail Container with Grade & Subject Badges */}
                  <div className="search-card-thumbnail-wrap position-relative">
                    {course.video_thumbnails_url ? (
                      <img
                        src={course.video_thumbnails_url}
                        alt={course.title}
                        className="search-card-thumbnail"
                        loading="lazy"
                        onError={(e) => {
                          // Fallback to stylized vector banner on image error
                          e.target.style.display = 'none'
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = 'flex'
                          }
                        }}
                      />
                    ) : null}

                    {/* Vector Banner Fallback */}
                    <div
                      className="w-100 h-100 align-items-center justify-content-center"
                      style={{
                        display: course.video_thumbnails_url ? 'none' : 'flex',
                        background: theme.cardBannerBg,
                        color: theme.accentColor,
                      }}
                    >
                      <SubjectVector subject={course.subject} />
                    </div>

                    {/* Grade Badge */}
                    <span className="search-card-badge bg-white text-dark shadow-sm">
                      GRADE {course.grade || 'V'}
                    </span>

                    {/* Favorite Heart Button */}
                    <button
                      type="button"
                      className="search-card-heart-btn"
                      onClick={(e) => toggleFavorite(course.id, e)}
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? '#ef4444' : 'none'}>
                        <path
                          d="M12 21.35L10.55 20.03C5.4 15.36 2 12.27 2 8.5C2 5.41 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.08C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.41 22 8.5C22 12.27 18.6 15.36 13.45 20.03L12 21.35Z"
                          stroke={isFav ? '#ef4444' : '#94a3b8'}
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Subject Tag Pill */}
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span
                      className="badge px-2 py-1 rounded-2"
                      style={{
                        backgroundColor: theme.badgeBg,
                        color: theme.badgeColor,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {theme.name.toUpperCase()}
                    </span>

                    <span className="text-muted small" style={{ fontSize: '0.74rem' }}>
                      {durationText}
                    </span>
                  </div>

                  {/* Course Title */}
                  <h3
                    className="fw-bold mb-1 text-dark"
                    style={{ fontSize: '1rem', lineHeight: '1.35', minHeight: '2.7rem' }}
                  >
                    {course.title}
                  </h3>

                  {/* Course Short Description */}
                  <p
                    className="text-secondary small mb-3 flex-grow-1"
                    style={{
                      fontSize: '0.8rem',
                      lineHeight: '1.45',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {cleanDescription}
                  </p>

                  {/* Bottom Meta & Action */}
                  <div className="d-flex align-items-center justify-content-between pt-2 border-top mt-auto">
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge bg-light text-dark border px-2 py-1" style={{ fontSize: '0.72rem' }}>
                        {lessonCount} {lessonCount === 1 ? 'Lesson' : 'Lessons'}
                      </span>
                      <span className="fw-bold small" style={{ color: isFree ? '#16a34a' : '#2563eb' }}>
                        {isFree ? 'Free' : `$${course.discounted_price || course.price}`}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 fw-bold text-decoration-none text-primary d-inline-flex align-items-center gap-1"
                      style={{ fontSize: '0.85rem' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCardClick(course)
                      }}
                    >
                      <span>Explore</span>
                      <span>›</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
