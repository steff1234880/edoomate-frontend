import React, { useState, useEffect, useMemo, useRef } from 'react'
import { courseService } from '../../services/courseService'
import { authService } from '../../services/authService'
import edoomateLogo from '../../assets/edoomate-logo.png'

// Fallback high-resolution thematic assets for standard subjects
import mathThumb from '../../assets/dashboard/course-math-hd.jpg'
import physicsThumb from '../../assets/dashboard/course-physics-hd.jpg'
import historyThumb from '../../assets/dashboard/course-history-hd.jpg'
import classroomGirlImg from '../../assets/dashboard/classroom-girl-hd.jpg'
import bannerVortexImg from '../../assets/dashboard/banner-vortex-hd.jpg'

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
  if (s.includes('HIST')) {
    // History scroll / temple
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M4 19.5V4.5C4 3.12 5.12 2 6.5 2H18a2 2 0 0 1 2 2v14.5a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8" y1="7" x2="16" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="8" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="8" y1="15" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (s.includes('GEO')) {
    // Geography globe
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (s.includes('COMP')) {
    // Computer screen
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
 * Returns distinct colors, banner backgrounds, and images for subjects
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
      fallbackImg: physicsThumb,
    }
  }
  if (s.includes('ENG')) {
    return {
      name: 'English',
      badgeBg: '#dcfce7',
      badgeColor: '#15803d',
      cardBannerBg: 'linear-gradient(135deg, #dcfce7 0%, #ccfbf1 100%)',
      accentColor: '#16a34a',
      fallbackImg: classroomGirlImg,
    }
  }
  if (s.includes('MATH')) {
    return {
      name: 'Maths',
      badgeBg: '#ffedd5',
      badgeColor: '#c2410c',
      cardBannerBg: 'linear-gradient(135deg, #ffedd5 0%, #fef3c7 100%)',
      accentColor: '#ea580c',
      fallbackImg: mathThumb,
    }
  }
  if (s.includes('HIST')) {
    return {
      name: 'History',
      badgeBg: '#fef3c7',
      badgeColor: '#b45309',
      cardBannerBg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      accentColor: '#d97706',
      fallbackImg: historyThumb,
    }
  }
  if (s.includes('GEO')) {
    return {
      name: 'Geography',
      badgeBg: '#e0f2fe',
      badgeColor: '#0369a1',
      cardBannerBg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
      accentColor: '#0284c7',
      fallbackImg: bannerVortexImg,
    }
  }
  if (s.includes('COMP')) {
    return {
      name: 'Computer',
      badgeBg: '#f3e8ff',
      badgeColor: '#7e22ce',
      cardBannerBg: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
      accentColor: '#9333ea',
      fallbackImg: bannerVortexImg,
    }
  }
  return {
    name: subject || 'General',
    badgeBg: '#f1f5f9',
    badgeColor: '#334155',
    cardBannerBg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
    accentColor: '#2563eb',
    fallbackImg: classroomGirlImg,
  }
}

