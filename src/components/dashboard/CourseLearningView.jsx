import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate, useParams, useLocation } from 'react-router-dom'
import Player from '@vimeo/player'
import { courseService } from '../../services/courseService'
import { authService } from '../../services/authService'

/**
 * CourseLearningView - Complete Edoomate Learning Page
 *
 * Implements:
 * 1. Header: Breadcrumb (My Learning > Course Name > Learning), Back button, Progress bar
 * 2. Main Layout: Desktop 2-column (Player on left, Curriculum on right), Mobile responsive
 * 3. Video Section: Large video player with real video URL or reading banner when no video exists
 * 4. Course Curriculum: Modules & lessons accordion, completed/active/locked statuses
 * 5. Navigation: Previous Lesson, Next Lesson, Mark as Complete, Accurate progress
 * 6. Resources: Lesson notes, and attachments only when provided
 * 7. Live Backend MCQ Tests: Fetches real tests, questions, passages, images, options via GET /api/test/{id}
 * 8. Real MCQ Submission: Evaluates answers and submits via POST /api/test/submit
 * 9. Robust error, loading, and empty states
 */
/**
 * Safely parse correct answer keys from question metadata and options.
 * Handles comma/underscore formats like "1,_,3", "1,_,2,_,4", "1, 3", "[1, 3]",
 * arrays, single values, and option flags (is_correct === true).
 */
export const parseMcqCorrectKeys = (question, options = []) => {
  const keys = new Set()
  if (!question) return keys

  // 1. Extract from flagged options
  const optList = Array.isArray(options) ? options : Object.values(options || {})
  optList.forEach((o, oIdx) => {
    if (
      o &&
      typeof o === 'object' &&
      (o.is_correct === true || o.is_correct === 1 || o.is_correct === '1' || o.correct === true || o.is_answer === true)
    ) {
      if (o.value !== undefined && o.value !== null) keys.add(String(o.value).trim().toLowerCase())
      if (o.label !== undefined && o.label !== null) keys.add(String(o.label).trim().toLowerCase())
      if (o.id !== undefined && o.id !== null) keys.add(String(o.id).trim().toLowerCase())
      keys.add(String.fromCharCode(65 + oIdx).toLowerCase())
      keys.add(String(oIdx + 1))
    }
  })

  // 2. Helper to add string/number/array tokens
  const addToken = (val) => {
    if (val === undefined || val === null) return
    if (Array.isArray(val)) {
      val.forEach(addToken)
      return
    }
    const str = String(val).trim()
    if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str)
        if (Array.isArray(parsed)) {
          parsed.forEach(addToken)
          return
        }
      } catch {}
    }
    // Clean delimiters: handles '1,_,3', '1,_,2,_,4', '1, 3', 'A, C', '1;3'
    const cleaned = str.replace(/,_\s*,|,_,|_/g, ',')
    cleaned
      .split(/[,;|]+/)
      .map((p) => p.trim())
      .filter((p) => p && p !== '_')
      .forEach((p) => keys.add(p.toLowerCase()))
  }

  if (Array.isArray(question.answers)) question.answers.forEach(addToken)
  if (Array.isArray(question.correct_answers)) question.correct_answers.forEach(addToken)
  if (Array.isArray(question.correct_options)) question.correct_options.forEach(addToken)

  addToken(question.answer)
  addToken(question.correct_answer)
  addToken(question.correct_option)
  addToken(question.right_answer)

  return keys
}

/**
 * Checks if a specific option is correct according to the parsed correct keys set
 */
export const checkIsOptionCorrect = (opt, oIdx, correctKeysSet) => {
  if (!opt) return false
  if (
    typeof opt === 'object' &&
    (opt.is_correct === true || opt.is_correct === 1 || opt.is_correct === '1' || opt.correct === true || opt.is_answer === true)
  ) {
    return true
  }
  if (!correctKeysSet || correctKeysSet.size === 0) return false

  const val = typeof opt === 'object' ? opt.value : opt
  const strVal = val !== undefined && val !== null ? String(val).trim().toLowerCase() : ''
  const strLbl = typeof opt === 'object' && opt.label ? String(opt.label).trim().toLowerCase() : ''
  const strId = typeof opt === 'object' && opt.id !== undefined && opt.id !== null ? String(opt.id).trim().toLowerCase() : ''
  const letter = String.fromCharCode(65 + oIdx).toLowerCase()
  const oneBased = String(oIdx + 1)

  return (
    (strVal && correctKeysSet.has(strVal)) ||
    (strLbl && correctKeysSet.has(strLbl)) ||
    (strId && correctKeysSet.has(strId)) ||
    correctKeysSet.has(letter) ||
    correctKeysSet.has(oneBased)
  )
}

