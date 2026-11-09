/**
 * Course Service - Edoomate REST API
 * Connects to live endpoints:
 * - GET https://edoomate.myieltspartner.com/api/courses
 * - GET https://edoomate.myieltspartner.com/api/course/{id}
 * - GET https://edoomate.myieltspartner.com/api/unit/{id}
 * - GET https://edoomate.myieltspartner.com/api/lesson/{id}
 */

const API_BASE_URL = 'https://edoomate.myieltspartner.com/api'

// ---------------------------------------------------------------------------
// In-memory API cache
// ---------------------------------------------------------------------------
// The Edoomate backend enforces aggressive rate-limits (HTTP 429 "Too Many
// Attempts") on several GET endpoints. When the student navigates:
//   Open MCQ → Back → Reopen MCQ
// React remounts CourseLearningView (due to the route-key change that resets
// test state), triggering a full burst of concurrent API calls:
//   GET /api/my-learning, /api/course/{id}, /api/unit/{id} × N,
//   /api/lesson/{id} × M, /api/test/{id}, /api/readable/{id} × R, etc.
//
// The fix: cache stable read-only responses in a module-level Map with a TTL.
// In-flight requests are also deduplicated: if a fetch for the same key is
// already in progress, the second caller awaits the same Promise instead of
// launching a new network request.
//
// TTL values:
//   CONTENT_CACHE_TTL_MS  – course/unit/lesson/test/topic/readable/video data (5 min)
//   MY_LEARNING_CACHE_TTL_MS – /api/my-learning enrollment list (90 s)
// ---------------------------------------------------------------------------

const CONTENT_CACHE_TTL_MS = 5 * 60 * 1000   // 5 minutes
const MY_LEARNING_CACHE_TTL_MS = 90_000        // 90 seconds

// Each entry: { data, ts } — also used as a Promise placeholder during in-flight dedup
const _cache = new Map()

/**
 * Generic cache-aware fetch helper.
 * @param {string} key        – unique cache key (e.g. "test:38")
 * @param {() => Promise<any>} fetcher – function that performs the actual fetch
 * @param {number} ttl        – cache TTL in ms
 */
async function _cachedFetch(key, fetcher, ttl) {
  const now = Date.now()
  const hit = _cache.get(key)
  if (hit) {
    // Waiting for an in-flight request: return the same Promise
    if (hit.promise) return hit.promise
    // Already resolved and still fresh
    if (now - hit.ts < ttl) return hit.data
  }
  // Start a new request and store the Promise so concurrent callers share it
  const promise = fetcher().then(
    (data) => {
      _cache.set(key, { data, ts: Date.now() })
      return data
    },
    (err) => {
      // Remove placeholder on failure so the next call retries
      const current = _cache.get(key)
      if (current && current.promise) _cache.delete(key)
      throw err
    }
  )
  _cache.set(key, { promise })
  return promise
}

/**
 * Clear all content caches (e.g. on logout or forced refresh).
 * The my-learning / enrollment cache is also cleared.
 */
function _clearAllCaches() {
  _cache.clear()
}

// Legacy dedicated map kept only for backwards-compat inside clearMyLearningCache
const _myLearningCache = new Map()

