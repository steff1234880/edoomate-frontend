import React, { useState, useEffect, useCallback, useRef } from 'react'
import { courseService } from '../../services/courseService'
import { authService } from '../../services/authService'

/**
 * Format percentage values with a maximum of 2 decimal places,
 * eliminating floating-point precision artifacts (e.g., 62.045000000000001 -> 62.05).
 */
const formatMasteryPercent = (val) => {
  if (val === null || val === undefined || isNaN(Number(val))) return '0'
  const num = Number(val)
  return Number(Math.round(Number(num + 'e+2')) + 'e-2').toString()
}

export default function AnalyticsView({ onBack, onOpenLesson, onOpenCourse }) {
  // Navigation level: 'overview' | 'course' | 'unit' | 'lesson'
  const [level, setLevel] = useState('overview')

  // Selected hierarchy identifiers
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedUnitId, setSelectedUnitId] = useState(null)
  const [selectedLessonId, setSelectedLessonId] = useState(null)

  // Preserved metadata across levels
  const [selectedCourseMeta, setSelectedCourseMeta] = useState(null)
  const [selectedUnitMeta, setSelectedUnitMeta] = useState(null)
  const [selectedLessonMeta, setSelectedLessonMeta] = useState(null)

  // Data states
  const [overviewData, setOverviewData] = useState(null)
  const [aggregatedOverview, setAggregatedOverview] = useState(null)
  const [availableCourses, setAvailableCourses] = useState([])
  const [courseAnalytics, setCourseAnalytics] = useState(null)
  const [unitAnalytics, setUnitAnalytics] = useState(null)
  const [lessonAnalytics, setLessonAnalytics] = useState(null)

  // Refs to avoid stale closures in hash sync
  const courseAnalyticsRef = useRef(courseAnalytics)
  const unitAnalyticsRef = useRef(unitAnalytics)
  useEffect(() => {
    courseAnalyticsRef.current = courseAnalytics
  }, [courseAnalytics])
  useEffect(() => {
    unitAnalyticsRef.current = unitAnalytics
  }, [unitAnalytics])

  // Active tab in lesson analytics: 'topics' | 'videos' | 'readables' | 'tests'
  const [activeLessonTab, setActiveLessonTab] = useState('topics')

  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [authError, setAuthError] = useState(null) // 'AUTH_MISSING' | 'AUTH_EXPIRED' | null

  // -------------------------------------------------------------------------
  // URL Hash Synchronisation & Deep Linking
  // -------------------------------------------------------------------------
  const parseHashParams = () => {
    const raw = window.location.hash || ''
    const parts = raw.split('?')
    const params = new URLSearchParams(parts[1] || '')
    return {
      courseId: params.get('courseId'),
      unitId: params.get('unitId'),
      lessonId: params.get('lessonId'),
    }
  }

  const updateHash = (cId = null, uId = null, lId = null) => {
    const params = new URLSearchParams()
    if (cId) params.set('courseId', String(cId))
    if (uId) params.set('unitId', String(uId))
    if (lId) params.set('lessonId', String(lId))
    const query = params.toString()
    window.location.hash = query ? `#analytics?${query}` : '#analytics'
  }

  // -------------------------------------------------------------------------
  // API Fetch Functions
  // -------------------------------------------------------------------------
  const fetchOverview = useCallback(async () => {
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
      // 1. Fetch Student Overall Analytics, Catalog Courses, and My Learning in parallel
      const [progressRes, catalogCourses, myLearning] = await Promise.all([
        courseService.getStudentAnalytics(token).catch(() => null),
        courseService.getCourses().catch(() => []),
        courseService.getMyLearningCourses(token).catch(() => null),
      ])

      const rawProgress = progressRes?.data || progressRes || null
      setOverviewData(rawProgress)

      const activeList = Array.isArray(myLearning?.data?.active_courses)
        ? myLearning.data.active_courses
        : Array.isArray(myLearning?.active_courses)
        ? myLearning.active_courses
        : Array.isArray(myLearning?.data)
        ? myLearning.data
        : []

      const expiredList = Array.isArray(myLearning?.data?.expired_courses)
        ? myLearning.data.expired_courses
        : Array.isArray(myLearning?.expired_courses)
        ? myLearning.expired_courses
        : []

      const expiredIds = new Set(
        expiredList.map((c) => String(c.id || c.course_id).replace(/^api-/, ''))
      )

      // Build unified courses map (clean normalized IDs)
      const courseMap = new Map()

      // Add active courses
      activeList.forEach((c) => {
        const rawId = c.id || c.course_id
        if (rawId) {
          const cleanId = String(rawId).replace(/^api-/, '')
          courseMap.set(cleanId, {
            ...c,
            id: Number(cleanId) || cleanId,
            is_expired: false,
            is_enrolled: true,
          })
        }
      })

      // Add expired courses (flagged: ensure they do NOT contribute to active progress)
      expiredList.forEach((c) => {
        const rawId = c.id || c.course_id
        if (rawId) {
          const cleanId = String(rawId).replace(/^api-/, '')
          if (!courseMap.has(cleanId)) {
            courseMap.set(cleanId, {
              ...c,
              id: Number(cleanId) || cleanId,
              is_expired: true,
              is_enrolled: true,
            })
          }
        }
      })

      // If active courses list was empty from myLearning, check catalog courses to populate user's curriculum
      if (Array.isArray(catalogCourses)) {
        catalogCourses.forEach((c) => {
          if (c.id) {
            const cleanId = String(c.id).replace(/^api-/, '')
            if (!courseMap.has(cleanId)) {
              courseMap.set(cleanId, {
                ...c,
                id: Number(cleanId) || cleanId,
                is_expired: expiredIds.has(cleanId),
                is_enrolled: true,
              })
            }
          }
        })
      }

      const allCourseList = Array.from(courseMap.values())

      // 2. Fetch ground-truth Course Analytics for all courses to calculate real metrics
      const courseAnalyticsResults = await Promise.allSettled(
        allCourseList.map(async (c) => {
          try {
            const aData = await courseService.getCourseAnalytics(c.id, token)
            return { id: String(c.id), analytics: aData }
          } catch {
            return { id: String(c.id), analytics: null }
          }
        })
      )

      const analyticsByCourseId = new Map()
      courseAnalyticsResults.forEach((res) => {
        if (res.status === 'fulfilled' && res.value?.analytics) {
          analyticsByCourseId.set(res.value.id, res.value.analytics)
        }
      })

      // Attach actual real-time progress to each course object
      const enrichedCourses = allCourseList.map((c) => {
        const a = analyticsByCourseId.get(String(c.id))
        const realProg =
          a?.current_status?.progress_percentage ??
          a?.course_progress_percentage ??
          c.progress ??
          0
        return {
          ...c,
          progress:
            typeof realProg === 'number'
              ? Math.round(realProg * 10) / 10
              : Number(realProg) || 0,
          analytics: a || null,
        }
      })

      setAvailableCourses(enrichedCourses)

      // 3. Compute accurate, ground-truth Overall Analytics from active courses
      // CRITICAL: Expired courses do not contribute to active learning progress
      const activeCoursesOnly = enrichedCourses.filter((c) => !c.is_expired)

      let totalTests = 0
      let attendedTests = 0
      let totalTopics = 0
      let watchedTopics = 0
      let totalVideos = 0
      let watchedVideos = 0
      let totalReadables = 0
      let watchedReadables = 0
      let totalProgressSum = 0
      let completedUnits = 0
      let totalUnits = 0
      let totalMinutes = 0
      let completedCoursesCount = 0
      let inProgressCoursesCount = 0

      activeCoursesOnly.forEach((c) => {
        const a = c.analytics
        const prog = Number(c.progress || 0)
        if (prog >= 100) completedCoursesCount++
        else if (prog > 0) inProgressCoursesCount++

        totalProgressSum += prog

        if (a) {
          totalTests += Number(a.total_tests ?? a.media_statistics?.tests?.total ?? 0)
          attendedTests += Number(a.attended_tests ?? a.media_statistics?.tests?.completed ?? 0)
          totalTopics += Number(a.total_topics ?? a.media_statistics?.topics?.total ?? 0)
          watchedTopics += Number(a.watched_topics ?? a.media_statistics?.topics?.completed ?? 0)
          totalVideos += Number(a.total_videos ?? a.media_statistics?.videos?.total ?? 0)
          watchedVideos += Number(a.watched_videos ?? a.media_statistics?.videos?.completed ?? 0)
          totalReadables += Number(a.total_readables ?? a.media_statistics?.readable?.total ?? 0)
          watchedReadables += Number(a.watched_readables ?? a.media_statistics?.readable?.completed ?? 0)
          completedUnits += Number(a.current_status?.completed_units ?? 0)
          totalUnits += Number(a.current_status?.total_units ?? a.units?.length ?? 0)
          if (Array.isArray(a.time_investment?.units)) {
            a.time_investment.units.forEach((u) => {
              totalMinutes += Number(u.minutes || 0)
            })
          }
        }
      })

      const calculatedAvgProgress =
        activeCoursesOnly.length > 0
          ? Math.round((totalProgressSum / activeCoursesOnly.length) * 10) / 10
          : 0

      // Format time spent as HH:MM:SS
      const hours = Math.floor(totalMinutes / 60)
      const mins = totalMinutes % 60
      const formattedTimeSpent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`

      // If backend overall_details has non-zero non-placeholder values, use them, otherwise use calculated real values
      const backendDetails = rawProgress?.overall_details || {}
      const backendEnrolled = Number(backendDetails.courses_enrolled || 0)
      const backendTotalProg = Number(backendDetails.total_progress || 0)
      const backendTime =
        backendDetails.total_time_spent && backendDetails.total_time_spent !== '00:00:00'
          ? backendDetails.total_time_spent
          : formattedTimeSpent

      // Build authoritative aggregated overview
      setAggregatedOverview({
        totalCourses: backendEnrolled > 0 ? backendEnrolled : activeCoursesOnly.length,
        completedCourses: completedCoursesCount,
        inProgressCourses: inProgressCoursesCount,
        totalProgress: backendTotalProg > 0 ? backendTotalProg : calculatedAvgProgress,
        totalTests,
        testsAttended: attendedTests,
        totalTopics,
        topicsWatched: watchedTopics,
        totalVideos,
        videosWatched: watchedVideos,
        totalReadables,
        readablesWatched: watchedReadables,
        totalUnits,
        completedUnits,
        totalTimeSpentFormatted: backendTime,
      })
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') setAuthError('AUTH_EXPIRED')
      else if (err.code === 'AUTH_MISSING') setAuthError('AUTH_MISSING')
      else setErrorMessage(err.message || 'Unable to load learning analytics.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchCourseAnalytics = useCallback(async (courseId) => {
    setIsLoading(true)
    setErrorMessage(null)
    setAuthError(null)
    setCourseAnalytics(null) // Prevent stale data from previous course

    const token = authService.getToken()
    if (!token) {
      setAuthError('AUTH_MISSING')
      setIsLoading(false)
      return
    }

    try {
      const data = await courseService.getCourseAnalytics(courseId, token)
      setCourseAnalytics(data)
      if (data?.course_title) {
        setSelectedCourseMeta((prev) => ({
          ...prev,
          id: courseId,
          title: data.course_title,
          subject: data.course_subject,
          thumbnail: data.course_thumbnail_url,
        }))
      }
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') setAuthError('AUTH_EXPIRED')
      else if (err.code === 'AUTH_MISSING') setAuthError('AUTH_MISSING')
      else setErrorMessage(err.message || 'Unable to load course analytics.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchUnitAnalytics = useCallback(async (unitId) => {
    setIsLoading(true)
    setErrorMessage(null)
    setAuthError(null)
    setUnitAnalytics(null) // Prevent stale data from previous unit

    const token = authService.getToken()
    if (!token) {
      setAuthError('AUTH_MISSING')
      setIsLoading(false)
      return
    }

    try {
      const data = await courseService.getUnitAnalytics(unitId, token)
      setUnitAnalytics(data)
      if (data?.unit_details?.unit_name) {
        setSelectedUnitMeta((prev) => ({
          ...prev,
          id: unitId,
          title: data.unit_details.unit_name,
        }))
      }
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') setAuthError('AUTH_EXPIRED')
      else if (err.code === 'AUTH_MISSING') setAuthError('AUTH_MISSING')
      else setErrorMessage(err.message || 'Unable to load unit analytics.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchLessonAnalytics = useCallback(async (lessonId) => {
    setIsLoading(true)
    setErrorMessage(null)
    setAuthError(null)
    setLessonAnalytics(null) // Prevent stale data from previous lesson

    const token = authService.getToken()
    if (!token) {
      setAuthError('AUTH_MISSING')
      setIsLoading(false)
      return
    }

    try {
      const [analyticsData, lessonDetails] = await Promise.all([
        courseService.getLessonAnalytics(lessonId, token).catch(() => null),
        courseService.getLessonDetails(lessonId, token).catch(() => null),
      ])

      // Merge tests from lessonDetails so that tests assigned to the lesson are visible even if unattempted
      const rawTests = Array.isArray(analyticsData?.tests) ? [...analyticsData.tests] : []
      const detailElements = lessonDetails?.lesson_link_details || lessonDetails?.elements || []
      const assignedTests = detailElements.filter((e) => e.element_type === 'test')

      assignedTests.forEach((at) => {
        const atId = at.element_id || at.id
        const cleanAtId = String(atId).replace(/^test-/, '')
        const existing = rawTests.find(
          (t) => String(t.test_id || t.id).replace(/^test-/, '') === cleanAtId
        )
        const storedResult = courseService.getStoredTestResult(cleanAtId)
        if (!existing) {
          rawTests.push({
            test_id: Number(cleanAtId) || cleanAtId,
            test_name: at.title || `Test #${cleanAtId}`,
            status: at.status || 'ACTIVE',
            score: storedResult?.score_percentage ?? undefined,
            is_active: courseService.isMcqActive(at),
          })
        } else if (storedResult && existing.score === undefined) {
          existing.score = storedResult.score_percentage
        }
      })

      // Also merge videos & readables from details if analytics arrays are empty
      let videos = Array.isArray(analyticsData?.videos) ? analyticsData.videos : []
      if (videos.length === 0) {
        const assignedVideos = detailElements.filter((e) => e.element_type === 'video')
        videos = assignedVideos.map((v) => ({
          video_id: v.element_id || v.id,
          video_name: v.title || 'Video Lecture',
          watch_count: 0,
        }))
      }

      let readables = Array.isArray(analyticsData?.readables) ? analyticsData.readables : []
      if (readables.length === 0) {
        const assignedReadables = detailElements.filter((e) => e.element_type === 'readable')
        readables = assignedReadables.map((r) => ({
          readable_id: r.element_id || r.id,
          readable_name: r.title || 'Study Guide',
          watch_count: 0,
        }))
      }

      setLessonAnalytics({
        ...(analyticsData || {}),
        tests: rawTests,
        videos,
        readables,
        topics: Array.isArray(analyticsData?.topics) ? analyticsData.topics : [],
      })
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') setAuthError('AUTH_EXPIRED')
      else if (err.code === 'AUTH_MISSING') setAuthError('AUTH_MISSING')
      else setErrorMessage(err.message || 'Unable to load lesson analytics.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Lifecycle & Hash Navigation Listeners
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleHashSync = () => {
      const { courseId, unitId, lessonId } = parseHashParams()

      if (lessonId && unitId && courseId) {
        setLevel('lesson')
        setSelectedCourseId(courseId)
        setSelectedUnitId(unitId)
        setSelectedLessonId(lessonId)
        fetchLessonAnalytics(lessonId)
        if (!unitAnalyticsRef.current) fetchUnitAnalytics(unitId)
        if (!courseAnalyticsRef.current) fetchCourseAnalytics(courseId)
      } else if (unitId && courseId) {
        setLevel('unit')
        setSelectedCourseId(courseId)
        setSelectedUnitId(unitId)
        setSelectedLessonId(null)
        setLessonAnalytics(null)
        fetchUnitAnalytics(unitId)
        if (!courseAnalyticsRef.current) fetchCourseAnalytics(courseId)
      } else if (courseId) {
        setLevel('course')
        setSelectedCourseId(courseId)
        setSelectedUnitId(null)
        setSelectedLessonId(null)
        setUnitAnalytics(null)
        setLessonAnalytics(null)
        fetchCourseAnalytics(courseId)
      } else {
        setLevel('overview')
        setSelectedCourseId(null)
        setSelectedUnitId(null)
        setSelectedLessonId(null)
        fetchOverview()
      }
    }

    handleHashSync()
    window.addEventListener('hashchange', handleHashSync)

    // Listen to real-time progress & test completion events dispatched across Edoomate
    const handleAnalyticsUpdate = () => {
      const { courseId, unitId, lessonId } = parseHashParams()
      if (lessonId) fetchLessonAnalytics(lessonId)
      else if (unitId) fetchUnitAnalytics(unitId)
      else if (courseId) fetchCourseAnalytics(courseId)
      else fetchOverview()
    }
    window.addEventListener('edoomate_analytics_updated', handleAnalyticsUpdate)

    return () => {
      window.removeEventListener('hashchange', handleHashSync)
      window.removeEventListener('edoomate_analytics_updated', handleAnalyticsUpdate)
    }
  }, [fetchCourseAnalytics, fetchLessonAnalytics, fetchOverview, fetchUnitAnalytics])

  // -------------------------------------------------------------------------
  // Navigation Handlers
  // -------------------------------------------------------------------------
  const navigateToOverview = () => {
    updateHash(null, null, null)
  }

  const navigateToCourse = (course) => {
    const cId = course.id || course.course_id
    setSelectedCourseMeta({
      id: cId,
      title: course.title || course.course_title || course.name || `Course ${cId}`,
      subject: course.subject || course.course_subject || null,
      thumbnail: course.video_thumbnails_url || course.course_thumbnail_url || course.thumbnail || null,
    })
    updateHash(cId, null, null)
  }

  const navigateToUnit = (unit) => {
    const uId = unit.unit_id || unit.id
    setSelectedUnitMeta({
      id: uId,
      title: unit.title || unit.unit_name || `Unit ${uId}`,
      unit_number: unit.unit_number || null,
    })
    updateHash(selectedCourseId, uId, null)
  }

  const navigateToLesson = (lesson) => {
    const lId = lesson.lesson_id || lesson.id
    setSelectedLessonMeta({
      id: lId,
      title: lesson.lesson_name || lesson.title || `Lesson ${lId}`,
      duration: lesson.duration || '00:00:00',
      score: lesson.score_percentage ?? 0,
      progress: lesson.progress_percentage ?? 0,
      comment: lesson.comment || 'N/A',
      completed_items: lesson.completed_items ?? 0,
      total_items: lesson.total_items ?? 0,
      is_completed: lesson.is_completed || false,
    })
    updateHash(selectedCourseId, selectedUnitId, lId)
  }

  const handleOpenLessonInLearning = (materialParams = {}) => {
    if (onOpenLesson) {
      onOpenLesson(
        selectedCourseMeta || selectedCourseId,
        selectedLessonMeta || selectedLessonId,
        materialParams
      )
    } else {
      // Direct navigation fallback via React Router compatible URL
      const cId = selectedCourseId
      const lId = selectedLessonId
      const searchObj = new URLSearchParams()
      if (cId) searchObj.set('courseId', String(cId))
      if (lId) searchObj.set('lessonId', String(lId))
      if (materialParams?.tab) searchObj.set('tab', materialParams.tab)
      if (materialParams?.mode) searchObj.set('mode', materialParams.mode)
      if (materialParams?.testId) searchObj.set('testId', String(materialParams.testId))
      if (materialParams?.videoId) searchObj.set('videoId', String(materialParams.videoId))
      const searchStr = searchObj.toString() ? `?${searchObj.toString()}` : ''
      window.location.href = `/learning${searchStr}`
    }
  }

  const handleHeaderBack = () => {
    if (level === 'lesson') {
      updateHash(selectedCourseId, selectedUnitId, null)
    } else if (level === 'unit') {
      updateHash(selectedCourseId, null, null)
    } else if (level === 'course') {
      updateHash(null, null, null)
    } else {
      if (onBack) onBack()
    }
  }

  const handleReLogin = () => {
    authService.logout()
    window.location.hash = '#login'
  }

  const handleRefresh = () => {
    if (level === 'lesson') fetchLessonAnalytics(selectedLessonId)
    else if (level === 'unit') fetchUnitAnalytics(selectedUnitId)
    else if (level === 'course') fetchCourseAnalytics(selectedCourseId)
    else fetchOverview()
  }

  // -------------------------------------------------------------------------
  // Correct Metrics Extraction Helpers (Tests Taken & Units Completed)
  // -------------------------------------------------------------------------
  // Helper to extract actual tests taken by student from response data
  const getTestsAttendedDisplay = (source) => {
    if (!source) return '0'
    // 1. Direct number from course analytics: attended_tests
    if (typeof source.attended_tests === 'number') {
      return String(source.attended_tests)
    }
    // 2. Direct number or string from media_statistics.tests.completed
    if (typeof source.media_statistics?.tests?.completed === 'number') {
      return String(source.media_statistics.tests.completed)
    }
    // 3. From overview overall_details: tests_attended (e.g. '0/0' or numeric)
    const rawAttended = source.overall_details?.tests_attended ?? source.tests_attended
    if (typeof rawAttended === 'number') {
      return String(rawAttended)
    }
    if (typeof rawAttended === 'string') {
      const parts = rawAttended.split('/')
      const taken = parseInt(parts[0], 10)
      if (!isNaN(taken)) return String(taken)
      return rawAttended
    }
    return '0'
  }

  // Helper to extract actual number of units completed from unit-level data
  const getUnitsCompletedCount = (analytics) => {
    if (!analytics) return 0
    // Check if unit list is available: count actual completed units directly from unit-level data
    if (Array.isArray(analytics.units) && analytics.units.length > 0) {
      const completedFromList = analytics.units.filter((u) => {
        if (u.is_completed === true) return true
        const prog = u.progress_percentage ?? u.unit_progress_percentage ?? u.completion_percentage ?? u.unit_completion_percentage
        if (typeof prog === 'number' && prog >= 100) return true
        return false
      }).length
      return completedFromList
    }
    // Fallback to current_status.completed_units if units array is empty/absent
    if (typeof analytics.current_status?.completed_units === 'number') {
      return analytics.current_status.completed_units
    }
    return 0
  }

  // Helper to get total number of units for a course
  const getTotalUnitsCount = (analytics) => {
    if (!analytics) return 0
    if (Array.isArray(analytics.units) && analytics.units.length > 0) {
      return analytics.units.length
    }
    if (typeof analytics.current_status?.total_units === 'number') {
      return analytics.current_status.total_units
    }
    return 0
  }

  // Helper to check if a specific unit is completed from unit-level fields
  const isUnitCompleted = (unit) => {
    if (!unit) return false
    if (unit.is_completed === true) return true
    const progress = unit.progress_percentage ?? unit.unit_progress_percentage ?? unit.completion_percentage ?? unit.unit_completion_percentage
    if (typeof progress === 'number' && progress >= 100) return true
    if (unit.lessons_total && unit.lessons_completed && unit.lessons_completed >= unit.lessons_total) return true
    return false
  }

  // Helper to get unit progress status: 'completed' | 'in-progress' | 'not-started'
  const getUnitStatus = (unit) => {
    if (isUnitCompleted(unit)) return 'completed'
    const progress = Number(unit.progress_percentage ?? unit.unit_progress_percentage ?? unit.completion_percentage ?? unit.unit_completion_percentage ?? 0)
    const completedLessons = Number(unit.lessons_completed ?? 0)
    if (progress > 0 || completedLessons > 0) return 'in-progress'
    return 'not-started'
  }

  // -------------------------------------------------------------------------
  // Best Performing Lesson & Recommended Focus Area Calculation
  // -------------------------------------------------------------------------
  const computeLessonHighlights = (lessons) => {
    if (!Array.isArray(lessons) || lessons.length === 0) {
      return { bestLesson: null, lowestLesson: null }
    }

    // Lessons with any recorded score, progress, or completion
    const activeLessons = lessons.filter(
      (l) => Number(l.score_percentage || 0) > 0 || Number(l.progress_percentage || 0) > 0 || l.is_completed
    )

    let best = null
    let lowest = null

    if (activeLessons.length > 0) {
      // Best lesson has highest score, then highest progress
      best = [...activeLessons].sort((a, b) => {
        const scoreDiff = (Number(b.score_percentage) || 0) - (Number(a.score_percentage) || 0)
        if (scoreDiff !== 0) return scoreDiff
        return (Number(b.progress_percentage) || 0) - (Number(a.progress_percentage) || 0)
      })[0]

      // Focus area: lessons that are not 100% complete, prioritizing lowest score/progress
      const incomplete = lessons.filter((l) => !l.is_completed && (Number(l.progress_percentage) || 0) < 100)
      if (incomplete.length > 0) {
        lowest = [...incomplete].sort((a, b) => {
          const scoreDiff = (Number(a.score_percentage) || 0) - (Number(b.score_percentage) || 0)
          if (scoreDiff !== 0) return scoreDiff
          return (Number(a.progress_percentage) || 0) - (Number(b.progress_percentage) || 0)
        })[0]
      } else if (lessons.length > 1) {
        lowest = [...lessons].sort(
          (a, b) => (Number(a.score_percentage) || 0) - (Number(b.score_percentage) || 0)
        )[0]
      }
    } else {
      best = lessons[0]
      lowest = lessons.length > 1 ? lessons[1] : lessons[0]
    }

    return {
      bestLesson: best
        ? {
            ...best,
            score_percentage: Number(best.score_percentage ?? best.progress_percentage ?? 0),
            duration: best.duration || '00:00:00',
            comment: best.comment || (Number(best.score_percentage || 0) >= 70 ? 'Excellent' : 'In Progress'),
          }
        : null,
      lowestLesson: lowest
        ? {
            ...lowest,
            score_percentage: Number(lowest.score_percentage ?? lowest.progress_percentage ?? 0),
            duration: lowest.duration || '00:00:00',
            comment: lowest.comment || 'Needs Focus',
          }
        : null,
    }
  }

  // -------------------------------------------------------------------------
  // Performance Comment Helper Badge Styling
  // -------------------------------------------------------------------------
  const getCommentBadgeClass = (comment) => {
    const lower = String(comment || '').toLowerCase()
    if (lower.includes('excellent') || lower.includes('great')) return 'bg-success text-white'
    if (lower.includes('good')) return 'bg-info text-white'
    if (lower.includes('average') || lower.includes('fair')) return 'bg-warning text-dark'
    if (lower.includes('poor') || lower.includes('needs')) return 'bg-danger text-white'
    return 'bg-secondary text-white'
  }

  // -------------------------------------------------------------------------
  // Render: Authentication & Global Error States
  // -------------------------------------------------------------------------
  if (authError === 'AUTH_MISSING') {
    return (
      <div className="analytics-view animate-fade-in p-4">
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-4">
          <div className="display-5 mb-3">🔒</div>
          <h4 className="fw-bold text-dark mb-2">Authentication Required</h4>
          <p className="text-muted small mb-4" style={{ maxWidth: '420px', margin: '0 auto' }}>
            Please log in to your student account to view your learning progress and performance analytics.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              onClick={() => {
                window.location.hash = '#login'
              }}
              id="btn-login-redirect-analytics"
            >
              Log In to Edoomate →
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (authError === 'AUTH_EXPIRED') {
    return (
      <div className="analytics-view animate-fade-in p-4">
        <div className="card border-0 rounded-4 shadow-sm p-5 text-center bg-white my-4">
          <div className="display-5 mb-3">⏳</div>
          <h4 className="fw-bold text-dark mb-2">Session Expired</h4>
          <p className="text-muted small mb-4" style={{ maxWidth: '420px', margin: '0 auto' }}>
            Your login session has expired. Please log in again to continue viewing your learning analytics.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 fw-semibold"
              onClick={handleReLogin}
              id="btn-relogin-redirect-analytics"
            >
              Log In Again →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="analytics-view animate-fade-in">
      {/* ===================================================================== */}
      {/* TOP HEADER & BREADCRUMB NAVIGATION                                    */}
      {/* ===================================================================== */}
      <div className="d-flex flex-wrap align-items-center justify-content-between p-3 bg-white border-bottom rounded-4 mb-4 shadow-sm gap-3">
        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            onClick={handleHeaderBack}
            id="btn-back-analytics"
            aria-label={level === 'overview' ? 'Back to Dashboard' : 'Back'}
            title={level === 'overview' ? 'Back to Dashboard' : 'Back'}
            style={{ width: '32px', height: '32px', padding: 0 }}
          >
            ←
          </button>
          <div>
            {/* Interactive Breadcrumb */}
            <div className="d-flex flex-wrap align-items-center gap-1.5 small text-muted mb-1" style={{ fontSize: '0.78rem' }}>
              <span
                role="button"
                className={`text-decoration-none ${level === 'overview' ? 'fw-bold text-dark' : 'text-primary'}`}
                onClick={navigateToOverview}
              >
                Analytics
              </span>
              {selectedCourseMeta && level !== 'overview' && (
                <>
                  <span className="text-muted">/</span>
                  <span
                    role="button"
                    className={`text-decoration-none text-truncate ${level === 'course' ? 'fw-bold text-dark' : 'text-primary'}`}
                    style={{ maxWidth: '140px' }}
                    onClick={() => updateHash(selectedCourseId, null, null)}
                    title={selectedCourseMeta.title}
                  >
                    {selectedCourseMeta.title}
                  </span>
                </>
              )}
              {selectedUnitMeta && (level === 'unit' || level === 'lesson') && (
                <>
                  <span className="text-muted">/</span>
                  <span
                    role="button"
                    className={`text-decoration-none text-truncate ${level === 'unit' ? 'fw-bold text-dark' : 'text-primary'}`}
                    style={{ maxWidth: '140px' }}
                    onClick={() => updateHash(selectedCourseId, selectedUnitId, null)}
                    title={selectedUnitMeta.title}
                  >
                    {selectedUnitMeta.title}
                  </span>
                </>
              )}
              {selectedLessonMeta && level === 'lesson' && (
                <>
                  <span className="text-muted">/</span>
                  <span
                    className="fw-bold text-dark text-truncate"
                    style={{ maxWidth: '140px' }}
                    title={selectedLessonMeta.title}
                  >
                    {selectedLessonMeta.title}
                  </span>
                </>
              )}
            </div>
            <h4 className="mb-0 fw-bold fs-6 text-dark">
              {level === 'lesson'
                ? selectedLessonMeta?.title || 'Lesson Analytics'
                : level === 'unit'
                ? selectedUnitMeta?.title || 'Unit Analytics'
                : level === 'course'
                ? selectedCourseMeta?.title || 'Course Analytics'
                : 'Learning Analytics Overview'}
            </h4>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* Quick Course Selector Dropdown when available */}
          {availableCourses.length > 0 && (
            <div className="d-none d-sm-block">
              <select
                className="form-select form-select-sm rounded-pill fw-semibold border text-dark"
                value={selectedCourseId || ''}
                onChange={(e) => {
                  const val = e.target.value
                  if (val) {
                    const c = availableCourses.find((x) => String(x.id) === String(val))
                    if (c) navigateToCourse(c)
                  } else {
                    navigateToOverview()
                  }
                }}
                id="select-course-analytics-nav"
                style={{ maxWidth: '200px' }}
              >
                <option value="">All Courses Overview</option>
                {availableCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || c.name || `Course ${c.id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="btn btn-light btn-sm rounded-pill px-3 fw-semibold border d-flex align-items-center gap-1.5"
            onClick={handleRefresh}
            disabled={isLoading}
            id="btn-refresh-analytics"
            title="Refresh current analytics data"
          >
            <span>🔄</span> Refresh
          </button>
        </div>
      </div>

      {/* API Error State */}
      {errorMessage && (
        <div className="card border-0 rounded-4 shadow-sm p-4 text-center bg-white my-4">
          <div className="display-6 mb-2 text-danger">⚠️</div>
          <h5 className="fw-bold text-dark mb-1">Unable to Load Analytics</h5>
          <p className="text-muted small mb-3" style={{ maxWidth: '440px', margin: '0 auto' }}>
            {errorMessage}
          </p>
          <div className="d-flex justify-content-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm rounded-pill px-4 fw-semibold"
              onClick={handleRefresh}
            >
              🔄 Try Again
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm rounded-pill px-4"
              onClick={handleHeaderBack}
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Loading Spinner */}
      {isLoading && (
        <div className="text-center py-5">
          <div
            className="spinner-border text-primary mb-3"
            style={{ width: '2.5rem', height: '2.5rem' }}
            role="status"
          >
            <span className="visually-hidden">Loading analytics...</span>
          </div>
          <h6 className="fw-semibold text-secondary">
            {level === 'lesson'
              ? 'Loading lesson analytics...'
              : level === 'unit'
              ? 'Loading unit analytics...'
              : level === 'course'
              ? 'Loading course analytics...'
              : 'Fetching real-time curriculum analytics...'}
          </h6>
          <p className="text-muted small">Connecting to Edoomate server</p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LEVEL 3: LESSON ANALYTICS VIEW                                        */}
      {/* Endpoint: GET /api/lesson/analytics/{lesson_id}                       */}
      {/* ===================================================================== */}
      {!isLoading && !errorMessage && level === 'lesson' && (
        <div className="lesson-analytics-view animate-fade-in">
          {/* Lesson Hero Card */}
          <div
            className="card border-0 rounded-4 shadow-sm p-4 mb-4 text-white position-relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)',
            }}
          >
            <div className="row align-items-center g-3 position-relative" style={{ zIndex: 2 }}>
              <div className="col-12 col-md-8">
                <span
                  className="badge bg-white bg-opacity-25 rounded-pill px-3 py-1 mb-2 fw-semibold"
                  style={{ fontSize: '0.75rem' }}
                >
                  📖 Lesson Mastery & Activity Details
                </span>
                <h3 className="fw-bolder mb-2" style={{ fontSize: 'clamp(1.2rem, 2vw, 1.6rem)' }}>
                  {selectedLessonMeta?.title || 'Lesson Analytics'}
                </h3>
                <p className="mb-0 opacity-90 small" style={{ maxWidth: '520px', lineHeight: 1.5 }}>
                  Detailed tracking of curriculum topics, lecture videos, reading guides, and assessments for this lesson.
                </p>
              </div>

              {/* Performance & Score Indicators and Open Lesson Action */}
              <div className="col-12 col-md-4 text-md-end">
                <div className="d-flex flex-wrap gap-2 justify-content-md-end align-items-center">
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '90px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <div className="fs-3 fw-bold text-white mb-0">
                      {selectedLessonMeta?.score ?? 0}%
                    </div>
                    <span className="smaller opacity-90 fw-semibold text-white">Score</span>
                  </div>
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '90px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <div className="fs-3 fw-bold text-white mb-0">
                      {selectedLessonMeta?.progress ?? 0}%
                    </div>
                    <span className="smaller opacity-90 fw-semibold text-white">Progress</span>
                  </div>

                  <div className="w-100 mt-2 text-md-end">
                    <button
                      type="button"
                      className="btn btn-light rounded-pill px-4 py-2 fw-bold shadow-sm d-inline-flex align-items-center gap-2 text-primary"
                      onClick={() => handleOpenLessonInLearning({ tab: 'materials' })}
                      id="btn-open-lesson-learning"
                    >
                      <span>▶</span>
                      <span>Start / Resume Lesson</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lesson KPI Metrics Bar */}
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                  Study Duration
                </span>
                <div className="fw-bolder fs-5 text-dark mt-1">
                  {selectedLessonMeta?.duration || '00:00:00'}
                </div>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>Active study time</span>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                  Performance
                </span>
                <div className="mt-1">
                  <span className={`badge rounded-pill px-3 py-1 ${getCommentBadgeClass(selectedLessonMeta?.comment)}`}>
                    {selectedLessonMeta?.comment || 'N/A'}
                  </span>
                </div>
                <span className="text-muted smaller mt-1" style={{ fontSize: '0.72rem' }}>Evaluation rating</span>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                  Topics Covered
                </span>
                <div className="fw-bolder fs-5 text-dark mt-1">
                  {Array.isArray(lessonAnalytics?.topics) ? lessonAnalytics.topics.length : 0}
                </div>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>Subject concepts</span>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                  Media Elements
                </span>
                <div className="fw-bolder fs-5 text-dark mt-1">
                  {(lessonAnalytics?.videos?.length || 0) + (lessonAnalytics?.readables?.length || 0)}
                </div>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>Videos + Reading items</span>
              </div>
            </div>
          </div>

          {/* Lesson Element Sections (Tabs) */}
          <div className="card border-0 rounded-4 p-4 bg-white shadow-sm mb-4">
            {/* Tabs Bar */}
            <div className="d-flex flex-wrap gap-2 border-bottom pb-3 mb-4">
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  activeLessonTab === 'topics' ? 'btn-primary' : 'btn-light border'
                }`}
                onClick={() => setActiveLessonTab('topics')}
                id="tab-lesson-topics"
              >
                🧩 Topics ({Array.isArray(lessonAnalytics?.topics) ? lessonAnalytics.topics.length : 0})
              </button>
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  activeLessonTab === 'videos' ? 'btn-primary' : 'btn-light border'
                }`}
                onClick={() => setActiveLessonTab('videos')}
                id="tab-lesson-videos"
              >
                🎥 Video Lectures ({Array.isArray(lessonAnalytics?.videos) ? lessonAnalytics.videos.length : 0})
              </button>
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  activeLessonTab === 'readables' ? 'btn-primary' : 'btn-light border'
                }`}
                onClick={() => setActiveLessonTab('readables')}
                id="tab-lesson-readables"
              >
                📖 Study Guides ({Array.isArray(lessonAnalytics?.readables) ? lessonAnalytics.readables.length : 0})
              </button>
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  activeLessonTab === 'tests' ? 'btn-primary' : 'btn-light border'
                }`}
                onClick={() => setActiveLessonTab('tests')}
                id="tab-lesson-tests"
              >
                📝 Tests & Quizzes ({Array.isArray(lessonAnalytics?.tests) ? lessonAnalytics.tests.length : 0})
              </button>
            </div>

            {/* TAB CONTENT: 1. Topics */}
            {activeLessonTab === 'topics' && (
              <div>
                {Array.isArray(lessonAnalytics?.topics) && lessonAnalytics.topics.length > 0 ? (
                  <div className="row g-3">
                    {lessonAnalytics.topics.map((t, idx) => (
                      <div key={t.topic_id || idx} className="col-12 col-md-6">
                        <div
                          className="p-3 rounded-4 border bg-light bg-opacity-25 d-flex align-items-center justify-content-between h-100 hover-shadow transition-all cursor-pointer"
                          style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                          onClick={() => handleOpenLessonInLearning({ tab: 'topics' })}
                          title="Open topic in lesson view"
                        >
                          <div className="d-flex align-items-center gap-3">
                            <span className="badge bg-primary bg-opacity-10 text-primary rounded-circle p-2 fs-6">
                              🧩
                            </span>
                            <div>
                              <h6 className="fw-bold text-dark mb-0 fs-6">
                                {t.topic_name || `Topic ${idx + 1}`}
                              </h6>
                              <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                                ID: #{t.topic_id}
                              </span>
                            </div>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-secondary bg-opacity-10 text-secondary rounded-pill px-2.5 py-1">
                              Views: {t.watch_count ?? 0}
                            </span>
                            <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill px-2 py-1 small">
                              Study →
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted">
                    <p className="small mb-0">No topics registered for this lesson.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 2. Videos */}
            {activeLessonTab === 'videos' && (
              <div>
                {Array.isArray(lessonAnalytics?.videos) && lessonAnalytics.videos.length > 0 ? (
                  <div className="row g-3">
                    {lessonAnalytics.videos.map((v, idx) => (
                      <div key={v.video_id || idx} className="col-12 col-md-6">
                        <div
                          className="p-3 rounded-4 border bg-light bg-opacity-25 d-flex align-items-center justify-content-between h-100 hover-shadow transition-all cursor-pointer"
                          style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                          onClick={() => handleOpenLessonInLearning({ tab: 'materials', mode: 'video', videoId: v.video_id })}
                          title="Watch video in lesson view"
                        >
                          <div className="d-flex align-items-center gap-3">
                            <span className="badge bg-primary bg-opacity-10 text-primary rounded-circle p-2 fs-6">
                              🎥
                            </span>
                            <div>
                              <h6 className="fw-bold text-dark mb-0 fs-6">
                                {v.video_name || `Video Lecture ${idx + 1}`}
                              </h6>
                              <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                                Video ID: #{v.video_id}
                              </span>
                            </div>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-2.5 py-1">
                              Views: {v.watch_count ?? 0}
                            </span>
                            <span className="btn btn-primary btn-sm rounded-pill px-3 fw-semibold">
                              ▶ Watch
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted">
                    <p className="small mb-0">No video lectures recorded for this lesson.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 3. Readables */}
            {activeLessonTab === 'readables' && (
              <div>
                {Array.isArray(lessonAnalytics?.readables) && lessonAnalytics.readables.length > 0 ? (
                  <div className="row g-3">
                    {lessonAnalytics.readables.map((r, idx) => (
                      <div key={r.readable_id || idx} className="col-12 col-md-6">
                        <div
                          className="p-3 rounded-4 border bg-light bg-opacity-25 d-flex align-items-center justify-content-between h-100 hover-shadow transition-all cursor-pointer"
                          style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                          onClick={() => handleOpenLessonInLearning({ tab: 'resources' })}
                          title="Read guide in lesson view"
                        >
                          <div className="d-flex align-items-center gap-3">
                            <span className="badge bg-info bg-opacity-10 text-info rounded-circle p-2 fs-6">
                              📖
                            </span>
                            <div>
                              <h6 className="fw-bold text-dark mb-0 fs-6">
                                {r.readable_name || `Study Guide ${idx + 1}`}
                              </h6>
                              <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                                Material ID: #{r.readable_id}
                              </span>
                            </div>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-secondary bg-opacity-10 text-secondary rounded-pill px-2.5 py-1">
                              Reads: {r.watch_count ?? 0}
                            </span>
                            <span className="btn btn-outline-info btn-sm rounded-pill px-3 fw-semibold">
                              Read ↗
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted">
                    <p className="small mb-0">No readable study guides assigned to this lesson.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 4. Tests */}
            {activeLessonTab === 'tests' && (
              <div>
                {Array.isArray(lessonAnalytics?.tests) && lessonAnalytics.tests.length > 0 ? (
                  <div className="row g-3">
                    {lessonAnalytics.tests.map((t, idx) => {
                      const testId = t.test_id || t.id
                      const isActive = courseService.isMcqActive(t)
                      return (
                        <div key={testId || idx} className="col-12 col-md-6">
                          <div
                            className={`p-3 rounded-4 border bg-light bg-opacity-25 d-flex align-items-center justify-content-between h-100 transition-all ${
                              isActive ? 'hover-shadow cursor-pointer' : 'opacity-75'
                            }`}
                            style={{ cursor: isActive ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease', backgroundColor: isActive ? undefined : '#f8fafc' }}
                            onClick={() => {
                              if (!isActive) return
                              handleOpenLessonInLearning({ tab: 'materials', mode: 'test', testId })
                            }}
                            title={isActive ? 'Take test in lesson view' : 'This MCQ test is inactive and cannot be accessed.'}
                            aria-disabled={!isActive}
                          >
                            <div className="d-flex align-items-center gap-3">
                              <span className="badge bg-danger bg-opacity-10 text-danger rounded-circle p-2 fs-6">
                                📝
                              </span>
                              <div>
                                <h6 className="fw-bold text-dark mb-0 fs-6">
                                  {t.test_name || t.title || `Test ${idx + 1}`}
                                </h6>
                                <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                                  {t.score !== undefined ? `Score: ${t.score}%` : 'Evaluation'}
                                </span>
                              </div>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <span
                                className={`badge border rounded-pill px-2.5 py-1 small fw-semibold ${
                                  isActive ? 'bg-success-subtle text-success border-success-subtle' : 'bg-secondary-subtle text-secondary border-secondary-subtle'
                                }`}
                              >
                                {isActive ? (t.status || 'ACTIVE') : 'INACTIVE'}
                              </span>
                              {isActive ? (
                                <span className="btn btn-danger btn-sm rounded-pill px-3 fw-semibold">
                                  Take Test →
                                </span>
                              ) : (
                                <span className="btn btn-secondary btn-sm rounded-pill px-3 fw-semibold disabled" style={{ opacity: 0.65 }}>
                                  Unavailable
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted">
                    <p className="small mb-0">No quizzes or tests assigned to this lesson.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LEVEL 2: UNIT ANALYTICS VIEW                                          */}
      {/* Endpoint: GET /api/unit/analytics/{unit_id}                           */}
      {/* ===================================================================== */}
      {!isLoading && !errorMessage && level === 'unit' && (
        <div className="unit-analytics-view animate-fade-in">
          {/* Unit Dedicated Page Header & Context Breadcrumb */}
          <div className="card border-0 rounded-4 shadow-sm p-3 p-md-3.5 bg-white mb-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div className="d-flex align-items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm rounded-pill px-3 py-1.5 d-inline-flex align-items-center gap-2 fw-semibold flex-shrink-0"
                  onClick={handleHeaderBack}
                  id="btn-unit-back"
                  title="Back to Course Analytics"
                >
                  <span aria-hidden="true">←</span>
                  <span>Back to Course</span>
                </button>
                <div className="min-w-0">
                  <div className="d-flex align-items-center gap-2 flex-wrap mb-0.5">
                    <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill px-2.5 py-0.5 fw-semibold smaller" style={{ fontSize: '0.72rem' }}>
                      Unit Analytics
                    </span>
                    {selectedCourseMeta?.title && (
                      <span className="text-muted smaller text-truncate d-none d-sm-inline" style={{ fontSize: '0.75rem', maxWidth: '240px' }} title={selectedCourseMeta.title}>
                        {selectedCourseMeta.title}
                      </span>
                    )}
                  </div>
                  <h4 className="fw-bold text-dark mb-0 fs-6 text-truncate" title={unitAnalytics?.unit_details?.unit_name || selectedUnitMeta?.title || 'Unit Details'}>
                    {unitAnalytics?.unit_details?.unit_name || selectedUnitMeta?.title || 'Unit Analytics'}
                  </h4>
                </div>
              </div>

              {/* Quick Actions / Status badge */}
              <div className="d-flex align-items-center gap-2 ms-auto ms-sm-0 flex-shrink-0">
                <span className="badge bg-light text-secondary border rounded-pill px-3 py-1.5 fw-semibold smaller">
                  ID: #{selectedUnitId || unitAnalytics?.unit_details?.unit_id || 'unit'}
                </span>
                <button
                  type="button"
                  className="btn btn-light btn-sm rounded-pill px-3 py-1.5 fw-semibold border d-inline-flex align-items-center gap-1.5"
                  onClick={handleRefresh}
                  disabled={isLoading}
                  title="Refresh unit analytics"
                >
                  <span>🔄</span>
                  <span className="d-none d-sm-inline">Refresh</span>
                </button>
              </div>
            </div>
          </div>

          {/* Unit Hero Card */}
          <div
            className="card border-0 rounded-4 shadow-sm p-3.5 p-md-4 mb-4 text-white position-relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)',
              boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.35)',
            }}
          >
            <div className="position-relative" style={{ zIndex: 2 }}>
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <span
                  className="badge bg-white bg-opacity-25 rounded-pill px-3 py-1 fw-semibold"
                  style={{ fontSize: '0.75rem', letterSpacing: '0.02em' }}
                >
                  📦 Unit Performance Overview
                </span>
                {unitAnalytics?.unit_details?.comment && (
                  <span className="badge bg-white text-primary rounded-pill px-2.5 py-1 fw-bold smaller">
                    {unitAnalytics.unit_details.comment}
                  </span>
                )}
              </div>
              <h3 className="fw-bolder mb-2 text-white" style={{ fontSize: 'clamp(1.25rem, 2.2vw, 1.7rem)', lineHeight: 1.25 }}>
                {unitAnalytics?.unit_details?.unit_name || selectedUnitMeta?.title || 'Unit Analytics'}
              </h3>
              <p className="mb-0 opacity-90 small" style={{ maxWidth: '640px', lineHeight: 1.5 }}>
                Module progression, lessons completed, study time investment, and evaluations.
              </p>
            </div>
          </div>

          {/* Unit Statistics 6-Card Grid */}
          <div className="unit-stat-grid mb-4">
            {/* Card 1: Total Lessons */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase tracking-wider" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    Total Lessons
                  </span>
                  <span className="fs-5" aria-hidden="true">📚</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1">
                  {unitAnalytics?.unit_details?.total_lessons ?? (Array.isArray(unitAnalytics?.lessons) ? unitAnalytics.lessons.length : 0)}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Curriculum lessons in unit
                </span>
              </div>
            </div>

            {/* Card 2: Completed Lessons */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase tracking-wider" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    Completed Lessons
                  </span>
                  <span className="fs-5" aria-hidden="true">✅</span>
                </div>
                <div className="fw-bolder fs-4 text-success mb-1 lh-1">
                  {unitAnalytics?.unit_details?.completed_lessons ?? (Array.isArray(unitAnalytics?.lessons) ? unitAnalytics.lessons.filter((l) => l.is_completed).length : 0)}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  {unitAnalytics?.unit_details?.total_lessons
                    ? `${Math.round(((unitAnalytics?.unit_details?.completed_lessons || 0) / unitAnalytics.unit_details.total_lessons) * 100)}% completed`
                    : 'Lessons finished'}
                </span>
              </div>
            </div>

            {/* Card 3: Unit Completion Percentage */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase tracking-wider" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    Unit Completion
                  </span>
                  <span className="fs-5" aria-hidden="true">📈</span>
                </div>
                <div className="fw-bolder fs-4 text-primary mb-1 lh-1">
                  {unitAnalytics?.unit_details?.progress_percentage ?? unitAnalytics?.progress_percentage ?? 0}%
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <div className="progress bg-light rounded-pill overflow-hidden" style={{ height: '5px' }}>
                  <div
                    className="progress-bar bg-primary rounded-pill"
                    role="progressbar"
                    style={{
                      width: `${Math.min(100, Math.max(0, unitAnalytics?.unit_details?.progress_percentage ?? unitAnalytics?.progress_percentage ?? 0))}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Card 4: Total Tests */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase tracking-wider" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    Total Tests
                  </span>
                  <span className="fs-5" aria-hidden="true">📝</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1">
                  {unitAnalytics?.unit_details?.total_tests !== undefined
                    ? unitAnalytics.unit_details.total_tests
                    : unitAnalytics?.unit_details?.no_of_tests !== undefined
                    ? unitAnalytics.unit_details.no_of_tests
                    : unitAnalytics?.unit_details?.total_elements ?? 0}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Assigned unit evaluations
                </span>
              </div>
            </div>

            {/* Card 5: Tests Attended */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase tracking-wider" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    Tests Attended
                  </span>
                  <span className="fs-5" aria-hidden="true">🎯</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1">
                  {unitAnalytics?.unit_details?.tests_attended !== undefined
                    ? unitAnalytics.unit_details.tests_attended
                    : unitAnalytics?.unit_details?.completed_elements ?? 0}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Evaluations taken by student
                </span>
              </div>
            </div>

            {/* Card 6: Study Duration */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase tracking-wider" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    Study Duration
                  </span>
                  <span className="fs-5" aria-hidden="true">⏱️</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1 text-truncate" title={unitAnalytics?.unit_details?.total_duration || '00:00:00'}>
                  {unitAnalytics?.unit_details?.total_duration || '00:00:00'}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Active study investment
                </span>
              </div>
            </div>
          </div>

          {/* Best & Lowest Lesson Highlights (calculated from actual unit lessons and tests) */}
          {(() => {
            const highlights = computeLessonHighlights(unitAnalytics?.lessons)
            const effectiveBest = unitAnalytics?.best_lesson || highlights.bestLesson
            const effectiveLowest = unitAnalytics?.lowest_lesson || highlights.lowestLesson
            if (!effectiveBest && !effectiveLowest) return null

            return (
              <div className="row g-3 g-md-4 mb-4 unit-performance-highlights-row">
                {/* Best Performing Lesson Card */}
                {effectiveBest && (
                  <div className="col-12 col-md-6 d-flex">
                    <div
                      className="unit-highlight-card unit-highlight-best card border-0 rounded-4 bg-white shadow-sm w-100 d-flex flex-column justify-content-between cursor-pointer"
                      onClick={() => navigateToLesson(effectiveBest)}
                      role="button"
                      tabIndex={0}
                      title="View lesson analytics"
                    >
                      <div>
                        {/* Top Header Badge & Score */}
                        <div className="d-flex align-items-center justify-content-between mb-3">
                          <div
                            className="d-inline-flex align-items-center gap-1.5 px-3 py-1 rounded-pill bg-success bg-opacity-10 text-success fw-bold smaller"
                            style={{ fontSize: '0.75rem' }}
                          >
                            <span className="fs-6" aria-hidden="true">🌟</span>
                            <span>BEST PERFORMING LESSON</span>
                          </div>
                          <div className="text-end">
                            <span className="fs-4 fw-bolder text-success lh-1">
                              {effectiveBest.score_percentage}%
                            </span>
                          </div>
                        </div>

                        {/* Lesson Title */}
                        <h6
                          className="fw-bold text-dark mb-2 fs-6 unit-highlight-title"
                          title={effectiveBest.lesson_name}
                        >
                          {effectiveBest.lesson_name}
                        </h6>

                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div
                            className="d-flex justify-content-between align-items-center mb-1 smaller text-muted"
                            style={{ fontSize: '0.72rem' }}
                          >
                            <span>Mastery Level</span>
                            <span className="fw-semibold text-dark">{effectiveBest.score_percentage}%</span>
                          </div>
                          <div className="progress rounded-pill overflow-hidden bg-light" style={{ height: '6px' }}>
                            <div
                              className="progress-bar bg-success rounded-pill"
                              role="progressbar"
                              aria-valuenow={effectiveBest.score_percentage}
                              aria-valuemin="0"
                              aria-valuemax="100"
                              style={{
                                width: `${Math.min(100, Math.max(0, effectiveBest.score_percentage))}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Footer Details: Duration & Rating Badge */}
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2.5 border-top mt-auto">
                        <span className="small text-muted d-inline-flex align-items-center gap-1.5" style={{ fontSize: '0.75rem' }}>
                          <span>⏱️</span>
                          <span>Duration: {effectiveBest.duration || '00:00:00'}</span>
                        </span>
                        <span
                          className={`badge rounded-pill px-2.5 py-1 fw-semibold ${getCommentBadgeClass(
                            effectiveBest.comment
                          )}`}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {effectiveBest.comment || 'Good'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recommended Focus Area Card */}
                {effectiveLowest && (
                  <div className="col-12 col-md-6 d-flex">
                    <div
                      className="unit-highlight-card unit-highlight-focus card border-0 rounded-4 bg-white shadow-sm w-100 d-flex flex-column justify-content-between cursor-pointer"
                      onClick={() => navigateToLesson(effectiveLowest)}
                      role="button"
                      tabIndex={0}
                      title="View focus lesson analytics"
                    >
                      <div>
                        {/* Top Header Badge & Score */}
                        <div className="d-flex align-items-center justify-content-between mb-3">
                          <div
                            className="d-inline-flex align-items-center gap-1.5 px-3 py-1 rounded-pill bg-warning bg-opacity-15 text-dark fw-bold smaller"
                            style={{ fontSize: '0.75rem' }}
                          >
                            <span className="fs-6" aria-hidden="true">💡</span>
                            <span>RECOMMENDED FOCUS AREA</span>
                          </div>
                          <div className="text-end">
                            <span className="fs-4 fw-bolder text-warning lh-1">
                              {effectiveLowest.score_percentage}%
                            </span>
                          </div>
                        </div>

                        {/* Lesson Title */}
                        <h6
                          className="fw-bold text-dark mb-2 fs-6 unit-highlight-title"
                          title={effectiveLowest.lesson_name}
                        >
                          {effectiveLowest.lesson_name}
                        </h6>

                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div
                            className="d-flex justify-content-between align-items-center mb-1 smaller text-muted"
                            style={{ fontSize: '0.72rem' }}
                          >
                            <span>Current Progress</span>
                            <span className="fw-semibold text-dark">{effectiveLowest.score_percentage}%</span>
                          </div>
                          <div className="progress rounded-pill overflow-hidden bg-light" style={{ height: '6px' }}>
                            <div
                              className="progress-bar bg-warning rounded-pill"
                              role="progressbar"
                              aria-valuenow={effectiveLowest.score_percentage}
                              aria-valuemin="0"
                              aria-valuemax="100"
                              style={{
                                width: `${Math.min(100, Math.max(0, effectiveLowest.score_percentage))}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Footer Details: Duration & Rating Badge */}
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2.5 border-top mt-auto">
                        <span className="small text-muted d-inline-flex align-items-center gap-1.5" style={{ fontSize: '0.75rem' }}>
                          <span>⏱️</span>
                          <span>Duration: {effectiveLowest.duration || '00:00:00'}</span>
                        </span>
                        <span
                          className={`badge rounded-pill px-2.5 py-1 fw-semibold ${getCommentBadgeClass(
                            effectiveLowest.comment
                          )}`}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {effectiveLowest.comment || 'Needs Focus'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Lessons & Evaluations Breakdown in this Unit */}
          <div className="card border-0 rounded-4 p-3.5 p-md-4 bg-white shadow-sm mb-4">
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mb-3 pb-2 border-bottom">
              <div>
                <h5 className="fw-bold text-dark fs-6 mb-1">Lessons & Learning Progress</h5>
                <p className="text-muted smaller mb-0" style={{ fontSize: '0.76rem' }}>
                  Select any lesson to examine topic concepts, videos, reading materials, and assessment scores.
                </p>
              </div>
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill px-3 py-1.5 fw-semibold smaller flex-shrink-0" style={{ fontSize: '0.75rem' }}>
                {unitAnalytics?.lessons?.length || 0} {unitAnalytics?.lessons?.length === 1 ? 'Lesson' : 'Lessons'}
              </span>
            </div>

            {Array.isArray(unitAnalytics?.lessons) && unitAnalytics.lessons.length > 0 ? (
              <div className="row g-3">
                {unitAnalytics.lessons.map((lesson, idx) => (
                  <div key={lesson.lesson_id || idx} className="col-12">
                    <div
                      className="p-3 p-md-3.5 rounded-4 border bg-white shadow-xs d-flex flex-wrap align-items-center justify-content-between gap-3 cursor-pointer hover-shadow transition-all unit-lesson-item-card"
                      style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                      onClick={() => navigateToLesson(lesson)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigateToLesson(lesson)
                        }
                      }}
                    >
                      {/* Left: Indicator & Lesson Info */}
                      <div className="d-flex align-items-center gap-3 min-w-0 flex-grow-1">
                        <div
                          className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0 shadow-xs"
                          style={{
                            width: '40px',
                            height: '40px',
                            backgroundColor: lesson.is_completed ? '#10b981' : '#2563eb',
                            fontSize: '0.85rem',
                          }}
                        >
                          {lesson.is_completed ? '✓' : idx + 1}
                        </div>
                        <div className="min-w-0">
                          <h6 className="fw-bold text-dark mb-1 fs-6 text-truncate" title={lesson.lesson_name}>
                            {lesson.lesson_name}
                          </h6>
                          <div className="d-flex flex-wrap align-items-center gap-1.5 gap-sm-2 small text-muted" style={{ fontSize: '0.75rem' }}>
                            <span className="d-inline-flex align-items-center gap-1">
                              <span>⏱️</span>
                              <span>{lesson.duration || '00:00:00'}</span>
                            </span>
                            <span>•</span>
                            <span className="d-inline-flex align-items-center gap-1">
                              <span>📊</span>
                              <span className="fw-medium text-dark">{lesson.score_percentage ?? 0}% Score</span>
                            </span>
                            <span>•</span>
                            <span>
                              Items: {lesson.completed_items ?? 0}/{lesson.total_items ?? 0}
                            </span>
                            {lesson.comment && (
                              <span className={`badge rounded-pill px-2 py-0.5 ${getCommentBadgeClass(lesson.comment)}`}>
                                {lesson.comment}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Progress bar & Action buttons */}
                      <div className="d-flex align-items-center justify-content-between justify-content-md-end gap-2 gap-md-3 w-100 w-md-auto flex-shrink-0 pt-2 pt-md-0 border-top border-md-top-0 mt-1 mt-md-0 unit-lesson-actions">
                        <div className="text-start text-md-end" style={{ minWidth: '85px' }}>
                          <span className="fw-bold text-dark smaller d-block" style={{ fontSize: '0.78rem' }}>
                            {lesson.progress_percentage ?? 0}% Complete
                          </span>
                          <div className="progress mt-1" style={{ height: '5px', width: '85px', backgroundColor: '#e2e8f0' }}>
                            <div
                              className="progress-bar bg-primary rounded-pill"
                              style={{ width: `${Math.min(100, Math.max(0, lesson.progress_percentage ?? 0))}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm rounded-pill px-3 py-1.5 fw-semibold d-inline-flex align-items-center gap-1"
                            style={{ fontSize: '0.78rem' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigateToLesson(lesson)
                            }}
                          >
                            <span>Analytics</span>
                            <span aria-hidden="true">→</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm rounded-pill px-3 py-1.5 fw-semibold d-inline-flex align-items-center gap-1"
                            style={{ fontSize: '0.78rem' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              const lId = lesson.lesson_id || lesson.id
                              if (onOpenLesson) {
                                onOpenLesson(selectedCourseMeta || selectedCourseId, lesson, { tab: 'materials' })
                              } else {
                                window.location.href = `/learning?courseId=${selectedCourseId}&lessonId=${lId}`
                              }
                            }}
                            title="Open lesson directly in learning view"
                          >
                            <span>▶</span>
                            <span>Study</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-5 bg-light bg-opacity-50 rounded-4 p-4 border border-dashed">
                <div className="display-6 mb-2">📖</div>
                <h6 className="fw-bold text-dark mb-1">No Lessons Registered in this Unit</h6>
                <p className="text-muted small mb-0" style={{ maxWidth: '400px', margin: '0 auto' }}>
                  There are no curriculum lessons configured under this unit. Check other course units or return to course overview.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LEVEL 1: COURSE ANALYTICS VIEW                                        */}
      {/* Endpoint: GET /api/course/analytics/{course_id}                       */}
      {/* ===================================================================== */}
      {!isLoading && !errorMessage && level === 'course' && (
        <div className="course-analytics-view animate-fade-in">
          {/* Course Hero Card */}
          <div
            className="card border-0 rounded-4 shadow-sm p-4 mb-4 text-white position-relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)',
            }}
          >
            <div className="row align-items-center g-3 position-relative" style={{ zIndex: 2 }}>
              <div className="col-12 col-md-8">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span
                    className="badge bg-white bg-opacity-25 rounded-pill px-3 py-1 fw-semibold"
                    style={{ fontSize: '0.75rem' }}
                  >
                    🎓 Course Mastery Tracker
                  </span>
                  {courseAnalytics?.course_subject && (
                    <span className="badge bg-white text-dark rounded-pill px-2.5 py-1 fw-semibold small">
                      {courseAnalytics.course_subject}
                    </span>
                  )}
                </div>
                <h3 className="fw-bolder mb-2" style={{ fontSize: 'clamp(1.2rem, 2vw, 1.6rem)' }}>
                  {courseAnalytics?.course_title || selectedCourseMeta?.title || 'Course Analytics'}
                </h3>
                <p className="mb-0 opacity-90 small" style={{ maxWidth: '520px', lineHeight: 1.5 }}>
                  {courseAnalytics?.current_status?.estimated_remaining_hours_text ||
                    'Track curriculum units, video lectures, reading materials, and evaluations in real-time.'}
                </p>
              </div>

              {/* Progress & Units Completed Indicator */}
              <div className="col-12 col-md-4 text-md-end">
                <div className="d-flex flex-wrap gap-2 justify-content-md-end">
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '100px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <div className="fs-3 fw-bold text-white mb-0">
                      {courseAnalytics?.current_status?.progress_percentage ??
                        courseAnalytics?.course_progress_percentage ??
                        0}%
                    </div>
                    <span className="smaller opacity-90 fw-semibold text-white">Course Mastery</span>
                  </div>
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '100px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <div className="fs-3 fw-bold text-white mb-0">
                      {getUnitsCompletedCount(courseAnalytics)}/
                      {getTotalUnitsCount(courseAnalytics)}
                    </div>
                    <span className="smaller opacity-90 fw-semibold text-white">Units Done</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Media & Content Statistics KPI Grid */}
          <div className="row g-3 mb-4">
            {/* 1. Videos */}
            <div className="col-6 col-lg-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                    Videos
                  </span>
                  <span className="fs-5">🎥</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1">
                  {courseAnalytics?.media_statistics?.videos?.label ||
                    `${courseAnalytics?.watched_videos || 0} / ${courseAnalytics?.total_videos || 0} Videos`}
                </div>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Lecture videos watched
                </span>
              </div>
            </div>

            {/* 2. Reading Materials */}
            <div className="col-6 col-lg-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                    Readables
                  </span>
                  <span className="fs-5">📖</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1">
                  {courseAnalytics?.media_statistics?.readable?.label ||
                    `${courseAnalytics?.watched_readables || 0} / ${courseAnalytics?.total_readables || 0} Reading`}
                </div>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Study guides reviewed
                </span>
              </div>
            </div>

            {/* 3. Topics */}
            <div className="col-6 col-lg-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                    Topics
                  </span>
                  <span className="fs-5">🧩</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1">
                  {courseAnalytics?.media_statistics?.topics?.label ||
                    `${courseAnalytics?.watched_topics || 0} / ${courseAnalytics?.total_topics || 0} Topics`}
                </div>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Curriculum topics mastered
                </span>
              </div>
            </div>

            {/* 4. Tests */}
            <div className="col-6 col-lg-3">
              <div className="card border-0 rounded-4 p-3 bg-white shadow-sm h-100">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-muted smaller fw-bold text-uppercase" style={{ fontSize: '0.72rem' }}>
                    Tests Taken
                  </span>
                  <span className="fs-5">📝</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1">
                  {courseAnalytics?.attended_tests !== undefined || courseAnalytics?.total_tests !== undefined
                    ? `${courseAnalytics?.attended_tests ?? 0} / ${courseAnalytics?.total_tests ?? 0} Tests Taken`
                    : courseAnalytics?.media_statistics?.tests?.label ||
                      `${courseAnalytics?.media_statistics?.tests?.completed ?? 0} / ${courseAnalytics?.media_statistics?.tests?.total ?? 0} Tests Taken`}
                </div>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Quizzes & evaluations
                </span>
              </div>
            </div>
          </div>

          {/* Time Investment Breakdown */}
          {Array.isArray(courseAnalytics?.time_investment?.units) &&
            courseAnalytics.time_investment.units.length > 0 && (
              <div className="card border-0 rounded-4 p-4 bg-white shadow-sm mb-4">
                <h5 className="fw-bold text-dark fs-6 mb-1">
                  {courseAnalytics.time_investment.title || 'Time Investment'}
                </h5>
                <p className="text-muted small mb-3">
                  {courseAnalytics.time_investment.subtitle || 'Minutes spent per unit'}
                </p>
                <div className="row g-3">
                  {courseAnalytics.time_investment.units.map((u, idx) => (
                    <div key={u.unit_id || idx} className="col-12 col-md-6">
                      <div className="p-3 rounded-4 border bg-light bg-opacity-25 d-flex justify-content-between align-items-center">
                        <span className="small fw-semibold text-dark text-truncate me-2">
                          {u.label}
                        </span>
                        <span className="badge bg-primary rounded-pill px-3 py-1">
                          {u.minutes} mins
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Unit List */}
          <div className="card border-0 rounded-4 p-3 p-md-4 bg-white shadow-sm mb-4">
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mb-3 pb-2 border-bottom">
              <div>
                <h5 className="fw-bold text-dark fs-6 mb-0">Curriculum Units</h5>
                <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                  Select a unit to view lesson-level analytics and evaluations
                </span>
              </div>
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill px-3 py-1.5 fw-semibold smaller flex-shrink-0" style={{ fontSize: '0.75rem' }}>
                {getUnitsCompletedCount(courseAnalytics)}/{getTotalUnitsCount(courseAnalytics)} Units Completed
              </span>
            </div>

            {Array.isArray(courseAnalytics?.units) && courseAnalytics.units.length > 0 ? (
              <div className="d-flex flex-column gap-2.5">
                {courseAnalytics.units.map((unit, idx) => {
                  const status = getUnitStatus(unit)
                  const progressVal = Math.min(100, Math.max(0, Math.round(Number(unit.progress_percentage ?? unit.unit_progress_percentage ?? unit.completion_percentage ?? unit.unit_completion_percentage ?? 0))))

                  // Status styling configurations
                  const statusConfig = {
                    completed: {
                      badgeText: 'Completed',
                      badgeClass: 'bg-success-subtle text-success border border-success-subtle',
                      iconBg: '#10b981',
                      iconColor: '#ffffff',
                      barBg: '#10b981',
                      borderHover: '#10b981',
                    },
                    'in-progress': {
                      badgeText: 'In Progress',
                      badgeClass: 'bg-primary-subtle text-primary border border-primary-subtle',
                      iconBg: '#eff6ff',
                      iconColor: '#2563eb',
                      barBg: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                      borderHover: '#3b82f6',
                    },
                    'not-started': {
                      badgeText: 'Not Started',
                      badgeClass: 'bg-light text-secondary border border-light-subtle',
                      iconBg: '#f8fafc',
                      iconColor: '#94a3b8',
                      barBg: '#cbd5e1',
                      borderHover: '#94a3b8',
                    },
                  }[status]

                  return (
                    <div
                      key={unit.unit_id || idx}
                      className="curriculum-unit-card p-3 p-lg-3.5 rounded-3 bg-white border shadow-xs d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center justify-content-between gap-3 gap-lg-4"
                      style={{
                        cursor: 'pointer',
                        borderColor: '#e2e8f0',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                      }}
                      onClick={() => navigateToUnit(unit)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#cbd5e1'
                        e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.06)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0'
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigateToUnit(unit)}
                      aria-label={`Unit ${unit.unit_number || idx + 1}: ${unit.title}`}
                    >
                      {/* Column 1: Left - Unit number, unit name, status and lesson count */}
                      <div className="curriculum-unit-left d-flex align-items-center gap-3 min-w-0 flex-grow-1">
                        {/* Status Icon / Number Avatar */}
                        <div
                          className="curriculum-unit-avatar rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                          style={{
                            width: '44px',
                            height: '44px',
                            backgroundColor: statusConfig.iconBg,
                            color: statusConfig.iconColor,
                            border: status === 'not-started' ? '1px solid #e2e8f0' : 'none',
                            fontSize: '0.88rem',
                          }}
                        >
                          {status === 'completed' ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            idx + 1
                          )}
                        </div>

                        {/* Title, Badge & Lesson Count */}
                        <div className="curriculum-unit-details min-w-0 flex-grow-1">
                          <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                            <span
                              className="badge rounded-pill px-2.5 py-0.5 fw-bold"
                              style={{ fontSize: '0.68rem', backgroundColor: '#f1f5f9', color: '#334155', letterSpacing: '0.02em' }}
                            >
                              {unit.unit_number || `Unit ${idx + 1}`}
                            </span>
                            <span className={`badge rounded-pill px-2.5 py-0.5 fw-bold ${statusConfig.badgeClass}`} style={{ fontSize: '0.68rem' }}>
                              {statusConfig.badgeText}
                            </span>
                          </div>

                          <h6
                            className="curriculum-unit-title fw-bold text-dark mb-1"
                            style={{ fontSize: '0.95rem', lineHeight: '1.35', color: '#0f172a' }}
                            title={unit.title}
                          >
                            {unit.title}
                          </h6>

                          <div className="d-inline-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: '0.78rem' }}>
                            <span aria-hidden="true" style={{ fontSize: '0.85rem' }}>📚</span>
                            <span className="fw-semibold text-secondary">
                              {unit.lessons_status || `${unit.lessons_completed || 0}/${unit.lessons_total || 0} Lessons`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Center - Time spent and score, neatly aligned */}
                      <div className="curriculum-unit-center d-flex flex-row flex-lg-column align-items-center align-items-lg-start justify-content-start justify-content-lg-center gap-3 gap-lg-1.5 flex-shrink-0">
                        <div className="d-inline-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: '0.8rem' }}>
                          <span aria-hidden="true" style={{ fontSize: '0.85rem' }}>⏱️</span>
                          <span className="text-muted smaller me-1">Time:</span>
                          <span className="fw-semibold text-dark">{unit.total_duration || '00:00:00'}</span>
                        </div>
                        {(unit.score_text || unit.score !== undefined) && (
                          <div className="d-inline-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: '0.8rem' }}>
                            <span aria-hidden="true" style={{ fontSize: '0.85rem' }}>🎯</span>
                            <span className="text-muted smaller me-1">Score:</span>
                            <span className="fw-semibold text-dark">
                              {unit.score_text ? unit.score_text.replace(/^SCORE:\s*/i, '') : Number(unit.score || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Column 3: Right - Completion percentage and Analytics button */}
                      <div className="curriculum-unit-right d-flex align-items-center justify-content-between justify-content-lg-end gap-3 gap-lg-3.5 flex-shrink-0">
                        {/* Progress Bar & Percentage */}
                        <div className="d-flex flex-column align-items-start align-items-lg-end" style={{ minWidth: '90px' }}>
                          <div className="d-flex align-items-center gap-1 mb-1">
                            <span className="fw-bolder text-dark" style={{ fontSize: '0.88rem' }}>
                              {progressVal}%
                            </span>
                            <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>complete</span>
                          </div>
                          <div
                            className="rounded-pill overflow-hidden"
                            style={{ height: '6px', width: '90px', backgroundColor: '#e2e8f0' }}
                          >
                            <div
                              className="rounded-pill h-100"
                              style={{
                                width: `${progressVal}%`,
                                background: statusConfig.barBg,
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </div>
                        </div>

                        {/* Action Button */}
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm rounded-pill px-3 py-1.5 fw-semibold d-inline-flex align-items-center gap-1.5 shadow-xs flex-shrink-0"
                          style={{
                            fontSize: '0.82rem',
                            height: '36px',
                            borderColor: '#bfdbfe',
                            backgroundColor: '#f8fafc',
                            color: '#1d8cf8',
                            transition: 'all 0.15s ease',
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigateToUnit(unit)
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#1d8cf8'
                            e.currentTarget.style.color = '#ffffff'
                            e.currentTarget.style.borderColor = '#1d8cf8'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#f8fafc'
                            e.currentTarget.style.color = '#1d8cf8'
                            e.currentTarget.style.borderColor = '#bfdbfe'
                          }}
                          aria-label={`View analytics for ${unit.title}`}
                        >
                          <span>Analytics</span>
                          <span aria-hidden="true" style={{ fontSize: '0.9rem' }}>→</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-muted">
                <p className="small mb-0">No units found in this course.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LEVEL 0: OVERALL ANALYTICS & COURSE SELECTION OVERVIEW               */}
      {/* ===================================================================== */}
      {!isLoading && !errorMessage && level === 'overview' && (
        <div className="overview-analytics-view animate-fade-in">
          {/* Level 0 Hero Card */}
          <div
            className="card border-0 rounded-4 shadow-sm p-4 mb-4 text-white position-relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)',
            }}
          >
            <div className="row align-items-center g-3 position-relative" style={{ zIndex: 2 }}>
              <div className="col-12 col-md-8">
                <span
                  className="badge bg-white bg-opacity-25 rounded-pill px-3 py-1 mb-2 fw-semibold"
                  style={{ fontSize: '0.75rem', letterSpacing: '0.02em' }}
                >
                  📊 Overall Academic Mastery & Performance
                </span>
                <h3 className="fw-bolder mb-2" style={{ fontSize: 'clamp(1.2rem, 2vw, 1.6rem)' }}>
                  Learning Analytics Overview
                </h3>
                <p className="mb-0 opacity-90 small" style={{ maxWidth: '520px', lineHeight: 1.5 }}>
                  Track your overall curriculum progress, test scores, study hours, and academic mastery across all enrolled subjects.
                </p>
              </div>

              {/* Progress & Courses Done Badges */}
              <div className="col-12 col-md-4 text-md-end">
                <div className="d-flex flex-wrap gap-2 justify-content-md-end">
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '100px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <div className="fs-3 fw-bold text-white mb-0">
                      {formatMasteryPercent(aggregatedOverview?.totalProgress)}%
                    </div>
                    <span className="smaller opacity-90 fw-semibold text-white">Overall Mastery</span>
                  </div>
                  <div
                    className="rounded-4 p-3 text-center"
                    style={{
                      minWidth: '100px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <div className="fs-3 fw-bold text-white mb-0">
                      {aggregatedOverview?.completedCourses ?? 0}/
                      {aggregatedOverview?.totalCourses ??
                        availableCourses.filter((c) => !c.is_expired).length}
                    </div>
                    <span className="smaller opacity-90 fw-semibold text-white">Courses Done</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Overall Statistics 6-Card Grid */}
          <div className="unit-stat-grid mb-4">
            {/* Card 1: Enrolled Active Courses */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span
                    className="text-muted smaller fw-bold text-uppercase tracking-wider"
                    style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}
                  >
                    Active Courses
                  </span>
                  <span className="fs-5" aria-hidden="true">🎓</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1">
                  {aggregatedOverview?.totalCourses ??
                    availableCourses.filter((c) => !c.is_expired).length}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  {aggregatedOverview?.completedCourses || 0} completed •{' '}
                  {aggregatedOverview?.inProgressCourses || 0} in progress
                </span>
              </div>
            </div>

            {/* Card 2: Overall Progress */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span
                    className="text-muted smaller fw-bold text-uppercase tracking-wider"
                    style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}
                  >
                    Average Mastery
                  </span>
                  <span className="fs-5" aria-hidden="true">📈</span>
                </div>
                <div className="fw-bolder fs-4 text-primary mb-1 lh-1">
                  {formatMasteryPercent(aggregatedOverview?.totalProgress)}%
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <div
                  className="progress bg-light rounded-pill overflow-hidden"
                  style={{ height: '5px' }}
                >
                  <div
                    className="progress-bar bg-primary rounded-pill"
                    role="progressbar"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, aggregatedOverview?.totalProgress ?? 0)
                      )}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Card 3: Tests Attended */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span
                    className="text-muted smaller fw-bold text-uppercase tracking-wider"
                    style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}
                  >
                    Tests Attended
                  </span>
                  <span className="fs-5" aria-hidden="true">📝</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1">
                  {aggregatedOverview?.testsAttended ?? 0} /{' '}
                  {aggregatedOverview?.totalTests ?? 0}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Curriculum evaluations completed
                </span>
              </div>
            </div>

            {/* Card 4: Study Duration */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span
                    className="text-muted smaller fw-bold text-uppercase tracking-wider"
                    style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}
                  >
                    Study Time
                  </span>
                  <span className="fs-5" aria-hidden="true">⏱️</span>
                </div>
                <div
                  className="fw-bolder fs-4 text-dark mb-1 lh-1 text-truncate"
                  title={aggregatedOverview?.totalTimeSpentFormatted || '00:00:00'}
                >
                  {aggregatedOverview?.totalTimeSpentFormatted || '00:00:00'}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Active learning investment
                </span>
              </div>
            </div>

            {/* Card 5: Topics Mastered */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span
                    className="text-muted smaller fw-bold text-uppercase tracking-wider"
                    style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}
                  >
                    Topics Mastered
                  </span>
                  <span className="fs-5" aria-hidden="true">🧩</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1">
                  {aggregatedOverview?.topicsWatched ?? 0} /{' '}
                  {aggregatedOverview?.totalTopics ?? 0}
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Subject concepts reviewed
                </span>
              </div>
            </div>

            {/* Card 6: Media Reviewed */}
            <div className="unit-stat-card card border-0 rounded-4 bg-white shadow-sm d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span
                    className="text-muted smaller fw-bold text-uppercase tracking-wider"
                    style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}
                  >
                    Media Reviewed
                  </span>
                  <span className="fs-5" aria-hidden="true">🎥</span>
                </div>
                <div className="fw-bolder fs-4 text-dark mb-1 lh-1">
                  {aggregatedOverview?.videosWatched ?? 0} /{' '}
                  {aggregatedOverview?.totalVideos ?? 0} Videos
                </div>
              </div>
              <div className="pt-2 border-top mt-2">
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  {aggregatedOverview?.readablesWatched ?? 0} /{' '}
                  {aggregatedOverview?.totalReadables ?? 0} Study guides
                </span>
              </div>
            </div>
          </div>

          {/* Course Selection & Drill-down Section */}
          <div className="card border-0 rounded-4 p-3.5 p-md-4 bg-white shadow-sm mb-4">
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mb-4 pb-2 border-bottom">
              <div>
                <h5 className="fw-bold text-dark fs-6 mb-1">
                  Select a Course for Deep-Dive Analytics
                </h5>
                <p className="text-muted smaller mb-0" style={{ fontSize: '0.78rem' }}>
                  Click any course below to view unit progress, lesson-level time investment, and evaluations.
                </p>
              </div>
              <span
                className="badge bg-primary bg-opacity-10 text-primary rounded-pill px-3 py-1.5 fw-semibold smaller flex-shrink-0"
                style={{ fontSize: '0.75rem' }}
              >
                {availableCourses.length}{' '}
                {availableCourses.length === 1 ? 'Available Course' : 'Available Courses'}
              </span>
            </div>

            {availableCourses.length > 0 ? (
              <div className="row g-3 g-md-4">
                {availableCourses.map((course, idx) => (
                  <div key={course.id || idx} className="col-12 col-md-6 d-flex">
                    <div
                      className="card border rounded-4 p-3.5 p-md-4 w-100 d-flex flex-column justify-content-between cursor-pointer shadow-xs analytics-course-card"
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigateToCourse(course)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigateToCourse(course)
                        }
                      }}
                    >
                      {/* Card Content Top */}
                      <div>
                        <div className="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
                          <div className="d-flex align-items-center gap-1.5">
                            <span
                              className="badge bg-primary bg-opacity-10 text-primary rounded-pill px-2.5 py-1 fw-bold text-uppercase"
                              style={{ fontSize: '0.68rem', letterSpacing: '0.03em' }}
                            >
                              {course.subject || 'CURRICULUM'}
                            </span>
                            {course.is_expired && (
                              <span
                                className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-0.5 fw-bold"
                                style={{ fontSize: '0.68rem' }}
                                title="Course expired — excluded from active metrics"
                              >
                                EXPIRED
                              </span>
                            )}
                          </div>
                          <span
                            className={`badge ${
                              course.is_expired ? 'bg-secondary' : 'bg-success'
                            } text-white rounded-pill px-2.5 py-1 fw-bold flex-shrink-0`}
                            style={{ fontSize: '0.72rem' }}
                          >
                            {typeof course.progress === 'number'
                              ? `${course.progress}%`
                              : '0%'}
                          </span>
                        </div>

                        <h6
                          className="fw-bold text-dark mb-1.5 fs-6 analytics-course-title"
                          title={course.title || course.name}
                        >
                          {course.title || course.name}
                        </h6>

                        <p
                          className="text-muted smaller mb-3 analytics-course-desc"
                          style={{ fontSize: '0.78rem' }}
                        >
                          {course.description
                            ? typeof course.description === 'string'
                              ? course.description.replace(/<[^>]*>?/gm, '')
                              : 'Explore unit breakdown, lecture hours, and test scores for this course.'
                            : 'Explore unit breakdown, lecture hours, and test scores for this course.'}
                        </p>
                      </div>

                      {/* Card Footer Bottom */}
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-3 border-top mt-2">
                        <span
                          className="badge bg-light text-secondary border rounded-pill px-2.5 py-1 smaller fw-medium"
                          style={{ fontSize: '0.72rem' }}
                        >
                          Course ID: #{course.id}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm rounded-pill px-3.5 py-1.5 fw-semibold d-inline-flex align-items-center gap-1.5 shadow-xs"
                          style={{ fontSize: '0.78rem' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigateToCourse(course)
                          }}
                        >
                          <span>Course Analytics</span>
                          <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-5 bg-light bg-opacity-50 rounded-4 p-4 border border-dashed">
                <div className="display-6 mb-2">📚</div>
                <h6 className="fw-bold text-dark mb-1">No Courses Enrolled</h6>
                <p
                  className="text-muted small mb-3"
                  style={{ maxWidth: '420px', margin: '0 auto' }}
                >
                  Explore the curriculum to enroll in your courses and start tracking your analytics.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-4 py-2 fw-semibold"
                  onClick={() => {
                    window.location.hash = '#explore'
                  }}
                >
                  🔍 Explore Courses
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