export default function CourseLearningView({
  course,
  action = 'resume',
  initialLessonId = null,
  onBack,
  onNavigateCourses,
  onOpenTest,
  isDedicatedTestRoute = false,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const courseId = searchParams.get('courseId') || course?.id || course?.course_id || 'feat-physics'
  const courseTitle = course?.title || course?.course_name || 'Advanced Physics: Kinematics'
  const courseBadge = course?.badge || 'GRADE 10'
  const courseSubject = course?.subject || 'PHYSICS'

  // Course Access & Entitlement Guard State
  const [accessCheck, setAccessCheck] = useState({
    isLoading: true,
    hasAccess: false,
    isExpired: false,
    isInactive: false,
    reason: '',
  })

  // Loading & Error States for API Courses
  const [isLoadingCurriculum, setIsLoadingCurriculum] = useState(false)
  const [apiError, setApiError] = useState(null)


  // Curriculum State: Array of Modules with Lessons
  const [modules, setModules] = useState([])
  const [activeLessonId, setActiveLessonId] = useState(null)
  const [expandedModules, setExpandedModules] = useState({})
  const [completedLessonIds, setCompletedLessonIds] = useState([])

  // Video & Playback Controls
  const videoRef = useRef(null)
  const vimeoIframeRef = useRef(null)
  const vimeoPlayerInstanceRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isVideoLoading, setIsVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState(null)
  const [isIframeLoaded, setIsIframeLoaded] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState('1.0x')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)

  // isDedicatedTest: use the stable prop value only — NOT window.location.pathname.
  // window.location.pathname changes immediately when navigate() is called (before re-render/unmount),
  // which would cause the redirect effect below to fire at the wrong time during route transitions.
  const isDedicatedTest = Boolean(isDedicatedTestRoute)
  const urlLessonId = searchParams.get('lessonId') || initialLessonId
  const urlTab = searchParams.get('tab') || 'materials'
  const routeParams = useParams()
  const urlTestId = routeParams.testId || searchParams.get('testId')
  const urlMode = searchParams.get('mode') // 'test' | 'video'

  // Redirect legacy /learning?testId=X URLs to the dedicated /test/:testId route.
  // Guard: only run when this is NOT the dedicated test route instance (isDedicatedTestRoute=false).
  // Using isDedicatedTestRoute prop (not window.location) avoids firing during navigation transitions.
  useEffect(() => {
    if (!isDedicatedTestRoute && urlTestId) {
      const lId = searchParams.get('lessonId')
      navigate(
        `/test/${encodeURIComponent(urlTestId)}?courseId=${encodeURIComponent(courseId)}${lId ? `&lessonId=${encodeURIComponent(lId)}` : ''}`,
        { replace: true }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDedicatedTestRoute, urlTestId])

  // Interactive Content Tabs: 'avatar', 'test', 'resources', 'video'
  const [activeTab, setActiveTab] = useState(() => {
    if (urlTab === 'test') return 'test'
    if (urlTab === 'resources') return 'resources'
    if (urlTab === 'video' || urlTab === 'topics') return 'video'
    return 'avatar'
  })
  const [toastMessage, setToastMessage] = useState('')
  const [isMobileCurriculumOpen, setIsMobileCurriculumOpen] = useState(false)

  // Real Backend MCQ Test States
  const [testDetails, setTestDetails] = useState(null)
  const [isLoadingTest, setIsLoadingTest] = useState(false)

  // Dedicated Video Learning Page States
  const [activeVideoData, setActiveVideoData] = useState(null)
  const [isVideoPageLoading, setIsVideoPageLoading] = useState(false)
  const [videoPageError, setVideoPageError] = useState(null)
  const [testError, setTestError] = useState(null)
  const [userAnswers, setUserAnswers] = useState({}) // { [qn_id]: option_value }
  const [isSubmittingTest, setIsSubmittingTest] = useState(false)
  const [testResult, setTestResult] = useState(null) // API response from /api/test/submit
  const [activeTestId, setActiveTestId] = useState(() => urlTestId || null)
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0)
  const [isTakingTest, setIsTakingTest] = useState(() => isDedicatedTest || urlMode === 'test' || Boolean(urlTestId))

  // Helper to sync current sub-state into URL search params without page reload
  const updateUrlParams = (updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, val]) => {
        if (val === null || val === undefined || val === '') {
          next.delete(key)
        } else {
          next.set(key, String(val))
        }
      })
      return next
    }, { replace: true })
  }

  // Backend Timer & Time Limit States
  const [timeLeft, setTimeLeft] = useState(null) // remaining seconds or null if no backend duration
  const [totalDurationSec, setTotalDurationSec] = useState(null) // original total test duration in seconds
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [hasTimedOut, setHasTimedOut] = useState(false)
  const [hasBackendDuration, setHasBackendDuration] = useState(false)
  const isSubmittingRef = useRef(false)
  const hasSubmittedRef = useRef(false)
  const timerIntervalRef = useRef(null)
  const userAnswersRef = useRef({})
  const testDetailsRef = useRef(null)
  const loadingTestIdRef = useRef(null)

  const [checkedQuestions, setCheckedQuestions] = useState({}) // { [qn_id]: true }
  const testStartTimeRef = useRef(null)
  const [testDurationTakenStr, setTestDurationTakenStr] = useState('00:00:00')

  // Keep refs in sync for interval callbacks without stale closures
  useEffect(() => {
    userAnswersRef.current = userAnswers
  }, [userAnswers])

  useEffect(() => {
    testDetailsRef.current = testDetails
  }, [testDetails])

  // Real Backend Resources & Topics States
  const [lessonResources, setLessonResources] = useState([])
  const [isLoadingResources, setIsLoadingResources] = useState(false)
  const [resourcesError, setResourcesError] = useState(null)

  // Inline viewer states — keep students inside Edoomate
  const [activeInlineResource, setActiveInlineResource] = useState(null) // { title, url, type }

  // Open a resource inside the Edoomate inline viewer instead of navigating away
  const handleOpenResource = (res) => {
    const rawUrl = res?.url || res?.pdf_url
    if (!rawUrl) return
    setActiveInlineResource({ title: res.title || 'Resource', url: rawUrl, type: res.type || res.readable_type || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Close the inline resource viewer and return to the resources tab
  const handleCloseInlineResource = () => {
    setActiveInlineResource(null)
  }

  // Open Native Avatar Lecture inside the internal dedicated video lesson page
  const handleOpenAvatarTopic = async (topic) => {
    // Record topic watch progress on backend API
    const token = authService.getToken()
    if (topic?.id && token) {
      courseService.recordTopicWatch({ courseId, topicId: topic.id }, token).catch(() => {})
      persistProgress(completedLessonIds, activeLessonId, { topicId: topic.id })
    }

    const url = topic?.avatar_link || topic?.rawDetail?.avatar_link
    if (!url || typeof url !== 'string' || !url.trim() || url === 'null' || url === 'undefined') {
      showToast('⚠️ No avatar lecture configured for this topic.')
      return
    }

    // Navigate to dedicated internal Video Lesson page which renders the Native Avatar Player
    handleOpenVideo({
      id: topic?.id || 'topic-avatar-video',
      title: topic?.title || 'Interactive Topic Lecture',
      videoUrl: url.trim(),
      sourceTab: 'topics',
      raw: topic,
    })
  }

  const [lessonTopics, setLessonTopics] = useState([])
  const [isLoadingTopics, setIsLoadingTopics] = useState(false)
  const [topicsError, setTopicsError] = useState(null)

  // Trigger temporary feedback toast
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3200)
  }

  // Dynamic document.title — keeps browser tab title in sync with the active view
  useEffect(() => {
    if (activeInlineResource) {
      document.title = `${activeInlineResource.title} | Edoomate`
    } else {
      document.title = courseTitle ? `${courseTitle} | Edoomate` : 'Edoomate'
    }
    return () => {
      document.title = 'Edoomate'
    }
  }, [activeInlineResource, courseTitle])

  // Load Course Curriculum & Stored Progress
  useEffect(() => {
    let isMounted = true

    async function initializeCourse() {
      // 0. Enforce backend entitlement check
      setAccessCheck({ isLoading: true, hasAccess: false, isExpired: false, isInactive: false, reason: '' })
      try {
        const token = authService.getToken()
        const check = await courseService.checkCourseAccess(courseId, token, course)
        if (!isMounted) return
        setAccessCheck({
          isLoading: false,
          hasAccess: check.hasAccess,
          isExpired: Boolean(check.isExpired),
          isInactive: Boolean(check.isInactive),
          reason: check.reason,
        })
        if (!check.hasAccess) {
          setIsLoadingCurriculum(false)
          return
        }
      } catch (checkErr) {
        if (!isMounted) return
        const isExp = checkErr.isExpired || checkErr.code === 'COURSE_EXPIRED' || /expired/i.test(checkErr.message)
        const isInactive = checkErr.isInactive || checkErr.code === 'COURSE_INACTIVE' || /inactive/i.test(checkErr.message)
        setAccessCheck({
          isLoading: false,
          hasAccess: false,
          isExpired: Boolean(isExp),
          isInactive: Boolean(isInactive),
          reason: checkErr.message || 'Access verification failed',
        })
        setIsLoadingCurriculum(false)
        return
      }

      setIsLoadingCurriculum(true)
      setApiError(null)

      let loadedModules = []
      const isApiCourse =
        String(courseId).startsWith('api-') ||
        typeof courseId === 'number' ||
        !isNaN(Number(courseId)) ||
        Boolean(course?.course_link_details)

      // 1. Fetch from API if it's an API course or has course_link_details
      if (isApiCourse && (!course?.modules || course.modules.length === 0)) {
        try {
          const token = authService.getToken()
          const apiData = await courseService.loadFullCourseCurriculum(courseId, token)
          if (apiData && apiData.modules && apiData.modules.length > 0) {
            loadedModules = apiData.modules
          }
        } catch (err) {
          console.warn('Failed to load curriculum from API:', err)
          setApiError('Unable to sync live curriculum with the server. Showing offline modules.')
        }
      }


      // 2. Fallback to existing modules on the course object
      if (loadedModules.length === 0 && course?.modules && course.modules.length > 0) {
        loadedModules = course.modules
      }

      // 3. Fallback to default curriculum if still empty
      if (loadedModules.length === 0) {
        loadedModules = [
          {
            id: 'mod-1',
            title: 'Module 1: Core Fundamentals & Principles',
            lessons: [
              {
                id: 'l-1',
                title: `${courseTitle} - Introduction & Overview`,
                duration: '15 min',
                type: 'video',
                videoUrl: course?.preview_video_url || course?.videoUrl || null,
                description: `Fundamental introduction to ${courseTitle}. Master core definitions, historical context, and key analytical frameworks.`,
              },
              {
                id: 'l-2',
                title: 'Core Methodologies & Practice',
                duration: '22 min',
                type: 'reading',
                videoUrl: null,
                description: 'Detailed reading, formulas, and guided worked examples for this module.',
              },
            ],
          },
          {
            id: 'mod-2',
            title: 'Module 2: Advanced Applications & Mastery',
            lessons: [
              {
                id: 'l-3',
                title: 'Practical Exercises & Synthesis',
                duration: '28 min',
                type: 'reading',
                videoUrl: null,
                description: 'Applied problems and capstone exercises to solidify topic mastery.',
              },
            ],
          },
        ]
      }

      if (!isMounted) return

      setModules(loadedModules)

      // Flatten lessons to calculate progress and determine initial lesson
      const allLessons = loadedModules.flatMap((m) => m.lessons || [])

      // 4. Load stored progress from backend user learning session / localStorage
      const token = authService.getToken()
      let backendSession = null
      try {
        backendSession = await courseService.getUserLearningSession(token)
      } catch {}

      const storedProgress = backendSession?.courseId && String(backendSession.courseId) === String(courseId)
        ? backendSession
        : courseService.getStoredProgress(courseId) || backendSession

      let initialCompleted = storedProgress?.completedLessonIds || []

      // If no stored progress yet but course had default initial progress
      if (initialCompleted.length === 0 && course?.progress > 0 && allLessons.length > 0) {
        const completedCount = Math.round((course.progress / 100) * allLessons.length)
        initialCompleted = allLessons.slice(0, completedCount).map((l) => l.id)
      }

      setCompletedLessonIds(initialCompleted)

      // 5. Determine active lesson based on action ('start', 'continue', 'resume')
      let targetLesson = null

      const effectiveInitialLessonId = urlLessonId || initialLessonId
      if (effectiveInitialLessonId) {
        targetLesson = allLessons.find(
          (l) =>
            String(l.id) === String(effectiveInitialLessonId) ||
            String(l.lessonId) === String(effectiveInitialLessonId) ||
            String(l.elementId) === String(effectiveInitialLessonId) ||
            String(l.id) === `lesson-${effectiveInitialLessonId}`
        )
      }

      if (!targetLesson) {
        if (action === 'start') {
          targetLesson = allLessons[0]
        } else if (action === 'continue') {
          // Open the first uncompleted lesson
          targetLesson = allLessons.find((l) => !initialCompleted.includes(l.id)) || allLessons[0]
        } else {
          // Resume: open last accessed lesson or first uncompleted
          if (storedProgress?.lastLessonId || storedProgress?.lessonId) {
            const lastId = storedProgress.lastLessonId || storedProgress.lessonId
            targetLesson = allLessons.find(
              (l) =>
                String(l.id) === String(lastId) ||
                String(l.lessonId) === String(lastId) ||
                String(l.elementId) === String(lastId)
            )
          }
          if (!targetLesson) {
            targetLesson = allLessons.find((l) => !initialCompleted.includes(l.id)) || allLessons[0]
          }
        }
      }

      if (targetLesson) {
        setActiveLessonId(targetLesson.id)

        // Expand the module containing the active lesson
        const parentModule = loadedModules.find((m) =>
          (m.lessons || []).some((l) => l.id === targetLesson.id)
        )
        if (parentModule) {
          setExpandedModules({ [parentModule.id]: true })
        }
      } else if (loadedModules.length > 0) {
        setExpandedModules({ [loadedModules[0].id]: true })
      }

      setIsLoadingCurriculum(false)
    }

    initializeCourse()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, action, initialLessonId, urlLessonId])

  // Flattened list of all lessons in sequence
  const allLessons = modules.flatMap((m) =>
    (m.lessons || []).map((lesson) => ({
      ...lesson,
      moduleId: m.id,
      moduleTitle: m.title,
    }))
  )

  const activeIndex = allLessons.findIndex((l) => l.id === activeLessonId)
  const currentLesson = allLessons[activeIndex] || allLessons[0] || null

  // Helper to parse backend duration string, number, or object into seconds
  const parseDurationToSeconds = (dur) => {
    if (dur === null || dur === undefined || dur === '') return null
    if (typeof dur === 'object') {
      const inner =
        dur.duration ??
        dur.value ??
        dur.minutes ??
        dur.hours ??
        dur.seconds ??
        dur.time ??
        dur.time_limit
      return inner !== undefined ? parseDurationToSeconds(inner) : null
    }
    if (typeof dur === 'number') {
      if (isNaN(dur) || dur <= 0) return null
      // If 1, usually means 1 hour (60 minutes = 3600 seconds)
      if (dur === 1) return 3600
      // If duration is greater than 120, treat as total seconds (e.g. 600 -> 10 mins, 3600 -> 1 hour).
      // Otherwise treat as minutes (e.g. 60 -> 60 mins = 3600 secs, 15 -> 15 mins = 900 secs).
      return dur > 120 ? Math.round(dur) : Math.round(dur * 60)
    }
    const str = String(dur).trim()
    if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return null

    // Format: "HH:MM:SS"
    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(str)) {
      const parts = str.split(':').map(Number)
      const sec = parts[0] * 3600 + parts[1] * 60 + parts[2]
      return sec > 0 ? sec : null
    }
    // Format: "MM:SS" or "HH:MM"
    if (/^\d{1,2}:\d{1,2}$/.test(str)) {
      const parts = str.split(':').map(Number)
      // If "01:00" or "1:00", treat as 1 hour (3600s); otherwise minutes:seconds
      const sec = parts[0] === 1 && parts[1] === 0 ? 3600 : parts[0] * 60 + parts[1]
      return sec > 0 ? sec : null
    }
    // Format: "1 hr 30 min" or "1 hour" or "1h" or "1.5 hours" or "60m"
    const hrMatch = str.match(/(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours|h)\b/i)
    const minPartMatch = str.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|m)\b/i)
    if (hrMatch || minPartMatch) {
      const hrs = hrMatch ? parseFloat(hrMatch[1]) : 0
      const mins = minPartMatch ? parseFloat(minPartMatch[1]) : 0
      const total = Math.round(hrs * 3600 + mins * 60)
      return total > 0 ? total : null
    }
    // Format: "120 sec" or "120s"
    const secMatch = str.match(/(\d+(?:\.\d+)?)\s*(sec|secs|second|seconds|s)\b/i)
    if (secMatch) {
      const secs = Math.round(parseFloat(secMatch[1]))
      return secs > 0 ? secs : null
    }
    // Pure numeric string (including decimals like "60.0", "3600", "60", "1")
    if (/^\d+(?:\.\d+)?$/.test(str)) {
      const val = parseFloat(str)
      if (isNaN(val) || val <= 0) return null
      if (val === 1) return 3600
      return val > 120 ? Math.round(val) : Math.round(val * 60)
    }
    return null
  }

  // Format seconds for MCQ timer badge: always "HH:MM:SS" (e.g., "01:00:00" -> "00:59:59")
  const formatTimerDisplay = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) return '00:00:00'
    const totalSecs = Math.max(0, Math.round(totalSeconds))
    const hrs = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Centralized test submission function (used for manual submit and timer expiration)
  const submitMcqTest = async (isAutoTimeout = false) => {
    if (isSubmittingRef.current || hasSubmittedRef.current) return
    const currentTest = testDetailsRef.current
    if (!currentTest || !currentTest.id) return

    const token = authService.getToken()
    if (!token) {
      showToast('⚠️ Authentication required to submit test. Please log in.')
      return
    }

    // Calculate actual elapsed duration from test attempt start timestamp
    const cleanTestIdForTimer = String(currentTest.id ?? currentTest.test_id ?? activeTestId ?? '').replace(/^test-/, '')
    let resolvedStartTime = testStartTimeRef.current
    try {
      const storedJson =
        sessionStorage.getItem(`edoomate_test_session_${cleanTestIdForTimer}`) ||
        sessionStorage.getItem(`edoomate_test_session_${activeTestId}`)
      if (storedJson) {
        const parsedSession = JSON.parse(storedJson)
        if (parsedSession?.startedAt && Number(parsedSession.startedAt) <= Date.now()) {
          resolvedStartTime = Number(parsedSession.startedAt)
          testStartTimeRef.current = resolvedStartTime
        }
      }
    } catch (e) {}

    let calculatedDurationStr = '00:00:00'
    if (resolvedStartTime) {
      const elapsedSec = Math.max(1, Math.round((Date.now() - resolvedStartTime) / 1000))
      const h = Math.floor(elapsedSec / 3600).toString().padStart(2, '0')
      const m = Math.floor((elapsedSec % 3600) / 60).toString().padStart(2, '0')
      const s = (elapsedSec % 60).toString().padStart(2, '0')
      calculatedDurationStr = `${h}:${m}:${s}`
      setTestDurationTakenStr(calculatedDurationStr)
    }

    isSubmittingRef.current = true
    hasSubmittedRef.current = true
    setIsSubmittingTest(true)
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    setIsTimerActive(false)

    try {
      const currentAns = {
        ...(userAnswersRef.current || {}),
        ...(userAnswers || {}),
      }
      const sectionQuestions = (currentTest.test_section_details || []).flatMap((s) => s.questions || [])
      const fallbackQuestions = currentTest.questions || currentTest.test_questions || []
      const questionsList = sectionQuestions.length > 0 ? sectionQuestions : fallbackQuestions

      const submitted_answer = Object.entries(currentAns)
        .filter(([, val]) => {
          if (Array.isArray(val)) return val.length > 0
          return val !== undefined && val !== null && String(val) !== ''
        })
        .map(([qnId, val]) => {
          const qObj = questionsList.find(
            (q, idx) => String(q.qn_id || q.id || q.question_id || idx + 1) === String(qnId)
          )
          const rawQId = qObj?.qn_id ?? qObj?.id ?? qObj?.question_id ?? qnId
          const numQnId = Number(rawQId)
          const formattedAns = Array.isArray(val) ? val.map((v) => String(v)).join(',') : String(val)
          return {
            qn_id: !isNaN(numQnId) && String(numQnId) === String(rawQId).trim() ? numQnId : rawQId,
            qn_type: qObj?.qn_type || qObj?.type || 'MCQ',
            answer: formattedAns,
          }
        })

      const rawTestId = currentTest.id ?? currentTest.test_id ?? activeTestId ?? urlTestId
      const cleanTestId = String(rawTestId).replace(/^test-/, '')
      const numTestId = Number(cleanTestId)
      const submittedDataId = !isNaN(numTestId) && String(numTestId) === cleanTestId ? numTestId : rawTestId
      const totalQ = Number(currentTest.total_test_questions) || questionsList.length || 1

      const payload = {
        submitted_data_id: submittedDataId,
        test_id: submittedDataId,
        total_questions: totalQ,
        submitted_answer,
      }

      const res = await courseService.submitTest(payload, token)
      try {
        sessionStorage.removeItem(`edoomate_test_session_${currentTest.id}`)
        sessionStorage.removeItem(`edoomate_test_session_${cleanTestId}`)
      } catch (e) {}

      // Compute verified question-level metrics against question answer keys
      let verifiedCorrectCount = 0
      let verifiedIncorrectCount = 0
      let verifiedScoreObtained = 0
      let verifiedMaxMarks = 0
      let hasVerifiedAnswerKeys = false

      questionsList.forEach((q, idx) => {
        const qId = String(q.qn_id || q.id || q.question_id || idx + 1)
        const qPoints = Number(q.points ?? q.marks ?? 1) || 1
        verifiedMaxMarks += qPoints
        const userAns = currentAns[qId]

        const rawOpts = q.options || q.question_options || q.choices || q.answers || []
        const optArray = Array.isArray(rawOpts) ? rawOpts : Object.values(rawOpts)
        // Parse and check all correct answer keys for this question
        const correctKeysSet = parseMcqCorrectKeys(q, optArray)
        const correctOptIndices = new Set()
        optArray.forEach((o, oIdx) => {
          if (checkIsOptionCorrect(o, oIdx, correctKeysSet)) {
            correctOptIndices.add(oIdx)
          }
        })

        const totalExpectedCorrectCount = correctOptIndices.size || (correctKeysSet.size > 0 ? correctKeysSet.size : 1)
        const qType = String(q.qn_type || q.type || '').trim().toUpperCase()
        const isMultipleAnswerQ =
          /MULTIPLE|CHECKBOX|MULTI/i.test(qType) ||
          totalExpectedCorrectCount > 1 ||
          Boolean(q.isMultiSelect) ||
          Number(q.max_answers || q.max_selections || q.correct_answers_count) > 1

        if (correctKeysSet.size > 0 || correctOptIndices.size > 0) {
          hasVerifiedAnswerKeys = true
          if (userAns !== undefined && userAns !== null && userAns !== '') {
            const userAnsList = (Array.isArray(userAns) ? userAns : [userAns])
              .flatMap((x) => String(x).replace(/,_\s*,|,_,|_/g, ',').split(/[,;|]+/))
              .map((x) => String(x).trim().toLowerCase())
              .filter(Boolean)

            if (userAnsList.length > 0) {
              const selectedCorrectIndices = new Set()
              let hasIncorrectSelection = false

              userAnsList.forEach((normUser) => {
                const selectedOptIndex = optArray.findIndex((o, oIdx) => {
                  if (typeof o === 'string' || typeof o === 'number') return String(o).trim().toLowerCase() === normUser
                  if (o && typeof o === 'object') {
                    const candidateVal = o.value ?? o.option_value ?? o.key ?? o.id ?? String.fromCharCode(65 + oIdx)
                    return (
                      String(candidateVal).trim().toLowerCase() === normUser ||
                      String(o.label ?? o.text ?? o.option ?? '').trim().toLowerCase() === normUser
                    )
                  }
                  return false
                })

                const isMatchCorrect =
                  (selectedOptIndex >= 0 && correctOptIndices.has(selectedOptIndex)) ||
                  correctKeysSet.has(normUser)

                if (isMatchCorrect) {
                  if (selectedOptIndex >= 0) selectedCorrectIndices.add(selectedOptIndex)
                  else selectedCorrectIndices.add(normUser)
                } else {
                  hasIncorrectSelection = true
                }
              })

              const allCorrectSelected =
                correctOptIndices.size > 0
                  ? selectedCorrectIndices.size === correctOptIndices.size
                  : selectedCorrectIndices.size === totalExpectedCorrectCount

              const fullCountMatch = isMultipleAnswerQ
                ? (allCorrectSelected && !hasIncorrectSelection)
                : (!hasIncorrectSelection && selectedCorrectIndices.size > 0)

              if (fullCountMatch) {
                verifiedCorrectCount++
                verifiedScoreObtained += qPoints
              } else {
                verifiedIncorrectCount++
              }
            }
          }
        }
      })

      const actualSubmittedCount = submitted_answer.length
      const backendCorrect =
        res.correct_answers !== undefined && !isNaN(Number(res.correct_answers))
          ? Number(res.correct_answers)
          : undefined
      const backendIncorrect =
        res.incorrect_answers !== undefined && !isNaN(Number(res.incorrect_answers))
          ? Number(res.incorrect_answers)
          : undefined
      const backendUnattended =
        res.unattended_questions !== undefined && !isNaN(Number(res.unattended_questions))
          ? Number(res.unattended_questions)
          : undefined
      const backendAttended =
        res.attended_questions !== undefined && !isNaN(Number(res.attended_questions))
          ? Number(res.attended_questions)
          : undefined
      const backendScore =
        res.score !== undefined && !isNaN(Number(res.score))
          ? Number(res.score)
          : undefined

      const finalTotalQ =
        res.total_questions !== undefined && !isNaN(Number(res.total_questions)) && Number(res.total_questions) > 0
          ? Number(res.total_questions)
          : totalQ

      // Detect if backend returned an un-evaluated zero stub despite non-empty submitted_answer
      const backendIgnoredSubmittedAnswers =
        actualSubmittedCount > 0 &&
        (backendCorrect || 0) === 0 &&
        (backendIncorrect || 0) === 0 &&
        ((backendAttended !== undefined && backendAttended === 0) ||
          (backendUnattended !== undefined && backendUnattended >= finalTotalQ))

      const finalCorrect =
        !backendIgnoredSubmittedAnswers && backendCorrect !== undefined && (backendCorrect > 0 || !hasVerifiedAnswerKeys || verifiedCorrectCount === 0)
          ? backendCorrect
          : hasVerifiedAnswerKeys
          ? verifiedCorrectCount
          : backendCorrect ?? 0

      const finalIncorrect =
        !backendIgnoredSubmittedAnswers && backendIncorrect !== undefined && (backendIncorrect > 0 || !hasVerifiedAnswerKeys || verifiedIncorrectCount === 0)
          ? backendIncorrect
          : hasVerifiedAnswerKeys
          ? verifiedIncorrectCount
          : Math.max(0, actualSubmittedCount - finalCorrect)

      const derivedAttendedFromBackend =
        backendAttended !== undefined
          ? backendAttended
          : backendUnattended !== undefined
          ? Math.max(0, finalTotalQ - backendUnattended)
          : undefined

      const finalAttended =
        !backendIgnoredSubmittedAnswers &&
        derivedAttendedFromBackend !== undefined &&
        (derivedAttendedFromBackend > 0 || actualSubmittedCount === 0)
          ? derivedAttendedFromBackend
          : actualSubmittedCount > 0
          ? actualSubmittedCount
          : finalCorrect + finalIncorrect

      const finalUnattended = Math.max(0, finalTotalQ - finalAttended)

      const finalMaxMarks =
        res.max_marks !== undefined && !isNaN(Number(res.max_marks)) && Number(res.max_marks) > 0
          ? Number(res.max_marks)
          : verifiedMaxMarks > 0
          ? verifiedMaxMarks
          : finalTotalQ

      const finalScore =
        !backendIgnoredSubmittedAnswers && backendScore !== undefined && (backendScore > 0 || finalCorrect === 0)
          ? backendScore
          : hasVerifiedAnswerKeys && verifiedScoreObtained > 0
          ? verifiedScoreObtained
          : finalCorrect

      const backendPct =
        res.score_percentage !== undefined && !isNaN(Number(res.score_percentage))
          ? Number(res.score_percentage)
          : undefined

      const finalPercentage =
        !backendIgnoredSubmittedAnswers && backendPct !== undefined && (backendPct > 0 || finalScore === 0)
          ? backendPct
          : finalMaxMarks > 0
          ? Math.round((finalScore / finalMaxMarks) * 1000) / 10
          : finalTotalQ > 0
          ? Math.round((finalCorrect / finalTotalQ) * 1000) / 10
          : 0

      const resolvedComment =
        !backendIgnoredSubmittedAnswers && res.comment
          ? res.comment
          : finalPercentage >= 80
          ? 'Excellent'
          : finalPercentage >= 60
          ? 'Good'
          : finalPercentage >= 40
          ? 'Average'
          : res.comment || 'Keep Practicing'

      // Elapsed duration fallback if backend didn't return duration_taken
      let computedDurationStr = calculatedDurationStr || testDurationTakenStr
      if (testStartTimeRef.current) {
        const elapsedSec = Math.max(1, Math.round((Date.now() - testStartTimeRef.current) / 1000))
        const h = Math.floor(elapsedSec / 3600).toString().padStart(2, '0')
        const m = Math.floor((elapsedSec % 3600) / 60).toString().padStart(2, '0')
        const s = (elapsedSec % 60).toString().padStart(2, '0')
        computedDurationStr = `${h}:${m}:${s}`
      }

      const enrichedResult = {
        ...res,
        total_questions: finalTotalQ,
        correct_answers: finalCorrect,
        incorrect_answers: finalIncorrect,
        attended_questions: finalAttended,
        unattended_questions: finalUnattended,
        score: finalScore,
        max_marks: finalMaxMarks,
        score_percentage: finalPercentage,
        comment: resolvedComment,
        duration_taken: res.duration_taken || computedDurationStr || '00:00:00',
        saved_user_answers: currentAns,
      }

      courseService.saveStoredTestResult(cleanTestId, enrichedResult)
      setTestResult(enrichedResult)
      updateUrlParams({ result: '1' })
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('edoomate_analytics_updated', { detail: { type: 'test_submitted', testId: cleanTestId } }))
        } catch {}
      }
      if (isAutoTimeout) {
        showToast('⏰ Time expired! Your answers were submitted automatically.')
      } else {
        showToast('🎉 Test submitted successfully! Results loaded.')
      }
      if (currentLesson?.id && !completedLessonIds.includes(currentLesson.id)) {
        handleToggleComplete(currentLesson.id)
      }
    } catch (err) {
      hasSubmittedRef.current = false // Allow retry on actual network error
      showToast(`Submission failed: ${err.message}`)
    } finally {
      isSubmittingRef.current = false
      setIsSubmittingTest(false)
    }
  }

  // Helper to cleanly separate Vimeo numeric ID and unlisted hash
  const extractVimeoInfo = (vId, vHash, vUrl) => {
    let numericId = null
    let hash = vHash ? String(vHash).trim() : null

    // Helper to evaluate a candidate string
    const evaluate = (candidate) => {
      if (!candidate || typeof candidate !== 'string') return
      const s = candidate.trim()
      // Check full vimeo url: vimeo.com/12345/abcdef or vimeo.com/video/12345?h=abcdef
      const urlHashMatch = s.match(/vimeo\.com\/(?:video\/)?(\d+)[/:]([a-zA-Z0-9]+)/i)
      if (urlHashMatch) {
        if (!numericId) numericId = urlHashMatch[1]
        if (!hash) hash = urlHashMatch[2]
        return
      }
      const queryHashMatch = s.match(/vimeo\.com\/(?:video\/)?(\d+).*?[?&]h=([a-zA-Z0-9]+)/i)
      if (queryHashMatch) {
        if (!numericId) numericId = queryHashMatch[1]
        if (!hash) hash = queryHashMatch[2]
        return
      }
      const simpleUrlMatch = s.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
      if (simpleUrlMatch) {
        if (!numericId) numericId = simpleUrlMatch[1]
        return
      }
      // Check composite ID like "1228571169:abcdef" or "1228571169/abcdef"
      if (s.includes('/') || s.includes(':')) {
        const parts = s.split(/[/:]/)
        const idPart = parts[0]?.trim()
        const hashPart = parts[1]?.trim()
        if (/^\d{6,12}$/.test(idPart)) {
          if (!numericId) numericId = idPart
          if (!hash && hashPart && !/^\d+$/.test(hashPart)) hash = hashPart
          return
        }
      }
      // Strictly numeric Vimeo ID (typically 6 to 12 digits)
      if (/^\d{6,12}$/.test(s)) {
        if (!numericId) numericId = s
      } else if (!hash && /^[a-zA-Z0-9]{8,16}$/.test(s)) {
        // Alphanumeric hash only (not numeric)
        hash = s
      }
    }

    if (vId) evaluate(String(vId))
    if (vUrl) evaluate(String(vUrl))

    return { numericVimeoId: numericId, vimeoHash: hash }
  }

  // Handle opening dedicated Video Lesson page when user clicks a Topic video or video material
  const handleOpenVideo = async (videoItem) => {
    if (!videoItem) return

    const isTopic =
      videoItem.sourceTab === 'topics' ||
      videoItem.raw?.element_type === 'topic' ||
      videoItem.type === 'topic'

    // Extract identifiers and hash
    const directUrl =
      videoItem.videoUrl ||
      videoItem.raw?.video_url ||
      videoItem.raw?.stream_url ||
      videoItem.raw?.avatar_link ||
      videoItem.raw?.url ||
      (!isTopic ? currentLesson?.videoUrl : null) ||
      null

    // Candidate Vimeo ID & Hash:
    // If opening a Topic, NEVER inherit currentLesson's shared vimeo ID or videos[0]!
    const candidateVimeoId =
      videoItem.vimeoId ||
      videoItem.raw?.vimeo_id ||
      videoItem.raw?.vimeoId ||
      (!isTopic
        ? (currentLesson?.vimeoId ||
           (currentLesson?.videos && currentLesson.videos[0]?.vimeo_id) ||
           (currentLesson?.videos && currentLesson.videos[0]?.vimeoId) ||
           null)
        : null)

    const candidateHash =
      videoItem.vimeoHash ||
      videoItem.raw?.vimeo_hash ||
      videoItem.raw?.hash ||
      (!isTopic
        ? ((currentLesson?.videos && currentLesson.videos[0]?.vimeo_hash) ||
           (currentLesson?.videos && currentLesson.videos[0]?.hash) ||
           null)
        : null)

    let { numericVimeoId: directVimeoId, vimeoHash: directVimeoHash } = extractVimeoInfo(
      candidateVimeoId,
      candidateHash,
      directUrl
    )

    // If still no direct Vimeo ID, check if item.id or raw.id is itself a numeric Vimeo ID
    if (!directVimeoId && videoItem.id && /^\d{7,12}$/.test(String(videoItem.id).trim())) {
      directVimeoId = String(videoItem.id).trim()
    }
    if (!directVimeoId && videoItem.raw?.id && /^\d{7,12}$/.test(String(videoItem.raw.id).trim())) {
      directVimeoId = String(videoItem.raw.id).trim()
    }

    // Determine actual video element ID (only for video elements, never for topics)
    let vidParam = null
    if (videoItem.raw?.element_type === 'video' || videoItem.type === 'video') {
      vidParam = videoItem.element_id || videoItem.raw?.element_id || videoItem.id
    } else if (!isTopic && currentLesson?.videos && currentLesson.videos.length > 0) {
      vidParam = currentLesson.videos[0].element_id || currentLesson.videos[0].id
    } else if (directVimeoId) {
      vidParam = directVimeoId
    } else if (!isTopic && videoItem.id && !String(videoItem.id).startsWith('topic-') && videoItem.id !== 'video-stream' && videoItem.id !== 'video-main') {
      vidParam = videoItem.id
    }

    // Determine topic ID
    const curTopicId = isTopic
      ? (videoItem.raw?.element_id || videoItem.raw?.id || videoItem.id)
      : null

    // Navigate to dedicated internal Video Lesson page (exact structure and pattern as PrivacyPolicyPage)
    const params = new URLSearchParams()
    if (vidParam) params.set('videoId', String(vidParam))
    if (directVimeoId) params.set('vimeoId', String(directVimeoId))
    if (directVimeoHash) params.set('vimeoHash', String(directVimeoHash))
    if (courseId) params.set('courseId', String(courseId))
    const lId = activeLessonId || urlLessonId || currentLesson?.id || currentLesson?.lessonId
    if (lId) params.set('lessonId', String(lId))
    if (curTopicId) params.set('topicId', String(curTopicId))
    if (videoItem.title) params.set('title', videoItem.title)

    navigate(`/video-lesson?${params.toString()}`)
  }

  // Handle opening a specific test when user clicks a test card
  const handleOpenTest = async (testId) => {
    if (!testId) return

    // Pre-check if current lesson has this test and if it is inactive
    const matchedTest = (currentLesson?.tests || []).find(
      (t) => String(t.element_id || t.id).replace(/^test-/, '') === String(testId).replace(/^test-/, '')
    )
    if (matchedTest && !courseService.isMcqActive(matchedTest)) {
      showToast('⚠️ This MCQ test is inactive and cannot be accessed.')
      return
    }

    // Clear any previous completed result when opening a test from the materials card;
    // preserve active timer session in sessionStorage if an unfinished attempt is still within its expiry window.
    try {
      courseService.clearStoredTestResult(testId)
    } catch (e) {}

    // If currently on /learning or another page, navigate to dedicated /test route
    if (!isDedicatedTest) {
      const currentLessonParam = activeLessonId || urlLessonId || initialLessonId || ''
      if (onOpenTest) {
        onOpenTest(testId, currentLessonParam)
        return
      }
      const targetUrl = `/test/${encodeURIComponent(testId)}?courseId=${encodeURIComponent(courseId)}${currentLessonParam ? `&lessonId=${encodeURIComponent(currentLessonParam)}` : ''}`
      navigate(targetUrl)
      return
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    setActiveTestId(testId)
    setIsTakingTest(true)
    updateUrlParams({ mode: 'test', testId: testId, tab: 'materials', result: null })
    setSelectedQuestionIndex(0)
    setIsLoadingTest(true)
    setTestError(null)
    userAnswersRef.current = {}
    setUserAnswers({})
    setCheckedQuestions({})
    setTestResult(null)
    testStartTimeRef.current = Date.now()
    setTestDurationTakenStr('00:00:00')
    setHasTimedOut(false)
    setTimeLeft(null)
    setIsTimerActive(false)
    setHasBackendDuration(false)
    hasSubmittedRef.current = false
    isSubmittingRef.current = false

    try {
      const token = authService.getToken()
      const data = await courseService.getTestDetails(testId, token, {
        courseId,
        lessonId: currentLesson?.lessonId || currentLesson?.elementId || currentLesson?.id || urlLessonId,
      })
      if (data) {
        const freshData = { ...data }
        testDetailsRef.current = freshData
        setTestDetails(freshData)
      } else {
        setTestError('Unable to load test questions from server.')
      }
    } catch (err) {
      setTestError(err.message || 'Error loading test.')
    } finally {
      setIsLoadingTest(false)
    }
  }

  // Timer Initialization & Countdown Effect (linked to testDetails & activeTestId)
  useEffect(() => {
    if (!testDetails || !activeTestId || testResult || !isTakingTest) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      setIsTimerActive(false)
      return
    }

    // Check if test was already submitted
    if (hasSubmittedRef.current) {
      setIsTimerActive(false)
      return
    }

    // Identify actual duration provided by backend / configuration:
    // 1. Direct or nested test details: duration, time_limit, total_duration, test_duration, test_time, etc.
    // 2. Section details (any section with duration, time_limit, timer)
    // 3. Lesson test link item or lesson elements
    const cleanActiveTestId = String(activeTestId).replace(/^test-/, '')
    const nestedDetails = testDetails.test_details || {}
    const sections = Array.isArray(testDetails.test_section_details) ? testDetails.test_section_details : []
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
    const matchedTestItem = currentLesson?.tests?.find(
      (t) =>
        String(t.id ?? '').replace(/^test-/, '') === cleanActiveTestId ||
        String(t.test_id ?? '').replace(/^test-/, '') === cleanActiveTestId ||
        String(t.element_id ?? '').replace(/^test-/, '') === cleanActiveTestId
    )

    const pickValidDuration = (...candidates) => {
      for (const c of candidates) {
        if (c !== undefined && c !== null && c !== '') {
          const parsed = parseDurationToSeconds(c)
          if (parsed && parsed > 0) {
            return c
          }
        }
      }
      return null
    }

    // Sum section durations if individual sections specify duration
    let summedSectionDur = 0
    for (const sec of sections) {
      const secSec = parseDurationToSeconds(
        sec?.duration ??
          sec?.time_limit ??
          sec?.timer ??
          sec?.section_duration ??
          sec?.total_duration ??
          sec?.duration_minutes ??
          sec?.duration_in_minutes ??
          sec?.test_duration
      )
      if (secSec && secSec > 0) {
        summedSectionDur += secSec
      }
    }

    // Scan any dynamic key matching /duration|time_limit|timer/i on nestedDetails or testDetails
    const scanObjDuration = (obj) => {
      if (!obj || typeof obj !== 'object') return null
      for (const [k, v] of Object.entries(obj)) {
        if (/duration|time_limit|time_allowed|test_time|timer/i.test(k) && !/taken|elapsed|used|spent/i.test(k)) {
          const picked = pickValidDuration(v)
          if (picked !== null) return picked
        }
      }
      return null
    }

    const rawDuration = pickValidDuration(
      testDetails.duration,
      testDetails.time_limit,
      testDetails.total_duration,
      testDetails.test_duration,
      testDetails.test_time,
      testDetails.duration_minutes,
      testDetails.duration_in_minutes,
      testDetails.time_allowed,
      testDetails.timer,
      nestedDetails.duration,
      nestedDetails.time_limit,
      nestedDetails.total_duration,
      nestedDetails.test_duration,
      nestedDetails.test_time,
      nestedDetails.duration_minutes,
      nestedDetails.duration_in_minutes,
      nestedDetails.time_allowed,
      nestedDetails.timer,
      summedSectionDur > 0 ? summedSectionDur : null,
      sectionWithDuration?.duration,
      sectionWithDuration?.time_limit,
      sectionWithDuration?.timer,
      sectionWithDuration?.section_duration,
      sectionWithDuration?.total_duration,
      sectionWithDuration?.duration_minutes,
      sectionWithDuration?.duration_in_minutes,
      matchedTestItem?.duration,
      matchedTestItem?.time_limit,
      matchedTestItem?.total_duration,
      matchedTestItem?.test_duration,
      testDetails.assessment?.duration,
      testDetails.assessment?.time_limit,
      testDetails.assessment?.total_duration,
      testDetails.assessment_details?.duration,
      testDetails.assessment_details?.time_limit,
      testDetails.assessment_details?.total_duration,
      currentLesson?.duration,
      currentLesson?.test_duration,
      currentLesson?.time_limit,
      course?.duration,
      course?.test_duration,
      course?.total_duration,
      scanObjDuration(nestedDetails),
      scanObjDuration(testDetails.assessment),
      scanObjDuration(testDetails.assessment_details),
      scanObjDuration(testDetails),
      scanObjDuration(matchedTestItem),
      currentLesson?.testDuration
    )

    const parsedSecs = parseDurationToSeconds(rawDuration)

    if (parsedSecs && parsedSecs > 0) {
      setHasBackendDuration(true)
      setTotalDurationSec(parsedSecs)

      // Session storage key unique to this specific test attempt (normalized ID)
      const storageKey = `edoomate_test_session_${cleanActiveTestId}`
      let targetExpiry = null
      let storedStartedAt = null
      let storedDurationSec = null

      try {
        const storedJson =
          sessionStorage.getItem(storageKey) ||
          sessionStorage.getItem(`edoomate_test_session_${activeTestId}`)
        if (storedJson) {
          const sessionData = JSON.parse(storedJson)
          if (sessionData && sessionData.expiry) {
            targetExpiry = Number(sessionData.expiry)
          }
          if (sessionData && sessionData.startedAt) {
            storedStartedAt = Number(sessionData.startedAt)
          }
          if (sessionData && sessionData.durationSec) {
            storedDurationSec = Number(sessionData.durationSec)
          }
        }
      } catch (e) {
        // Fallback
      }

      const now = Date.now()
      // If no stored expiry, or the stored expiry has already passed, or the stored duration does not match
      // the configured test duration, start fresh expiry from the configured backend duration
      if (!targetExpiry || targetExpiry <= now || (storedDurationSec && storedDurationSec !== parsedSecs)) {
        targetExpiry = now + parsedSecs * 1000
        testStartTimeRef.current = now
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              testId: cleanActiveTestId,
              startedAt: now,
              durationSec: parsedSecs,
              expiry: targetExpiry,
            })
          )
        } catch (e) {
          // Storage fallback
        }
      } else {
        testStartTimeRef.current = storedStartedAt && storedStartedAt <= now ? storedStartedAt : targetExpiry - parsedSecs * 1000
      }

      // Calculate remaining seconds from authoritative expiry timestamp
      const remainingSecs = Math.max(0, Math.round((targetExpiry - Date.now()) / 1000))

      if (remainingSecs <= 0) {
        setTimeLeft(0)
        setIsTimerActive(false)
        setHasTimedOut(true)
        // Auto-submit if not already submitted
        submitMcqTest(true)
        return
      }

      setTimeLeft(remainingSecs)
      setIsTimerActive(true)
      setHasTimedOut(false)

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }

      // Accurate tick every second based on absolute expiry timestamp
      timerIntervalRef.current = setInterval(() => {
        const currentSecs = Math.max(0, Math.round((targetExpiry - Date.now()) / 1000))
        setTimeLeft((prev) => {
          const nextSecs = prev !== null && currentSecs >= prev && prev > 0 ? prev - 1 : currentSecs
          if (nextSecs <= 0) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            setIsTimerActive(false)
            setHasTimedOut(true)
            submitMcqTest(true)
            return 0
          }
          return nextSecs
        })
      }, 1000)
    } else {
      // Backend provided no duration for this test
      setHasBackendDuration(false)
      setTotalDurationSec(null)
      setTimeLeft(null)
      setIsTimerActive(false)
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [testDetails, activeTestId, testResult, isTakingTest, isDedicatedTest])

  // Fetch real MCQ test from backend API whenever test ID or current lesson changes
  useEffect(() => {
    let isCancelled = false

    async function loadLessonTest() {
      // If neither on dedicated test route nor in test mode / testId param, we are on learning view
      if (!(urlMode === 'test' || urlTestId || isDedicatedTest)) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
        }
        loadingTestIdRef.current = null
        testDetailsRef.current = null
        userAnswersRef.current = {}
        setIsTakingTest(false)
        setActiveTestId(null)
        setTestDetails(null)
        setTestError(null)
        setUserAnswers({})
        setTestResult(null)
        setIsLoadingTest(false)
        return
      }

      // Identify target test: priority to urlTestId (from route /test/:testId or query params)
      const tests = currentLesson?.tests || []
      const matchedUrlTest = urlTestId ? tests.find(t => String(t.element_id || t.id) === String(urlTestId)) : null
      const targetTest = matchedUrlTest || (urlTestId ? { id: urlTestId } : tests[0])
      const tid = urlTestId || activeTestId || targetTest?.element_id || targetTest?.id
      const cleanTid = tid ? String(tid).replace(/^test-/, '') : null

      // If this exact test has already finished loading and is active, do not wipe out userAnswers or the running timer!
      const currentActive = String(activeTestId || testDetailsRef.current?.id || testDetailsRef.current?.test_id || '').replace(/^test-/, '')
      if (
        isTakingTest &&
        testDetailsRef.current &&
        ((cleanTid && cleanTid === currentActive) || !cleanTid)
      ) {
        return
      }

      loadingTestIdRef.current = cleanTid

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }

      setIsTakingTest(true)
      hasSubmittedRef.current = false
      isSubmittingRef.current = false
      setHasTimedOut(false)
      setTimeLeft(null)
      setIsTimerActive(false)
      setHasBackendDuration(false)
      testStartTimeRef.current = Date.now()
      setTestDurationTakenStr('00:00:00')

      if (!tid) {
        loadingTestIdRef.current = null
        testDetailsRef.current = null
        userAnswersRef.current = {}
        setTestDetails(null)
        setTestError(null)
        setUserAnswers({})
        setTestResult(null)
        setActiveTestId(null)
        setSelectedQuestionIndex(0)
        setIsLoadingTest(false)
        return
      }

      setActiveTestId(tid)
      setSelectedQuestionIndex(0)
      setIsLoadingTest(true)
      setTestError(null)
      if (!userAnswersRef.current || Object.keys(userAnswersRef.current).length === 0) {
        userAnswersRef.current = {}
        setUserAnswers({})
        setCheckedQuestions({})
      }
      const isViewingResult = searchParams.get('result') === '1'
      const storedRes = isViewingResult ? courseService.getStoredTestResult(tid) : null
      setTestResult(storedRes || null)
      if (storedRes && storedRes.saved_user_answers) {
        userAnswersRef.current = storedRes.saved_user_answers
        setUserAnswers(storedRes.saved_user_answers)
      }

      try {
        const token = authService.getToken()
        const effectiveLessonId = currentLesson?.lessonId || currentLesson?.elementId || currentLesson?.id || urlLessonId
        const data = await courseService.getTestDetails(tid, token, {
          courseId,
          lessonId: effectiveLessonId,
        })
        if (!isCancelled) {
          loadingTestIdRef.current = null
          if (data) {
            const freshData = { ...data }
            testDetailsRef.current = freshData
            setTestDetails(freshData)

            // If refreshing on result screen and sessionStorage was cleared, recover score from lesson analytics API
            if (isViewingResult && !storedRes && token) {
              if (effectiveLessonId) {
                courseService
                  .getLessonAnalytics(effectiveLessonId, token)
                  .then((analyticsData) => {
                    if (isCancelled || !analyticsData) return
                    const cleanTid = String(tid).replace(/^test-/, '')
                    const matchedTestAnalytics = (analyticsData.tests || []).find(
                      (t) => String(t.test_id || t.id).replace(/^test-/, '') === cleanTid
                    )
                    if (matchedTestAnalytics && matchedTestAnalytics.score !== undefined) {
                      const totalQCount =
                        Number(data.total_test_questions) ||
                        (data.test_section_details || []).flatMap((s) => s.questions || []).length ||
                        (data.questions || data.test_questions || []).length ||
                        1
                      const pct = Number(matchedTestAnalytics.score) || 0
                      const approxCorrect = Math.round((pct / 100) * totalQCount)
                      const recovered = {
                        total_questions: totalQCount,
                        correct_answers: matchedTestAnalytics.correct_answers ?? approxCorrect,
                        incorrect_answers: matchedTestAnalytics.incorrect_answers ?? Math.max(0, totalQCount - approxCorrect),
                        attended_questions: matchedTestAnalytics.attended_questions ?? totalQCount,
                        unattended_questions: matchedTestAnalytics.unattended_questions ?? 0,
                        score: matchedTestAnalytics.marks_obtained ?? matchedTestAnalytics.score_marks ?? approxCorrect,
                        max_marks: matchedTestAnalytics.max_marks ?? totalQCount,
                        score_percentage: pct,
                        comment: matchedTestAnalytics.comment || matchedTestAnalytics.status || undefined,
                        duration_taken:
                          matchedTestAnalytics.duration_taken ||
                          matchedTestAnalytics.time_taken ||
                          matchedTestAnalytics.elapsed_time ||
                          '00:00:00',
                      }
                      courseService.saveStoredTestResult(cleanTid, recovered)
                      setTestResult(recovered)
                    }
                  })
                  .catch(() => {})
              }
            }
          } else {
            setTestError('Unable to load test questions from server.')
          }
        }
      } catch (err) {
        if (!isCancelled) {
          loadingTestIdRef.current = null
          console.error(`Failed to load test ${tid}:`, err)
          // If the student already completed the test and has a valid result, preserve the result screen instead of blocking with an error
          if (!isViewingResult && !testResult && !storedRes) {
            setTestError(err.message || 'Error loading test questions.')
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTest(false)
        }
      }
    }

    loadLessonTest()

    return () => {
      isCancelled = true
      loadingTestIdRef.current = null
    }
  }, [urlTestId, isDedicatedTest, urlMode, urlLessonId ? null : currentLesson?.id])

  // Automatically restore activeVideoData if URL contains mode=video or videoId
  const urlVideoId = searchParams.get('videoId')
  useEffect(() => {
    if ((urlMode === 'video' || urlVideoId) && !activeVideoData) {
      const vid = urlVideoId && urlVideoId !== 'video-stream' && urlVideoId !== 'video-main' ? urlVideoId : null
      const matchedVideo = (currentLesson?.videos || []).find(
        (v) => String(v.element_id || v.id) === String(vid)
      )
      handleOpenVideo(
        matchedVideo || {
          id: vid || 'video-stream',
          videoUrl: currentLesson?.videoUrl || null,
          vimeoId: currentLesson?.vimeoId || null,
          title: currentLesson?.title || 'Video Lecture',
        }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlMode, urlVideoId, currentLesson?.id])

  // Fetch real Resources from backend (GET /api/readable/{id}) whenever current lesson changes
  useEffect(() => {
    let isCancelled = false

    async function loadLessonResources() {
      const readables = currentLesson?.readables || []
      const existingResources = currentLesson?.resources || []

      if (readables.length === 0) {
        setLessonResources(existingResources)
        setIsLoadingResources(false)
        setResourcesError(null)
        return
      }

      setIsLoadingResources(true)
      setResourcesError(null)

      try {
        const token = authService.getToken()
        const resourcePromises = readables.map(async (r) => {
          try {
            const detail = await courseService.getReadableDetails(r.element_id, token)
            // Extract nested PDF URLs and section details
            const sections = detail?.readable_section_details || []
            const pdfItem = sections.flatMap((s) => s.readables || []).find((f) => f.pdf_url)

            return {
              id: r.element_id || r.id,
              element_id: r.element_id,
              title: detail?.readable_name || r.title || 'Lesson Resource Document',
              description:
                typeof detail?.description === 'string'
                  ? detail.description
                  : detail?.description?.children?.[0]?.children?.[0]?.text ||
                    'Comprehensive study material and official reading guide.',
              type: 'pdf',
              readable_type: 'READABLE_PDF',
              grade: detail?.grade,
              subject: detail?.subject,
              total_pages: detail?.total_pages || 1,
              pdf_url: pdfItem?.pdf_url || null,
              pdf_title: pdfItem?.pdf_title || 'Document.pdf',
              url: pdfItem?.pdf_url || null,
              thumbnail_url: r.thumbnail_image_url || r.thumbnail_url || null,
            }
          } catch (e) {
            return {
              id: r.element_id || r.id,
              element_id: r.element_id,
              title: r.title || 'Course Document',
              type: 'document',
              url: null,
            }
          }
        })

        const resolved = await Promise.all(resourcePromises)
        if (!isCancelled) {
          setLessonResources([...resolved, ...existingResources])
        }
      } catch (err) {
        if (!isCancelled) {
          setResourcesError(err.message || 'Failed to load lesson resources.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingResources(false)
        }
      }
    }

    loadLessonResources()

    return () => {
      isCancelled = true
    }
  }, [currentLesson?.id, currentLesson?.lessonId])

  // Fetch real Topics from backend (GET /api/topic/{id}) whenever current lesson changes
  useEffect(() => {
    let isCancelled = false

    async function loadLessonTopics() {
      const topicLinks = currentLesson?.topics || []

      if (topicLinks.length === 0) {
        setLessonTopics([])
        setIsLoadingTopics(false)
        setTopicsError(null)
        return
      }

      setIsLoadingTopics(true)
      setTopicsError(null)

      try {
        const token = authService.getToken()
        const topicPromises = topicLinks.map(async (t, idx) => {
          try {
            const detail = await courseService.getTopicDetails(t.element_id, token)

            // Extract any Vimeo video id, hash, or embed url strictly from this topic's attributes or links
            const { numericVimeoId, vimeoHash } = extractVimeoInfo(
              detail?.vimeo_id || detail?.vimeoId,
              detail?.vimeo_hash || detail?.hash,
              detail?.video_url || detail?.stream_url || detail?.avatar_link
            )
            let topicVideoUrl = detail?.video_url || detail?.stream_url || detail?.avatar_link || null

            return {
              id: t.element_id || t.id,
              element_id: t.element_id,
              order: t.order || idx + 1,
              title: detail?.topic || t.title || `Topic ${idx + 1}`,
              description: detail?.description || t.description || 'Topic concept and learning outcomes.',
              subject: detail?.subject || currentLesson?.subject,
              grade: detail?.grade || currentLesson?.grade,
              language: detail?.language || 'en-US',
              avatar_link: detail?.avatar_link || null,
              vimeoId: numericVimeoId,
              vimeoHash: vimeoHash,
              video_url: topicVideoUrl,
              thumbnail_url: t.thumbnail_image_url || t.thumbnail_url || null,
              rawDetail: detail,
            }
          } catch (e) {
            return {
              id: t.element_id || t.id,
              element_id: t.element_id,
              order: t.order || idx + 1,
              title: t.title || `Topic ${idx + 1}`,
              description: t.description || 'Topic concept.',
            }
          }
        })

        const resolvedTopics = await Promise.all(topicPromises)
        if (!isCancelled) {
          setLessonTopics(resolvedTopics)
        }
      } catch (err) {
        if (!isCancelled) {
          setTopicsError(err.message || 'Failed to load lesson topics.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTopics(false)
        }
      }
    }

    loadLessonTopics()

    return () => {
      isCancelled = true
    }
  }, [currentLesson?.id, currentLesson?.lessonId])

  // Reset video playback state and loading/error when active lesson changes
  useEffect(() => {
    setIsPlaying(false)
    setIsVideoLoading(Boolean(currentLesson?.videoUrl || currentLesson?.vimeoId))
    setVideoError(null)
    setIsIframeLoaded(false)
    setCurrentTime(0)
    setDuration(0)
  }, [currentLesson?.id, currentLesson?.videoUrl, currentLesson?.vimeoId])

  // Calculate accurate course progress
  const totalLessonsCount = allLessons.length
  const completedCount = completedLessonIds.filter((id) =>
    allLessons.some((l) => l.id === id)
  ).length
  const progressPercent =
    totalLessonsCount > 0 ? Math.round((completedCount / totalLessonsCount) * 100) : 0

  // Last saved playback timestamp ref for throttled saving during playback
  const lastSavedTimeRef = useRef(0)
  const resumeTimeTargetRef = useRef(null)

  // Initialize resume target from URL query param ('time') or stored learning session
  useEffect(() => {
    const urlTime = searchParams.get('time')
    if (urlTime && !isNaN(Number(urlTime))) {
      resumeTimeTargetRef.current = Number(urlTime)
    }
  }, [searchParams])

  // Save progress changes locally and to backend automatically
  const persistProgress = (newCompletedIds, lastId = activeLessonId, extra = {}) => {
    const token = authService.getToken()
    const lastLesson = allLessons.find((l) => l.id === lastId) || currentLesson
    courseService.saveStoredProgress(courseId, {
      completedLessonIds: newCompletedIds,
      lastLessonId: lastId,
      unitId: lastLesson?.moduleId || null,
      topicId: extra.topicId || searchParams.get('topicId') || null,
      videoTimestamp: extra.videoTimestamp !== undefined ? extra.videoTimestamp : (videoRef.current?.currentTime || currentTime || 0),
      videoId: extra.videoId || activeVideoData?.id || null,
    }, token)
  }

  // Periodic video playback position persistence (every 3 seconds) and on pause/exit
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime
      setCurrentTime(cur)
      setDuration(videoRef.current.duration || 0)

      // Throttle backend save to every 3 seconds to avoid overwhelming the network
      if (Math.abs(cur - lastSavedTimeRef.current) >= 3) {
        lastSavedTimeRef.current = cur
        persistProgress(completedLessonIds, activeLessonId, { videoTimestamp: cur })
      }
    }
  }

  // Handle video pause: immediately flush playback position to backend
  const handleVideoPause = () => {
    setIsPlaying(false)
    if (videoRef.current) {
      const cur = videoRef.current.currentTime
      lastSavedTimeRef.current = cur
      persistProgress(completedLessonIds, activeLessonId, { videoTimestamp: cur })
    }
  }

  // Synchronize Vimeo Player SDK with active Vimeo video iframe
  useEffect(() => {
    const isVimeo = Boolean(
      activeVideoData?.vimeoId ||
      (activeVideoData?.videoUrl && String(activeVideoData.videoUrl).includes('vimeo.com'))
    )

    if (!isVimeo || !vimeoIframeRef.current) {
      if (vimeoPlayerInstanceRef.current) {
        try {
          vimeoPlayerInstanceRef.current.destroy()
        } catch (e) {}
        vimeoPlayerInstanceRef.current = null
      }
      return
    }

    let isDisposed = false
    let player = null

    try {
      player = new Player(vimeoIframeRef.current)
      vimeoPlayerInstanceRef.current = player

      player.ready().then(() => {
        if (isDisposed) return
        setIsVideoLoading(false)
        setVideoError(null)

        // Resume from exact video timestamp if resume target exists
        if (resumeTimeTargetRef.current !== null && resumeTimeTargetRef.current > 0) {
          const resumePoint = resumeTimeTargetRef.current
          resumeTimeTargetRef.current = null
          player.setCurrentTime(resumePoint).catch((err) => {
            console.warn('Vimeo resume seek error:', err)
          })
          setCurrentTime(resumePoint)
        }

        // Get initial duration
        player.getDuration().then((d) => {
          if (!isDisposed && d) setDuration(d)
        }).catch(() => {})
      }).catch((readyErr) => {
        console.warn('Vimeo player ready error:', readyErr)
      })

      player.on('play', () => {
        if (!isDisposed) {
          setIsPlaying(true)
          setIsVideoLoading(false)
          setVideoError(null)
        }
      })

      player.on('pause', () => {
        if (!isDisposed) {
          setIsPlaying(false)
          player.getCurrentTime().then((cur) => {
            if (cur !== undefined) {
              lastSavedTimeRef.current = cur
              persistProgress(completedLessonIds, activeLessonId, { videoTimestamp: cur })
            }
          }).catch(() => {})
        }
      })

      player.on('timeupdate', (data) => {
        if (!isDisposed && data) {
          const cur = data.seconds || 0
          const dur = data.duration || 0
          setCurrentTime(cur)
          if (dur > 0) setDuration(dur)

          // Throttle backend save to every 3 seconds
          if (Math.abs(cur - lastSavedTimeRef.current) >= 3) {
            lastSavedTimeRef.current = cur
            persistProgress(completedLessonIds, activeLessonId, { videoTimestamp: cur })
          }
        }
      })

      player.on('ended', () => {
        if (!isDisposed) {
          setIsPlaying(false)
          handleToggleComplete(currentLesson?.id)
        }
      })

      player.on('error', (errData) => {
        if (!isDisposed) {
          setIsVideoLoading(false)
          console.warn('Vimeo Player error event:', errData)
        }
      })
    } catch (err) {
      console.warn('Could not initialize Vimeo player SDK:', err)
    }

    return () => {
      isDisposed = true
      if (player) {
        player.getCurrentTime().then((cur) => {
          if (cur > 0) {
            persistProgress(completedLessonIds, activeLessonId, { videoTimestamp: cur })
          }
        }).catch(() => {})
        try {
          player.destroy()
        } catch (e) {}
      }
      vimeoPlayerInstanceRef.current = null
    }
  }, [activeVideoData?.vimeoId, activeVideoData?.videoUrl, activeVideoData?.id, activeLessonId])

  // Listen for beforeunload / unmount to flush current video position to backend
  useEffect(() => {
    const handleBeforeUnload = () => {
      const curTime = videoRef.current?.currentTime || currentTime || 0
      if (curTime > 0) {
        persistProgress(completedLessonIds, activeLessonId, {
          videoTimestamp: curTime,
        })
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      const curTime = videoRef.current?.currentTime || currentTime || 0
      if (curTime > 0) {
        persistProgress(completedLessonIds, activeLessonId, {
          videoTimestamp: curTime,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedLessonIds, activeLessonId, courseId, currentTime])

  // Toggle Module Expand/Collapse
  const toggleModule = (moduleId) => {
    setExpandedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }))
  }

  // Select an accessible lesson
  const handleSelectLesson = (lesson) => {
    setActiveLessonId(lesson.id)
    setIsPlaying(false)
    setUserAnswers({})
    setTestResult(null)
    setActiveVideoData(null)

    // Expand parent module if closed
    if (lesson.moduleId && !expandedModules[lesson.moduleId]) {
      setExpandedModules((prev) => ({ ...prev, [lesson.moduleId]: true }))
    }

    // Update last accessed lesson in storage
    persistProgress(completedLessonIds, lesson.id)

    // Sync lesson selection with URL
    const lId = lesson.lessonId || lesson.elementId || lesson.id
    updateUrlParams({ lessonId: lId, mode: null, testId: null })
    setIsMobileCurriculumOpen(false)

    // Scroll smoothly to player
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Toggle Lesson Completion
  const handleToggleComplete = (lessonId) => {
    const idToToggle = lessonId || currentLesson?.id
    if (!idToToggle) return

    let nextCompleted = []
    const isAlreadyDone = completedLessonIds.includes(idToToggle)

    if (isAlreadyDone) {
      nextCompleted = completedLessonIds.filter((id) => id !== idToToggle)
      showToast('Lesson marked as incomplete.')
    } else {
      nextCompleted = [...completedLessonIds, idToToggle]
      showToast('🎉 Lesson Completed! Course progress updated.')
    }

    setCompletedLessonIds(nextCompleted)
    persistProgress(nextCompleted, idToToggle)
  }

  // Navigation: Previous Lesson
  const handlePrevLesson = () => {
    if (activeIndex > 0) {
      const prevLesson = allLessons[activeIndex - 1]
      handleSelectLesson(prevLesson)
    }
  }

  // Navigation: Next Lesson
  const handleNextLesson = () => {
    if (activeIndex < allLessons.length - 1) {
      // Auto-complete current lesson if advancing
      if (currentLesson && !completedLessonIds.includes(currentLesson.id)) {
        const nextCompleted = [...completedLessonIds, currentLesson.id]
        setCompletedLessonIds(nextCompleted)
        persistProgress(nextCompleted, currentLesson.id)
      }
      const nextLesson = allLessons[activeIndex + 1]
      handleSelectLesson(nextLesson)
    }
  }

  // Video Playback Controls (Unified for HTML5 and Vimeo Player SDK)
  const togglePlayPause = () => {
    if (vimeoPlayerInstanceRef.current) {
      if (isPlaying) {
        vimeoPlayerInstanceRef.current.pause().catch((e) => console.warn('Vimeo pause error:', e))
      } else {
        vimeoPlayerInstanceRef.current.play().catch((e) => console.warn('Vimeo play error:', e))
      }
    } else if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
        setIsPlaying(false)
      } else {
        videoRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => console.warn('Autoplay prevented:', e))
      }
    } else {
      setIsPlaying(!isPlaying)
    }
  }

  // Seek video playback to percentage
  const handleSeek = (e) => {
    const seekPercentage = parseFloat(e.target.value)
    if (duration > 0) {
      const seekTime = (seekPercentage / 100) * duration
      if (vimeoPlayerInstanceRef.current) {
        vimeoPlayerInstanceRef.current.setCurrentTime(seekTime).catch((err) => console.warn('Vimeo seek error:', err))
      } else if (videoRef.current) {
        videoRef.current.currentTime = seekTime
      }
      setCurrentTime(seekTime)
      lastSavedTimeRef.current = seekTime
      persistProgress(completedLessonIds, activeLessonId, { videoTimestamp: seekTime })
    }
  }

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed)
    const rate = parseFloat(speed.replace('x', ''))
    if (vimeoPlayerInstanceRef.current) {
      vimeoPlayerInstanceRef.current.setPlaybackRate(rate).catch((err) => console.warn('Vimeo speed error:', err))
    } else if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
  }

  const toggleMute = () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    if (vimeoPlayerInstanceRef.current) {
      vimeoPlayerInstanceRef.current.setMuted(nextMuted).catch((err) => console.warn('Vimeo mute error:', err))
    } else if (videoRef.current) {
      videoRef.current.muted = nextMuted
    }
  }

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    setIsMuted(val === 0)
    if (vimeoPlayerInstanceRef.current) {
      vimeoPlayerInstanceRef.current.setVolume(val).catch((err) => console.warn('Vimeo volume error:', err))
      if (val === 0) {
        vimeoPlayerInstanceRef.current.setMuted(true).catch(() => {})
      } else {
        vimeoPlayerInstanceRef.current.setMuted(false).catch(() => {})
      }
    } else if (videoRef.current) {
      videoRef.current.volume = val
      videoRef.current.muted = val === 0
    }
  }

  const toggleFullscreen = () => {
    const container = document.getElementById('learning-video-container')
    if (!container) return

    if (vimeoPlayerInstanceRef.current) {
      vimeoPlayerInstanceRef.current.requestFullscreen?.().catch(() => {
        // Fallback to container fullscreen if Vimeo SDK requestFullscreen fails
        if (!document.fullscreenElement) {
          container.requestFullscreen?.().catch((err) => console.warn(err))
        } else {
          document.exitFullscreen?.().catch((err) => console.warn(err))
        }
      })
    } else {
      if (!document.fullscreenElement) {
        container.requestFullscreen?.().catch((err) => console.warn(err))
      } else {
        document.exitFullscreen?.().catch((err) => console.warn(err))
      }
    }
  }

  // Format Seconds to MM:SS
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === 0) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Real Video URL Verification: never show a fake working video if no video URL exists
  // If access is currently checking
  if (accessCheck.isLoading) {
    return (
      <div className="course-learning-view text-center py-5 animate-fade-in">
        <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}></div>
        <h5 className="fw-bold text-dark mb-1">Verifying Course Access...</h5>
        <p className="text-muted small">Checking your enrollment authorization with the server.</p>
      </div>
    )
  }

  // If user does not have access or course is expired or inactive, block learning view and redirect to Course Details
  if (!accessCheck.hasAccess) {
    const isCourseExpired = accessCheck.isExpired || accessCheck.reason === 'Your course has expired.'
    const isCourseInactive = accessCheck.isInactive || accessCheck.reason === 'This course is currently inactive.'
    return (
      <div className="course-learning-view p-4 animate-fade-in">
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white mx-auto" style={{ maxWidth: '600px' }}>
          <div
            className={`rounded-circle ${isCourseExpired ? 'bg-danger bg-opacity-15 text-danger' : isCourseInactive ? 'bg-secondary bg-opacity-15 text-secondary' : 'bg-warning bg-opacity-15 text-warning'} d-inline-flex align-items-center justify-content-center mb-3 mx-auto`}
            style={{ width: '72px', height: '72px', fontSize: '2.2rem' }}
          >
            {isCourseExpired ? '⏳' : isCourseInactive ? '⚠️' : '🔒'}
          </div>
          <h4 className="fw-bolder text-dark mb-2">
            {isCourseExpired
              ? 'Your course has expired.'
              : isCourseInactive
              ? 'This course is currently inactive.'
              : 'Course Access Restricted'}
          </h4>
          <p className="text-secondary small mb-4">
            {isCourseExpired
              ? 'Your course has expired. Access to video lessons, practice MCQs, topics, and study materials has ended.'
              : isCourseInactive
              ? 'This course has been deactivated or is currently not available. Please contact your instructor or administration.'
              : (accessCheck.reason || 'You do not have an active enrollment for this course. Please purchase the course or contact your institute to activate access.')}
          </p>
          <div className="d-flex justify-content-center gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary rounded-pill px-4 btn-sm"
              onClick={onNavigateCourses || onBack}
            >
              ← My Courses
            </button>
            {!isCourseInactive && (
              <button
                type="button"
                className="btn btn-primary rounded-pill px-4 btn-sm fw-bold shadow-sm"
                onClick={onBack}
                id="btn-return-course-details-checkout"
              >
                {isCourseExpired ? 'Renew Course Access →' : 'View Course Details & Check Out →'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="course-learning-view animate-fade-in pb-5">

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className="position-fixed top-0 start-50 translate-middle-x mt-3 bg-dark text-white px-4 py-2 rounded-pill shadow-lg d-flex align-items-center gap-2 animate-fade-in"
          style={{ zIndex: 1200, fontSize: '0.85rem' }}
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            className="btn btn-sm btn-link text-white text-decoration-none p-0 ms-2"
            onClick={() => setToastMessage('')}
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Header & Breadcrumb Bar */}
      <div className={`learning-top-bar bg-white border rounded-4 p-3 mb-4 shadow-sm ${isDedicatedTest ? 'd-none' : ''}`}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          {/* Left: Back button & Breadcrumbs */}
          <div className="d-flex align-items-center flex-wrap gap-2 gap-md-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              onClick={onBack}
              id="back-to-learning-btn"
              aria-label="Back to Course Details"
              title="Back to Course Details"
              style={{ width: '32px', height: '32px', padding: 0 }}
            >
              ←
            </button>

            {/* Breadcrumb Navigation */}
            <nav aria-label="breadcrumb" className="d-none d-sm-block">
              <ol className="breadcrumb mb-0 small fw-semibold">
                <li className="breadcrumb-item">
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none text-muted align-baseline"
                    onClick={onNavigateCourses || onBack}
                  >
                    My Learning
                  </button>
                </li>
                <li className="breadcrumb-item text-truncate" style={{ maxWidth: '240px' }}>
                  <span className="text-secondary">{courseTitle}</span>
                </li>
                <li className="breadcrumb-item active text-primary" aria-current="page">
                  Learning
                </li>
              </ol>
            </nav>
          </div>

          {/* Right: Course Progress Metric */}
          <div className="d-flex align-items-center gap-3 ms-auto ms-md-0">
            <div className="text-end d-none d-md-block">
              <div className="small fw-bold text-dark mb-1">
                {completedCount} / {totalLessonsCount} Lessons Completed
              </div>
              <div
                className="progress"
                style={{ width: '160px', height: '7px', backgroundColor: '#e2e8f0' }}
              >
                <div
                  className="progress-bar bg-primary rounded-pill"
                  role="progressbar"
                  style={{
                    width: `${progressPercent}%`,
                    transition: 'width 0.4s ease',
                  }}
                  aria-valuenow={progressPercent}
                  aria-valuemin="0"
                  aria-valuemax="100"
                ></div>
              </div>
            </div>
            <span className="badge bg-primary bg-opacity-10 text-primary border border-primary px-3 py-2 rounded-pill fw-bold">
              {progressPercent}% Complete
            </span>

            {/* Mobile Curriculum Drawer Toggle */}
            <button
              type="button"
              className="btn btn-sm btn-outline-primary rounded-pill px-3 d-lg-none fw-semibold"
              onClick={() => setIsMobileCurriculumOpen(!isMobileCurriculumOpen)}
            >
              {isMobileCurriculumOpen ? 'Hide Syllabus' : 'View Syllabus ☰'}
            </button>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoadingCurriculum && !isDedicatedTest && (
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white mb-4">
          <div className="spinner-border text-primary mx-auto mb-3" role="status">
            <span className="visually-hidden">Loading curriculum...</span>
          </div>
          <h5 className="fw-bold mb-1">Synchronizing Course Curriculum</h5>
          <p className="text-muted small mb-0">Fetching live units and lesson modules...</p>
        </div>
      )}

      {/* API Warning if server was partially unavailable */}
      {apiError && !isLoadingCurriculum && !isDedicatedTest && (
        <div className="alert alert-warning alert-dismissible fade show rounded-4 py-2 px-3 small d-flex align-items-center gap-2 mb-4">
          <span>⚠️ {apiError}</span>
          <button
            type="button"
            className="btn-close small p-2"
            onClick={() => setApiError(null)}
          ></button>
        </div>
      )}

      {/* ── INLINE RESOURCE VIEWER ──────────────────────────────────────────────
           Renders PDFs / docs INSIDE Edoomate instead of redirecting away.
      ──────────────────────────────────────────────────────────────────────── */}
      {activeInlineResource && (
        <div className="inline-resource-viewer animate-fade-in mb-4">
          {/* Back bar */}
          <div className="d-flex align-items-center gap-3 mb-3 pb-2 border-bottom flex-wrap">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              onClick={handleCloseInlineResource}
              aria-label="Back to Resources"
              title="Back to Resources"
              style={{ width: '32px', height: '32px', padding: 0 }}
            >
              ←
            </button>
            <div className="min-w-0 flex-grow-1">
              <h6 className="fw-bold text-dark mb-0 text-truncate" style={{ maxWidth: '400px' }}>
                {activeInlineResource.title}
              </h6>
              <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                {activeInlineResource.type === 'pdf' || activeInlineResource.type === 'READABLE_PDF'
                  ? 'PDF Document'
                  : 'Learning Resource'}
              </span>
            </div>
          </div>

          {/* Embedded PDF / document viewer with toolbar controls and action header hidden */}
          <div
            className="card border-0 rounded-4 shadow-sm overflow-hidden bg-white position-relative"
            style={{ minHeight: '600px' }}
          >
            <div className="w-100 h-100 position-relative overflow-hidden" style={{ height: '75vh', minHeight: '560px' }}>
              <iframe
                src={
                  activeInlineResource.url
                    ? activeInlineResource.url.includes('#')
                      ? `${activeInlineResource.url}&toolbar=0&navpanes=0`
                      : `${activeInlineResource.url}#toolbar=0&navpanes=0`
                    : ''
                }
                title={activeInlineResource.title}
                className="w-100 border-0 position-relative"
                style={{
                  height: 'calc(100% + 56px)',
                  marginTop: '-56px',
                  minHeight: '616px',
                }}
              />
              {/* Top cover overlay to shield and disable any embedded top header / action bar */}
              <div
                className="position-absolute top-0 start-0 end-0 bg-white"
                style={{ height: '56px', zIndex: 10, pointerEvents: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Layout: Left Player & Right Curriculum */}
      {(!isLoadingCurriculum || isDedicatedTest) && !activeInlineResource && (
        <div className="row g-4">
          {/* LEFT COLUMN: Main Learning Flow or Dedicated Video Learning Page */}
          <div className={isDedicatedTest ? 'col-12' : 'col-12 col-lg-8'}>
            {/* DEDICATED VIDEO LEARNING PAGE (Only rendered when user clicks a Video Material item) */}
            {activeVideoData ? (
              <div className="dedicated-video-learning-card card border-0 rounded-4 shadow-sm p-3 p-md-4 mb-4 bg-white animate-fade-in">
                {/* Video Page Header with Back Button */}
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 pb-2 border-bottom">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-2"
                    onClick={() => {
                      const prevTab = activeVideoData.sourceTab || activeTab || 'materials'
                      setActiveVideoData(null)
                      setIsPlaying(false)
                      updateUrlParams({ mode: null, videoId: null, tab: prevTab })
                    }}
                    id="btn-back-to-lesson"
                  >
                    <span>←</span>
                    <span>{activeVideoData.sourceTab === 'topics' ? 'Back to Topic Resources' : activeVideoData.sourceTab === 'resources' ? 'Back to Resources' : 'Back to Lesson Materials'}</span>
                  </button>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill px-3 py-1-5 fw-semibold small">
                      {activeVideoData.vimeoId ? 'Vimeo Stream' : 'Video Lecture'}
                    </span>
                    <span className="badge bg-light text-secondary border rounded-pill px-2-5 py-1 small">
                      {activeVideoData.duration || '15 min'}
                    </span>
                  </div>
                </div>

                {/* Video Player Box */}
                <div
                  className="learning-player-card rounded-4 overflow-hidden shadow-sm bg-dark position-relative text-white mb-3"
                  id="learning-video-container"
                >
                  <div className="learning-video-inner position-relative bg-black w-100 d-flex align-items-center justify-content-center" style={{ minHeight: '340px', maxHeight: '520px' }}>
                    {/* Video Loading State */}
                    {(isVideoLoading || isVideoPageLoading) && (
                      <div className="position-absolute top-50 start-50 translate-middle text-center" style={{ zIndex: 12 }}>
                        <div className="spinner-border text-primary mb-2" role="status">
                          <span className="visually-hidden">Loading video...</span>
                        </div>
                        <div className="small text-white-50">Loading lecture video stream...</div>
                      </div>
                    )}

                    {/* Video Error Overlay */}
                    {(videoError || videoPageError) && (
                      <div className="position-absolute top-50 start-50 translate-middle text-center p-4 bg-dark bg-opacity-90 rounded-4 border border-danger w-75" style={{ zIndex: 15 }}>
                        <div className="fs-3 mb-2">⚠️</div>
                        <h6 className="fw-bold text-white mb-1">Video Unavailable</h6>
                        <p className="text-white-50 small mb-3">{videoError || videoPageError}</p>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-light rounded-pill px-3"
                          onClick={() => {
                            setVideoError(null)
                            setVideoPageError(null)
                            if (videoRef.current) {
                              videoRef.current.load()
                            }
                          }}
                        >
                          Retry Video
                        </button>
                      </div>
                    )}

                    {/* Vimeo Embed or HTML5 Video */}
                    {activeVideoData.vimeoId || (activeVideoData.videoUrl && activeVideoData.videoUrl.includes('vimeo.com')) ? (
                      <div className="ratio ratio-16x9 w-100 h-100" style={{ maxHeight: '480px' }}>
                        <iframe
                          ref={vimeoIframeRef}
                          src={
                            activeVideoData.vimeoId
                              ? activeVideoData.vimeoHash
                                ? `https://player.vimeo.com/video/${activeVideoData.vimeoId}?h=${encodeURIComponent(activeVideoData.vimeoHash)}&autoplay=0&title=0&byline=0&portrait=0`
                                : `https://player.vimeo.com/video/${activeVideoData.vimeoId}?autoplay=0&title=0&byline=0&portrait=0`
                              : activeVideoData.videoUrl
                          }
                          title={activeVideoData.title}
                          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                          allowFullScreen
                          className="w-100 h-100 border-0"
                          referrerPolicy="strict-origin-when-cross-origin"
                          onLoad={() => {
                            setIsVideoLoading(false)
                            setIsIframeLoaded(true)
                          }}
                          onError={() => {
                            setIsVideoLoading(false)
                            setVideoError('Unable to load Vimeo embedded video. Please check your internet connection.')
                          }}
                        ></iframe>
                      </div>
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          src={activeVideoData.videoUrl}
                          poster={activeVideoData.thumbnailUrl || undefined}
                          className="w-100 h-100 d-block"
                          style={{
                            maxHeight: '480px',
                            objectFit: 'contain',
                            backgroundColor: '#000',
                          }}
                          onLoadStart={() => setIsVideoLoading(true)}
                          onLoadedData={() => {
                            setIsVideoLoading(false)
                            setVideoError(null)
                            // Resume from exact video timestamp if resume target exists
                            if (resumeTimeTargetRef.current !== null && resumeTimeTargetRef.current > 0 && videoRef.current) {
                              const resumePoint = resumeTimeTargetRef.current
                              resumeTimeTargetRef.current = null
                              try {
                                videoRef.current.currentTime = resumePoint
                                setCurrentTime(resumePoint)
                              } catch (seekErr) {
                                console.warn('Could not set resume timestamp on loaded video:', seekErr)
                              }
                            }
                          }}
                          onWaiting={() => setIsVideoLoading(true)}
                          onPlaying={() => {
                            setIsVideoLoading(false)
                            setIsPlaying(true)
                            setVideoError(null)
                          }}
                          onError={(e) => {
                            setIsVideoLoading(false)
                            setIsPlaying(false)
                            const errCode = e?.currentTarget?.error?.code
                            let message = 'The video stream could not be loaded or is in an unsupported format.'
                            if (errCode === 1) message = 'Video loading was aborted.'
                            else if (errCode === 2) message = 'Network error while fetching the video stream.'
                            else if (errCode === 3) message = 'Video decoding failed or format is corrupted.'
                            else if (errCode === 4) message = 'The video format or MIME type is not supported by your browser.'
                            setVideoError(message)
                          }}
                          onTimeUpdate={handleTimeUpdate}
                          onEnded={() => {
                            setIsPlaying(false)
                            handleToggleComplete(currentLesson?.id)
                          }}
                          onPlay={() => setIsPlaying(true)}
                          onPause={handleVideoPause}
                          controls={false}
                          playsInline
                        />

                        {/* Play/Pause Center Overlay */}
                        {!isPlaying && !videoError && !isVideoLoading && !isVideoPageLoading && (
                          <div
                            className="position-absolute top-50 start-50 translate-middle text-center cursor-pointer"
                            style={{ cursor: 'pointer', zIndex: 10 }}
                            onClick={togglePlayPause}
                          >
                            <button
                              type="button"
                              className="btn btn-primary rounded-circle shadow-lg d-inline-flex align-items-center justify-content-center border-0"
                              style={{ width: '70px', height: '70px', fontSize: '1.75rem' }}
                              aria-label="Play video"
                            >
                              ▶
                            </button>
                            <div className="mt-2 text-light fw-semibold small bg-dark bg-opacity-75 px-3 py-1 rounded-pill">
                              Play Video Lecture
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Bottom HTML5 Video Controls */}
                    {!activeVideoData.vimeoId && !(activeVideoData.videoUrl && activeVideoData.videoUrl.includes('vimeo.com')) && (
                      <div
                        className="position-absolute bottom-0 start-0 end-0 p-3"
                        style={{
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                          zIndex: 10,
                        }}
                      >
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <span className="small text-white-50" style={{ minWidth: '42px', fontSize: '0.75rem' }}>
                            {formatTime(currentTime)}
                          </span>
                          <input
                            type="range"
                            className="form-range flex-grow-1"
                            min="0"
                            max="100"
                            value={duration > 0 ? (currentTime / duration) * 100 : 0}
                            onChange={handleSeek}
                            style={{ height: '5px', cursor: 'pointer' }}
                            aria-label="Video seek slider"
                          />
                          <span className="small text-white-50" style={{ minWidth: '42px', fontSize: '0.75rem' }}>
                            {formatTime(duration) !== '00:00' ? formatTime(duration) : activeVideoData.duration}
                          </span>
                        </div>

                        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                          <div className="d-flex align-items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-light rounded-circle p-0 d-inline-flex align-items-center justify-content-center"
                              style={{ width: '32px', height: '32px' }}
                              onClick={togglePlayPause}
                              title={isPlaying ? 'Pause' : 'Play'}
                            >
                              {isPlaying ? '⏸' : '▶'}
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-link text-white p-0"
                              onClick={toggleMute}
                              title={isMuted ? 'Unmute' : 'Mute'}
                            >
                              {isMuted || volume === 0 ? '🔇' : '🔊'}
                            </button>
                            <input
                              type="range"
                              className="form-range d-none d-sm-inline-block"
                              min="0"
                              max="1"
                              step="0.05"
                              value={isMuted ? 0 : volume}
                              onChange={handleVolumeChange}
                              style={{ width: '60px' }}
                              aria-label="Volume slider"
                            />

                            <div className="btn-group btn-group-sm ms-2">
                              {['1.0x', '1.25x', '1.5x'].map((speed) => (
                                <button
                                  key={speed}
                                  type="button"
                                  className={`btn btn-xs px-2 py-1 ${
                                    playbackSpeed === speed ? 'btn-primary' : 'btn-outline-light'
                                  }`}
                                  style={{ fontSize: '0.72rem' }}
                                  onClick={() => handleSpeedChange(speed)}
                                >
                                  {speed}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="d-flex align-items-center gap-2">
                            <button
                              type="button"
                              className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                                completedLessonIds.includes(currentLesson?.id)
                                  ? 'btn-success'
                                  : 'btn-outline-light'
                              }`}
                              onClick={() => handleToggleComplete(currentLesson?.id)}
                            >
                              {completedLessonIds.includes(currentLesson?.id) ? 'Completed ✓' : 'Mark as Complete'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-light rounded-circle p-0 d-inline-flex align-items-center justify-content-center"
                              style={{ width: '32px', height: '32px' }}
                              onClick={toggleFullscreen}
                              title="Fullscreen"
                            >
                              ⛶
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Video Info Strip */}
                <div className="p-2">
                  <h4 className="fw-bold text-dark mb-1 fs-5">{activeVideoData.title}</h4>
                  {activeVideoData.description && (
                    <p className="text-muted small mb-0" style={{ lineHeight: '1.6' }}>
                      {typeof activeVideoData.description === 'string'
                        ? activeVideoData.description
                        : 'Official video lecture for this course module.'}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Current Lesson Header & Fast Controls */}
            <div className="card border-0 rounded-4 shadow-sm p-3 p-sm-4 bg-white mcq-lesson-card-pad">
              {isDedicatedTest && (
                <div className="d-flex align-items-center pb-3 mb-3 border-bottom">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-2"
                    onClick={() => {
                      if (timerIntervalRef.current) {
                        clearInterval(timerIntervalRef.current)
                        timerIntervalRef.current = null
                      }
                      setIsTakingTest(false)
                      if (onBack) {
                        onBack()
                      } else {
                        navigate(-1)
                      }
                    }}
                    id="btn-back-to-lesson-from-test"
                  >
                    <span>←</span>
                    <span>Back to Lesson</span>
                  </button>
                </div>
              )}
              {/* EXACT LESSON DETAILS HEADER (SCREENSHOT REFERENCE) */}
              <div className={`lesson-page-header-card mb-4 position-relative border ${isDedicatedTest ? 'd-none' : ''}`}>
                {/* 1. Large course/lesson banner image with circular back button */}
                <div className="lesson-banner-wrapper">
                  <button
                    type="button"
                    className="lesson-back-circle-btn"
                    onClick={onBack}
                    title="Back to Course Details"
                    id="btn-lesson-back"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                  </button>
                  <img
                    src={
                      currentLesson?.imageUrl ||
                      course?.thumbnail ||
                      course?.video_thumbnails_url ||
                      'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?q=80&w=1200&auto=format&fit=crop'
                    }
                    alt={currentLesson?.title || 'Lesson Banner'}
                    className="lesson-banner-img"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?q=80&w=1200&auto=format&fit=crop'
                    }}
                  />
                </div>

                {/* Subject pill, Lesson title, Underline tabs */}
                <div className="p-3 p-md-4 bg-white">
                  <div className="mb-2">
                    <span className="lesson-category-pill">
                      {currentLesson?.subject || courseSubject || 'SCIENCE'}
                    </span>
                  </div>
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
                    <h2 className="lesson-main-title mb-0">
                      {currentLesson?.title || 'Full test 10 questions'}
                    </h2>

                    {/* Previous & Next Fast Controls */}
                    <div className="d-flex align-items-center gap-2 ms-auto ms-sm-0">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-1"
                        onClick={handlePrevLesson}
                        disabled={activeIndex <= 0}
                        id="btn-prev-lesson"
                      >
                        <span>←</span>
                        <span className="d-none d-sm-inline">Previous</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-primary rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-1"
                        onClick={handleNextLesson}
                        disabled={activeIndex >= allLessons.length - 1}
                        id="btn-next-lesson"
                      >
                        <span className="d-none d-sm-inline">Next</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>

                  {/* Four Tabs in exact reference order: 1. Avatar Lesson, 2. Test, 3. Resources, 4. Video Lesson */}
                  <ul className="lesson-underline-tabs">
                    <li className="lesson-underline-tab-item">
                      <button
                        type="button"
                        className={`lesson-underline-tab-btn ${activeTab === 'avatar' && !isDedicatedTest ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab('avatar')
                          setIsTakingTest(false)
                          updateUrlParams({ tab: 'avatar', mode: null, testId: null })
                        }}
                        id="tab-lesson-avatar"
                      >
                        Avatar Lesson
                      </button>
                    </li>
                    <li className="lesson-underline-tab-item">
                      <button
                        type="button"
                        className={`lesson-underline-tab-btn ${(activeTab === 'test' || isDedicatedTest) ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab('test')
                          updateUrlParams({ tab: 'test', mode: null })
                        }}
                        id="tab-lesson-test"
                      >
                        Test
                      </button>
                    </li>
                    <li className="lesson-underline-tab-item">
                      <button
                        type="button"
                        className={`lesson-underline-tab-btn ${activeTab === 'resources' && !isDedicatedTest ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab('resources')
                          setIsTakingTest(false)
                          updateUrlParams({ tab: 'resources', mode: null, testId: null })
                        }}
                        id="tab-lesson-resources"
                      >
                        Resources
                      </button>
                    </li>
                    <li className="lesson-underline-tab-item">
                      <button
                        type="button"
                        className={`lesson-underline-tab-btn ${activeTab === 'video' && !isDedicatedTest ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab('video')
                          setIsTakingTest(false)
                          updateUrlParams({ tab: 'video', mode: null, testId: null })
                        }}
                        id="tab-lesson-video"
                      >
                        Video Lesson
                      </button>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Tab Contents */}
              <div className="tab-content pt-2">
                {/* TAB 1: AVATAR LESSON */}
                {((activeTab === 'avatar' && !isDedicatedTest) || (!['test', 'resources', 'video'].includes(activeTab) && !isDedicatedTest)) && (
                  <div className="animate-fade-in d-flex flex-column gap-3">
                    <div className="animate-fade-in">
                      {(() => {
                        const avatarItems = (lessonTopics && lessonTopics.length > 0)
                          ? lessonTopics.map((topic, idx) => ({
                              id: topic.id || `topic-avatar-${idx}`,
                              title: topic.title || `Topic ${idx + 1}`,
                              raw: topic,
                              order: topic.order || idx + 1,
                              thumbnailUrl: topic.thumbnail_url || null,
                              isTopic: true,
                            }))
                          : (currentLesson?.topics && currentLesson.topics.length > 0)
                          ? currentLesson.topics.map((t, idx) => ({
                              id: t.element_id || t.id || `lesson-topic-${idx}`,
                              title: t.title || `Topic ${idx + 1}`,
                              raw: t,
                              order: t.order || idx + 1,
                              thumbnailUrl: t.thumbnail_image_url || t.thumbnail_url || null,
                              isTopic: true,
                            }))
                          : [
                              {
                                id: currentLesson?.id || 'avatar-lesson-main',
                                title: currentLesson?.title || 'Avatar Lesson',
                                raw: currentLesson,
                                order: 1,
                                thumbnailUrl: currentLesson?.imageUrl || null,
                                isTopic: false,
                              },
                            ]

                        return (
                          <div className="d-flex flex-column gap-1">
                            {avatarItems.map((item, idx) => (
                              <div
                                key={item.id || idx}
                                className="lesson-material-card"
                                onClick={() => {
                                  if (item.isTopic) {
                                    handleOpenAvatarTopic(item.raw)
                                  } else {
                                    handleOpenAvatarTopic(item.raw || currentLesson)
                                  }
                                }}
                                id={`avatar-lesson-card-${idx}`}
                              >
                                {/* Left Square Thumbnail Box */}
                                <div className="lesson-material-thumb-box">
                                  {item.thumbnailUrl ? (
                                    <img
                                      src={item.thumbnailUrl}
                                      alt={item.title}
                                      className="lesson-material-thumb-img"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                        if (e.currentTarget.nextSibling) {
                                          e.currentTarget.nextSibling.style.display = 'block'
                                        }
                                      }}
                                    />
                                  ) : null}
                                  <svg
                                    className="lesson-material-thumb-icon"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ display: item.thumbnailUrl ? 'none' : 'block' }}
                                  >
                                    <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                  </svg>
                                </div>

                                {/* Right Meta (bullet + type) and Title */}
                                <div className="min-w-0 flex-grow-1">
                                  <div className="lesson-material-meta d-flex align-items-center justify-content-between">
                                    <div className="d-flex align-items-center gap-1.5">
                                      <span className="lesson-material-bullet"></span>
                                      <span>Avatar Lesson : {item.order || idx + 1}</span>
                                    </div>
                                  </div>
                                  <h4 className="lesson-material-title">
                                    {item.title}
                                  </h4>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {/* Lesson study overview collapsed below materials */}
                      {currentLesson?.description && (
                        <div className="mt-3 p-3 bg-light rounded-3 border">
                          <div className="fw-semibold small text-dark mb-1">📖 Lesson Description</div>
                          <div
                            className="text-muted smaller"
                            style={{ lineHeight: '1.6' }}
                            dangerouslySetInnerHTML={{
                              __html: currentLesson.description,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: TEST */}
                {(activeTab === 'test' || isDedicatedTest) && (
                  <div className="animate-fade-in d-flex flex-column gap-3">
                    {/* Test items list when not currently running a test */}
                    {!isTakingTest && !isDedicatedTest && (
                      <div className="animate-fade-in">
                        {(() => {
                          const testItems = (currentLesson?.tests || []).map((t) => {
                            const isActive = courseService.isMcqActive(t)
                            return {
                              id: t.element_id || t.id,
                              type: 'test',
                              title: t.title || 'Lesson Quiz / Test',
                              thumbnailUrl: t.thumbnail_url || t.thumbnail_image_url || null,
                              raw: t,
                              isActive,
                              statusText: isActive ? 'Active' : 'Inactive',
                            }
                          })

                          if (testItems.length === 0) {
                            return (
                              <div className="p-4 border rounded-4 bg-light text-center text-muted small">
                                <div className="fs-3 mb-2">⚡</div>
                                <div className="fw-semibold text-secondary mb-1">No Tests Linked for this Lesson</div>
                                <p className="mb-0 text-muted">
                                  Check other lessons or units for practice quizzes and tests.
                                </p>
                              </div>
                            )
                          }

                          return (
                            <div className="d-flex flex-column gap-1">
                              {testItems.map((item, idx) => {
                                const isItemDisabled = item.isActive === false
                                return (
                                  <div
                                    key={item.id || idx}
                                    className={`lesson-material-card ${isItemDisabled ? 'opacity-50' : ''}`}
                                    style={{
                                      cursor: isItemDisabled ? 'not-allowed' : 'pointer',
                                      backgroundColor: isItemDisabled ? '#f1f5f9' : undefined,
                                    }}
                                    onClick={() => {
                                      if (isItemDisabled) {
                                        showToast('⚠️ This MCQ test is inactive and cannot be accessed.')
                                        return
                                      }
                                      handleOpenTest(item.id)
                                    }}
                                    id={`lesson-test-card-${idx}`}
                                    title={isItemDisabled ? 'This MCQ test is inactive and cannot be accessed.' : undefined}
                                    aria-disabled={isItemDisabled}
                                  >
                                    <div className="lesson-material-thumb-box">
                                      {item.thumbnailUrl ? (
                                        <img
                                          src={item.thumbnailUrl}
                                          alt={item.title}
                                          className="lesson-material-thumb-img"
                                          onError={(e) => {
                                            e.currentTarget.style.display = 'none'
                                            if (e.currentTarget.nextSibling) {
                                              e.currentTarget.nextSibling.style.display = 'block'
                                            }
                                          }}
                                        />
                                      ) : null}
                                      <svg
                                        className="lesson-material-thumb-icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ display: item.thumbnailUrl ? 'none' : 'block' }}
                                      >
                                        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                        <polyline points="21 15 16 10 5 21"></polyline>
                                      </svg>
                                    </div>

                                    <div className="min-w-0 flex-grow-1">
                                      <div className="lesson-material-meta d-flex align-items-center justify-content-between">
                                        <div className="d-flex align-items-center gap-1.5">
                                          <span className="lesson-material-bullet"></span>
                                          <span>Test : {idx + 1}</span>
                                        </div>
                                        <span
                                          className={`badge rounded-pill px-2 py-0.5 ${
                                            item.isActive ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border border-secondary-subtle'
                                          }`}
                                          style={{ fontSize: '0.65rem', fontWeight: 600 }}
                                        >
                                          {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                      </div>
                                      <h4 className="lesson-material-title">
                                        {item.title}
                                      </h4>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Integrated MCQ / Test Section inside Lesson Materials */}
                    <div className="mcq-integrated-section" style={{ display: isDedicatedTest && isTakingTest ? 'block' : 'none' }}>

                      {isLoadingTest && (
                        <div className="text-center py-4 bg-light rounded-3 border" id="mcq-test-loading">
                          <div className="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                          <div className="small text-muted">Loading test...</div>
                        </div>
                      )}
                      {!isLoadingTest && testError && (
                        <div className="alert alert-warning rounded-3 small p-3 d-flex flex-wrap align-items-center justify-content-between gap-2" id="mcq-test-error">
                          <div className="d-flex align-items-center gap-2">
                            <span>⚠️ {testError}</span>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            {testError.toLowerCase().includes('inactive') ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                                onClick={() => {
                                  setIsTakingTest(false)
                                  setActiveTestId(null)
                                  setTestDetails(null)
                                  setTestError(null)
                                  updateUrlParams({ mode: null, testId: null })
                                  if (isDedicatedTest) {
                                    const targetLesson = activeLessonId || urlLessonId || ''
                                    navigate(`/learning?courseId=${encodeURIComponent(courseId)}${targetLesson ? `&lessonId=${encodeURIComponent(targetLesson)}` : ''}`)
                                  }
                                }}
                              >
                                ← Back to Course
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary rounded-pill px-3"
                                id="btn-mcq-test-retry"
                                onClick={() => handleOpenTest(activeTestId || searchParams.get('testId'))}
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Real Test Loaded from Backend */}
                      {!isLoadingTest && testDetails && (
                        <div className="mcq-test-container">
                          {/* Test Header */}
                          <div className="p-3 bg-white rounded-3 border mb-3 shadow-xs">
                            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                <span className="badge bg-primary rounded-pill px-2-5 py-1 small fw-semibold">
                                  {testDetails.subject} • GRADE {testDetails.grade}
                                </span>
                              </div>

                              <div className="d-flex align-items-center gap-3">
                                {(() => {
                                  const resolvedSecs = totalDurationSec || parseDurationToSeconds(testDetails?.duration)
                                  const effectiveTimeLeft = timeLeft !== null ? timeLeft : resolvedSecs
                                  const showTimer = (hasBackendDuration || Boolean(resolvedSecs)) && effectiveTimeLeft !== null

                                  if (showTimer) {
                                    const totalSec = totalDurationSec || resolvedSecs || effectiveTimeLeft || 1
                                    const progressRatio = Math.max(0, Math.min(1, effectiveTimeLeft / totalSec))
                                    const radius = 13
                                    const circumference = 2 * Math.PI * radius
                                    const strokeDashoffset = circumference * (1 - progressRatio)
                                    const isDanger = effectiveTimeLeft <= 30
                                    const isWarning = effectiveTimeLeft > 30 && effectiveTimeLeft <= 120
                                    const stateClass = isDanger ? 'timer-danger' : isWarning ? 'timer-warning' : ''

                                    return (
                                      <div
                                        className={`mcq-circular-timer-container ${stateClass}`}
                                        id="mcq-test-countdown-timer"
                                        role="timer"
                                        aria-live="polite"
                                        aria-label={`Time remaining: ${formatTimerDisplay(effectiveTimeLeft)}`}
                                        title={isDanger ? 'Critical: Less than 30 seconds left!' : isWarning ? 'Warning: Less than 2 minutes left' : 'Time Remaining'}
                                      >
                                        <div className="mcq-circular-svg-wrap">
                                          <svg className="mcq-circular-svg" viewBox="0 0 32 32">
                                            <circle
                                              className="mcq-timer-bg-circle"
                                              cx="16"
                                              cy="16"
                                              r={radius}
                                            />
                                            <circle
                                              className="mcq-timer-progress-circle"
                                              cx="16"
                                              cy="16"
                                              r={radius}
                                              strokeDasharray={circumference}
                                              strokeDashoffset={strokeDashoffset}
                                            />
                                          </svg>
                                          <span className="mcq-timer-clock-icon" aria-hidden="true">⏱️</span>
                                        </div>
                                        <div className="mcq-timer-label-box">
                                          <span className="mcq-timer-time-val">
                                            {formatTimerDisplay(effectiveTimeLeft)}
                                          </span>
                                          <span className="mcq-timer-subtext">
                                            {isDanger ? 'Expiring' : isWarning ? 'Low Time' : 'Remaining'}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  }

                                  return (
                                    <div
                                      className="mcq-circular-timer-container"
                                      title="No time limit specified by backend for this test"
                                    >
                                      <div className="mcq-circular-svg-wrap">
                                        <span className="mcq-timer-clock-icon" style={{ fontSize: '14px' }}>⏱️</span>
                                      </div>
                                      <div className="mcq-timer-label-box">
                                        <span className="mcq-timer-time-val" style={{ fontSize: '0.825rem' }}>Untimed</span>
                                        <span className="mcq-timer-subtext">No Limit</span>
                                      </div>
                                    </div>
                                  )
                                })()}
                                <span className="text-muted small fw-semibold">
                                  {testDetails.total_test_questions || 0} Questions Total
                                </span>
                              </div>
                            </div>
                            <h5 className="fw-bold fs-6 mb-1 text-dark" style={{ wordBreak: 'break-word' }}>
                              {testDetails.test_name}
                            </h5>
                            {testDetails.description?.children?.[0]?.children?.[0]?.text && (
                              <p className="text-muted small mb-0" style={{ lineHeight: '1.5', wordBreak: 'break-word' }}>
                                {testDetails.description.children[0].children[0].text}
                              </p>
                            )}
                          </div>

                          {/* SUBMITTED TEST RESULT PAGE (SCREENSHOT 3 REFERENCE) */}
                          {testResult ? (
                            <div className="mcq-result-screen animate-fade-in text-center p-3 p-md-4 bg-white rounded-4 border shadow-sm">
                              {/* Completion Illustration / Badge near top */}
                              <div className="mcq-result-celebration-box mb-3">
                                <div className="mcq-result-trophy-circle mx-auto">
                                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                                    <path d="M4 22h16"></path>
                                    <path d="M10 14.66V17c0 .55-.45 1-1 1H7.5"></path>
                                    <path d="M14 14.66V17c0 .55.45 1 1 1h1.5"></path>
                                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                                  </svg>
                                </div>
                              </div>

                              {/* Heading & Lessons progress */}
                              <h2 className="fw-bold text-dark mb-1 fs-3">Lessons Completed!</h2>
                              <p className="text-muted small mb-4">
                                {completedLessonIds.length} / {Math.max(1, allLessons.length)} Lessons Completed
                              </p>

                              {/* 6 Statistic Cards in Responsive Grid */}
                              {(() => {
                                const fallbackTotalQ =
                                  Number(testDetails.total_test_questions) ||
                                  (testDetails.test_section_details || []).flatMap((sec) => sec.questions || []).length ||
                                  (testDetails.questions || testDetails.test_questions || []).length ||
                                  1
                                const totalQ =
                                  testResult.total_questions !== undefined && !isNaN(Number(testResult.total_questions)) && Number(testResult.total_questions) > 0
                                    ? Number(testResult.total_questions)
                                    : fallbackTotalQ
                                const correctQ =
                                  testResult.correct_answers !== undefined && !isNaN(Number(testResult.correct_answers))
                                    ? Number(testResult.correct_answers)
                                    : 0
                                const incorrectQ =
                                  testResult.incorrect_answers !== undefined && !isNaN(Number(testResult.incorrect_answers))
                                    ? Number(testResult.incorrect_answers)
                                    : 0
                                const unattendedQ =
                                  testResult.unattended_questions !== undefined && !isNaN(Number(testResult.unattended_questions))
                                    ? Number(testResult.unattended_questions)
                                    : Math.max(0, totalQ - (correctQ + incorrectQ))
                                const attendedQ =
                                  testResult.attended_questions !== undefined && !isNaN(Number(testResult.attended_questions))
                                    ? Number(testResult.attended_questions)
                                    : Math.max(0, totalQ - unattendedQ)

                                const hasScore = testResult.score !== undefined && !isNaN(Number(testResult.score))
                                const hasMaxMarks = testResult.max_marks !== undefined && !isNaN(Number(testResult.max_marks))
                                const hasPercentage =
                                  testResult.score_percentage !== undefined && !isNaN(Number(testResult.score_percentage))

                                const durationTaken = testResult.duration_taken || testDurationTakenStr || '00:00:00'

                                return (
                                  <>
                                    {(hasScore || hasPercentage || testResult.comment || totalQ > 0) && (
                                      <div className="d-flex flex-wrap justify-content-center align-items-center gap-2 mb-3">
                                        {hasScore && (
                                          <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 rounded-pill px-3 py-2 fw-bold">
                                            Marks: {testResult.score}{hasMaxMarks ? ` / ${testResult.max_marks}` : ''}
                                          </span>
                                        )}
                                        {hasPercentage && (
                                          <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-2 fw-bold">
                                            Percentage: {testResult.score_percentage}%
                                          </span>
                                        )}
                                        <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill px-3 py-2 fw-semibold">
                                          Total Questions: {totalQ}
                                        </span>
                                        {testResult.comment && (
                                          <span className="badge bg-warning bg-opacity-15 text-dark rounded-pill px-3 py-2 fw-semibold">
                                            {typeof testResult.comment === 'string' || typeof testResult.comment === 'number'
                                              ? testResult.comment
                                              : JSON.stringify(testResult.comment)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <div className="mcq-result-stats-grid mb-4">
                                      {/* Card 1: Correct Score */}
                                      <div className="mcq-result-card mcq-card-correct-score">
                                        <div className="mcq-result-card-label">Correct Score</div>
                                        <div className="mcq-result-card-val text-success">
                                          {correctQ}/{totalQ}
                                        </div>
                                      </div>

                                      {/* Card 2: Incorrect Score */}
                                      <div className="mcq-result-card mcq-card-incorrect-score">
                                        <div className="mcq-result-card-label">Incorrect Score</div>
                                        <div className="mcq-result-card-val text-danger">
                                          {incorrectQ}/{totalQ}
                                        </div>
                                      </div>

                                      {/* Card 3: Correct Answer */}
                                      <div className="mcq-result-card mcq-card-correct-count">
                                        <div className="mcq-result-card-label">Correct Answer</div>
                                        <div className="mcq-result-card-val text-success">
                                          {correctQ}
                                        </div>
                                      </div>

                                      {/* Card 4: Incorrect Answer */}
                                      <div className="mcq-result-card mcq-card-incorrect-count">
                                        <div className="mcq-result-card-label">Incorrect Answer</div>
                                        <div className="mcq-result-card-val text-danger">
                                          {incorrectQ}
                                        </div>
                                      </div>

                                      {/* Card 5: Attended Questions */}
                                      <div className="mcq-result-card mcq-card-attended">
                                        <div className="mcq-result-card-label">Attended Questions</div>
                                        <div className="mcq-result-card-val text-primary">
                                          {attendedQ}
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                )
                              })()}

                              {/* Continue Learning Action Button */}
                              <div className="pt-2">
                                <button
                                  type="button"
                                  className="btn btn-primary rounded-pill w-100 py-3 fw-bold fs-6 mcq-continue-learning-btn shadow-sm"
                                  id="btn-continue-learning-result"
                                  onClick={() => {
                                    testDetailsRef.current = null
                                    userAnswersRef.current = {}
                                    setIsTakingTest(false)
                                    setTestResult(null)
                                    setActiveTestId(null)
                                    setUserAnswers({})
                                    setCheckedQuestions({})
                                    updateUrlParams({ mode: null, testId: null, result: null })
                                    if (isDedicatedTest) {
                                      const targetLesson = activeLessonId || urlLessonId || ''
                                      navigate(`/learning?courseId=${encodeURIComponent(courseId)}${targetLesson ? `&lessonId=${encodeURIComponent(targetLesson)}` : ''}`)
                                      return
                                    }
                                    if (activeIndex < allLessons.length - 1) {
                                      handleNextLesson()
                                    } else {
                                      setActiveTab('materials')
                                      showToast('🎉 Course lessons completed!')
                                    }
                                  }}
                                >
                                  Continue Learning →
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ACTIVE MCQ TEST RUNNER (SCREENSHOT 2 REFERENCE) */
                            <div>
                              {(() => {
                                // Extract questions from sections, root questions, or nested questions array
                                const rawSections =
                                  testDetails.test_section_details ||
                                  testDetails.assessment_section_details ||
                                  testDetails.sections ||
                                  testDetails.test_sections ||
                                  []
                                const rawQuestions = rawSections.flatMap((sec) =>
                                  (sec.questions || sec.test_questions || []).map((q) => ({
                                    ...q,
                                    qn_type: q.qn_type || q.type || sec.qn_type || sec.type || 'MCQ',
                                  }))
                                )
                                const fallbackQuestions = testDetails.questions || testDetails.test_questions || []
                                const rawList = rawQuestions.length > 0 ? rawQuestions : fallbackQuestions

                                // Helper to safely extract printable text even if an API field is a Lexical rich-text object
                                const toSafeText = (val, fallback = '') => {
                                  if (val === undefined || val === null) return fallback
                                  if (typeof val === 'string' || typeof val === 'number') return String(val)
                                  if (typeof val === 'object') {
                                    if (Array.isArray(val.children)) {
                                      const txt = val.children
                                        .flatMap((c) => (Array.isArray(c.children) ? c.children.map((t) => t.text || '') : [c.text || '']))
                                        .join(' ')
                                        .trim()
                                      if (txt) return txt
                                    }
                                    if (typeof val.text === 'string') return val.text
                                    if (typeof val.label === 'string') return val.label
                                    if (typeof val.title === 'string') return val.title
                                  }
                                  return fallback
                                }

                                // Normalize each question object so field names match the component expectations
                                const allQuestions = rawList.map((q, idx) => {
                                  if (!q || typeof q !== 'object') {
                                    return {
                                      qn_id: idx + 1,
                                      question: `Question ${idx + 1}`,
                                      options: [],
                                      answer: undefined,
                                      points: 1,
                                      qn_type: 'MCQ',
                                    }
                                  }
                                  const qnId = q.qn_id || q.id || q.question_id || idx + 1
                                  let rawOptions = q.options || q.question_options || q.choices || q.answers || []
                                  if (typeof rawOptions === 'string') {
                                    try {
                                      rawOptions = JSON.parse(rawOptions)
                                    } catch {
                                      rawOptions = []
                                    }
                                  }
                                  // Standardize options array: [{ value, label, ... }]
                                  const normalizedOptions = Array.isArray(rawOptions)
                                    ? rawOptions.map((opt, oIdx) => {
                                        if (typeof opt === 'string' || typeof opt === 'number') {
                                          return { value: String(opt), label: String(opt) }
                                        }
                                        if (!opt || typeof opt !== 'object') {
                                          return { value: String.fromCharCode(65 + oIdx), label: `Option ${oIdx + 1}` }
                                        }
                                        const optVal =
                                          opt.value !== undefined && opt.value !== null && String(opt.value) !== ''
                                            ? opt.value
                                            : opt.option_value !== undefined && opt.option_value !== null && String(opt.option_value) !== ''
                                            ? opt.option_value
                                            : opt.key !== undefined && opt.key !== null && String(opt.key) !== ''
                                            ? opt.key
                                            : opt.id !== undefined && opt.id !== null && String(opt.id) !== ''
                                            ? opt.id
                                            : opt.option_id !== undefined && opt.option_id !== null && String(opt.option_id) !== ''
                                            ? opt.option_id
                                            : opt.option !== undefined && opt.option !== null && String(opt.option) !== ''
                                            ? opt.option
                                            : opt.text !== undefined && opt.text !== null && String(opt.text) !== ''
                                            ? opt.text
                                            : opt.label !== undefined && opt.label !== null && String(opt.label) !== ''
                                            ? opt.label
                                            : String.fromCharCode(65 + oIdx) // 'A', 'B', 'C', 'D'
                                        const rawOptLabel =
                                          opt.label || opt.text || opt.title || opt.option || opt.name || opt.value || `Option ${oIdx + 1}`
                                        const optLabel = toSafeText(rawOptLabel, `Option ${oIdx + 1}`)
                                        return {
                                          ...opt,
                                          value: typeof optVal === 'object' ? String.fromCharCode(65 + oIdx) : optVal,
                                          label: optLabel,
                                        }
                                      })
                                    : rawOptions && typeof rawOptions === 'object'
                                    ? Object.entries(rawOptions).map(([key, val]) => ({
                                        value: key,
                                        label: typeof val === 'string' ? val : toSafeText(val?.label || val, key),
                                        ...(val && typeof val === 'object' ? val : {}),
                                      }))
                                    : []

                                  const flaggedCorrectOpt = normalizedOptions.find(
                                    (o) =>
                                      o &&
                                      typeof o === 'object' &&
                                      (o.is_correct === true || o.is_correct === 1 || o.correct === true || o.is_answer === true)
                                  )
                                  const resolvedAnswerKey =
                                    q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== ''
                                      ? q.answer
                                      : q.correct_answer ?? q.correct_option ?? q.right_answer ?? flaggedCorrectOpt?.value

                                  // Detect configured selection limit from backend question metadata
                                  const flaggedCorrectOptions = normalizedOptions.filter(
                                    (o) =>
                                      o &&
                                      typeof o === 'object' &&
                                      (o.is_correct === true || o.is_correct === 1 || o.is_correct === '1' || o.correct === true || o.is_answer === true)
                                  )
                                  const detectedCorrectKeys = parseMcqCorrectKeys(q, normalizedOptions)

                                  const explicitLimit =
                                    Number(
                                      q.max_answers ||
                                        q.max_selections ||
                                        q.max_options ||
                                        q.correct_answers_count ||
                                        q.total_correct_answers ||
                                        q.number_of_correct_answers ||
                                        q.no_of_correct_answers
                                    ) || 0

                                  const qTypeRaw = String(q.qn_type || q.type || '').trim().toUpperCase()
                                  const isTypeMulti = /MULTIPLE|CHECKBOX|MULTI/i.test(qTypeRaw)
                                  const isMultiSelect = isTypeMulti || explicitLimit > 1 || detectedCorrectKeys.size > 1
                                  const selectionLimit = isMultiSelect
                                    ? (explicitLimit > 1 ? explicitLimit : Math.max(normalizedOptions.length, 2))
                                    : 1

                                  return {
                                    ...q,
                                    qn_id: qnId,
                                    question: toSafeText(q.question || q.question_text || q.title, `Question ${idx + 1}`),
                                    question_passage: q.question_passage ? toSafeText(q.question_passage, '') : '',
                                    options: normalizedOptions,
                                    answer: resolvedAnswerKey,
                                    points: q.points || q.marks || 1,
                                    qn_type: toSafeText(q.qn_type || q.type, isMultiSelect ? 'MCQ_MULTIPLE' : 'MCQ'),
                                    selectionLimit,
                                    isMultiSelect,
                                    correctKeysSet: detectedCorrectKeys,
                                  }
                                })

                                const totalQ = allQuestions.length
                                const currentQIndex = Math.min(Math.max(0, selectedQuestionIndex), Math.max(0, totalQ - 1))
                                const currentQ = allQuestions[currentQIndex]
                                const isLastQuestion = currentQIndex >= totalQ - 1

                                if (!currentQ) {
                                  return (
                                    <div className="p-3 bg-light rounded-3 text-muted small text-center">
                                      No questions available in this test.
                                    </div>
                                  )
                                }

                                const qnId = currentQ.qn_id
                                const currentSelectedValue = userAnswers[qnId]
                                const isCurrentChecked = Boolean(checkedQuestions[qnId])
                                const limit = currentQ.selectionLimit || 1
                                const isMulti = currentQ.isMultiSelect || limit > 1

                                // Normalize currently selected options as an array of string values
                                const selectedValuesArray = Array.isArray(currentSelectedValue)
                                  ? currentSelectedValue.map((v) => String(v).trim())
                                  : currentSelectedValue !== undefined && currentSelectedValue !== null && String(currentSelectedValue).trim() !== ''
                                  ? String(currentSelectedValue).replace(/,_\s*,|,_,|_/g, ',').split(/[,;|]+/).map((v) => v.trim()).filter(Boolean)
                                  : []

                                const isAnswered = selectedValuesArray.length > 0

                                // Handler for selecting / deselecting an option with limit enforcement
                                const handleOptionToggle = (optVal) => {
                                  if (hasTimedOut || testResult || isSubmittingTest || isCurrentChecked) return
                                  const strVal = String(optVal)
                                  const alreadySelected = selectedValuesArray.includes(strVal)

                                  let nextVal
                                  if (isMulti) {
                                    if (alreadySelected) {
                                      // Deselect option
                                      nextVal = selectedValuesArray.filter((v) => v !== strVal)
                                    } else {
                                      // If limit reached, prevent adding more options
                                      if (selectedValuesArray.length >= limit) {
                                        return
                                      }
                                      nextVal = [...selectedValuesArray, strVal]
                                    }
                                  } else {
                                    if (alreadySelected) {
                                      // Allow deselecting in single-select as well
                                      nextVal = undefined
                                    } else {
                                      nextVal = strVal
                                    }
                                  }

                                  const nextAnswers = {
                                    ...(userAnswersRef.current || {}),
                                    [qnId]: nextVal,
                                  }
                                  if (nextVal === undefined || (Array.isArray(nextVal) && nextVal.length === 0)) {
                                    delete nextAnswers[qnId]
                                  }
                                  userAnswersRef.current = nextAnswers
                                  setUserAnswers((prev) => {
                                    const updated = { ...prev }
                                    if (nextVal === undefined || (Array.isArray(nextVal) && nextVal.length === 0)) {
                                      delete updated[qnId]
                                    } else {
                                      updated[qnId] = nextVal
                                    }
                                    return updated
                                  })
                                }

                                // Function to handle Check or Advance
                                const handleCheckClick = () => {
                                  if (!isCurrentChecked) {
                                    if (!isAnswered) return
                                    setCheckedQuestions((prev) => ({ ...prev, [qnId]: true }))
                                  } else {
                                    if (isLastQuestion) {
                                      submitMcqTest(false)
                                    } else {
                                      setSelectedQuestionIndex((prev) => Math.min(totalQ - 1, prev + 1))
                                    }
                                  }
                                }

                                return (
                                  <div className="card border-0 rounded-4 p-3 p-sm-4 bg-white shadow-xs mb-3">
                                    {/* Question Header & Points */}
                                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-2 border-bottom">
                                      <div className="d-flex flex-wrap align-items-center gap-2">
                                        <span className="badge bg-primary text-white rounded-pill px-2-5 py-1 small fw-semibold">
                                          Question {currentQIndex + 1} of {totalQ}
                                        </span>
                                        {currentQ.qn_type && (
                                          <span className="badge bg-light text-secondary border rounded-pill px-2 py-0-5 smaller">
                                            {currentQ.qn_type.replace(/_/g, ' ')}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                                        {currentQ.points || 1} pt{currentQ.points > 1 ? 's' : ''}
                                      </span>
                                    </div>

                                    {/* Optional Reading Passage */}
                                    {currentQ.question_passage && (
                                      <div
                                        className="p-3 mb-3 rounded-3 bg-light border-start border-3 border-info small text-secondary"
                                        style={{ lineHeight: '1.6', wordBreak: 'break-word' }}
                                      >
                                        <strong className="d-block text-dark mb-1">📖 Passage:</strong>
                                        {currentQ.question_passage}
                                      </div>
                                    )}

                                    {/* Optional Audio Player */}
                                    {currentQ.question_audio_url &&
                                      !currentQ.question_audio_url.endsWith('/undefined') &&
                                      !currentQ.question_audio_url.endsWith('/') && (
                                        <div className="mb-3 p-2 bg-light rounded-3 border d-flex align-items-center gap-2 flex-wrap">
                                          <span className="small text-muted fw-semibold">🎧 Audio:</span>
                                          <audio controls src={currentQ.question_audio_url} className="w-100" style={{ height: '36px', minWidth: '0' }} />
                                        </div>
                                      )}

                                    {/* Optional Question Image (preview_image_url or passage_image) */}
                                    {(() => {
                                      const rawImg = currentQ.preview_image_url || (currentQ.passage_image && currentQ.passage_image !== 'undefined' ? `/storage/test_question_image/${currentQ.passage_image}` : null)
                                      if (!rawImg || typeof rawImg !== 'string') return null
                                      const trimmed = rawImg.trim()
                                      if (!trimmed || trimmed.endsWith('/undefined') || trimmed.endsWith('/storage/test_question_image/') || trimmed.endsWith('/')) return null
                                      const questionImgSrc = trimmed.startsWith('http')
                                        ? trimmed
                                        : trimmed.startsWith('/')
                                        ? `https://edoomate.myieltspartner.com${trimmed}`
                                        : `https://edoomate.myieltspartner.com/storage/test_question_image/${trimmed}`

                                      return (
                                        <div className="mcq-question-image-box mb-3 border">
                                          <img
                                            src={questionImgSrc}
                                            alt={`Question ${currentQIndex + 1} illustration`}
                                            className="img-fluid rounded-3 border shadow-xs"
                                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                                          />
                                        </div>
                                      )
                                    })()}

                                    {/* Question Text */}
                                    <h6
                                      className="fw-semibold text-dark mb-3 fs-6"
                                      style={{ lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                    >
                                      {currentQ.question}
                                    </h6>

                                    {/* Options List */}
                                    <div className="d-flex flex-column gap-2 mb-4">
                                      {(currentQ.options || []).map((opt, oIdx) => {
                                        const optValueStr = String(opt.value)
                                        const isSelected = selectedValuesArray.includes(optValueStr)
                                        const atSelectionLimit = !isSelected && selectedValuesArray.length >= limit

                                        const isCorrectOption = checkIsOptionCorrect(opt, oIdx, currentQ.correctKeysSet)

                                        // Feedback logic:
                                        // Before check: selected option gets blue border + light-blue background
                                        // After check: selected wrong gets red, correct gets green
                                        let optionClasses = 'bg-light hover-bg-white text-dark border'
                                        if (isCurrentChecked) {
                                          if (isSelected && isCorrectOption) {
                                            optionClasses = 'bg-success-subtle border-success text-success fw-bold shadow-xs'
                                          } else if (isSelected && !isCorrectOption) {
                                            optionClasses = 'bg-danger-subtle border-danger text-danger fw-bold shadow-xs'
                                          } else if (!isSelected && isCorrectOption) {
                                            optionClasses = 'bg-success-subtle border-success text-success fw-semibold shadow-xs'
                                          }
                                        } else if (isSelected) {
                                          optionClasses = 'mcq-option-selected fw-semibold shadow-xs'
                                        }

                                        const isOptionDisabled = Boolean(
                                          hasTimedOut || testResult || isSubmittingTest || isCurrentChecked || atSelectionLimit
                                        )
                                        const rawOptImg = opt.image_url || opt.image || opt.photo || opt.preview_image_url || null
                                        const optionImageUrl = (() => {
                                          if (!rawOptImg || typeof rawOptImg !== 'string') return null
                                          const trimmed = rawOptImg.trim()
                                          if (!trimmed || trimmed.endsWith('/undefined') || trimmed === 'undefined' || trimmed.endsWith('/')) return null
                                          if (trimmed.startsWith('http')) return trimmed
                                          if (trimmed.startsWith('/') || trimmed.startsWith('.')) return `https://edoomate.myieltspartner.com${trimmed.replace(/^\./, '')}`
                                          return `https://edoomate.myieltspartner.com/storage/test_question_image/${trimmed}`
                                        })()

                                        return (
                                          <label
                                            key={opt.value ?? oIdx}
                                            onClick={(e) => {
                                              e.preventDefault()
                                              handleOptionToggle(opt.value)
                                            }}
                                            className={`mcq-option-label transition-all ${optionClasses} ${
                                              isOptionDisabled && !isCurrentChecked ? 'opacity-75' : 'cursor-pointer'
                                            }`}
                                            style={{ cursor: isOptionDisabled && !isSelected ? 'default' : 'pointer', fontSize: '0.88rem' }}
                                          >
                                            <div className="mcq-option-content">
                                              <input
                                                type={isMulti ? 'checkbox' : 'radio'}
                                                name={`question-${qnId}`}
                                                value={opt.value}
                                                checked={isSelected}
                                                disabled={Boolean(hasTimedOut || testResult || isSubmittingTest || isCurrentChecked || atSelectionLimit)}
                                                onChange={() => handleOptionToggle(opt.value)}
                                                className="form-check-input mt-0 flex-shrink-0"
                                              />
                                              {/* Render Option Label if present */}
                                              {opt.label && <span className="mcq-option-text">{opt.label}</span>}

                                              {/* Render Option Image if present */}
                                              {optionImageUrl && (
                                                <div className="d-flex align-items-center gap-2 my-1">
                                                  <img
                                                    src={optionImageUrl}
                                                    alt={opt.label || `Option ${opt.value}`}
                                                    className="mcq-option-img img-thumbnail rounded border shadow-xs"
                                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                                  />
                                                  {!opt.label && <span className="small text-muted fw-semibold">Option {oIdx + 1}</span>}
                                                </div>
                                              )}
                                            </div>

                                          </label>
                                        )
                                      })}
                                    </div>

                                    {/* Action Buttons: Previous & Check / Next / Submit */}
                                    <div className="d-flex align-items-center gap-2 mt-2">
                                      {currentQIndex > 0 && (
                                        <button
                                          type="button"
                                          className="btn btn-outline-secondary rounded-pill px-3 py-2 fw-semibold d-inline-flex align-items-center gap-1 flex-shrink-0"
                                          id="btn-mcq-prev-question"
                                          onClick={() => setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))}
                                          disabled={isSubmittingTest}
                                        >
                                          <span>←</span>
                                          <span className="d-none d-sm-inline">Previous</span>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        className="btn btn-primary rounded-pill flex-grow-1 py-3 fw-bold fs-6 mcq-check-action-btn shadow-sm"
                                        disabled={
                                          isSubmittingTest ||
                                          (!isCurrentChecked && !isAnswered)
                                        }
                                        id="btn-mcq-check-action"
                                        onClick={handleCheckClick}
                                      >
                                        {isSubmittingTest ? (
                                          <>
                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                            <span>Submitting answers...</span>
                                          </>
                                        ) : !isCurrentChecked ? (
                                          'Check'
                                        ) : isLastQuestion ? (
                                          'Finish Test ✓'
                                        ) : (
                                          'Next Question →'
                                        )}
                                      </button>

                                      {!isCurrentChecked && !isAnswered && (
                                        <button
                                          type="button"
                                          className={`btn ${isLastQuestion ? 'btn-success' : 'btn-outline-primary'} rounded-pill px-3 py-2 fw-semibold d-inline-flex align-items-center gap-1 flex-shrink-0`}
                                          id={isLastQuestion ? 'btn-mcq-submit-unanswered' : 'btn-mcq-skip-question'}
                                          onClick={() => {
                                            if (isLastQuestion) {
                                              submitMcqTest(false)
                                            } else {
                                              setSelectedQuestionIndex((prev) => Math.min(totalQ - 1, prev + 1))
                                            }
                                          }}
                                          disabled={isSubmittingTest}
                                        >
                                          <span>{isLastQuestion ? 'Submit Test ✓' : 'Skip →'}</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                )}

                {/* TAB 2: RESOURCES (Real backend readables, PDFs, official attachments) */}
                {activeTab === 'resources' && (
                  <div className="animate-fade-in">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                      <div>
                        <h5 className="fw-bold fs-6 mb-1 text-dark">Official Lesson Resources & Downloads</h5>
                        <p className="text-muted small mb-0">
                          Access verified reading PDFs, study notes, and supplementary documents for this lesson.
                        </p>
                      </div>
                    </div>

                    {/* Resources Loading State */}
                    {isLoadingResources && (
                      <div className="text-center py-4 bg-light rounded-3 border">
                        <div className="spinner-border spinner-border-sm text-primary mb-2" role="status">
                          <span className="visually-hidden">Loading resources...</span>
                        </div>
                        <div className="small text-muted">Fetching resources from Edoomate server...</div>
                      </div>
                    )}

                    {/* Resources Error State */}
                    {!isLoadingResources && resourcesError && (
                      <div className="alert alert-warning rounded-3 small p-3 mb-3">
                        ⚠️ {resourcesError}
                      </div>
                    )}

                    {/* Resources List */}
                    {!isLoadingResources && lessonResources.length > 0 && (
                      <div className="d-flex flex-column gap-3 lesson-resources-list">
                        {lessonResources.map((res, rIdx) => {
                          const hasUrl = Boolean(res.url || res.pdf_url)
                          return (
                            <div
                              key={res.id || rIdx}
                              onClick={hasUrl ? () => handleOpenResource(res) : undefined}
                              onKeyDown={
                                hasUrl
                                  ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleOpenResource(res)
                                      }
                                    }
                                  : undefined
                              }
                              role={hasUrl ? 'button' : undefined}
                              tabIndex={hasUrl ? 0 : undefined}
                              aria-label={hasUrl ? `Open ${res.title}` : undefined}
                              className={`p-3 border rounded-3 bg-white shadow-xs d-flex flex-wrap align-items-center justify-content-between gap-3 lesson-resource-card ${
                                hasUrl ? 'lesson-resource-card-clickable' : ''
                              }`}
                              style={{ cursor: hasUrl ? 'pointer' : 'default' }}
                            >
                              <div className="d-flex align-items-start gap-3 min-w-0 lesson-resource-info">
                                <span
                                  className="rounded-3 bg-danger bg-opacity-10 text-danger d-inline-flex align-items-center justify-content-center flex-shrink-0 lesson-resource-icon"
                                  style={{ width: '42px', height: '42px', fontSize: '1.25rem' }}
                                >
                                  {res.type === 'pdf' || res.readable_type === 'READABLE_PDF' ? '📕' : '📄'}
                                </span>
                                <div className="min-w-0 flex-grow-1 lesson-resource-details">
                                  <div className="fw-semibold small text-dark lesson-resource-title">
                                    {res.title}
                                  </div>
                                  <div className="text-muted smaller mb-1 lesson-resource-desc" style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                                    {res.description}
                                  </div>
                                  <div className="d-flex align-items-center gap-2 flex-wrap lesson-resource-meta">
                                    {res.subject && (
                                      <span className="badge bg-light text-secondary border rounded-pill px-2 py-0-5 smaller">
                                        {res.subject}
                                      </span>
                                    )}
                                    {res.grade && (
                                      <span className="badge bg-light text-secondary border rounded-pill px-2 py-0-5 smaller">
                                        Grade {res.grade}
                                      </span>
                                    )}
                                    {res.total_pages && (
                                      <span className="smaller text-muted">
                                        {res.total_pages} Page{res.total_pages > 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Resource Status Indicator */}
                              {!hasUrl && (
                                <span className="badge bg-secondary bg-opacity-10 text-secondary rounded-pill px-3 py-2 small lesson-resource-text-badge">
                                  Text Resource
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Resources Empty State */}
                    {!isLoadingResources && (!lessonResources || lessonResources.length === 0) && (
                      <div className="p-4 border rounded-3 bg-light text-center text-muted small">
                        <div className="fs-4 mb-2">📂</div>
                        <div className="fw-semibold text-secondary mb-1">
                          No downloadable resources for this lesson
                        </div>
                        <span className="smaller text-muted">
                          All required lecture notes, study instructions, and assessment questions are provided directly in the Lesson Materials tab.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: VIDEO LESSON */}
                {(activeTab === 'video' || activeTab === 'topics') && (
                  <div className="animate-fade-in d-flex flex-column gap-3">
                    {(() => {
                      const videoItems = (currentLesson?.videos || []).map((v) => ({
                        id: v.element_id || v.id,
                        type: 'video',
                        title: v.title || currentLesson?.title || 'Video Lecture',
                        thumbnailUrl: v.thumbnail_url || currentLesson?.imageUrl || null,
                        vimeoId: v.vimeo_id || v.vimeoId,
                        vimeoHash: v.vimeo_hash || v.hash,
                        videoUrl: v.video_url || v.stream_url || v.url,
                        raw: v,
                      }))

                      // Also include any topic videos
                      ;(lessonTopics || []).forEach((top, tIdx) => {
                        if (top.vimeoId || (top.video_url && top.video_url.includes('vimeo.com'))) {
                          videoItems.push({
                            id: top.id || `topic-video-${tIdx}`,
                            type: 'video',
                            title: top.title || `Topic ${tIdx + 1} Video`,
                            thumbnailUrl: top.thumbnail_url || null,
                            vimeoId: top.vimeoId,
                            vimeoHash: top.vimeoHash,
                            videoUrl: top.video_url,
                            raw: top,
                            sourceTab: 'video',
                          })
                        }
                      })

                      // If lesson has real video URL but not in videos array
                      const hasRealVideo = Boolean(currentLesson?.videoUrl || currentLesson?.vimeoId)
                      if (hasRealVideo && videoItems.length === 0) {
                        videoItems.push({
                          id: 'video-main',
                          type: 'video',
                          title: currentLesson?.title || 'Video Lecture',
                          thumbnailUrl: currentLesson?.imageUrl || course?.thumbnail || null,
                          vimeoId: currentLesson?.vimeoId,
                          vimeoHash: currentLesson?.vimeoHash,
                          videoUrl: currentLesson?.videoUrl,
                          raw: currentLesson,
                        })
                      }

                      if (videoItems.length === 0) {
                        return (
                          <div className="p-4 border rounded-4 bg-light text-center text-muted small">
                            <div className="fs-3 mb-2">🎥</div>
                            <div className="fw-semibold text-secondary mb-1">No Video Lessons Linked for this Lesson</div>
                            <p className="mb-0 text-muted">
                              Check other tabs for interactive avatar lessons, tests, and study resources.
                            </p>
                          </div>
                        )
                      }

                      return (
                        <div className="d-flex flex-column gap-1">
                          {videoItems.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              className="lesson-material-card"
                              onClick={() => handleOpenVideo(item)}
                              id={`lesson-video-card-${idx}`}
                            >
                              <div className="lesson-material-thumb-box">
                                {item.thumbnailUrl ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.title}
                                    className="lesson-material-thumb-img"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none'
                                      if (e.currentTarget.nextSibling) {
                                        e.currentTarget.nextSibling.style.display = 'block'
                                      }
                                    }}
                                  />
                                ) : null}
                                <svg
                                  className="lesson-material-thumb-icon"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ display: item.thumbnailUrl ? 'none' : 'block' }}
                                >
                                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                              </div>
                              <div className="min-w-0 flex-grow-1">
                                <div className="lesson-material-meta d-flex align-items-center justify-content-between">
                                  <div className="d-flex align-items-center gap-1.5">
                                    <span className="lesson-material-bullet"></span>
                                    <span>Video Lesson : {idx + 1}</span>
                                  </div>
                                </div>
                                <h4 className="lesson-material-title">
                                  {item.title}
                                </h4>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Course Curriculum Sidebar */}
          <div className={`col-12 col-lg-4 ${isDedicatedTest ? 'd-none' : isMobileCurriculumOpen ? 'd-block' : 'd-none d-lg-block'}`}>
            <div className="card border-0 rounded-4 shadow-sm p-3 p-md-4 bg-white sticky-lg-top curriculum-sidebar-card" style={{ top: '80px' }}>
              {/* Sidebar Header */}
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-3 border-bottom">
                <div className="min-w-0">
                  <h5 className="fw-bold fs-6 mb-1 text-dark text-break">Course Curriculum</h5>
                  <div className="text-muted smaller d-flex align-items-center gap-1 flex-wrap" style={{ fontSize: '0.75rem' }}>
                    <span>{modules.length} {modules.length === 1 ? 'Module' : 'Modules'}</span>
                    <span>•</span>
                    <span>{totalLessonsCount} {totalLessonsCount === 1 ? 'Lesson' : 'Lessons'}</span>
                  </div>
                </div>
                <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 rounded-pill px-3 py-1-5 fw-semibold flex-shrink-0" style={{ fontSize: '0.75rem' }}>
                  {completedCount}/{totalLessonsCount} Done
                </span>
              </div>

              {/* Modules & Lessons Accordion */}
              <div className="curriculum-modules-accordion d-flex flex-column gap-3">
                {modules.map((module, mIdx) => {
                  const isExpanded = Boolean(expandedModules[module.id])
                  const moduleLessons = module.lessons || []
                  const moduleCompleted = moduleLessons.filter((l) =>
                    completedLessonIds.includes(l.id)
                  ).length
                  const isModuleAllDone =
                    moduleLessons.length > 0 && moduleCompleted === moduleLessons.length

                  return (
                    <div
                      key={module.id || mIdx}
                      className="curriculum-module-group border rounded-3 overflow-hidden bg-white shadow-xs"
                    >
                      {/* Module Header / Toggle */}
                      <button
                        type="button"
                        className="w-100 p-3 text-start border-0 bg-light d-flex align-items-center justify-content-between cursor-pointer module-header-btn"
                        onClick={() => toggleModule(module.id)}
                        aria-expanded={isExpanded}
                      >
                        <div className="min-w-0 me-3 flex-grow-1">
                          <div className="d-flex flex-wrap align-items-center gap-2 mb-1-5">
                            <span className="badge bg-secondary bg-opacity-25 text-dark rounded-pill fw-bold" style={{ fontSize: '0.68rem', letterSpacing: '0.02em' }}>
                              Module {mIdx + 1}
                            </span>
                            {isModuleAllDone && (
                              <span className="badge bg-success bg-opacity-15 text-success border border-success border-opacity-25 rounded-pill fw-semibold" style={{ fontSize: '0.65rem' }}>
                                Completed ✓
                              </span>
                            )}
                          </div>
                          <div className="fw-bold text-dark module-title-text mb-1" style={{ fontSize: '0.85rem', lineHeight: '1.35', wordBreak: 'break-word' }}>
                            {module.title}
                          </div>
                          <div className="text-muted smaller d-flex align-items-center gap-1 flex-wrap" style={{ fontSize: '0.72rem' }}>
                            <span>{moduleLessons.length} {moduleLessons.length === 1 ? 'Lesson' : 'Lessons'}</span>
                            <span>•</span>
                            <span className={moduleCompleted > 0 ? 'text-primary fw-medium' : ''}>
                              {moduleCompleted}/{moduleLessons.length} Completed
                            </span>
                          </div>
                        </div>

                        <div className="module-chevron-wrap flex-shrink-0 ms-auto">
                          <span
                            className="d-inline-flex align-items-center justify-content-center rounded-circle bg-white shadow-xs text-muted"
                            style={{
                              width: '26px',
                              height: '26px',
                              fontSize: '0.65rem',
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            ▼
                          </span>
                        </div>
                      </button>

                      {/* Lessons List inside Module */}
                      {isExpanded && (
                        <div className="module-lessons-list p-2 bg-white border-top d-flex flex-column gap-2">
                          {moduleLessons.length === 0 ? (
                            <div className="p-3 text-center text-muted small">
                              No lessons published in this module yet.
                            </div>
                          ) : (
                            moduleLessons.map((lesson, lIdx) => {
                              const isCurrent = lesson.id === activeLessonId
                              const isDone = completedLessonIds.includes(lesson.id)

                              return (
                                <div
                                  key={lesson.id}
                                  className={`lesson-curriculum-item p-2-5 px-3 rounded-3 d-flex align-items-center justify-content-between cursor-pointer gap-2 ${
                                    isCurrent
                                      ? 'bg-primary text-white shadow-sm'
                                      : isDone
                                      ? 'bg-light text-dark'
                                      : 'bg-white text-dark border-light-subtle'
                                  }`}
                                  style={{
                                    cursor: 'pointer',
                                    transition: 'all 0.18s ease',
                                    border: isCurrent ? '1px solid #2563eb' : '1px solid #edf2f7',
                                    minHeight: '52px',
                                  }}
                                  onClick={() => handleSelectLesson({ ...lesson, moduleId: module.id, moduleTitle: module.title })}
                                >
                                  <div className="d-flex align-items-center gap-2-5 min-w-0 flex-grow-1">
                                    {/* Status Circle */}
                                    <span
                                      className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold ${
                                        isCurrent
                                          ? 'bg-white text-primary'
                                          : isDone
                                          ? 'bg-success text-white'
                                          : 'bg-secondary bg-opacity-25 text-secondary'
                                      }`}
                                      style={{ width: '24px', height: '24px', fontSize: '0.72rem' }}
                                    >
                                      {isDone ? '✓' : lIdx + 1}
                                    </span>

                                    <div className="min-w-0 flex-grow-1 pe-1">
                                      <div
                                        className={`fw-semibold lesson-row-title ${
                                          isCurrent ? 'text-white' : 'text-dark'
                                        }`}
                                        style={{
                                          fontSize: '0.82rem',
                                          lineHeight: '1.35',
                                          wordBreak: 'break-word',
                                          whiteSpace: 'normal',
                                        }}
                                      >
                                        {lesson.title}
                                      </div>
                                      <div
                                        className={`smaller d-flex align-items-center gap-1-5 flex-wrap mt-0-5 ${
                                          isCurrent ? 'text-white-50' : 'text-muted'
                                        }`}
                                        style={{ fontSize: '0.7rem' }}
                                      >
                                        <span>{lesson.type === 'video' ? '🎥 Video' : '📄 Reading'}</span>
                                        {Array.isArray(lesson.topics) && lesson.topics.length > 0 && (
                                          <span>• {lesson.topics.length} {lesson.topics.length === 1 ? 'Topic' : 'Topics'}</span>
                                        )}
                                        {Array.isArray(lesson.tests) && lesson.tests.length > 0 && (
                                          <span className={isCurrent ? 'text-warning fw-semibold' : 'text-primary fw-semibold'}>
                                            • ⚡ MCQ Test
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {isCurrent && (
                                    <span
                                      className="badge bg-white text-primary rounded-pill flex-shrink-0 ms-1 fw-bold"
                                      style={{ fontSize: '0.65rem', padding: '0.3em 0.6em' }}
                                    >
                                      Active
                                    </span>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Bottom Quick Navigation */}
              <div className="mt-3 pt-3 border-top d-flex justify-content-between align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold flex-fill text-truncate"
                  onClick={handlePrevLesson}
                  disabled={activeIndex <= 0}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary rounded-pill px-3 fw-semibold flex-fill text-truncate"
                  onClick={handleNextLesson}
                  disabled={activeIndex >= allLessons.length - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