export const courseService = {
  /**
   * Fetch logged-in student's enrolled courses from backend API.
   * Endpoint: GET /api/my-learning
   * Results are cached in memory for MY_LEARNING_CACHE_TTL_MS to avoid
   * triggering the backend rate-limit (429 "Too Many Attempts") during
   * repeated navigation events.
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response with active_courses and expired_courses
   */
  /**
   * Clear ALL in-memory API caches (e.g., on logout or forced refresh).
   * Call this when the user signs out so the next sign-in gets a fresh response.
   */
  clearMyLearningCache() {
    _myLearningCache.clear()
    _clearAllCaches()
  },

  async getMyLearningCourses(token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }

    // Use unified cache with deduplication (keyed by token hash so different users get different data)
    return _cachedFetch(`my-learning:${token}`, async () => {
      // Also keep legacy _myLearningCache in sync for backwards-compat
      const response = await fetch(`${API_BASE_URL}/my-learning`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      })

      if (response.status === 401) {
        _myLearningCache.delete(token)
        const err = new Error('Your session has expired. Please log in again.')
        err.code = 'AUTH_EXPIRED'
        throw err
      }

      if (!response.ok) {
        let msg = `Server returned status ${response.status}`
        try {
          const body = await response.json()
          if (body?.message) msg = body.message
        } catch (e) {}
        const err = new Error(msg)
        err.code = response.status === 429 ? 'RATE_LIMITED' : `HTTP_${response.status}`
        throw err
      }

      const data = await response.json()
      _myLearningCache.set(token, { data, ts: Date.now() })
      return data
    }, MY_LEARNING_CACHE_TTL_MS)
  },

  /**
   * Fetch student's learning analytics and course progress from backend API
   * Endpoint: GET /api/course-progress
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response with overall_details and courses
   */
  async getStudentAnalytics(token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }

    const response = await fetch(`${API_BASE_URL}/course-progress`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    if (!response.ok) {
      let msg = `Server returned status ${response.status}`
      try {
        const body = await response.json()
        if (body?.message) msg = body.message
      } catch (e) {}
      const err = new Error(msg)
      err.code = `HTTP_${response.status}`
      throw err
    }

    const data = await response.json()
    return data
  },

  /**
   * Fetch detailed Course Analytics from backend API
   * Endpoint: GET /api/course/analytics/{course_id}
   * @param {number|string} courseId - Course ID
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response data with course metrics and unit list
   */
  async getCourseAnalytics(courseId, token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }
    const cleanId = String(courseId).replace(/^api-/, '')
    const response = await fetch(`${API_BASE_URL}/course/analytics/${cleanId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    const data = await response.json().catch(() => null)

    if (!response.ok || (data && data.success === false)) {
      const msg = data?.errors || data?.message || `Failed to fetch course analytics (HTTP ${response.status}).`
      const err = new Error(typeof msg === 'string' ? msg : `Course analytics error (${response.status})`)
      err.code = `HTTP_${response.status}`
      throw err
    }

    return data?.data || data
  },

  /**
   * Fetch Unit Analytics from backend API
   * Endpoint: GET /api/unit/analytics/{unit_id}
   * @param {number|string} unitId - Unit ID
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response data with unit details and lesson list
   */
  async getUnitAnalytics(unitId, token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }
    const cleanId = String(unitId).replace(/^unit-/, '')
    const response = await fetch(`${API_BASE_URL}/unit/analytics/${cleanId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    const data = await response.json().catch(() => null)

    if (!response.ok || (data && data.success === false)) {
      const msg = data?.errors || data?.message || `Failed to fetch unit analytics (HTTP ${response.status}).`
      const err = new Error(typeof msg === 'string' ? msg : `Unit analytics error (${response.status})`)
      err.code = `HTTP_${response.status}`
      throw err
    }

    return data?.data || data
  },

  /**
   * Fetch Lesson Analytics from backend API
   * Endpoint: GET /api/lesson/analytics/{lesson_id}
   * @param {number|string} lessonId - Lesson ID
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response data with tests, readables, videos, topics arrays
   */
  async getLessonAnalytics(lessonId, token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }
    const cleanId = String(lessonId).replace(/^lesson-/, '')
    const response = await fetch(`${API_BASE_URL}/lesson/analytics/${cleanId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    const data = await response.json().catch(() => null)

    if (!response.ok || (data && data.success === false)) {
      const msg = data?.errors || data?.message || `Failed to fetch lesson analytics (HTTP ${response.status}).`
      const err = new Error(typeof msg === 'string' ? msg : `Lesson analytics error (${response.status})`)
      err.code = `HTTP_${response.status}`
      throw err
    }

    return data?.data || data
  },

  /**
   * Fetch leaderboard rankings from backend API
   * Endpoint: GET /api/leaderboard
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response with your_rank, total_students, school_name, grade, leaderboard
   */
  async getLeaderboard(token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }

    const response = await fetch(`${API_BASE_URL}/leaderboard`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    if (!response.ok) {
      let msg = `Server returned status ${response.status}`
      try {
        const body = await response.json()
        if (body?.message) msg = body.message
      } catch (e) {}
      const err = new Error(msg)
      err.code = `HTTP_${response.status}`
      throw err
    }

    const data = await response.json()
    return data
  },

  /**
   * Check Virtual Classroom status from backend API
   * Authenticated request using Bearer token
   * Endpoints probed: GET /api/virtual-classroom, GET /api/classroom, GET /api/student/classroom
   * Evaluates the real API response to determine if the session is active, inactive, upcoming, or unavailable.
   * @param {string} token - Bearer auth token
   * @returns {Promise<{ isActive: boolean, status: string, data: Object|null, message: string }>}
   */
  async checkClassroomStatus(token) {
    if (!token) {
      return {
        isActive: false,
        status: 'unavailable',
        data: null,
        message: 'Authentication required to access virtual classroom.',
      }
    }

    const candidateEndpoints = ['/virtual-classroom', '/classroom', '/student/classroom']
    let lastStatus = 404
    let lastMessage = ''

    for (const ep of candidateEndpoints) {
      let response
      try {
        response = await fetch(`${API_BASE_URL}${ep}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        })
      } catch {
        return {
          isActive: false,
          status: 'unavailable',
          data: null,
          message: 'Unable to connect to classroom server.',
        }
      }

      if (response.status === 401 || response.status === 403) {
        return {
          isActive: false,
          status: 'unavailable',
          data: null,
          message: response.status === 401 ? 'Session expired.' : 'Classroom access restricted.',
        }
      }

      if (response.ok) {
        const body = await response.json().catch(() => null)
        if (body && body.success !== false) {
          const data = body?.data || body
          const statusStr = String(data?.status || data?.state || '').toLowerCase().trim()

          // Check for explicit inactive / upcoming / unavailable indicators
          const isExplicitlyInactive =
            data?.is_active === false ||
            data?.active === false ||
            data?.is_live === false ||
            ['inactive', 'upcoming', 'unavailable', 'ended', 'closed', 'scheduled', 'pending', 'cancelled'].includes(statusStr)

          if (isExplicitlyInactive) {
            return {
              isActive: false,
              status: statusStr || 'inactive',
              data,
              message: data?.message || `Classroom is ${statusStr || 'inactive'}.`,
            }
          }

          // Check for explicit active indicators
          const isExplicitlyActive =
            data?.is_active === true ||
            data?.active === true ||
            data?.is_live === true ||
            ['active', 'live', 'started', 'ongoing', 'in_progress', 'open'].includes(statusStr)

          if (isExplicitlyActive) {
            return {
              isActive: true,
              status: statusStr || 'active',
              data,
              message: 'Classroom is currently active.',
            }
          }

          // If payload contains live meeting details (room_id, meeting_url, zoom_url, redirect_url)
          if (data?.room_id || data?.session_id || data?.meeting_url || data?.zoom_url || data?.redirect_url) {
            return {
              isActive: true,
              status: 'active',
              data,
              message: 'Classroom session is active.',
            }
          }

          // Default fallback if endpoint responded ok but without active indicators
          return {
            isActive: false,
            status: statusStr || 'unavailable',
            data,
            message: data?.message || 'Classroom session is not currently active.',
          }
        }
      }

      lastStatus = response.status
      try {
        const errBody = await response.json()
        if (errBody?.message) lastMessage = errBody.message
      } catch {}
    }

    // When virtual-classroom meeting API is unavailable, the Virtual Classroom feature
    // acts as the student's learning classroom study room (resuming curriculum course & lessons).
    // Mark as active so students can always enter the classroom.
    return {
      isActive: true,
      status: 'active',
      data: null,
      message: 'Virtual Classroom is active.',
    }
  },

  /**
   * Classroom Storage Keys for Tracking Active Sessions and Re-entry
   */
  CLASSROOM_STORAGE_KEY: 'edoomate_active_classroom_session',

  /**
   * Retrieve active/previous classroom session state from storage
   * @returns {Object|null} Saved classroom session state
   */
  getStoredClassroomSession() {
    try {
      const raw = localStorage.getItem(this.CLASSROOM_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed
    } catch {
      return null
    }
  },

  /**
   * Save or update classroom session upon entry/resume
   * Prevents duplicate enrollment calls and saves active progress / timestamp
   * @param {Object} sessionDetails
   */
  saveStoredClassroomSession(sessionDetails = {}) {
    try {
      const current = this.getStoredClassroomSession() || {}
      const updated = {
        ...current,
        ...sessionDetails,
        hasJoined: true,
        lastActiveAt: new Date().toISOString(),
        timestamp: current.timestamp || new Date().toISOString(),
      }
      localStorage.setItem(this.CLASSROOM_STORAGE_KEY, JSON.stringify(updated))
      // Dispatch custom event for real-time reactivity
      window.dispatchEvent(
        new CustomEvent('edoomate_classroom_session_updated', { detail: updated })
      )
      return updated
    } catch {
      return null
    }
  },

  /**
   * Update student leave state while keeping session intact for resume
   * @param {Object} leaveMetadata - e.g. chat messages, notes, video position
   */
  leaveClassroomSession(leaveMetadata = {}) {
    try {
      const current = this.getStoredClassroomSession()
      if (!current) return null
      const updated = {
        ...current,
        leftAt: new Date().toISOString(),
        isCurrentlyInRoom: false,
        savedState: {
          ...(current.savedState || {}),
          ...leaveMetadata,
        },
      }
      localStorage.setItem(this.CLASSROOM_STORAGE_KEY, JSON.stringify(updated))
      window.dispatchEvent(
        new CustomEvent('edoomate_classroom_session_updated', { detail: updated })
      )
      return updated
    } catch {
      return null
    }
  },

  /**
   * Clear active classroom session when classroom has ended or user completes class
   */
  clearStoredClassroomSession() {
    try {
      localStorage.removeItem(this.CLASSROOM_STORAGE_KEY)
      window.dispatchEvent(
        new CustomEvent('edoomate_classroom_session_updated', { detail: null })
      )
    } catch {
      // Storage unavailable
    }
  },

  /**
   * Enter / Fetch Virtual Classroom session from backend API
   * Authenticated request using Bearer token
   * Endpoints probed: GET /api/virtual-classroom, GET /api/classroom, GET /api/student/classroom
   * Reuses existing session if available to avoid duplicate registrations.
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response with classroom details
   */
  async getVirtualClassroom(token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }

    const candidateEndpoints = ['/virtual-classroom', '/classroom', '/student/classroom']
    let lastStatus = 404
    let lastMessage = ''

    for (const ep of candidateEndpoints) {
      let response
      try {
        response = await fetch(`${API_BASE_URL}${ep}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        })
      } catch {
        const err = new Error(
          'Unable to connect to the Edoomate classroom server. Please check your internet connection.'
        )
        err.code = 'NETWORK_ERROR'
        throw err
      }

      if (response.status === 401) {
        const err = new Error('Your session has expired. Please log in again.')
        err.code = 'AUTH_EXPIRED'
        throw err
      }

      if (response.status === 403) {
        const err = new Error('Access denied. You do not currently have access to this virtual classroom.')
        err.code = 'FORBIDDEN'
        throw err
      }

      if (response.ok) {
        const data = await response.json().catch(() => null)
        if (data && data.success !== false) {
          const classroomData = data?.data || data
          // Save and preserve session tracking
          this.saveStoredClassroomSession({
            id: classroomData?.id || classroomData?.session_id || 'active_classroom',
            title: classroomData?.title || classroomData?.room_name || classroomData?.name,
            endpoint: ep,
          })
          return classroomData
        }
      }

      lastStatus = response.status
      try {
        const body = await response.json()
        if (body?.message) lastMessage = body.message
      } catch {}
    }

    // Classroom session not found or endpoint inactive on backend
    const notFoundErr = new Error(
      lastMessage ||
        'No active virtual classroom session found. The classroom endpoint (/api/virtual-classroom) is not currently active on the server.'
    )
    notFoundErr.code = `HTTP_${lastStatus}`
    notFoundErr.status = lastStatus
    notFoundErr.endpoint = candidateEndpoints[0]
    throw notFoundErr
  },

  /**
   * Fetch all courses from backend API
   */
  async getCourses() {
    try {
      const response = await fetch(`${API_BASE_URL}/courses`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch courses: ${response.status}`)
      }

      const data = await response.json()
      if (data && data.success && Array.isArray(data.data)) {
        return data.data
      }
      return []
    } catch (error) {
      console.warn('Backend courses API unavailable, using fallback:', error.message)
      return null
    }
  },

  /**
   * Fetch available grades from backend API
   * Endpoint: GET /api/grades
   * @returns {Promise<Array<string>>} Array of grades: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
   */
  async getGrades() {
    try {
      const response = await fetch(`${API_BASE_URL}/grades`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) {
        throw new Error(`Grades API error: ${response.status}`)
      }
      const data = await response.json()
      if (data && data.success && data.data) {
        if (Array.isArray(data.data)) {
          return data.data
        }
        return Object.values(data.data)
      }
      return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
    } catch (err) {
      console.warn('Backend grades API failed, using fallback grades:', err.message)
      return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
    }
  },

  /**
   * Fetch available subjects from backend API
   * Endpoint: GET /api/subjects
   * @returns {Promise<Object>} Subject dictionary
   */
  async getSubjects() {
    try {
      const response = await fetch(`${API_BASE_URL}/subjects`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (!response.ok) {
        throw new Error(`Subjects API error: ${response.status}`)
      }
      const data = await response.json()
      if (data && data.success && data.data) {
        return data.data
      }
      return {
        GENERAL: 'General',
        ENGLISH: 'English',
        SCIENCE: 'Science',
        MATHS: 'Maths',
        HISTORY: 'History',
        GEOGRAPHY: 'Geography',
        COMPUTER: 'Computer',
      }
    } catch (err) {
      console.warn('Backend subjects API failed:', err.message)
      return {
        GENERAL: 'General',
        ENGLISH: 'English',
        SCIENCE: 'Science',
        MATHS: 'Maths',
        HISTORY: 'History',
        GEOGRAPHY: 'Geography',
        COMPUTER: 'Computer',
      }
    }
  },

  /**
   * Search and filter courses with API-supported grade and subject query parameters
   * Endpoint: GET /api/courses?grade=...&subject=...
   * @param {Object} options - { grade, subject, search }
   * @returns {Promise<Array>} Array of course objects
   */
  async searchCourses({ grade = '', subject = '' } = {}) {
    const queryParams = new URLSearchParams()
    if (grade && grade !== 'All') {
      queryParams.append('grade', grade)
    }
    if (subject && subject !== 'All') {
      queryParams.append('subject', subject)
    }
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

    const response = await fetch(`${API_BASE_URL}/courses${queryString}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      // If the backend returns 404 for a search/filter query, treat as a normal empty list
      if (response.status === 404) {
        return []
      }
      let msg = `Server returned status ${response.status}`
      try {
        const body = await response.json()
        if (body?.message) {
          // If the message indicates no courses found, treat as empty list rather than error
          if (/no courses? found/i.test(body.message)) {
            return []
          }
          msg = body.message
        }
      } catch (e) {}
      const err = new Error(msg)
      err.code = `HTTP_${response.status}`
      throw err
    }

    const data = await response.json()
    if (data && data.success && Array.isArray(data.data)) {
      return data.data
    }
    // Also check if data is an array or if message says no courses found
    if (Array.isArray(data)) {
      return data
    }
    return []
  },

  /**
   * Fetch single course details by ID
   * Endpoint: GET /api/course/{id}
   */
  async getCourseDetails(courseId, token = null) {
    const cleanId = String(courseId).replace(/^api-/, '')
    return _cachedFetch(`course:${cleanId}`, async () => {
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(`${API_BASE_URL}/course/${cleanId}`, { method: 'GET', headers })
        if (!response.ok) throw new Error(`Failed to fetch course details: ${response.status}`)
        const data = await response.json()
        return data?.data || null
      } catch (error) {
        console.warn(`Course detail API unavailable for course ${courseId}:`, error.message)
        return null
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Fetch single unit/module details by ID
   * Endpoint: GET /api/unit/{id}
   */
  async getUnitDetails(unitId, token = null) {
    return _cachedFetch(`unit:${unitId}`, async () => {
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(`${API_BASE_URL}/unit/${unitId}`, { method: 'GET', headers })
        if (!response.ok) throw new Error(`Failed to fetch unit details: ${response.status}`)
        const data = await response.json()
        return data?.data || null
      } catch (error) {
        console.warn(`Unit API unavailable for unit ${unitId}:`, error.message)
        return null
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Fetch lesson details by ID (authenticated if token provided)
   * Endpoint: GET /api/lesson/{id}
   */
  async getLessonDetails(lessonId, token = null) {
    return _cachedFetch(`lesson:${lessonId}`, async () => {
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(`${API_BASE_URL}/lesson/${lessonId}`, { method: 'GET', headers })
        if (!response.ok) return null
        const data = await response.json()
        return data?.data || null
      } catch {
        return null
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Helper to check if an MCQ / Test status indicates it is active.
   * Handles string status, boolean active flags, and numeric status codes.
   * @param {Object|string|number|boolean} testObjOrStatus
   * @returns {boolean}
   */
  isMcqActive(testObjOrStatus) {
    if (testObjOrStatus === null || testObjOrStatus === undefined) {
      return true // default to active if no explicit status is reported
    }
    if (typeof testObjOrStatus === 'boolean') {
      return testObjOrStatus
    }
    if (typeof testObjOrStatus === 'number') {
      return testObjOrStatus === 1
    }
    if (typeof testObjOrStatus === 'string') {
      const s = testObjOrStatus.trim().toLowerCase()
      if (['active', 'live', 'started', 'ongoing', 'open', 'enabled', '1', 'true'].includes(s)) {
        return true
      }
      if (['inactive', 'closed', 'ended', 'disabled', 'unavailable', '0', 'false', 'draft'].includes(s)) {
        return false
      }
      return true
    }
    if (typeof testObjOrStatus === 'object') {
      const explicitFlag =
        testObjOrStatus.is_active ??
        testObjOrStatus.active ??
        testObjOrStatus.is_enabled ??
        testObjOrStatus.enabled ??
        testObjOrStatus.test_details?.is_active ??
        testObjOrStatus.test_details?.active
      if (explicitFlag !== undefined && explicitFlag !== null) {
        return Boolean(explicitFlag === true || explicitFlag === 1 || String(explicitFlag).trim().toLowerCase() === 'true' || String(explicitFlag).trim() === '1')
      }
      const rawStatus =
        testObjOrStatus.status ??
        testObjOrStatus.state ??
        testObjOrStatus.status_name ??
        testObjOrStatus.test_status ??
        testObjOrStatus.test_details?.status ??
        testObjOrStatus.test_details?.state
      if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '') {
        const s = String(rawStatus).trim().toLowerCase()
        if (['active', 'live', 'started', 'ongoing', 'open', 'enabled', '1', 'true', 'assigned', 'passed', 'completed', 'in_progress'].includes(s)) {
          return true
        }
        if (['inactive', 'closed', 'ended', 'disabled', 'unavailable', '0', 'false', 'draft', 'pending'].includes(s)) {
          return false
        }
      }
      return true
    }
    return true
  },

  /**
   * Fetch Test details and MCQ questions by test ID.
   * Endpoint: GET /api/test/{id}
   * Results are cached for CONTENT_CACHE_TTL_MS and in-flight requests are
   * deduplicated so rapid component remounts (Back → Reopen MCQ) never fire
   * more than one concurrent GET /api/test/{id} request, preventing HTTP 429.
   * @param {number|string} testId - Test ID
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response with test_details
   */
  async getTestDetails(testId, token = null, context = {}) {
    const cleanId = String(testId).replace(/^test-/, '')
    const cacheKey = `test:${cleanId}:${token ? token.slice(-16) : 'anon'}`
    return _cachedFetch(cacheKey, async () => {
      const headers = { 'Accept': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${API_BASE_URL}/test/${cleanId}`, { method: 'GET', headers })

      if (!response.ok) {
        let errorMsg
        if (response.status === 401) {
          errorMsg = 'Session expired or authentication required. Please log in again.'
        } else if (response.status === 404) {
          errorMsg = `Test ${cleanId} was not found on the server.`
        } else if (response.status === 429) {
          // Read Retry-After header if provided
          const retryAfter = response.headers.get('Retry-After')
          const waitStr = retryAfter ? ` Please wait ${retryAfter} seconds and try again.` : ' Please try again in a moment.'
          errorMsg = `The server is busy processing requests.${waitStr}`
        } else {
          errorMsg = `Server error ${response.status}`
        }
        const err = new Error(errorMsg)
        err.status = response.status
        err.code = response.status === 429 ? 'RATE_LIMITED' : `HTTP_${response.status}`
        throw err
      }

      const json = await response.json()
      const raw = json?.data || json

      const baseDetails = raw?.test_details || {}

      // Enforce active status restriction at API layer (skip check when student is reviewing completed result)
      if (!context.isViewingResult) {
        const isTestActive = this.isMcqActive(raw) && this.isMcqActive(baseDetails)
        if (!isTestActive) {
          const inactiveMsg = raw?.message || baseDetails?.message || 'This MCQ test is currently inactive and cannot be accessed.'
          const err = new Error(inactiveMsg)
          err.code = 'MCQ_INACTIVE'
          err.status = 403
          err.isInactive = true
          throw err
        }
      }
      const sections =
        raw?.test_section_details ||
        raw?.sections ||
        baseDetails?.test_section_details ||
        baseDetails?.sections ||
        []

      const directQuestions =
        raw?.questions ||
        raw?.test_questions ||
        baseDetails?.questions ||
        baseDetails?.test_questions ||
        []

      const sectionWithDuration = sections.find(
        (s) =>
          s.duration ||
          s.time_limit ||
          s.timer ||
          s.section_duration ||
          s.total_duration ||
          s.duration_minutes ||
          s.duration_in_minutes ||
          s.test_duration
      )

      const pickValidDuration = (...candidates) => {
        for (const c of candidates) {
          if (c !== undefined && c !== null && c !== '') {
            if (typeof c === 'object') {
              const objVal =
                c.duration ??
                c.value ??
                c.minutes ??
                c.hours ??
                c.seconds ??
                c.time ??
                c.time_limit
              if (objVal !== undefined && objVal !== null && objVal !== '') {
                const pickedInner = pickValidDuration(objVal)
                if (pickedInner !== null) return pickedInner
              }
              continue
            }
            const s = String(c).trim()
            if (s && s !== '0' && s !== '00:00' && s !== '00:00:00' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined') {
              return c
            }
          }
        }
        return null
      }

      // Compute summed section durations if sections specify individual durations
      let summedSectionDuration = 0
      for (const sec of sections) {
        const secDur = Number(
          sec?.duration ??
          sec?.time_limit ??
          sec?.timer ??
          sec?.section_duration ??
          sec?.total_duration ??
          sec?.duration_minutes ??
          sec?.duration_in_minutes ??
          sec?.test_duration ??
          0
        )
        if (!isNaN(secDur) && secDur > 0) {
          summedSectionDuration += secDur
        }
      }

      // Scan any dynamic key matching /duration|time_limit|timer/i on baseDetails or raw
      const scanDurationKey = (obj) => {
        if (!obj || typeof obj !== 'object') return null
        for (const [k, v] of Object.entries(obj)) {
          if (/duration|time_limit|time_allowed|test_time|timer/i.test(k) && !/taken|elapsed|used|spent/i.test(k)) {
            const picked = pickValidDuration(v)
            if (picked !== null) return picked
          }
        }
        return null
      }

      let resolvedDuration = pickValidDuration(
        raw?.duration,
        baseDetails?.duration,
        raw?.time_limit,
        baseDetails?.time_limit,
        raw?.total_duration,
        baseDetails?.total_duration,
        raw?.test_duration,
        baseDetails?.test_duration,
        raw?.test_time,
        baseDetails?.test_time,
        raw?.duration_minutes,
        baseDetails?.duration_minutes,
        raw?.duration_in_minutes,
        baseDetails?.duration_in_minutes,
        raw?.time_allowed,
        baseDetails?.time_allowed,
        raw?.timer,
        baseDetails?.timer,
        summedSectionDuration > 0 ? summedSectionDuration : null,
        sectionWithDuration?.duration,
        sectionWithDuration?.time_limit,
        sectionWithDuration?.timer,
        sectionWithDuration?.section_duration,
        sectionWithDuration?.total_duration,
        sectionWithDuration?.duration_minutes,
        sectionWithDuration?.duration_in_minutes,
        scanDurationKey(baseDetails),
        scanDurationKey(raw)
      )

      // If /api/test/{id} does not directly include the configured duration, look up the existing
      // parent lesson / unit / course backend sources that store the test/lesson duration
      if (!resolvedDuration) {
        try {
          const cleanLessonId = String(
            context?.lessonId || raw?.lesson_id || baseDetails?.lesson_id || ''
          ).replace(/^lesson-/, '')
          const cleanCourseId = String(
            context?.courseId || raw?.course_id || baseDetails?.course_id || ''
          ).replace(/^api-/, '')

          if (cleanLessonId) {
            const lessonData = await this.getLessonDetails(cleanLessonId, token)
            if (lessonData) {
              const lessonMeta = lessonData.lesson_details || {}
              const linkedTest = (lessonData.lesson_link_details || []).find(
                (el) =>
                  (el.element_type === 'test' || el.element_type === 'mcq' || el.element_type === 'quiz') &&
                  String(el.element_id || el.id).replace(/^test-/, '') === cleanId
              )
              resolvedDuration = pickValidDuration(
                linkedTest?.duration,
                linkedTest?.time_limit,
                linkedTest?.total_duration,
                linkedTest?.test_duration,
                linkedTest?.test_details?.duration,
                linkedTest?.test_details?.total_duration,
                lessonMeta.test_duration,
                lessonMeta.duration,
                lessonMeta.total_duration,
                lessonData.test_duration,
                lessonData.duration,
                lessonData.total_duration,
                scanDurationKey(linkedTest),
                scanDurationKey(lessonMeta),
                scanDurationKey(lessonData)
              )
            }
          }

          if (!resolvedDuration) {
            const courseData =
              cleanCourseId && !isNaN(Number(cleanCourseId))
                ? await this.getCourseDetails(cleanCourseId, token)
                : await (async () => {
                    const allCourses = await this.getAllCourses(token)
                    return allCourses?.[0]?.id ? await this.getCourseDetails(allCourses[0].id, token) : null
                  })()

            if (courseData) {
              for (const uLink of courseData.course_link_details || []) {
                const uDetails = uLink.unit_details || {}
                const unitData = uLink.unit_id ? await this.getUnitDetails(uLink.unit_id, token) : null
                const unitMeta = unitData?.unit_details || uDetails
                const unitLinks = unitData?.unit_link_details || []
                const matchesUnit =
                  !cleanLessonId ||
                  unitLinks.some((ul) => String(ul.element_id || ul.id) === cleanLessonId)

                if (matchesUnit) {
                  resolvedDuration = pickValidDuration(
                    unitMeta?.test_duration,
                    unitData?.test_duration,
                    uLink?.test_duration,
                    courseData?.test_duration,
                    courseData?.course_details?.test_duration,
                    courseData?.duration,
                    courseData?.course_details?.duration,
                    courseData?.total_duration,
                    courseData?.course_details?.total_duration,
                    unitMeta?.duration,
                    unitData?.duration,
                    unitMeta?.total_duration,
                    scanDurationKey(courseData),
                    scanDurationKey(courseData?.course_details),
                    scanDurationKey(unitMeta),
                    scanDurationKey(unitData)
                  )
                  if (resolvedDuration) break
                }
              }
            }
          }
        } catch {
          // Ignore parent lookup errors so test loading itself is never blocked
        }
      }

      return {
        ...baseDetails,
        ...raw,
        id: raw?.id || baseDetails?.id || raw?.test_id || baseDetails?.test_id || cleanId,
        test_name: raw?.test_name || baseDetails?.test_name || raw?.title || baseDetails?.title || `Test #${cleanId}`,
        subject: raw?.subject || baseDetails?.subject || raw?.category || 'ASSESSMENT',
        grade: raw?.grade || baseDetails?.grade || '10',
        duration: resolvedDuration,
        total_test_questions:
          raw?.total_test_questions ||
          baseDetails?.total_test_questions ||
          (sections.length > 0 ? sections.flatMap((s) => s.questions || []).length : directQuestions.length),
        test_section_details: sections,
        questions: directQuestions,
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Fetch Readable details (PDF document, reading sections) by readable ID
   * Endpoint: GET /api/readable/{id}
   * @param {number|string} readableId - Readable ID
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response with readable_details
   */
  async getReadableDetails(readableId, token = null) {
    const cleanId = String(readableId).replace(/^readable-/, '')
    return _cachedFetch(`readable:${cleanId}`, async () => {
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(`${API_BASE_URL}/readable/${cleanId}`, { method: 'GET', headers })
        if (!response.ok) throw new Error(`Failed to fetch readable details: ${response.status}`)
        const data = await response.json()
        return data?.data?.readable_details || data?.data || null
      } catch (error) {
        console.warn(`Readable API unavailable for readable ${readableId}:`, error.message)
        return null
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Fetch Topic details by topic ID
   * Endpoint: GET /api/topic/{id}
   * @param {number|string} topicId - Topic ID
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} Topic detail object
   */
  async getTopicDetails(topicId, token = null) {
    const cleanId = String(topicId).replace(/^topic-/, '')
    return _cachedFetch(`topic:${cleanId}`, async () => {
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const response = await fetch(`${API_BASE_URL}/topic/${cleanId}`, { method: 'GET', headers })
        if (!response.ok) throw new Error(`Failed to fetch topic details: ${response.status}`)
        const data = await response.json()
        return data?.data || data
      } catch (error) {
        console.warn(`Topic API unavailable for topic ${topicId}:`, error.message)
        return null
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Fetch Avatar Topic Definition (3D Model, scripts, audio, blendshapes) via backend proxy
   * Endpoint: GET /api/avatar/topic/{avatarTopicId}
   * @param {string} avatarTopicId - Avatar Topic UUID
   * @param {string} [token] - Bearer auth token
   * @returns {Promise<Object>} { topic, scripts }
   */
  async getAvatarTopicDefinition(avatarTopicId, token = null) {
    if (!avatarTopicId) return null
    const cleanUuid = String(avatarTopicId).trim()
    return _cachedFetch(`avatar_def:${cleanUuid}`, async () => {
      // 1. Static bundled definition (instant, production-ready, zero CORS issues on Render)
      try {
        const staticRes = await fetch(`/data/avatar/${cleanUuid}.json`)
        if (staticRes.ok) {
          const staticData = await staticRes.json()
          if (staticData && (staticData.topic || staticData.scripts)) return staticData
        }
      } catch (staticErr) {
        // Fall through to live providers
      }

      // 2. First try the local proxy route /api/avatar/topic/:id (active in dev server)
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch(`/api/avatar/topic/${cleanUuid}`, { headers })
        if (res.ok) {
          const data = await res.json()
          if (data && data.topic) return data
        }
      } catch (e) {
        console.warn('Local proxy /api/avatar/topic note:', e.message)
      }

      // 3. Direct provider fetch fallback
      try {
        const res = await fetch(`https://my-avatar.in/api/topic/${cleanUuid}`, {
          headers: { 'Accept': 'application/json' },
        })
        if (res.ok) {
          const data = await res.json()
          if (data && data.topic) return data
        }
      } catch (err) {
        console.warn('Direct provider fetch note:', err.message)
      }

      return null
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Ask avatar a question regarding the current topic/checkpoint
   * Endpoint: POST /api/avatar/ask (proxies to https://my-avatar.in/api/ask)
   * @param {Object} params - { topic_id, question, acs_content }
   * @returns {Promise<Object>} { answer, tts_audio, tts_json, cached }
   */
  async askAvatarQuestion({ topic_id, question, acs_content = '' }) {
    if (!question || !question.trim()) return null

    const payload = {
      topic_id,
      question: question.trim(),
      acs_content: acs_content || '',
    }

    // 1. Try local proxy route /api/avatar/ask
    try {
      const res = await fetch('/api/avatar/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        if (data && data.answer) return data
      }
    } catch (e) {
      console.warn('Local proxy /api/avatar/ask note:', e.message)
    }

    // 2. Direct fallback
    try {
      const res = await fetch('https://my-avatar.in/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://my-avatar.in',
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        if (data && data.answer) return data
      }
    } catch (err) {
      console.warn('Direct provider ask fetch note:', err.message)
    }

    return null
  },

  /**
   * Fetch Video details by video ID
   * Endpoint: GET /api/video/{id}
   * @param {number|string} videoId - Video ID
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} Normalized Video detail object
   */
  async getVideoDetails(videoId, token = null) {
    const cleanId = String(videoId).replace(/^video-/, '')
    return _cachedFetch(`video:${cleanId}`, async () => {
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const response = await fetch(`${API_BASE_URL}/video/${cleanId}`, { method: 'GET', headers })

        if (!response.ok) {
          throw new Error(`Failed to fetch video details: ${response.status}`)
        }

        const data = await response.json()
        const raw = data?.data || data
        if (!raw || typeof raw !== 'object') return null

        // Resolve video URL if present (HLS, MP4, Vimeo, or relative storage path)
        let resolvedUrl = null
        let isVimeo = false
        let vimeoId = raw.vimeo_id ? String(raw.vimeo_id).trim() : null
        let vimeoHash = raw.vimeo_hash || raw.hash || raw.unlisted_hash || null

        const potentialUrl =
          raw.video_url ||
          raw.url ||
          raw.stream_url ||
          raw.hls_url ||
          raw.play_url ||
          raw.file_url ||
          raw.file ||
          null

        if (potentialUrl && typeof potentialUrl === 'string') {
          const trimmed = potentialUrl.trim()
          if (trimmed && !trimmed.endsWith('/undefined')) {
            // Check for vimeo.com/12345/abcdef (unlisted video with hash)
            const unlistedMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)\/([a-zA-Z0-9]+)/i)
            if (unlistedMatch) {
              vimeoId = unlistedMatch[1]
              vimeoHash = unlistedMatch[2]
              isVimeo = true
            } else if (/vimeo\.com\/(?:video\/)?(\d+)/i.test(trimmed)) {
              const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
              if (match && match[1]) {
                vimeoId = match[1]
                isVimeo = true
              }
            } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              resolvedUrl = trimmed
            } else if (trimmed.startsWith('/')) {
              resolvedUrl = `https://edoomate.myieltspartner.com${trimmed}`
            } else {
              resolvedUrl = `https://edoomate.myieltspartner.com/storage/course_videos/${trimmed}`
            }
          }
        }

        // Check if vimeo_id contains hash like "123456:abcdef" or "123456/abcdef"
        if (vimeoId) {
          if (vimeoId.includes('/')) {
            const parts = vimeoId.split('/')
            vimeoId = parts[0].trim()
            if (!vimeoHash && parts[1]) vimeoHash = parts[1].trim()
          } else if (vimeoId.includes(':')) {
            const parts = vimeoId.split(':')
            vimeoId = parts[0].trim()
            if (!vimeoHash && parts[1]) vimeoHash = parts[1].trim()
          }
          isVimeo = true
        }

        // If Vimeo, construct the official embed URL with hash parameter when available
        if (isVimeo && vimeoId) {
          const embedParams = 'autoplay=0&title=0&byline=0&portrait=0'
          resolvedUrl = vimeoHash
            ? `https://player.vimeo.com/video/${vimeoId}?h=${encodeURIComponent(vimeoHash)}&${embedParams}`
            : `https://player.vimeo.com/video/${vimeoId}?${embedParams}`
        }

        // Resolve video thumbnail image
        let resolvedThumbnail = raw.preview_image_url || raw.thumbnail_url || null
        if (!resolvedThumbnail && raw.video_thumbnail) {
          const thumb = String(raw.video_thumbnail).trim()
          if (thumb && thumb !== 'undefined') {
            resolvedThumbnail = thumb.startsWith('http')
              ? thumb
              : thumb.startsWith('/')
              ? `https://edoomate.myieltspartner.com${thumb}`
              : `https://edoomate.myieltspartner.com/storage/video_thumbnails/${thumb}`
          }
        }

        return {
          ...raw,
          vimeo_id: vimeoId,
          vimeo_hash: vimeoHash,
          isVimeo,
          video_url: resolvedUrl,
          thumbnail_url: resolvedThumbnail,
        }
      } catch (error) {
        console.warn(`Video API unavailable for video ${videoId}:`, error.message)
        return null
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Fetch authorized Vimeo playback details directly using Vimeo API (reproducing Flutter VimeoPlayerV2)
   * Calls https://api.vimeo.com/videos/{videoId} with Bearer token
   * Extracts play.progressive video URLs (highest up to 720p), falling back to play.hls.link
   * @param {string|number} vimeoId
   * @param {string} [vimeoHash]
   * @param {string} [token]
   * @returns {Promise<Object>} { success, playback_url, hls_url, embed_url, vimeo_hash, title, duration }
   */
  async getVimeoPlaybackDetails(vimeoId, vimeoHash = null, token = null) {
    if (!vimeoId) return null
    const cleanId = String(vimeoId).replace(/\D/g, '')
    if (!cleanId) return null

    return _cachedFetch(`vimeo_playback:${cleanId}:${vimeoHash || ''}`, async () => {
      // Check for Vimeo Access Token in frontend environment variables
      const vimeoAccessToken =
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VIMEO_ACCESS_TOKEN) ||
        (typeof process !== 'undefined' && (process.env?.VITE_VIMEO_ACCESS_TOKEN || process.env?.VIMEO_ACCESS_TOKEN)) ||
        null

      // 1. Direct Vimeo API access (matching Flutter VimeoPlayerV2): GET https://api.vimeo.com/videos/{videoId}
      if (vimeoAccessToken) {
        try {
          const vimeoRes = await fetch(`https://api.vimeo.com/videos/${cleanId}`, {
            headers: {
              'Authorization': `Bearer ${vimeoAccessToken}`,
              'Accept': 'application/vnd.vimeo.*+json;version=3.4',
            },
          })

          if (vimeoRes.ok) {
            const data = await vimeoRes.json()

            // Extract from data.play.progressive or data.files
            const progressiveList =
              data?.play?.progressive ||
              (Array.isArray(data?.files) ? data.files.filter((f) => f.type === 'video/mp4' || f.container === 'mp4') : [])

            // Select highest available quality up to 720p (720p, then 540p, 480p, 360p, 240p)
            let selectedProg = null
            const qualityRanks = ['720p', '540p', '480p', '360p', '240p']

            for (const q of qualityRanks) {
              const match = progressiveList.find(
                (p) =>
                  String(p.quality || p.public_name || '').toLowerCase() === q ||
                  String(p.rendition || '').toLowerCase() === q ||
                  Number(p.height) === parseInt(q, 10)
              )
              if (match && (match.link || match.url)) {
                selectedProg = match
                break
              }
            }

            // Fallback to any progressive <= 720p or first available
            if (!selectedProg && progressiveList.length > 0) {
              selectedProg =
                progressiveList.find((p) => Number(p.height || 0) <= 720 && (p.link || p.url)) ||
                progressiveList[0]
            }

            const progressiveUrl = selectedProg?.link || selectedProg?.url || null

            // Fallback to play.hls.link if progressive URLs are unavailable
            const hlsUrl =
              data?.play?.hls?.link ||
              data?.files?.find((f) => f.quality === 'hls' || f.container === 'm3u8')?.link ||
              null

            const resolvedPlayUrl = progressiveUrl || hlsUrl

            if (resolvedPlayUrl) {
              return {
                success: true,
                vimeo_id: cleanId,
                playback_url: resolvedPlayUrl,
                hls_url: hlsUrl,
                embed_url: data.player_embed_url || `https://player.vimeo.com/video/${cleanId}`,
                vimeo_hash: vimeoHash,
                title: data.name,
                duration: data.duration,
              }
            } else {
              return {
                success: false,
                vimeo_id: cleanId,
                error: 'NO_PLAYABLE_STREAM',
                message: 'No progressive MP4 or HLS playback stream found in Vimeo API response for this video.',
              }
            }
          } else {
            const errData = await vimeoRes.json().catch(() => null)
            const errMsg = errData?.error || errData?.message || `Vimeo API HTTP ${vimeoRes.status}`
            return {
              success: false,
              vimeo_id: cleanId,
              error: `VIMEO_API_${vimeoRes.status}`,
              message: `Vimeo API error (${vimeoRes.status}): ${errMsg}`,
            }
          }
        } catch (vimeoErr) {
          console.warn('Vimeo direct API fetch note:', vimeoErr.message)
          return {
            success: false,
            vimeo_id: cleanId,
            error: 'NETWORK_ERROR',
            message: `Failed to connect to Vimeo API: ${vimeoErr.message}`,
          }
        }
      }

      // 2. Try backend API endpoint (GET /api/vimeo/playback/:id or GET /api/video/:id/playback)
      try {
        const headers = { 'Accept': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const hashQuery = vimeoHash ? `?h=${encodeURIComponent(vimeoHash)}` : ''
        const res = await fetch(`${API_BASE_URL}/vimeo/playback/${cleanId}${hashQuery}`, { headers })
        if (res.ok) {
          const data = await res.json()
          if (data && (data.playback_url || data.data?.playback_url)) {
            return data.data || data
          }
        }
      } catch (e) {
        // Backend endpoint not deployed yet
      }

      // 3. Try Vite dev server proxy endpoint /api/vimeo/playback/:id
      try {
        const hashQuery = vimeoHash ? `?h=${encodeURIComponent(vimeoHash)}` : ''
        const res = await fetch(`/api/vimeo/playback/${cleanId}${hashQuery}`)
        if (res.ok) {
          const data = await res.json()
          if (data && data.playback_url) {
            return data
          }
        }
      } catch (e) {}

      // 4. Fallback: Direct Vimeo player config resolution if hash is provided
      if (vimeoHash) {
        try {
          const cfgRes = await fetch(`https://player.vimeo.com/video/${cleanId}/config?h=${encodeURIComponent(vimeoHash)}`, {
            headers: {
              'Referer': 'https://edoomate.myieltspartner.com/',
            },
          })
          if (cfgRes.ok) {
            const cfg = await cfgRes.json()
            const files = cfg.request?.files?.progressive || []
            const prog = files.find((f) => f.quality === '720p') || files.find((f) => f.quality === '1080p') || files[0]
            if (prog?.url) {
              return {
                success: true,
                vimeo_id: cleanId,
                playback_url: prog.url,
                hls_url: cfg.request?.files?.hls?.default_cdn ? cfg.request?.files?.hls?.cdns?.[cfg.request.files.hls.default_cdn]?.url : null,
                embed_url: `https://player.vimeo.com/video/${cleanId}?h=${encodeURIComponent(vimeoHash)}`,
                vimeo_hash: vimeoHash,
                title: cfg.video?.title,
                duration: cfg.video?.duration,
              }
            }
          }
        } catch (e) {}
      }

      return {
        success: false,
        vimeo_id: cleanId,
        error: 'VIMEO_AUTH_REQUIRED',
        message: 'Direct Vimeo stream could not be loaded. Please ensure VITE_VIMEO_ACCESS_TOKEN is configured in Render environment variables.',
      }
    }, CONTENT_CACHE_TTL_MS)
  },

  /**
   * Submit MCQ answers to backend API
   * Endpoint: POST /api/test/submit
   * @param {Object} submissionPayload - { submitted_data_id, total_questions, submitted_answer }
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} Result payload { correct_answers, incorrect_answers, unattended_questions, score, score_percentage, comment, ... }
   */
  async submitTest(submissionPayload, token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in to submit your test.')
      err.code = 'AUTH_MISSING'
      throw err
    }

    // Verify test active status before allowing submission attempt
    const submittedTestId = submissionPayload?.submitted_data_id
    if (submittedTestId) {
      try {
        const testCheck = await this.getTestDetails(submittedTestId, token)
        if (testCheck && !this.isMcqActive(testCheck)) {
          const err = new Error('Cannot submit answers: This MCQ test is inactive.')
          err.code = 'MCQ_INACTIVE'
          err.status = 403
          err.isInactive = true
          throw err
        }
      } catch (checkErr) {
        if (checkErr.code === 'MCQ_INACTIVE' || checkErr.isInactive) {
          throw checkErr
        }
      }
    }

    const response = await fetch(`${API_BASE_URL}/test/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(submissionPayload),
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    const json = await response.json().catch(() => null)

    if (!response.ok || (json && json.success === false)) {
      let msg = `Server returned status ${response.status}`
      if (json?.message) {
        msg = json.message
      } else if (json?.errors) {
        if (typeof json.errors === 'string') {
          msg = json.errors
        } else if (typeof json.errors === 'object') {
          msg = Object.values(json.errors).flat().join(', ')
        }
      }
      const err = new Error(msg)
      err.code = `HTTP_${response.status}`
      err.status = response.status
      throw err
    }

    const raw = json?.data || json || {}
    const nested =
      raw?.result ||
      raw?.test_result ||
      raw?.score_details ||
      raw?.summary ||
      raw?.evaluation ||
      raw?.data ||
      {}

    const pickNum = (...candidates) => {
      for (const c of candidates) {
        if (c !== undefined && c !== null && c !== '') {
          if (typeof c === 'number' && !isNaN(c)) return c
          if (typeof c === 'string') {
            const trimmed = c.trim()
            // Match plain numeric or percentage like "85%"
            if (/^-?\d+(\.\d+)?%?$/.test(trimmed)) {
              const parsed = parseFloat(trimmed.replace('%', ''))
              if (!isNaN(parsed)) return parsed
            }
          }
        }
      }
      return undefined
    }

    // Parse fraction strings if backend returns e.g. score: "8/10"
    let fractionScored = undefined
    let fractionMax = undefined
    for (const fracCandidate of [raw.score, nested.score, raw.marks, nested.marks]) {
      if (typeof fracCandidate === 'string' && /^\s*\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?\s*$/.test(fracCandidate)) {
        const [numPart, denPart] = fracCandidate.split('/').map((s) => parseFloat(s.trim()))
        if (!isNaN(numPart) && !isNaN(denPart)) {
          fractionScored = numPart
          fractionMax = denPart
          break
        }
      }
    }

    // Check if backend returned an array of answer-level evaluations
    const answerEvaluations = Array.isArray(raw.submitted_answer)
      ? raw.submitted_answer
      : Array.isArray(raw.answers)
      ? raw.answers
      : Array.isArray(raw.evaluation)
      ? raw.evaluation
      : Array.isArray(nested.submitted_answer)
      ? nested.submitted_answer
      : Array.isArray(nested.answers)
      ? nested.answers
      : null

    let evalCorrectCount = undefined
    let evalIncorrectCount = undefined
    let evalScoreSum = undefined
    if (answerEvaluations && answerEvaluations.length > 0) {
      let cCount = 0
      let iCount = 0
      let sSum = 0
      let hasEvalFlags = false
      let hasEvalPoints = false
      for (const item of answerEvaluations) {
        if (item && typeof item === 'object') {
          if (item.is_correct === true || item.is_correct === 1 || item.correct === true || item.status === 'correct') {
            cCount++
            hasEvalFlags = true
          } else if (
            item.is_correct === false ||
            item.is_correct === 0 ||
            item.correct === false ||
            item.status === 'incorrect' ||
            item.status === 'wrong'
          ) {
            iCount++
            hasEvalFlags = true
          }
          const pts = pickNum(item.marks_obtained, item.score, item.points, item.marks)
          if (pts !== undefined) {
            sSum += pts
            hasEvalPoints = true
          }
        }
      }
      if (hasEvalFlags) {
        evalCorrectCount = cCount
        evalIncorrectCount = iCount
      }
      if (hasEvalPoints) {
        evalScoreSum = sSum
      }
    }

    const totalQuestions = pickNum(
      raw.total_questions,
      raw.total_test_questions,
      raw.total,
      nested.total_questions,
      nested.total_test_questions,
      nested.total,
      submissionPayload?.total_questions
    )
    const correctAnswers = pickNum(
      raw.correct_answers,
      raw.correct_answer,
      raw.correct_count,
      raw.correct,
      raw.right_answers,
      nested.correct_answers,
      nested.correct_answer,
      nested.correct_count,
      nested.correct,
      evalCorrectCount
    )
    const incorrectAnswers = pickNum(
      raw.incorrect_answers,
      raw.incorrect_answer,
      raw.wrong_answers,
      raw.incorrect_count,
      raw.incorrect,
      raw.wrong,
      nested.incorrect_answers,
      nested.incorrect_answer,
      nested.wrong_answers,
      nested.incorrect_count,
      nested.incorrect,
      evalIncorrectCount
    )
    const unattendedQuestions = pickNum(
      raw.unattended_questions,
      raw.unattended,
      raw.unanswered_questions,
      raw.unanswered,
      raw.skipped_questions,
      raw.skipped,
      nested.unattended_questions,
      nested.unattended,
      nested.unanswered_questions,
      nested.unanswered
    )
    const attendedQuestions = pickNum(
      raw.attended_questions,
      raw.attended,
      raw.attempted_questions,
      raw.attempted,
      nested.attended_questions,
      nested.attended,
      nested.attempted_questions,
      nested.attempted
    )
    const score = pickNum(
      raw.score,
      raw.marks_obtained,
      raw.obtained_marks,
      raw.total_score,
      raw.marks,
      nested.score,
      nested.marks_obtained,
      nested.obtained_marks,
      nested.total_score,
      nested.marks,
      fractionScored,
      evalScoreSum
    )
    const maxMarks = pickNum(
      raw.max_marks,
      raw.maximum_marks,
      raw.total_marks,
      raw.max_score,
      nested.max_marks,
      nested.maximum_marks,
      nested.total_marks,
      nested.max_score,
      fractionMax
    )
    const scorePercentage = pickNum(
      raw.score_percentage,
      raw.percentage,
      raw.percent,
      nested.score_percentage,
      nested.percentage,
      nested.percent
    )

    // Invalidate all caches and notify analytics so subsequent visits immediately reflect the test submission
    _clearAllCaches()
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('edoomate_analytics_updated', { detail: { type: 'test_submitted' } }))
      } catch {}
    }

    return {
      ...nested,
      ...raw,
      ...(totalQuestions !== undefined ? { total_questions: totalQuestions } : {}),
      ...(correctAnswers !== undefined ? { correct_answers: correctAnswers } : {}),
      ...(incorrectAnswers !== undefined ? { incorrect_answers: incorrectAnswers } : {}),
      ...(unattendedQuestions !== undefined ? { unattended_questions: unattendedQuestions } : {}),
      ...(attendedQuestions !== undefined ? { attended_questions: attendedQuestions } : {}),
      ...(score !== undefined ? { score } : {}),
      ...(maxMarks !== undefined ? { max_marks: maxMarks } : {}),
      ...(scorePercentage !== undefined ? { score_percentage: scorePercentage } : {}),
      duration_taken:
        raw.duration_taken ||
        raw.time_taken ||
        raw.elapsed_time ||
        nested.duration_taken ||
        nested.time_taken ||
        nested.elapsed_time ||
        undefined,
      comment:
        raw.comment ||
        raw.remarks ||
        raw.grade ||
        raw.performance ||
        raw.status_label ||
        nested.comment ||
        nested.remarks ||
        nested.grade ||
        nested.performance ||
        undefined,
    }
  },

  /**
   * Save and retrieve last test result in sessionStorage so refreshing on the result view preserves backend results
   */
  saveStoredTestResult(testId, resultObj) {
    if (!testId || !resultObj) return
    try {
      const cleanId = String(testId).replace(/^test-/, '')
      sessionStorage.setItem(`edoomate_test_result_${cleanId}`, JSON.stringify(resultObj))
    } catch (e) {}
  },

  getStoredTestResult(testId) {
    if (!testId) return null
    try {
      const cleanId = String(testId).replace(/^test-/, '')
      const raw = sessionStorage.getItem(`edoomate_test_result_${cleanId}`)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  },

  clearStoredTestResult(testId) {
    if (!testId) return
    try {
      const cleanId = String(testId).replace(/^test-/, '')
      sessionStorage.removeItem(`edoomate_test_result_${cleanId}`)
      sessionStorage.removeItem(`edoomate_test_result_${testId}`)
    } catch (e) {}
  },

  /**
   * Load and normalize full course curriculum from backend API
   * Fetches units, lessons, and each lesson's linked elements (tests/MCQs, topics, readables, videos)
   */
  async loadFullCourseCurriculum(courseId, token = null) {
    // Validate course expiry and entitlement before returning protected curriculum content
    if (token && courseId) {
      const access = await this.checkCourseAccess(courseId, token)
      if (access.isExpired) {
        const expiredErr = new Error('Your course has expired.')
        expiredErr.code = 'COURSE_EXPIRED'
        expiredErr.status = 403
        expiredErr.isExpired = true
        throw expiredErr
      }
      if (!access.hasAccess) {
        const accessErr = new Error('You do not have an active enrollment for this course.')
        accessErr.code = 'COURSE_LOCKED'
        accessErr.status = 403
        throw accessErr
      }
    }

    const course = await this.getCourseDetails(courseId, token)
    if (!course) return null

    // Normalize course-level preview video if provided
    let coursePreviewVideoUrl = null
    if (course.preview_video_url) {
      coursePreviewVideoUrl = course.preview_video_url
    } else if (course.preview_video) {
      const rawPv = String(course.preview_video).trim()
      if (rawPv && rawPv !== 'undefined') {
        coursePreviewVideoUrl = rawPv.startsWith('http')
          ? rawPv
          : rawPv.startsWith('/')
          ? `https://edoomate.myieltspartner.com${rawPv}`
          : `https://edoomate.myieltspartner.com/storage/course_videos/${rawPv}`
      }
    }

    const units = []
    if (Array.isArray(course.course_link_details) && course.course_link_details.length > 0) {
      const unitPromises = course.course_link_details.map(async (link, unitIdx) => {
        const unitData = await this.getUnitDetails(link.unit_id, token)
        if (!unitData) {
          return {
            id: `unit-${link.unit_id}`,
            unitId: link.unit_id,
            title: link.title || `Module ${unitIdx + 1}`,
            description: link.description || '',
            lessons: [
              {
                id: `lesson-u${link.unit_id}-1`,
                title: `${link.title || 'Lesson'} Lecture`,
                duration: link.unit_details?.duration || '15 min',
                videoUrl: coursePreviewVideoUrl || null,
                imageUrl: course.video_thumbnails_url || null,
                type: coursePreviewVideoUrl ? 'video' : 'lesson',
                description: 'Lecture and self-study material for this module.',
                elements: [],
                tests: [],
                topics: [],
                videos: [],
              },
            ],
          }
        }

        const rawLessonLinks = unitData.unit_link_details || []

        // Fetch each lesson's detailed elements in parallel for real backend topics, tests, readables
        const lessonPromises = rawLessonLinks.map(async (l, lIdx) => {
          const lessonId = l.element_id || l.id
          let lessonDetail = null
          if (lessonId) {
            lessonDetail = await this.getLessonDetails(lessonId, token)
          }

          const elements = lessonDetail?.lesson_link_details || []
          const tests = elements.filter(
            (el) => el.element_type === 'test' || el.element_type === 'mcq' || el.element_type === 'quiz'
          )
          const topics = elements.filter((el) => el.element_type === 'topic')
          const videos = elements.filter((el) => el.element_type === 'video')
          const readables = elements.filter((el) => el.element_type === 'readable')

          // If lesson has a linked video element, fetch its vimeo/media details
          let resolvedVideoUrl = null
          let resolvedVimeoId = null
          let videoDetail = null
          if (videos.length > 0 && videos[0].element_id) {
            try {
              videoDetail = await this.getVideoDetails(videos[0].element_id, token)
              if (videoDetail) {
                resolvedVimeoId = videoDetail.vimeo_id || null
                resolvedVideoUrl = videoDetail.video_url || null
              }
            } catch (err) {
              console.warn('Failed to resolve video details:', err)
            }
          }

          // Fallback to course preview video if no lesson-specific video is assigned
          if (!resolvedVideoUrl && coursePreviewVideoUrl) {
            resolvedVideoUrl = coursePreviewVideoUrl
          }

          const hasVideoContent = Boolean(resolvedVideoUrl || resolvedVimeoId || videos.length > 0)

          return {
            id: `lesson-${lessonId || `${unitData.id}-${lIdx + 1}`}`,
            elementId: lessonId,
            lessonId,
            title: l.title || lessonDetail?.lesson_name || `Lesson ${lIdx + 1}`,
            duration:
              lessonDetail?.lesson_details?.duration ||
              lessonDetail?.duration ||
              l.duration ||
              videoDetail?.duration ||
              unitData.unit_details?.duration ||
              '15 min',
            testDuration:
              lessonDetail?.lesson_details?.test_duration ||
              lessonDetail?.test_duration ||
              l.test_duration ||
              null,
            order: l.order || lIdx + 1,
            videoUrl: resolvedVideoUrl,
            vimeoId: resolvedVimeoId,
            videoDetail,
            imageUrl:
              videoDetail?.thumbnail_url ||
              l.lesson_image_url ||
              lessonDetail?.lesson_image_url ||
              unitData.unit_image_url ||
              null,
            type: hasVideoContent ? 'video' : (l.element_type || 'lesson'),
            description:
              lessonDetail?.description ||
              videoDetail?.description ||
              l.description ||
              unitData.description ||
              `Core study lecture on ${l.title || unitData.unit_name}.`,
            elements,
            tests,
            topics,
            videos,
            readables,
            resources: l.lesson_image_url
              ? [
                  {
                    id: `res-${l.id}`,
                    title: `${l.title} Study Material Image`,
                    url: l.lesson_image_url,
                    type: 'image',
                  },
                ]
              : [],
          }
        })

        const lessons = await Promise.all(lessonPromises)

        // Fallback lesson if unit has no explicit linked lessons
        if (lessons.length === 0) {
          lessons.push({
            id: `lesson-${unitData.id}-1`,
            elementId: null,
            lessonId: null,
            title: `${unitData.unit_name} Study Material`,
            duration: unitData.unit_details?.duration || '20 min',
            order: 1,
            videoUrl: course.preview_video_url || null,
            imageUrl: unitData.unit_image_url || null,
            type: 'lesson',
            description: unitData.description || `Module lecture on ${unitData.unit_name}.`,
            elements: [],
            tests: [],
            topics: [],
            videos: [],
            readables: [],
            resources: [],
          })
        }

        return {
          id: `unit-${unitData.id}`,
          unitId: unitData.id,
          title: unitData.unit_name || link.title,
          description: unitData.description || '',
          lessons,
        }
      })

      const resolvedUnits = await Promise.all(unitPromises)
      units.push(...resolvedUnits.filter(Boolean))
    }

    return {
      course,
      modules: units,
    }
  },

  /**
   * Retrieve saved course progress from localStorage
   */
  getStoredProgress(courseId) {
    try {
      const key = `edoomate_progress_${courseId}`
      const raw = localStorage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  /**
   * Save user's playback and learning session to backend API automatically.
   * Persists to backend student profile so progress remains available across devices,
   * page refreshes, and logout/re-login without relying primarily on localStorage.
   * Endpoint: PUT /api/student/profile/update
   */
  async saveUserLearningSession(sessionData, token = null) {
    if (!sessionData) return null
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('edoomate_auth_token') : null)

    const payload = {
      courseId: sessionData.courseId || null,
      unitId: sessionData.unitId || null,
      lessonId: sessionData.lessonId || sessionData.lastLessonId || null,
      topicId: sessionData.topicId || null,
      avatarTopicId: sessionData.avatarTopicId || sessionData.avatar_topic_id || null,
      avatarLink: sessionData.avatarLink || sessionData.avatar_link || null,
      stepIndex: sessionData.stepIndex !== undefined ? sessionData.stepIndex : null,
      isAvatarLecture: Boolean(sessionData.isAvatarLecture || sessionData.avatarTopicId || sessionData.avatar_topic_id || sessionData.avatarLink),
      videoId: sessionData.videoId || null,
      videoTimestamp: Number(sessionData.videoTimestamp || sessionData.timestamp || 0),
      completedLessonIds: Array.isArray(sessionData.completedLessonIds) ? sessionData.completedLessonIds : [],
      updatedAt: new Date().toISOString(),
    }

    // Always mirror to memory / storage for instant local retrieval
    this.saveStoredClassroomSession(payload)
    if (payload.courseId) {
      try {
        const key = `edoomate_progress_${payload.courseId}`
        localStorage.setItem(key, JSON.stringify(payload))
      } catch {}
    }

    if (!authToken) return payload

    try {
      const response = await fetch(`${API_BASE_URL}/student/profile/update`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          whatsapp: JSON.stringify(payload),
        }),
      })

      const data = await response.json().catch(() => null)
      return data?.data || payload
    } catch (err) {
      console.warn('saveUserLearningSession backend sync failed:', err.message)
      return payload
    }
  },

  /**
   * Fetch user's saved learning session and last playback position from backend API.
   * Endpoint: GET /api/user
   */
  async getUserLearningSession(token = null) {
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('edoomate_auth_token') : null)
    let backendSession = null

    if (authToken) {
      try {
        const response = await fetch(`${API_BASE_URL}/user`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Accept': 'application/json',
          },
        })

        if (response.ok) {
          const body = await response.json().catch(() => null)
          const rawWhatsapp = body?.data?.details?.whatsapp || body?.data?.student_details?.whatsapp
          if (rawWhatsapp && typeof rawWhatsapp === 'string' && rawWhatsapp.startsWith('{')) {
            try {
              const parsed = JSON.parse(rawWhatsapp)
              if (parsed && typeof parsed === 'object') {
                backendSession = parsed
                // Sync to local memory / storage cache
                this.saveStoredClassroomSession(parsed)
                if (parsed.courseId) {
                  try {
                    localStorage.setItem(`edoomate_progress_${parsed.courseId}`, JSON.stringify(parsed))
                  } catch {}
                }
              }
            } catch {}
          }
        }
      } catch (err) {
        console.warn('getUserLearningSession failed to fetch from backend:', err.message)
      }
    }

    // Fallback to local session if backend session could not be retrieved
    if (!backendSession) {
      backendSession = this.getStoredClassroomSession()
    }

    return backendSession
  },

  /**
   * Save course progress locally and track resume details
   */
  saveStoredProgress(courseId, { completedLessonIds, lastLessonId, unitId, topicId, videoTimestamp, videoId, avatarTopicId, avatarLink, stepIndex, isAvatarLecture }, token = null) {
    try {
      const key = `edoomate_progress_${courseId}`
      const existing = this.getStoredProgress(courseId) || {}
      const data = {
        ...existing,
        courseId,
        completedLessonIds: completedLessonIds || existing.completedLessonIds || [],
        lastLessonId: lastLessonId !== undefined ? lastLessonId : existing.lastLessonId || null,
        unitId: unitId !== undefined ? unitId : existing.unitId || null,
        topicId: topicId !== undefined ? topicId : existing.topicId || null,
        avatarTopicId: avatarTopicId !== undefined ? avatarTopicId : existing.avatarTopicId || null,
        avatarLink: avatarLink !== undefined ? avatarLink : existing.avatarLink || null,
        stepIndex: stepIndex !== undefined ? stepIndex : existing.stepIndex || 0,
        isAvatarLecture: isAvatarLecture !== undefined ? isAvatarLecture : existing.isAvatarLecture || false,
        videoTimestamp: videoTimestamp !== undefined ? videoTimestamp : existing.videoTimestamp || 0,
        videoId: videoId !== undefined ? videoId : existing.videoId || null,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(key, JSON.stringify(data))

      // Also update classroom resume state
      this.saveStoredClassroomSession({
        courseId,
        unitId: data.unitId,
        lessonId: data.lastLessonId,
        topicId: data.topicId,
        avatarTopicId: data.avatarTopicId,
        avatarLink: data.avatarLink,
        stepIndex: data.stepIndex,
        isAvatarLecture: data.isAvatarLecture,
        videoTimestamp: data.videoTimestamp,
        videoId: data.videoId,
        completedLessonIds: data.completedLessonIds,
      })

      // Sync automatically to backend
      this.saveUserLearningSession(data, token).catch(() => {})

      return true
    } catch {
      return false
    }
  },

  /**
   * Fetch student's points balance from backend API
   * Endpoint: GET /api/user
   * HTTP Method: GET
   * Authentication: Bearer <token>
   * Response fields: data.points
   * @param {string} token - Bearer auth token
   * @returns {Promise<number>} Points balance
   */
  async getUserPoints(token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in.')
      err.code = 'AUTH_MISSING'
      throw err
    }

    const response = await fetch(`${API_BASE_URL}/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    if (!response.ok) {
      let msg = `Server returned status ${response.status}`
      try {
        const body = await response.json()
        if (body?.message) msg = body.message
      } catch {}
      const err = new Error(msg)
      err.code = `HTTP_${response.status}`
      throw err
    }

    const data = await response.json()
    const user = data?.data || data
    const raw = user?.points !== undefined ? user.points : 0
    const num = Number(raw)
    return isNaN(num) ? 0 : num
  },

  /**
   * Helper to inspect any date fields or validity windows on a course / enrollment object
   * to determine if the course has passed its backend expiry date.
   *
   * @param {Object} obj - Course or enrollment record
   * @param {boolean} [isExplicitActiveEnrollment=false] - When true, obj comes from backend active_courses
   * @returns {{ isExpired: boolean, expiryDate: string|null }}
   */
  checkExpiryDate(obj, isExplicitActiveEnrollment = false) {
    if (!obj || typeof obj !== 'object') {
      return { isExpired: false, expiryDate: null }
    }

    // Direct boolean or status flags from backend
    if (obj.is_expired === true || obj._is_expired === true || obj.expired === true) {
      return { isExpired: true, expiryDate: obj.expiry_date || obj.expires_at || null }
    }
    if (String(obj.status_text || obj.status_name || '').toLowerCase() === 'expired') {
      return { isExpired: true, expiryDate: obj.expiry_date || obj.expires_at || null }
    }

    // Candidate date fields representing expiration
    const candidateFields = [
      'expiry_date',
      'expires_at',
      'expired_at',
      'expiration_date',
      'valid_until',
      'valid_to',
      'expires_on',
      'expiryDate',
      'expiresAt',
    ]

    // Only inspect enrollment-level records for expiry dates.
    // Notice: We intentionally do NOT include catalog course objects or course.end_date
    // unless this is a direct enrollment or user subscription record, preventing
    // historical course metadata from incorrectly expiring an active student's purchased access.
    const nestedEnrollmentObjects = [
      obj,
      obj.enrollment,
      obj.user_course,
      obj.subscription,
      obj.pivot,
    ].filter(Boolean)

    for (const target of nestedEnrollmentObjects) {
      for (const field of candidateFields) {
        const val = target[field]
        if (val && typeof val === 'string' && val.trim() !== '' && val !== 'null' && val !== 'undefined') {
          const parsedTime = Date.parse(val.trim().replace(' ', 'T'))
          if (!isNaN(parsedTime)) {
            if (Date.now() > parsedTime) {
              return { isExpired: true, expiryDate: val }
            } else {
              // Explicit future expiry date -> definitively NOT expired
              return { isExpired: false, expiryDate: val }
            }
          }
        }
      }

      // Check enrollment created_at + validity_days window
      const validityDays = Number(target.validity_days || target.validityDays)
      const startDateStr = target.enrolled_at || target.created_at || target.start_date || target.purchased_at
      if (!isNaN(validityDays) && validityDays > 0 && startDateStr) {
        const startTime = Date.parse(String(startDateStr).trim().replace(' ', 'T'))
        if (!isNaN(startTime)) {
          const calculatedExpiryTime = startTime + validityDays * 24 * 60 * 60 * 1000
          if (Date.now() > calculatedExpiryTime) {
            return { isExpired: true, expiryDate: new Date(calculatedExpiryTime).toISOString() }
          } else {
            return { isExpired: false, expiryDate: new Date(calculatedExpiryTime).toISOString() }
          }
        }
      }
    }

    // If this object is confirmed in active_courses from the backend and has no past expiry date,
    // it is definitively active and NOT expired.
    return { isExpired: false, expiryDate: null }
  },

  /**
   * Helper to determine if a course or enrollment is active according to backend flags and status text
   * @param {Object} courseObj
   * @returns {{ isActive: boolean, status: string, reason?: string }}
   */
  isCourseActive(courseObj) {
    if (!courseObj || typeof courseObj !== 'object') {
      return { isActive: false, status: 'unknown', reason: 'Invalid course object.' }
    }

    const explicitInactive =
      courseObj.is_active === false ||
      courseObj.is_active === 0 ||
      courseObj.is_active === '0' ||
      courseObj.active === false ||
      courseObj.active === 0 ||
      courseObj.active === '0' ||
      courseObj.status === 0 ||
      courseObj.status === '0'

    const statusStr = String(
      courseObj.status_name ||
      courseObj.status_text ||
      courseObj.status ||
      ''
    ).toLowerCase().trim()

    if (
      explicitInactive ||
      ['inactive', 'disabled', 'draft', 'archived', 'suspended', 'deactivated'].includes(statusStr)
    ) {
      return {
        isActive: false,
        status: 'inactive',
        reason: 'This course is currently inactive.',
      }
    }

    return { isActive: true, status: statusStr || 'active' }
  },

  /**
   * Verify if the authenticated student has access to a given course.
   * Authoritative backend source: GET /api/my-learning (active_courses vs expired_courses)
   * Also verifies backend expiry dates and valid enrollment windows.
   *
   * @param {number|string} courseId - The course ID to verify
   * @param {string} token - Bearer auth token
   * @param {Object} [courseMeta] - Optional course metadata for fallback checking
   * @returns {Promise<{ hasAccess: boolean, isExpired: boolean, isInactive?: boolean, status: string, reason: string, enrollment?: Object }>}
   */
  async checkCourseAccess(courseId, token, courseMeta = null) {
    if (!courseId) {
      return { hasAccess: false, isExpired: false, isInactive: false, status: 'unauthorized', reason: 'No course specified.' }
    }

    // Require token for protected course access
    if (!token) {
      return { hasAccess: false, isExpired: false, isInactive: false, status: 'unauthenticated', reason: 'Please log in to access this course.' }
    }

    try {
      const myLearning = await this.getMyLearningCourses(token)
      const data = myLearning?.data || myLearning || {}
      const activeCourses = Array.isArray(data.active_courses) ? data.active_courses : []
      const expiredCourses = Array.isArray(data.expired_courses) ? data.expired_courses : []

      const targetId = Number(String(courseId).replace(/^api-/, ''))

      const matchesTarget = (c) => {
        const cCourseId = Number(c.course_id ?? c.course?.id ?? c.id)
        const cDirectId = Number(c.id)
        return cCourseId === targetId || cDirectId === targetId
      }

      // 1. Check active enrollments returned by backend FIRST (Active purchased enrollments take precedence)
      const activeMatch = activeCourses.find(matchesTarget)

      if (activeMatch) {
        // Authoritative date check on the active course / enrollment record
        const expiryCheck = this.checkExpiryDate(activeMatch, true)
        if (expiryCheck.isExpired) {
          return {
            hasAccess: false,
            isExpired: true,
            isInactive: false,
            status: 'expired',
            reason: 'Your course has expired.',
            expiryDate: expiryCheck.expiryDate,
            enrollment: activeMatch,
          }
        }

        // Authoritative active check: verify the course itself is active, not deactivated or disabled
        const activeStatusCheck = this.isCourseActive(activeMatch)
        if (!activeStatusCheck.isActive) {
          return {
            hasAccess: false,
            isExpired: false,
            isInactive: true,
            status: 'inactive',
            reason: activeStatusCheck.reason || 'This course is currently inactive.',
            enrollment: activeMatch,
          }
        }

        return {
          hasAccess: true,
          isExpired: false,
          isInactive: false,
          status: 'active',
          reason: 'Authorized active enrollment.',
          expiryDate: expiryCheck.expiryDate,
          enrollment: activeMatch,
        }
      }

      // 2. Check explicit expired enrollments returned by backend only if no active enrollment exists
      const expiredMatch = expiredCourses.find(matchesTarget)

      if (expiredMatch) {
        const { expiryDate } = this.checkExpiryDate(expiredMatch)
        return {
          hasAccess: false,
          isExpired: true,
          isInactive: false,
          status: 'expired',
          reason: 'Your course has expired.',
          expiryDate: expiryDate || null,
          enrollment: expiredMatch,
        }
      }

      // 3. Check if the course is inactive in courseMeta
      if (courseMeta) {
        const metaExpiry = this.checkExpiryDate(courseMeta)
        if (metaExpiry.isExpired) {
          return {
            hasAccess: false,
            isExpired: true,
            isInactive: false,
            status: 'expired',
            reason: 'Your course has expired.',
            expiryDate: metaExpiry.expiryDate,
          }
        }

        const metaActiveCheck = this.isCourseActive(courseMeta)
        if (!metaActiveCheck.isActive) {
          return {
            hasAccess: false,
            isExpired: false,
            isInactive: true,
            status: 'inactive',
            reason: metaActiveCheck.reason || 'This course is currently inactive.',
          }
        }

        const isFree = courseMeta.is_free === true || courseMeta.is_free === 1 || parseFloat(courseMeta.price) === 0
        if (isFree) {
          return { hasAccess: true, isExpired: false, isInactive: false, status: 'active', reason: 'Free course access.' }
        }
      }

      return {
        hasAccess: false,
        isExpired: false,
        isInactive: false,
        status: 'unpurchased',
        reason: 'This course requires purchase or active enrollment.',
      }
    } catch (err) {
      console.warn('checkCourseAccess failed:', err)
      // Check if we have cached my-learning data to verify against during rate-limiting or network issues
      const cached = _myLearningCache.get(token)
      if (cached && cached.data) {
        const cachedData = cached.data.data || cached.data || {}
        const cachedActive = Array.isArray(cachedData.active_courses) ? cachedData.active_courses : []
        const cachedExpired = Array.isArray(cachedData.expired_courses) ? cachedData.expired_courses : []
        const targetId = Number(String(courseId).replace(/^api-/, ''))

        const matchesCached = (c) => {
          const cCourseId = Number(c.course_id ?? c.course?.id ?? c.id)
          const cDirectId = Number(c.id)
          return cCourseId === targetId || cDirectId === targetId
        }

        const cachedActiveMatch = cachedActive.find(matchesCached)
        if (cachedActiveMatch) {
          const expiryCheck = this.checkExpiryDate(cachedActiveMatch, true)
          if (expiryCheck.isExpired) {
            return {
              hasAccess: false,
              isExpired: true,
              isInactive: false,
              status: 'expired',
              reason: 'Your course has expired.',
            }
          }
          const activeCheck = this.isCourseActive(cachedActiveMatch)
          if (!activeCheck.isActive) {
            return {
              hasAccess: false,
              isExpired: false,
              isInactive: true,
              status: 'inactive',
              reason: 'This course is currently inactive.',
            }
          }
          return {
            hasAccess: true,
            isExpired: false,
            isInactive: false,
            status: 'active',
            reason: 'Authorized active enrollment.',
          }
        }

        const cachedExpiredMatch = cachedExpired.find(matchesCached)
        if (cachedExpiredMatch) {
          return {
            hasAccess: false,
            isExpired: true,
            isInactive: false,
            status: 'expired',
            reason: 'Your course has expired.',
          }
        }
      }

      return {
        hasAccess: false,
        isExpired: false,
        isInactive: false,
        status: err.code === 'RATE_LIMITED' ? 'rate_limited' : 'error',
        reason: err.code === 'RATE_LIMITED'
          ? 'Course verification temporarily unavailable due to request limit. Please retry in a moment.'
          : (err.message || 'Unable to verify course access at this time.'),
      }
    }
  },

  /**
   * Attempt checkout or payment status verification with backend
   * Endpoint: GET /api/course/checkout
   * @param {number|string} courseId
   * @param {string} token
   * @returns {Promise<Object>}
   */
  async getCourseCheckout(courseId, token) {
    if (!token) {
      throw new Error('Authentication token is missing. Please log in.')
    }
    const targetId = Number(String(courseId).replace(/^api-/, ''))
    const response = await fetch(`${API_BASE_URL}/course/checkout?course_id=${targetId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })
    const data = await response.json()
    return data
  },

  /**
   * Create Stripe Checkout session with the backend API
   * Endpoint: POST /api/payment/stripe/checkout
   * Request Body: { course_id: <actual_course_id> }
   * Response: { data: { redirect_url, stripe_session_id, ... }, ... }
   * @param {Object} params - { courseId, user, course }
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} { success, redirect_url, checkout_url, stripe_session_id, session_id, data }
   */
  async createPaymentSession({ courseId, user, course }, token) {
    if (!token) {
      throw new Error('Authentication token is missing. Please log in to purchase.')
    }
    const targetId = Number(String(courseId).replace(/^api-/, ''))
    if (!targetId || isNaN(targetId)) {
      throw new Error('Invalid course ID provided for checkout.')
    }

    const response = await fetch(`${API_BASE_URL}/payment/stripe/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ course_id: targetId }),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      const errMsg = body?.message || body?.error || `Checkout initiation failed (HTTP ${response.status})`
      throw new Error(errMsg)
    }

    const redirectUrl = body?.data?.redirect_url || body?.redirect_url || body?.url || body?.data?.url
    const sessionId = body?.data?.stripe_session_id || body?.data?.session_id || body?.stripe_session_id || body?.session_id

    return {
      success: true,
      redirect_url: redirectUrl,
      checkout_url: redirectUrl,
      stripe_session_id: sessionId,
      session_id: sessionId,
      data: body?.data || body,
    }
  },

  /**
   * Confirm Stripe payment with backend API
   * Endpoint: POST /api/payment/stripe/confirm
   * Request Body: { session_id: "<actual_stripe_session_id>" }
   * @param {string} sessionId - Stripe session id
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} Confirmation response from backend
   */
  async confirmStripePayment(sessionId, token) {
    if (!token) {
      throw new Error('Authentication token is missing. Please log in.')
    }
    if (!sessionId) {
      throw new Error('Stripe session ID is missing.')
    }

    const response = await fetch(`${API_BASE_URL}/payment/stripe/confirm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId }),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      const errMsg = body?.message || body?.error || `Payment confirmation failed (HTTP ${response.status})`
      throw new Error(errMsg)
    }

    return body
  },

  /**
   * Authoritative Payment & Access Verification
   * 1. Confirms Stripe session with backend if session_id provided
   * 2. Verifies student enrollment via GET /api/my-learning
   * @param {number|string} courseId
   * @param {string} token
   * @param {string} [stripeSessionId]
   * @returns {Promise<{ isVerified: boolean, hasAccess: boolean, status: string, message: string, raw: Object }>}
   */
  async verifyPaymentStatus(courseId, token, stripeSessionId = null) {
    if (!token) {
      return { isVerified: false, hasAccess: false, status: 'unauthenticated', message: 'Authentication required.' }
    }

    let confirmResult = null
    if (stripeSessionId) {
      try {
        confirmResult = await this.confirmStripePayment(stripeSessionId, token)
        // Clear my-learning cache so that newly enrolled course is immediately fetched from backend
        this.clearMyLearningCache()
      } catch (err) {
        console.warn('POST /payment/stripe/confirm error:', err)
        // If confirmation explicitly failed or session is invalid, preserve error info
        return {
          isVerified: false,
          hasAccess: false,
          status: 'failed',
          message: err.message || 'Payment confirmation failed with server.',
          raw: err,
        }
      }
    }

    // Now query authoritative active courses in GET /api/my-learning
    const access = await this.checkCourseAccess(courseId, token)
    return {
      isVerified: access.hasAccess,
      hasAccess: access.hasAccess,
      status: access.hasAccess ? 'success' : (access.status || 'pending'),
      message: access.reason || (access.hasAccess ? 'Payment verified and course access granted.' : 'Awaiting enrollment confirmation in My Learning.'),
      confirmResult,
    }
  },

  /**
   * Fetch subject assessments for a student / grade
   * Endpoint: GET /api/subject-assessments?grade={grade}
   * @param {string} grade - Student grade (e.g. 'V', 'X', 'I')
   * @param {string} [token] - Optional Bearer auth token
   * @param {string} [subjectKey] - Optional single subject key filter (e.g. 'ENGLISH')
   * @returns {Promise<Object>} API payload containing subjects list, completion counts, etc.
   */
  async getSubjectAssessments({ grade = 'V', token = null, subjectKey = null } = {}) {
    const cleanGrade = (grade || 'V').trim()
    const query = new URLSearchParams()
    if (cleanGrade) query.append('grade', cleanGrade)

    const subPath = subjectKey ? `/${encodeURIComponent(subjectKey)}` : ''
    const url = `${API_BASE_URL}/subject-assessments${subPath}?${query.toString()}`

    const headers = { 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await fetch(url, { method: 'GET', headers })
      const data = await response.json().catch(() => null)

      if (!response.ok || (data && data.success === false)) {
        throw new Error(data?.message || `Failed to fetch subject assessments (HTTP ${response.status})`)
      }

      return data?.data || data || null
    } catch (err) {
      console.warn('Backend getSubjectAssessments failed:', err.message)
      throw err
    }
  },

  /**
   * Fetch assessment questions and metadata for a specific grade & subject
   * Primary Endpoint: GET /api/assessment/{grade}/{subject}
   * Fallback Endpoint: GET /api/test/{testId}
   * @param {Object} params - { grade, subject, testId, token }
   * @returns {Promise<Object>} Standardized test/assessment details object with questions and options
   */
  async getAssessmentQuestions({ grade = 'V', subject, testId = null, takeUrl = null, token = null }) {
    const headers = { 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const cleanSubject = String(subject || '').toUpperCase().trim()
    const cleanGrade = String(grade || 'V').trim()

    let rawData = null
    const candidateUrls = []

    // 1. Direct take_assessment_url returned by /api/subject-assessments (e.g. /api/assessment/V/ENGLISH)
    // The APK and backend assessment system use /api/assessment/{grade}/{subject} containing assessment_section_details
    if (takeUrl && typeof takeUrl === 'string' && takeUrl.trim()) {
      candidateUrls.push(takeUrl.trim())
    }

    // 2. Official /api/assessment/{grade}/{subject} endpoint
    if (cleanGrade && cleanSubject) {
      candidateUrls.push(`${API_BASE_URL}/assessment/${encodeURIComponent(cleanGrade)}/${encodeURIComponent(cleanSubject)}`)
    }

    // 3. Direct test endpoint: GET /api/test/{cleanId}
    if (testId) {
      const cleanId = String(testId).replace(/^test-/, '').trim()
      candidateUrls.push(`${API_BASE_URL}/assessment/take/${cleanId}`)
      candidateUrls.push(`${API_BASE_URL}/assessment/questions/${cleanId}`)
      candidateUrls.push(`${API_BASE_URL}/assessment/start/${cleanId}`)
      candidateUrls.push(`${API_BASE_URL}/test/${cleanId}`)
    }

    // Deduplicate URLs while preserving order
    const uniqueUrls = [...new Set(candidateUrls)]

    for (const url of uniqueUrls) {
      try {
        const response = await fetch(url, { method: 'GET', headers })
        if (response.ok) {
          const json = await response.json().catch(() => null)
          if (json && json.status !== false && json.success !== false) {
            const candidate = json.data || json
            // Ensure candidate has data
            if (candidate && (typeof candidate === 'object')) {
              // Enforce grade match if assessment object specifies grade
              const candidateGrade = candidate?.grade || candidate?.test_details?.grade
              if (
                !candidateGrade ||
                String(candidateGrade).trim().toUpperCase() === cleanGrade.toUpperCase()
              ) {
                rawData = candidate
                break
              }
            }
          }
        }
      } catch (e) {
        console.warn(`getAssessmentQuestions request to ${url} failed:`, e.message)
      }
    }

    // Fallback: If still not loaded and testId exists, try getTestDetails helper
    if (!rawData && testId) {
      const cleanId = String(testId).replace(/^test-/, '').trim()
      try {
        const testRes = await this.getTestDetails(cleanId, token)
        if (testRes) {
          // Note: getTestDetails synthesizes grade '10' if test details omit grade.
          // Because testId was already verified from subject-assessments for this student/grade,
          // accept testRes unconditionally.
          rawData = testRes
        }
      } catch (e) {
        console.warn(`getTestDetails fallback for test ${cleanId} error:`, e.message)
      }
    }

    if (!rawData) {
      throw new Error(`Unable to load assessment questions for ${cleanSubject} (${cleanGrade}). Authentication or assessment setup required.`)
    }

    // Verify active status restriction on assessment questions
    if (!this.isMcqActive(rawData) || !this.isMcqActive(rawData?.test_details)) {
      const err = new Error(`The assessment for ${cleanSubject} is currently inactive and cannot be accessed.`)
      err.code = 'MCQ_INACTIVE'
      err.status = 403
      err.isInactive = true
      throw err
    }

    const baseDetails = rawData?.test_details || {}
    const sections =
      rawData?.assessment_section_details ||
      rawData?.test_section_details ||
      rawData?.sections ||
      rawData?.test_sections ||
      baseDetails?.assessment_section_details ||
      baseDetails?.test_section_details ||
      baseDetails?.sections ||
      baseDetails?.test_sections ||
      []

    const directQuestions =
      rawData?.questions ||
      rawData?.test_questions ||
      baseDetails?.questions ||
      baseDetails?.test_questions ||
      []

    return {
      ...baseDetails,
      ...rawData,
      id: rawData?.id || baseDetails?.id || testId,
      test_name: rawData?.test_name || baseDetails?.test_name || rawData?.title || `${cleanSubject} Assessment`,
      subject: cleanSubject,
      grade: cleanGrade,
      duration:
        rawData?.duration ||
        baseDetails?.duration ||
        rawData?.time_limit ||
        baseDetails?.time_limit ||
        rawData?.total_duration ||
        baseDetails?.total_duration ||
        null,
      total_test_questions:
        rawData?.total_test_questions ||
        rawData?.total_question ||
        baseDetails?.total_test_questions ||
        baseDetails?.total_question ||
        (sections.length > 0 ? sections.flatMap((s) => s.questions || s.test_questions || []).length : directQuestions.length),
      test_section_details: sections,
      questions: directQuestions,
    }
  },

  /**
   * Fetch Privacy Policy content from backend
   * Endpoint: GET /api/privacy-policy
   * @param {string} [token] - Optional Bearer auth token
   * @returns {Promise<Object>} Privacy policy data object
   */
  async getPrivacyPolicy(token = null) {
    const headers = { 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await fetch(`${API_BASE_URL}/privacy-policy`, { method: 'GET', headers })
      const data = await response.json().catch(() => null)

      if (!response.ok || (data && data.success === false)) {
        throw new Error(data?.message || `Failed to fetch privacy policy (HTTP ${response.status})`)
      }

      return data?.data || data || null
    } catch (err) {
      console.warn('Backend getPrivacyPolicy failed:', err.message)
      throw err
    }
  },

  /**
   * Submit student assessment answers to backend API
   * Primary Endpoint: PUT /api/student-assessments/submit/{assessment_id}
   * @param {number|string} assessmentId - Assessment ID
   * @param {Object} payload - { student_id, answers: [{ qn_id, question, options, selected_option, correct_answer, points }] }
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response
   */
  async submitStudentAssessment(assessmentId, payload, token) {
    if (!token) {
      const err = new Error('Authentication token is missing. Please log in to submit your assessment.')
      err.code = 'AUTH_MISSING'
      throw err
    }

    const cleanId = String(assessmentId).replace(/^test-/, '').trim()
    const response = await fetch(`${API_BASE_URL}/student-assessments/submit/${cleanId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 401) {
      const err = new Error('Your session has expired. Please log in again.')
      err.code = 'AUTH_EXPIRED'
      throw err
    }

    const json = await response.json().catch(() => null)

    if (!response.ok || (json && json.success === false)) {
      let msg = json?.message || json?.error || `Server returned status ${response.status}`
      if (json?.errors && typeof json.errors === 'object') {
        msg = Object.values(json.errors).flat().join(', ')
      }
      const err = new Error(msg)
      err.code = `HTTP_${response.status}`
      err.status = response.status
      throw err
    }

    return json?.data || json || {}
  },

  /**
   * Record video watch progress on backend API
   * Endpoint: POST /api/video/watch
   * @param {Object} param0 - { courseId, videoId, duration }
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response
   */
  async recordVideoWatch({ courseId, videoId, duration = 1 }, token) {
    if (!token || !courseId || !videoId) return null
    try {
      const response = await fetch(`${API_BASE_URL}/video/watch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          course_id: Number(courseId) || courseId,
          video_id: Number(videoId) || videoId,
          duration: Number(duration) || 1,
        }),
      })
      const data = await response.json().catch(() => null)
      if (typeof window !== 'undefined' && data?.success) {
        window.dispatchEvent(new CustomEvent('edoomate_analytics_updated', { detail: { type: 'topic_watched', courseId, topicId } }))
      }
      return data
    } catch (e) {
      console.warn('recordVideoWatch failed:', e.message)
      return null
    }
  },

  /**
   * Record topic watch progress on backend API
   * Endpoint: POST /api/topic/watch
   * @param {Object} param0 - { courseId, topicId }
   * @param {string} token - Bearer auth token
   * @returns {Promise<Object>} API response
   */
  async recordTopicWatch({ courseId, topicId }, token) {
    if (!token || !courseId || !topicId) return null
    try {
      const response = await fetch(`${API_BASE_URL}/topic/watch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          course_id: Number(courseId) || courseId,
          topic_id: Number(topicId) || topicId,
        }),
      })
      const data = await response.json().catch(() => null)
      if (typeof window !== 'undefined' && data?.success) {
        window.dispatchEvent(new CustomEvent('edoomate_analytics_updated', { detail: { type: 'topic_watched', courseId, topicId } }))
      }
      return data
    } catch (e) {
      console.warn('recordTopicWatch failed:', e.message)
      return null
    }
  },

  /**
   * Record readable watch on backend API
   * Endpoint: POST /api/readable/watch
   */
  async recordReadableWatch({ courseId, readableId }, token) {
    if (!token || !courseId || !readableId) return null
    try {
      const response = await fetch(`${API_BASE_URL}/readable/watch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          course_id: Number(courseId) || courseId,
          readable_id: Number(readableId) || readableId,
        }),
      })
      const data = await response.json().catch(() => null)
      if (typeof window !== 'undefined' && data?.success) {
        window.dispatchEvent(new CustomEvent('edoomate_analytics_updated', { detail: { type: 'readable_watched', courseId, readableId } }))
      }
      return data
    } catch {
      return null
    }
  },

  /**
   * Endpoint: GET /api/terms-conditions
   * @param {string} [token] - Optional Bearer auth token
   * @returns {Promise<Object>} Terms & conditions data object
   */
  async getTermsAndConditions(token = null) {
    const headers = { 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await fetch(`${API_BASE_URL}/terms-conditions`, { method: 'GET', headers })
      const data = await response.json().catch(() => null)

      if (!response.ok || (data && data.success === false)) {
        throw new Error(data?.message || `Failed to fetch terms & conditions (HTTP ${response.status})`)
      }

      return data?.data || data || null
    } catch (err) {
      console.warn('Backend getTermsAndConditions failed:', err.message)
      throw err
    }
  },

  /**
   * Fetch Profile Questionnaire Questions from backend
   * Endpoint: GET /api/profile-questions
   * @param {string} [token] - Optional Bearer auth token
   * @returns {Promise<Array>} List of questionnaire questions with options
   */
  async getProfileQuestions(token = null) {
    const headers = { 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await fetch(`${API_BASE_URL}/profile-questions`, { method: 'GET', headers })
      const data = await response.json().catch(() => null)

      if (!response.ok || (data && data.success === false)) {
        throw new Error(data?.message || `Failed to fetch profile questions (HTTP ${response.status})`)
      }

      return Array.isArray(data?.data) ? data.data : []
    } catch (err) {
      console.warn('Backend getProfileQuestions failed:', err.message)
      throw err
    }
  },

  /**
   * Fetch previously saved student profile questionnaire answers
   * Endpoint: GET /api/profile-questions/student/{studentId}
   * @param {number|string} studentId - Student ID
   * @param {string} [token] - Optional Bearer auth token
   * @returns {Promise<Object>} Object containing data: [{question, answer}], is_profile_question_completed
   */
  async getStudentProfileAnswers(studentId, token = null) {
    if (!studentId) return { data: [], is_profile_question_completed: false }
    const headers = { 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await fetch(`${API_BASE_URL}/profile-questions/student/${studentId}`, { method: 'GET', headers })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        if (response.status === 404) {
          return { data: [], is_profile_question_completed: false }
        }
        throw new Error(data?.message || `Failed to fetch student answers (HTTP ${response.status})`)
      }

      return data || { data: [], is_profile_question_completed: false }
    } catch (err) {
      console.warn('Backend getStudentProfileAnswers failed:', err.message)
      return { data: [], is_profile_question_completed: false }
    }
  },

  /**
   * Submit student profile questionnaire answers
   * Enforces one-time submission on the backend/API layer.
   * Endpoint: POST /api/profile-questions/submit
   * @param {Object} payload - { student_id, answers: [{ question, answer }] }
   * @param {string} [token] - Bearer auth token
   * @returns {Promise<Object>} Server response
   */
  async submitProfileQuestions(payload, token = null) {
    const studentId = payload?.student_id
    if (!studentId) {
      throw new Error('Student identifier is required for questionnaire submission.')
    }

    // Verify current completion status directly against the server/database
    if (token) {
      try {
        const studentStatusRes = await this.getStudentProfileAnswers(studentId, token)
        if (studentStatusRes?.is_profile_question_completed) {
          const alreadySubmittedErr = new Error('You have already completed and submitted this questionnaire. Resubmission is not permitted.')
          alreadySubmittedErr.code = 'ALREADY_COMPLETED'
          alreadySubmittedErr.status = 409
          throw alreadySubmittedErr
        }
      } catch (checkErr) {
        if (checkErr.code === 'ALREADY_COMPLETED') throw checkErr
        // If status check fails non-critically, proceed to post
      }
    }

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${API_BASE_URL}/profile-questions/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok || (data && data.success === false)) {
      let msg = data?.message || data?.error || `Server error ${response.status}`
      if (data?.errors && typeof data.errors === 'object') {
        msg = Object.values(data.errors).flat().join(', ')
      }
      const err = new Error(msg)
      err.status = response.status
      throw err
    }

    return data || {}
  },

  /**
   * Submit Help & Support inquiry / contact request
   * Endpoint: POST /api/contact-us
   * @param {Object} payload - { first_name, last_name, email, mobile, phone, subject, message, user_id }
   * @param {string} [token] - Optional Bearer auth token
   * @returns {Promise<Object>} Server response
   */
  async submitSupportInquiry(payload, token = null) {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${API_BASE_URL}/contact-us`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok || (data && data.success === false)) {
      let msg = data?.message || data?.error || `Server returned error ${response.status}`
      if (data?.errors && typeof data.errors === 'object') {
        msg = Object.values(data.errors).flat().join(', ')
      }
      const err = new Error(msg)
      err.status = response.status
      throw err
    }

    return data || {}
  },
}