export default function CourseExplorationView({ onSelectCourse, onOpenDetails, onBack, currentUser = null }) {
  // 1. Logged-in User's Registered Grade
  const [registeredGrade, setRegisteredGrade] = useState(() => {
    const user = currentUser || authService.getUser()
    return user?.grade ? String(user.grade).trim() : 'VII'
  })

  // 2. Search Query with Debouncing
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // 3. Dynamic Grades & Selected Grade (Locked strictly to user's registered grade)
  const [gradesList, setGradesList] = useState(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'])
  const [selectedGrade, setSelectedGrade] = useState(() => registeredGrade)

  // 4. Dynamic Subjects & Selected Subject Drill-down
  const [subjectsMap, setSubjectsMap] = useState({})
  const [selectedSubject, setSelectedSubject] = useState(null) // null = show subject cards, string = show courses in that subject

  // 5. API Data & State
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

  // Step 1: Fetch user's registered grade dynamically from backend API
  useEffect(() => {
    let isMounted = true
    async function loadUserProfile() {
      try {
        const profile = await authService.getUserProfile().catch(() => null)
        const userGrade = profile?.grade || profile?.data?.grade || currentUser?.grade || authService.getUser()?.grade
        if (isMounted && userGrade) {
          const cleanGrade = String(userGrade).trim()
          setRegisteredGrade(cleanGrade)
          setSelectedGrade(cleanGrade)
        }
      } catch (err) {
        console.warn('Using cached user registered grade:', err.message)
      }
    }
    loadUserProfile()
    return () => {
      isMounted = false
    }
  }, [currentUser])

  // Step 2: Load dynamic grades list and subjects dictionary from backend API
  useEffect(() => {
    let isMounted = true
    async function fetchMetadata() {
      try {
        const [gradesData, subjectsData] = await Promise.all([
          courseService.getGrades().catch(() => null),
          courseService.getSubjects().catch(() => null),
        ])

        if (isMounted) {
          if (Array.isArray(gradesData) && gradesData.length > 0) {
            setGradesList(gradesData)
          } else if (gradesData && typeof gradesData === 'object') {
            const list = Object.values(gradesData)
            if (list.length > 0) setGradesList(list)
          }

          if (subjectsData && typeof subjectsData === 'object') {
            setSubjectsMap(subjectsData)
          }
        }
      } catch (err) {
        console.warn('Metadata load note:', err.message)
      }
    }
    fetchMetadata()
    return () => {
      isMounted = false
    }
  }, [])

  // Step 3: Fetch real courses from Backend API for the registered grade
  const fetchCourses = async (gradeFilter = registeredGrade) => {
    const targetGrade = gradeFilter || registeredGrade
    const cacheKey = targetGrade || 'ALL'
    if (courseCacheRef.current[cacheKey]) {
      setAllCourses(courseCacheRef.current[cacheKey])
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const coursesData = await courseService.searchCourses({
        grade: targetGrade,
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

  // Refetch when registeredGrade resolves
  useEffect(() => {
    if (registeredGrade) {
      setSelectedGrade(registeredGrade)
      fetchCourses(registeredGrade)
    }
  }, [registeredGrade])

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

  // Calculate dynamic subjects available for the registered grade from courses returned by backend API
  const availableSubjects = useMemo(() => {
    // 1. Group active, available courses by subject for this grade
    const countBySubject = {}
    const thumbBySubject = {}
    const courseTitlesBySubject = {}

    allCourses.forEach((c) => {
      // Respect course active status if provided by backend (e.g. status: 1 or is_active !== false)
      const isCourseActive =
        c.status === undefined || c.status === null || c.status === 1 || c.status === '1' || c.is_active === true
      if (!isCourseActive) return

      const sKey = String(c.subject || '').toUpperCase().trim()
      if (sKey) {
        countBySubject[sKey] = (countBySubject[sKey] || 0) + 1
        if (c.video_thumbnails_url && !thumbBySubject[sKey]) {
          thumbBySubject[sKey] = c.video_thumbnails_url
        }
        if (!courseTitlesBySubject[sKey]) {
          courseTitlesBySubject[sKey] = []
        }
        if (c.title) {
          courseTitlesBySubject[sKey].push(c.title)
        }
      }
    })

    // 2. Build list ONLY for subjects that are currently active/available according to the backend API for this grade
    const activeSubjectKeys = Object.keys(countBySubject)
    const list = []

    activeSubjectKeys.forEach((key) => {
      const upperKey = key.toUpperCase()
      // Subject name fetched dynamically from subjectsMap or capitalized key, without hardcoding
      const displayName =
        subjectsMap[key] ||
        subjectsMap[upperKey] ||
        key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
      const count = countBySubject[upperKey] || 0
      const theme = getSubjectTheme(key)
      const image = thumbBySubject[upperKey] || theme.fallbackImg

      list.push({
        key: upperKey,
        name: displayName,
        count,
        theme,
        image,
        titles: courseTitlesBySubject[upperKey] || [],
      })
    })

    // 3. Filter by search term if user is searching while in subjects view
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim()
      return list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.key.toLowerCase().includes(q) ||
          s.titles.some((t) => t.toLowerCase().includes(q))
      )
    }

    return list
  }, [allCourses, subjectsMap, debouncedSearch])

  // Filter courses for the selected subject and search query
  const filteredCourses = useMemo(() => {
    return allCourses.filter((course) => {
      // 1. Grade Filter (Enforce registered grade)
      if (registeredGrade) {
        const gradeStr = String(course.grade || '').trim().toUpperCase()
        const targetStr = String(registeredGrade).trim().toUpperCase()
        if (gradeStr && targetStr && gradeStr !== targetStr) {
          return false
        }
      }

      // 2. Subject Filter (when a subject is selected)
      if (selectedSubject) {
        const courseSubj = String(course.subject || '').toUpperCase().trim()
        const selectedSubj = String(selectedSubject).toUpperCase().trim()
        if (courseSubj !== selectedSubj) {
          return false
        }
      }

      // 3. Search Term Filter across title, subject, and description
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
  }, [allCourses, registeredGrade, selectedSubject, debouncedSearch])

  // Open course details or start learning
  const handleCardClick = (course) => {
    if (onOpenDetails) {
      onOpenDetails(course)
    } else if (onSelectCourse) {
      onSelectCourse(course)
    }
  }

  // Handle grade click: only registered grade can be selected
  const handleGradeClick = (grade) => {
    const isUnlocked = String(grade).toUpperCase().trim() === String(registeredGrade).toUpperCase().trim()
    if (!isUnlocked) {
      // Enforce backend authorization: User cannot select other grades
      return
    }
    setSelectedGrade(grade)
    setSelectedSubject(null) // Reset subject filter when toggling
  }

  // Resolve active subject display name
  const selectedSubjectDisplayName = useMemo(() => {
    if (!selectedSubject) return ''
    return subjectsMap[selectedSubject] || getSubjectTheme(selectedSubject).name
  }, [selectedSubject, subjectsMap])

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

          {/* Search Input */}
          <input
            type="text"
            className="form-control search-input-field"
            placeholder={selectedSubject ? `Search in ${selectedSubjectDisplayName}...` : 'Search subject or course'}
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
        </div>

        {/* Grade Pills: Only registered grade is unlocked. Other grades display lock icon 🔒 and are disabled */}
        <div className="search-grades-scroll" id="grades-filter-bar">
          {gradesList.map((grade) => {
            const isRegistered = String(grade).toUpperCase().trim() === String(registeredGrade).toUpperCase().trim()
            const isSelected = selectedGrade === grade && isRegistered

            return (
              <button
                key={grade}
                type="button"
                className={`grade-filter-pill ${isSelected ? 'active' : ''} ${!isRegistered ? 'locked-grade' : ''}`}
                onClick={() => handleGradeClick(grade)}
                disabled={!isRegistered}
                id={`grade-pill-${grade}`}
                title={isRegistered ? `Your registered Grade ${grade}` : `Grade ${grade} is locked. You are registered for Grade ${registeredGrade}.`}
                style={{
                  cursor: isRegistered ? 'pointer' : 'not-allowed',
                  opacity: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: isSelected ? '#1d9bf0' : '#f1f5f9',
                  color: isSelected ? '#ffffff' : '#334155',
                  borderColor: isSelected ? '#1d9bf0' : 'transparent',
                  fontWeight: isSelected ? 700 : 500,
                  padding: '6px 14px',
                  borderRadius: '9999px',
                }}
              >
                <span>{grade}</span>
                {!isRegistered && (
                  <span
                    role="img"
                    aria-label="locked"
                    style={{
                      fontSize: '0.78rem',
                      opacity: 0.65,
                      marginLeft: '2px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    🔒
                  </span>
                )}
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
            onClick={() => fetchCourses(registeredGrade)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        /* Loading Spinner */
        <div className="text-center py-5 my-4" id="search-loading-state">
          <div className="spinner-border text-primary mb-3" style={{ width: '2.5rem', height: '2.5rem' }} role="status">
            <span className="visually-hidden">Loading courses...</span>
          </div>
          <p className="text-muted fw-semibold small">Fetching subjects and courses for Grade {registeredGrade}...</p>
        </div>
      ) : selectedSubject ? (
        /* ==================== VIEW 2: COURSES FOR SELECTED SUBJECT ==================== */
        <div id="subject-courses-view">
          {/* Breadcrumb / Navigation back to all subjects */}
          <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-light btn-sm rounded-pill px-3 py-1 fw-bold text-secondary d-inline-flex align-items-center gap-1 border"
                onClick={() => {
                  setSelectedSubject(null)
                  setSearchTerm('')
                }}
                id="btn-back-to-subjects"
                title="Back to all subjects"
                style={{ fontSize: '0.82rem' }}
              >
                <span>←</span>
                <span>All Subjects</span>
              </button>

              <span className="text-muted small">/</span>

              {/* Requirement 6: Display the selected subject name above the course list */}
              <h3 className="fw-bold text-dark fs-5 mb-0" id="selected-subject-heading">
                {selectedSubjectDisplayName} Courses
              </h3>
            </div>

            <span className="badge bg-light text-muted border rounded-pill px-2.5 py-1" style={{ fontSize: '0.75rem' }}>
              {filteredCourses.length} {filteredCourses.length === 1 ? 'course' : 'courses'}
            </span>
          </div>

          {filteredCourses.length === 0 ? (
            /* Empty Courses for this Subject */
            <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-3" id="subject-empty-courses">
              <div className="display-6 mb-3">📚</div>
              <h5 className="fw-bold text-dark mb-1">No courses found for {selectedSubjectDisplayName}</h5>
              <p className="text-muted small mb-3">
                {debouncedSearch
                  ? `No courses match "${debouncedSearch}" in ${selectedSubjectDisplayName}.`
                  : `There are currently no published courses in ${selectedSubjectDisplayName} for Grade ${registeredGrade}.`}
              </p>
              <div>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm rounded-pill px-4 py-2 fw-semibold"
                  onClick={() => setSelectedSubject(null)}
                >
                  Browse Other Subjects
                </button>
              </div>
            </div>
          ) : (
            /* Course Cards Grid */
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
                          GRADE {course.grade || registeredGrade}
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
      ) : (
        /* ==================== VIEW 1: SUBJECT CARDS GRID ==================== */
        <div id="subjects-cards-view">
          {/* Header */}
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <span className="fw-bold text-dark fs-6">Available Subjects</span>
              <span className="badge bg-light text-muted border rounded-pill px-2 py-1" style={{ fontSize: '0.75rem' }}>
                {availableSubjects.length} {availableSubjects.length === 1 ? 'subject' : 'subjects'}
              </span>
            </div>

            {debouncedSearch && (
              <button
                type="button"
                className="btn btn-link btn-sm text-muted text-decoration-none p-0"
                style={{ fontSize: '0.8rem' }}
                onClick={() => setSearchTerm('')}
              >
                Clear search
              </button>
            )}
          </div>

          {availableSubjects.length === 0 ? (
            /* Empty State */
            <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-3" id="search-empty-state">
              <div className="display-6 mb-3">🔍</div>
              <h5 className="fw-bold text-dark mb-1">No subjects found</h5>
              <p className="text-muted small mb-3">
                {debouncedSearch
                  ? `No subjects match "${debouncedSearch}".`
                  : `No subjects currently available for Grade ${registeredGrade}.`}
              </p>
              <div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-4 py-2 fw-semibold"
                  onClick={() => setSearchTerm('')}
                >
                  Clear Search
                </button>
              </div>
            </div>
          ) : (
            /* Subject Cards Grid matching Screenshot 1: 2-column layout with Edoomate logo and centered subject name */
            <div className="row g-3 g-md-4" id="subjects-grid">
              {availableSubjects.map((subj) => {
                return (
                  <div key={subj.key} className="col-6 col-md-4 col-lg-3">
                    <div
                      className="subject-display-card"
                      onClick={() => {
                        setSelectedSubject(subj.key)
                        setSearchTerm('')
                      }}
                      id={`subject-card-${subj.key}`}
                      title={`Explore ${subj.name} courses`}
                    >
                      {/* Stylized Edoomate Brand Logo */}
                      <div className="subject-card-logo-wrap">
                        <img
                          src={edoomateLogo}
                          alt="edoomate"
                          className="subject-card-logo"
                        />
                      </div>

                      {/* Subject Name matching Screenshot (e.g. English, Maths) */}
                      <div className="subject-card-name">
                        {subj.name}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
