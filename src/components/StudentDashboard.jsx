import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { studentData } from '../data/studentData'
import { authService } from '../services/authService'
import edooIcon from '../assets/edoo-icon.png'
import illustrationBooks3D from '../assets/dashboard/illustration-books-3d.png'
import illustrationChart3D from '../assets/dashboard/illustration-chart-3d.png'
import illustrationCap3D from '../assets/dashboard/illustration-cap-3d.png'

// Sub-views & Interactive Modals
import CourseLearningView from './dashboard/CourseLearningView'
import MyCoursesView from './dashboard/MyCoursesView'
import AnalyticsView from './dashboard/AnalyticsView'
import StudentProfileView from './dashboard/StudentProfileView'
import AchievementsView from './dashboard/AchievementsView'
import VirtualClassroomModal from './dashboard/VirtualClassroomModal'
import SettingsModal from './dashboard/SettingsModal'
import BasicProfileSetupModal from './dashboard/BasicProfileSetupModal'
import CourseDetailsModal from './dashboard/CourseDetailsModal'
import CourseDetailsView from './dashboard/CourseDetailsView'
import CourseExplorationView from './dashboard/CourseExplorationView'
import LeaderboardView from './dashboard/LeaderboardView'
import AvatarSelectionModal from './dashboard/AvatarSelectionModal'
import NotificationsPanel from './dashboard/NotificationsPanel'
import InitialsAvatar from './common/InitialsAvatar'
import { avatarService } from '../services/avatarService'
import { courseService } from '../services/courseService'
import { notificationService } from '../services/notificationService'

export default function StudentDashboard({ onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  // Helper to map pathname to activeView
  const getViewFromLocation = (loc) => {
    const p = (loc?.pathname || window.location.pathname).replace(/^\/+/, '').split('/')[0]
    if (p === 'learning') return 'learning'
    if (p === 'test') return 'test'
    if (p === 'course-details') return 'course-details'
    if (p === 'courses') return 'courses'
    if (p === 'analytics') return 'analytics'
    if (p === 'explore' || p === 'search') return 'explore'
    if (p === 'leaderboard') return 'leaderboard'
    if (p === 'achievements') return 'achievements'
    if (p === 'profile') return 'profile'
    return 'home'
  }

  // Navigation & View States derived directly from React Router URL (Single Source of Truth)
  const activeView = getViewFromLocation(location)
  const activeNav = (activeView === 'learning' || activeView === 'course-details' || activeView === 'test')
    ? 'courses'
    : activeView === 'explore'
    ? 'search'
    : activeView
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [isLoadingCourseData, setIsLoadingCourseData] = useState(false)

  // Interactive Modals & Panels
  const [isClassroomOpen, setIsClassroomOpen] = useState(false)
  const [isClassroomLoading, setIsClassroomLoading] = useState(false)
  const [classroomData, setClassroomData] = useState(null)
  const [classroomError, setClassroomError] = useState(null)
  const [classroomStatus, setClassroomStatus] = useState({
    isActive: false,
    status: 'checking',
    data: null,
  })
  const [activeClassroomSession, setActiveClassroomSession] = useState(() =>
    courseService.getStoredClassroomSession()
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => window.location.hash === '#settings')
  const [isProfileSetupOpen, setIsProfileSetupOpen] = useState(
    () => window.location.pathname.includes('/profile-setup') || window.location.hash === '#profile-setup'
  )
  const [isFromRegistration, setIsFromRegistration] = useState(() => {
    const isStateReg = Boolean(location.state?.fromRegistration)
    const isSessionReg = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('edoomate_is_new_registration') === 'true'
    return isStateReg || isSessionReg
  })
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
  const [studentAvatar, setStudentAvatar] = useState(() => avatarService.getCurrentAvatar())
  const [detailsCourse, setDetailsCourse] = useState(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [courseAction, setCourseAction] = useState('resume')
  const [targetLessonId, setTargetLessonId] = useState(null)
  const [previousView, setPreviousView] = useState('home')
  const [toastMessage, setToastMessage] = useState('')
  // Mobile navigation drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Listen to hash and pathname changes for settings or profile-setup modal
  useEffect(() => {
    if (window.location.hash === '#settings') {
      setIsSettingsOpen(true)
    }
    if (window.location.hash === '#profile-setup' || location.pathname.includes('/profile-setup') || location.pathname.includes('/assessment')) {
      const isStateReg = Boolean(location.state?.fromRegistration)
      const isSessionReg = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('edoomate_is_new_registration') === 'true'
      setIsFromRegistration(isStateReg || isSessionReg)
      setIsProfileSetupOpen(true)
    }
  }, [location.pathname, location.state])
  useEffect(() => {
    const handleAvatarChange = (e) => {
      if (e.detail?.avatar) {
        setStudentAvatar(e.detail.avatar)
      }
    }
    window.addEventListener('edoomate_avatar_changed', handleAvatarChange)
    return () => window.removeEventListener('edoomate_avatar_changed', handleAvatarChange)
  }, [])

  // Reactive listener for classroom session changes (entry, leave, resume)
  useEffect(() => {
    const handleSessionUpdate = (e) => {
      setActiveClassroomSession(e.detail)
    }
    window.addEventListener('edoomate_classroom_session_updated', handleSessionUpdate)
    return () => window.removeEventListener('edoomate_classroom_session_updated', handleSessionUpdate)
  }, [])

  // Use authenticated user's name if logged in, otherwise default to Kristin from Figma
  const [currentUser, setCurrentUser] = useState(() => authService.getUser())
  const studentName =
    currentUser?.first_name ||
    currentUser?.full_name?.split(' ')[0] ||
    studentData.profile.name

  // User Points State (API GET /api/user)
  const [userPoints, setUserPoints] = useState(() => {
    const cached = authService.getUser()
    if (cached && cached.points !== undefined && !isNaN(Number(cached.points))) {
      return Number(cached.points)
    }
    return null
  })
  const [isPointsLoading, setIsPointsLoading] = useState(false)
  const [pointsError, setPointsError] = useState(null)

  // Fetch student's real-time points balance from GET /api/user
  const fetchUserPoints = async () => {
    const token = authService.getToken()
    if (!token) return

    setIsPointsLoading(true)
    setPointsError(null)

    try {
      const points = await authService.getUserPoints(token)
      if (typeof points === 'number' && !isNaN(points)) {
        setUserPoints(points)
      }
    } catch (err) {
      console.warn('Failed to load user points:', err.message)
      setPointsError(err.message || 'Unable to load points balance.')
    } finally {
      setIsPointsLoading(false)
    }
  }

  // Purchased Course State (API GET /api/my-learning)
  const [purchasedCourse, setPurchasedCourse] = useState(null)
  const [isPurchasedCourseLoading, setIsPurchasedCourseLoading] = useState(true)
  const [purchasedCourseError, setPurchasedCourseError] = useState(null)
  const [purchasedCourseImgFailed, setPurchasedCourseImgFailed] = useState(false)

  // Active / Enrolled Courses List State (API GET /api/my-learning)
  const [activeCoursesList, setActiveCoursesList] = useState([])
  const [isActiveCoursesLoading, setIsActiveCoursesLoading] = useState(true)
  const [activeCoursesError, setActiveCoursesError] = useState(null)

  // Fetch student's purchased / enrolled courses from GET /api/my-learning
  const fetchPurchasedCourse = async () => {
    const token = authService.getToken()
    if (!token) {
      setPurchasedCourse(null)
      setActiveCoursesList([])
      setIsPurchasedCourseLoading(false)
      setIsActiveCoursesLoading(false)
      return
    }

    setIsPurchasedCourseLoading(true)
    setIsActiveCoursesLoading(true)
    setPurchasedCourseError(null)
    setActiveCoursesError(null)
    setPurchasedCourseImgFailed(false)

    try {
      const response = await courseService.getMyLearningCourses(token)
      let list = []
      if (Array.isArray(response?.data)) {
        list = response.data
      } else if (response?.data && typeof response.data === 'object') {
        const active = Array.isArray(response.data.active_courses) ? response.data.active_courses : []
        list = active
      }

      // Process normalized course list for compact Active Courses section
      const parsedCourses = list.map((item) => {
        const nestedCourse = item?.course && typeof item.course === 'object' ? item.course : {}
        const id = item?.id ?? item?.course_id ?? nestedCourse?.id
        const title = item?.title ?? nestedCourse?.title ?? item?.name ?? 'Enrolled Course'
        const subject = item?.subject ?? nestedCourse?.subject ?? 'Academics'
        const grade = item?.grade ?? nestedCourse?.grade ?? null

        const candidateThumbs = [
          item?.video_thumbnails_url,
          nestedCourse?.video_thumbnails_url,
          item?.thumbnail_url,
          nestedCourse?.thumbnail_url,
          item?.image_url,
          nestedCourse?.image_url,
          item?.thumbnail,
          nestedCourse?.thumbnail,
          item?.video_thumbnail,
          nestedCourse?.video_thumbnail,
        ]
        let resolvedThumb = null
        for (const t of candidateThumbs) {
          if (typeof t === 'string' && t.trim() && t !== 'null' && t !== 'undefined') {
            const trimmed = t.trim()
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              resolvedThumb = trimmed
            } else if (trimmed.startsWith('/')) {
              resolvedThumb = `https://edoomate.myieltspartner.com${trimmed}`
            } else {
              resolvedThumb = `https://edoomate.myieltspartner.com/storage/video_thumbnails/${trimmed}`
            }
            break
          }
        }

        let progress = 0
        if (typeof item?.progress === 'number') {
          progress = Math.min(100, Math.max(0, item.progress))
        } else if (typeof item?.progress_percentage === 'number') {
          progress = Math.min(100, Math.max(0, item.progress_percentage))
        } else if (typeof item?.percentage === 'number') {
          progress = Math.min(100, Math.max(0, item.percentage))
        } else if (typeof nestedCourse?.progress === 'number') {
          progress = Math.min(100, Math.max(0, nestedCourse.progress))
        } else if (id) {
          const stored = courseService.getStoredProgress(id)
          if (stored?.completedLessonIds?.length) {
            progress = Math.min(100, stored.completedLessonIds.length * 20)
          }
        }

        return {
          raw: item,
          id,
          title,
          subject,
          grade,
          thumbnail: resolvedThumb,
          progress,
          duration: item?.total_duration || nestedCourse?.total_duration || 'Self-paced',
        }
      })

      setActiveCoursesList(parsedCourses)

      if (list.length > 0) {
        // Selection rule: Pick the most recently accessed course if stored, else the first valid course
        let chosen = list[0]
        for (const item of list) {
          const cId = item.id ?? item.course_id ?? item.course?.id
          if (cId) {
            const stored = courseService.getStoredProgress(cId)
            if (stored?.updatedAt) {
              chosen = item
              break
            }
          }
        }

        const nestedCourse = chosen?.course && typeof chosen.course === 'object' ? chosen.course : {}
        const id = chosen?.id ?? chosen?.course_id ?? nestedCourse?.id
        const title = chosen?.title ?? nestedCourse?.title ?? chosen?.name ?? 'Enrolled Course'
        const subject = chosen?.subject ?? nestedCourse?.subject ?? 'Academics'
        const grade = chosen?.grade ?? nestedCourse?.grade ?? null

        // Resolve thumbnail from API response fields
        const candidateThumbs = [
          chosen?.video_thumbnails_url,
          nestedCourse?.video_thumbnails_url,
          chosen?.thumbnail_url,
          nestedCourse?.thumbnail_url,
          chosen?.image_url,
          nestedCourse?.image_url,
          chosen?.thumbnail,
          nestedCourse?.thumbnail,
          chosen?.video_thumbnail,
          nestedCourse?.video_thumbnail,
        ]
        let resolvedThumb = null
        for (const t of candidateThumbs) {
          if (typeof t === 'string' && t.trim() && t !== 'null' && t !== 'undefined') {
            const trimmed = t.trim()
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              resolvedThumb = trimmed
            } else if (trimmed.startsWith('/')) {
              resolvedThumb = `https://edoomate.myieltspartner.com${trimmed}`
            } else {
              resolvedThumb = `https://edoomate.myieltspartner.com/storage/video_thumbnails/${trimmed}`
            }
            break
          }
        }

        // Progress calculation
        let progress = 0
        if (typeof chosen?.progress === 'number') {
          progress = Math.min(100, Math.max(0, chosen.progress))
        } else if (typeof chosen?.progress_percentage === 'number') {
          progress = Math.min(100, Math.max(0, chosen.progress_percentage))
        } else if (typeof chosen?.percentage === 'number') {
          progress = Math.min(100, Math.max(0, chosen.percentage))
        } else if (typeof nestedCourse?.progress === 'number') {
          progress = Math.min(100, Math.max(0, nestedCourse.progress))
        } else if (id) {
          const stored = courseService.getStoredProgress(id)
          if (stored?.completedLessonIds?.length) {
            progress = Math.min(100, stored.completedLessonIds.length * 20)
          }
        }

        setPurchasedCourse({
          raw: chosen,
          id,
          title,
          subject,
          grade,
          thumbnail: resolvedThumb,
          progress,
          duration: chosen?.total_duration || nestedCourse?.total_duration || 'Self-paced',
        })
      } else {
        setPurchasedCourse(null)
      }
    } catch (err) {
      console.warn('Failed to fetch purchased course:', err.message)
      setPurchasedCourseError(err.message || 'Unable to load purchased course.')
      setActiveCoursesError(err.message || 'Unable to load active courses.')
      setPurchasedCourse(null)
      setActiveCoursesList([])
    } finally {
      setIsPurchasedCourseLoading(false)
      setIsActiveCoursesLoading(false)
    }
  }

  // My Rank State (API GET /api/leaderboard)
  const [myRankData, setMyRankData] = useState({
    rank: null,
    totalParticipants: null,
    points: null,
    trend: null,
    schoolName: '',
    grade: '',
    hasData: false,
  })
  const [isRankLoading, setIsRankLoading] = useState(true)
  const [rankError, setRankError] = useState(null)

  // Fetch logged-in student's actual rank from GET /api/leaderboard
  const fetchMyRank = async () => {
    const token = authService.getToken()
    if (!token) {
      setIsRankLoading(false)
      return
    }

    setIsRankLoading(true)
    setRankError(null)

    try {
      const res = await courseService.getLeaderboard(token)
      if (res && res.success && res.data) {
        const data = res.data
        const loggedUser = authService.getUser()

        // 1. Determine rank directly from API
        let userRank = typeof data.your_rank === 'number' ? data.your_rank : null

        // 2. Determine total participants directly from API
        const total = typeof data.total_students === 'number'
          ? data.total_students
          : Array.isArray(data.leaderboard)
          ? data.leaderboard.length
          : null

        // 3. Find user in leaderboard list if available
        let userPointsFromLeaderboard = null
        let userTrend = null

        if (Array.isArray(data.leaderboard)) {
          const userEntry = data.leaderboard.find((item, index) => {
            const itemRank = typeof item.rank === 'number' ? item.rank : index + 1
            const isMatch = Boolean(
              item.is_user ||
              item.isUser ||
              (loggedUser?.id && (item.id === loggedUser.id || item.user_id === loggedUser.id || item.student_id === loggedUser.id)) ||
              (loggedUser?.email && item.email && item.email.toLowerCase() === loggedUser.email.toLowerCase()) ||
              (typeof data.your_rank === 'number' && itemRank === data.your_rank)
            )
            return isMatch
          })

          if (userEntry) {
            if (userRank === null) {
              const idx = data.leaderboard.indexOf(userEntry)
              userRank = typeof userEntry.rank === 'number' ? userEntry.rank : idx + 1
            }
            const pts = userEntry.points ?? userEntry.score ?? userEntry.total_points ?? userEntry.xp ?? null
            if (pts !== null && pts !== undefined) {
              userPointsFromLeaderboard = pts
            }
            if (userEntry.trend) {
              userTrend = userEntry.trend
            }
          }
        }

        setMyRankData({
          rank: userRank,
          totalParticipants: total,
          points: userPointsFromLeaderboard,
          trend: userTrend,
          schoolName: data.school_name || '',
          grade: data.grade || '',
          hasData: Boolean(userRank !== null || total !== null || Array.isArray(data.leaderboard)),
        })
      } else {
        setMyRankData((prev) => ({ ...prev, hasData: false }))
      }
    } catch (err) {
      console.warn('Failed to load ranking data:', err.message)
      setRankError(err.message || 'Unable to load ranking.')
    } finally {
      setIsRankLoading(false)
    }
  }

  // Load points, purchased course, active session, and my rank on mount
  useEffect(() => {
    fetchUserPoints()
    fetchPurchasedCourse()
    fetchMyRank()

    // Fetch and synchronize saved session on initial load
    const token = authService.getToken()
    if (token) {
      courseService.getUserLearningSession(token).then((sess) => {
        if (sess) {
          setActiveClassroomSession(sess)
        }
      }).catch(() => {})
    }
  }, [])

  // Live Classroom Status check from API
  const fetchClassroomStatus = async () => {
    const token = authService.getToken()
    try {
      const res = await courseService.checkClassroomStatus(token)
      setClassroomStatus(res)
      if (res.data) {
        setClassroomData(res.data)
      }
    } catch {
      setClassroomStatus({
        isActive: false,
        status: 'unavailable',
        data: null,
      })
    }
  }

  // Poll classroom status periodically so when classroom becomes active,
  // existing button colour and functionality are restored automatically
  useEffect(() => {
    fetchClassroomStatus()
    const statusInterval = setInterval(fetchClassroomStatus, 30000)
    const handleFocus = () => fetchClassroomStatus()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(statusInterval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Show temporary toast message
  const triggerToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // Enter / Resume Virtual Classroom Handler with live API integration
  const handleEnterClassroom = async () => {
    if (isClassroomLoading) return

    const token = authService.getToken()
    if (!token) {
      triggerToast('⚠️ Please log in to enter the virtual classroom.')
      setClassroomError('Authentication token is missing. Please log in.')
      setIsClassroomOpen(true)
      return
    }

    setIsClassroomLoading(true)
    setClassroomError(null)

    try {
      // 1. Fetch user's saved learning session and last playback position from backend API
      const savedSession = await courseService.getUserLearningSession(token)

      // 2. Identify the active course to resume
      let targetCourseId = savedSession?.courseId
      let targetLessonId = savedSession?.lessonId || savedSession?.lastLessonId
      let targetTopicId = savedSession?.topicId
      let targetVideoTimestamp = savedSession?.videoTimestamp || savedSession?.timestamp || 0

      // If no target course in savedSession, find active course from activeCoursesList or getMyLearningCourses
      if (!targetCourseId) {
        if (activeCoursesList && activeCoursesList.length > 0) {
          targetCourseId = activeCoursesList[0]?.id || activeCoursesList[0]?.course_id
        } else {
          try {
            const myLearning = await courseService.getMyLearningCourses(token)
            const activeList = Array.isArray(myLearning?.data?.active_courses)
              ? myLearning.data.active_courses
              : Array.isArray(myLearning?.data)
              ? myLearning.data
              : []
            if (activeList.length > 0) {
              targetCourseId = activeList[0]?.id || activeList[0]?.course_id
            }
          } catch {}
        }
      }

      // If no enrolled course is found, do NOT fall back to unpurchased course or mock courses
      if (!targetCourseId) {
        triggerToast('🔒 You do not have an active enrolled course. Please enroll to enter the classroom.')
        setClassroomError('You do not have an active enrolled course. Please enroll in a course to enter the Avatar Classroom.')
        setIsClassroomOpen(true)
        setIsClassroomLoading(false)
        return
      }

      // 3. Verify that the target course has not expired, is active, and student has verified access
      const accessCheck = await courseService.checkCourseAccess(targetCourseId, token)
      if (accessCheck.isExpired) {
        triggerToast('Your course has expired.')
        setClassroomError('Your course has expired. Access to the Avatar Classroom has ended.')
        setIsClassroomOpen(true)
        setIsClassroomLoading(false)
        return
      }
      if (!accessCheck.hasAccess) {
        const errorMsg = accessCheck.isInactive
          ? 'This course is currently inactive.'
          : (accessCheck.reason || 'You do not have an active enrollment for this course.')
        triggerToast('🔒 ' + errorMsg)
        setClassroomError(errorMsg)
        setIsClassroomOpen(true)
        setIsClassroomLoading(false)
        return
      }

      // 4. Inspect curriculum for Avatar Topics
      let resolvedAvatarTopic = null
      let avatarLessonId = targetLessonId

      try {
        const fullCurriculum = await courseService.loadFullCourseCurriculum(targetCourseId, token)
        const allModules = fullCurriculum?.modules || []
        const allLessons = allModules.flatMap((m) => m.lessons || [])

        // If targetTopicId exists, check if it's an avatar topic
        if (targetTopicId) {
          try {
            const cleanTId = String(targetTopicId).replace(/^topic-/, '').trim()
            const topicRes = await courseService.getTopicDetails(cleanTId, token)
            const topicObj = topicRes?.data || topicRes
            if (topicObj?.avatar_link || topicObj?.avatar_topic_id) {
              resolvedAvatarTopic = {
                topicId: cleanTId,
                avatarTopicId: topicObj.avatar_topic_id,
                title: topicObj.topic || topicObj.title,
              }
            }
          } catch (tErr) {
            console.warn('Inspect targetTopicId note:', tErr.message)
          }
        }

        // If no explicit avatar topic yet, search all lessons in curriculum for the first available Avatar topic
        if (!resolvedAvatarTopic && allLessons.length > 0) {
          // Priority 1: Check topics in current/target lesson
          const preferredLesson = allLessons.find((l) => String(l.id) === String(targetLessonId)) || allLessons[0]
          const candLessons = [preferredLesson, ...allLessons.filter((l) => l !== preferredLesson)]

          for (const les of candLessons) {
            const topicLinks = les.topics || []
            for (const tl of topicLinks) {
              const cleanId = String(tl.element_id || tl.id).replace(/^topic-/, '').trim()
              try {
                const tDetail = await courseService.getTopicDetails(cleanId, token)
                const tObj = tDetail?.data || tDetail
                if (tObj?.avatar_link || tObj?.avatar_topic_id) {
                  resolvedAvatarTopic = {
                    topicId: cleanId,
                    avatarTopicId: tObj.avatar_topic_id,
                    title: tObj.topic || tObj.title,
                  }
                  avatarLessonId = les.id || les.lessonId
                  break
                }
              } catch {}
            }
            if (resolvedAvatarTopic) break
          }
        }
      } catch (curriculumErr) {
        console.warn('Curriculum inspection during Enter Classroom:', curriculumErr.message)
      }

      // 5. Directly reopen Avatar Classroom (VideoLessonPage with avatar topic and saved timestamp)
      if (resolvedAvatarTopic) {
        const params = new URLSearchParams()
        params.set('courseId', String(targetCourseId))
        if (avatarLessonId) {
          params.set('lessonId', String(avatarLessonId))
        }
        params.set('topicId', String(resolvedAvatarTopic.topicId))
        if (targetVideoTimestamp && Number(targetVideoTimestamp) > 0) {
          params.set('time', String(Math.floor(targetVideoTimestamp)))
        }
        if (savedSession?.stepIndex !== undefined && savedSession.stepIndex !== null) {
          params.set('step', String(savedSession.stepIndex))
        }
        if (resolvedAvatarTopic.title) {
          params.set('title', resolvedAvatarTopic.title)
        }

        triggerToast('🚀 Entering Avatar Classroom and resuming your lecture...')
        navigateTo('video-lesson', 'courses', `?${params.toString()}`)
        return
      }

      // Fallback: If no avatar topics exist in course curriculum, resume lesson learning view
      const fallbackParams = new URLSearchParams()
      fallbackParams.set('courseId', String(targetCourseId))
      if (targetLessonId) fallbackParams.set('lessonId', String(targetLessonId))
      if (targetTopicId) fallbackParams.set('topicId', String(targetTopicId))
      if (targetVideoTimestamp && Number(targetVideoTimestamp) > 0) {
        fallbackParams.set('time', String(Math.floor(targetVideoTimestamp)))
      }

      triggerToast('🚀 Entering classroom and resuming your lesson...')
      navigateTo('learning', 'courses', `?${fallbackParams.toString()}`)
    } catch (err) {
      console.warn('Classroom entry error:', err.message)
      triggerToast('⚠️ Unable to enter classroom: ' + err.message)
    } finally {
      setIsClassroomLoading(false)
    }
  }

  // Consistent Navigation Handler using React Router
  const navigateTo = (view, navId = null, search = '') => {
    const cleanView = String(view).replace(/^\/+/, '')
    const basePath = cleanView === 'home' ? '/dashboard' : cleanView === 'explore' ? '/explore' : `/${cleanView}`
    const fullPath = search ? `${basePath}${search.startsWith('?') ? search : '?' + search}` : basePath
    navigate(fullPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Handle dedicated MCQ test navigation
  const handleOpenTest = (testId, lessonId = null) => {
    const cId = searchParams.get('courseId') || selectedCourse?.id
    const lId = lessonId || targetLessonId || searchParams.get('lessonId')
    const qs = new URLSearchParams()
    if (cId) qs.set('courseId', String(cId))
    if (lId) qs.set('lessonId', String(lId))
    const searchStr = qs.toString() ? `?${qs.toString()}` : ''
    navigateTo(`test/${encodeURIComponent(testId)}`, 'courses', searchStr)
  }

  // Synchronize URL parameters and recover course details on route change or refresh
  useEffect(() => {
    const cId = searchParams.get('courseId')
    const lId = searchParams.get('lessonId')

    if (lId && lId !== targetLessonId) {
      setTargetLessonId(lId)
    }

    // Recover course details from backend if refreshing on learning, course-details, or test
    if (cId && (!selectedCourse || String(selectedCourse.id) !== String(cId))) {
      let isMounted = true
      setIsLoadingCourseData(true)
      const token = authService.getToken()

      courseService
        .getCourseDetails(cId, token)
        .then((detail) => {
          if (!isMounted) return
          if (detail) {
            setSelectedCourse(detail)
          } else {
            // Minimal course fallback with the recovered ID
            setSelectedCourse({ id: cId, title: `Course ${cId}` })
          }
        })
        .catch((err) => {
          console.warn('Could not recover course details on refresh:', err)
          if (isMounted) {
            setSelectedCourse({ id: cId, title: `Course ${cId}` })
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingCourseData(false)
        })

      return () => {
        isMounted = false
      }
    }
  }, [location.pathname, location.search])

  // Navigate to Course Details Page (Screenshot 1)
  const handleOpenCourseDetails = (course) => {
    setPreviousView(activeView)
    setSelectedCourse(course)
    const cId = course?.id || course?.course_id
    const search = cId ? `?courseId=${cId}` : ''
    navigateTo('course-details', 'courses', search)
  }

  // Navigate to Lesson Details Page (Screenshot 2) when lesson name is clicked
  const handleSelectLessonFromCourse = async (course, lesson) => {
    const cId = course?.id || course?.course_id
    const token = authService.getToken()
    const access = await courseService.checkCourseAccess(cId, token, course)

    if (access.isExpired) {
      triggerToast('Your course has expired.')
      setPreviousView(activeView)
      setSelectedCourse(course)
      const search = cId ? `?courseId=${cId}` : ''
      navigateTo('course-details', 'courses', search)
      return
    }

    if (!access.hasAccess) {
      const msg = access.isInactive
        ? 'This course is currently inactive.'
        : '🔒 Course purchase or enrollment required to view lesson.'
      triggerToast(msg)
      setPreviousView(activeView)
      setSelectedCourse(course)
      const search = cId ? `?courseId=${cId}` : ''
      navigateTo('course-details', 'courses', search)
      return
    }

    setPreviousView('course-details')
    setSelectedCourse(course)
    setCourseAction('resume')
    const lId = lesson?.lessonId || lesson?.elementId || lesson?.id
    setTargetLessonId(lId)
    const search = `?courseId=${cId || ''}${lId ? `&lessonId=${lId}` : ''}`
    navigateTo('learning', 'courses', search)
  }

  const handleStartCourse = async (course, action = 'resume', lessonId = null) => {
    const cId = course?.id || course?.course_id
    const token = authService.getToken()
    const access = await courseService.checkCourseAccess(cId, token, course)

    if (access.isExpired) {
      triggerToast('Your course has expired.')
      setPreviousView(activeView)
      setSelectedCourse(course)
      const search = cId ? `?courseId=${cId}` : ''
      navigateTo('course-details', 'courses', search)
      return
    }

    if (!access.hasAccess) {
      const msg = access.isInactive
        ? 'This course is currently inactive.'
        : '🔒 Please complete checkout to access this course.'
      triggerToast(msg)
      setPreviousView(activeView)
      setSelectedCourse(course)
      const search = cId ? `?courseId=${cId}` : ''
      navigateTo('course-details', 'courses', search)
      return
    }

    setPreviousView(activeView)
    setSelectedCourse(course)
    setCourseAction(action)
    setTargetLessonId(lessonId)
    const search = `?courseId=${cId || ''}${lessonId ? `&lessonId=${lessonId}` : ''}`
    navigateTo('learning', 'courses', search)
  }


  const handleOpenDetails = (course) => {
    setDetailsCourse(course)
    setIsDetailsModalOpen(true)
  }



  // Format user points with exactly one decimal place
  const formattedPoints = (userPoints !== null && !isNaN(Number(userPoints)) ? Number(userPoints) : 0).toFixed(1)

  return (
    <div className="dashboard-container position-relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className="dashboard-toast-banner position-fixed top-0 start-50 translate-middle-x mt-3 bg-dark text-white px-4 py-2 rounded-pill shadow-lg d-flex align-items-center gap-2 animate-fade-in"
          style={{ zIndex: 1100, fontSize: '0.85rem' }}
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

      {/* 1. Left Vertical Icon Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-top">
          <div
            className="sidebar-brand-icon cursor-pointer"
            title="Edoomate"
            onClick={() => navigateTo('home', 'home')}
            style={{ cursor: 'pointer' }}
          >
            <img src={edooIcon} alt="Edoo" className="sidebar-logo-img" />
          </div>

          <nav className="sidebar-nav">
            {/* Home */}
            <button
              type="button"
              className={`sidebar-nav-item ${activeNav === 'home' && activeView === 'home' ? 'active' : ''}`}
              onClick={() => navigateTo('home', 'home')}
              title="Home Dashboard"
              id="sidebar-nav-home"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 21V12H15V21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Search Courses / Explore */}
            <button
              type="button"
              className={`sidebar-nav-item ${activeNav === 'search' || activeView === 'explore' ? 'active' : ''}`}
              onClick={() => navigateTo('explore', 'search')}
              title="Search"
              id="sidebar-nav-search"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="11"
                  cy="11"
                  r="8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="21"
                  y1="21"
                  x2="16.65"
                  y2="16.65"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Notification */}
            <button
              type="button"
              className={`sidebar-nav-item position-relative ${isNotificationsOpen ? 'active' : ''}`}
              onClick={() => setIsNotificationsOpen((prev) => !prev)}
              title="Notification"
              id="sidebar-nav-notification"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21S18 15 18 8Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.73 21A2 2 0 0 1 10.27 21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {notifications.some((n) => !n.read) && (
                <span
                  className="position-absolute bg-danger rounded-circle"
                  style={{ width: '8px', height: '8px', top: '9px', right: '9px' }}
                ></span>
              )}
            </button>

            {/* My Learning */}
            <button
              type="button"
              className={`sidebar-nav-item ${activeNav === 'courses' || activeView === 'courses' || activeView === 'learning' ? 'active' : ''}`}
              onClick={() => navigateTo('courses', 'courses')}
              title="My Learning"
              id="sidebar-nav-courses"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="8" cy="6" r="2" fill="white" stroke="currentColor" strokeWidth="2" />
                <circle cx="16" cy="12" r="2" fill="white" stroke="currentColor" strokeWidth="2" />
                <circle cx="10" cy="18" r="2" fill="white" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>

            {/* Leaderboard & Rankings */}
            <button
              type="button"
              className={`sidebar-nav-item ${activeNav === 'leaderboard' || activeNav === 'achievements' || activeView === 'leaderboard' || activeView === 'achievements' ? 'active' : ''}`}
              onClick={() => navigateTo('leaderboard', 'leaderboard')}
              title="Leaderboard & Rankings"
              id="sidebar-nav-leaderboard"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 9C6 11.2091 7.79086 13 10 13H14C16.2091 13 18 11.2091 18 9V4H6V9Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 5H3V8C3 9.65685 4.34315 11 6 11V5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M18 5H21V8C21 9.65685 19.6569 11 18 11V5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 13V18M9 21H15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Analytics */}
            <button
              type="button"
              className={`sidebar-nav-item ${activeNav === 'analytics' || activeView === 'analytics' ? 'active' : ''}`}
              onClick={() => navigateTo('analytics', 'analytics')}
              title="Learning Analytics"
              id="sidebar-nav-analytics"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>

            {/* Settings */}
            <button
              type="button"
              className="sidebar-nav-item"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              id="sidebar-nav-settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </nav>
        </div>

        {/* Bottom Actions: Settings & Logout */}
        <div className="sidebar-bottom gap-2">
          {/* Settings Button */}
          <button
            type="button"
            className="sidebar-settings-btn sidebar-logout-btn mb-2"
            onClick={() => setIsSettingsOpen(true)}
            title="Account Preferences & Settings"
            id="sidebar-settings-btn"
            style={{ color: '#64748b', borderColor: '#e2e8f0', background: '#f8fafc' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </button>

          {/* Logout Button */}
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={onLogout}
            title="Sign Out & Return to Login"
            id="sidebar-logout-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Mobile navigation drawer */}
      {isDrawerOpen && (
        <>
          <div
            className="mobile-drawer-overlay"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
          >
            {/* Drawer Header with Title and Close Button */}
            <div className="mobile-drawer-header">
              <div className="d-flex align-items-center gap-2">
                <img src={edooIcon} alt="Edoo" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                <span className="fw-bold fs-5 text-dark">Edoomate</span>
              </div>
              <button
                type="button"
                className="mobile-drawer-close-btn"
                aria-label="Close navigation menu"
                onClick={() => setIsDrawerOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Navigation List with Icons and Labels */}
            <nav className="mobile-drawer-nav">
              {/* Home */}
              <button
                type="button"
                className={`mobile-drawer-nav-item ${activeNav === 'home' && activeView === 'home' ? 'active' : ''}`}
                onClick={() => { setIsDrawerOpen(false); navigateTo('home', 'home'); }}
              >
                <span className="mobile-drawer-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 21V12H15V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="mobile-drawer-nav-label">Home</span>
              </button>

              {/* Search Courses / Explore */}
              <button
                type="button"
                className={`mobile-drawer-nav-item ${activeNav === 'search' || activeView === 'explore' ? 'active' : ''}`}
                onClick={() => { setIsDrawerOpen(false); navigateTo('explore', 'search'); }}
              >
                <span className="mobile-drawer-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="mobile-drawer-nav-label">Search Courses</span>
              </button>

              {/* Notifications */}
              <button
                type="button"
                className={`mobile-drawer-nav-item ${isNotificationsOpen ? 'active' : ''}`}
                onClick={() => { setIsDrawerOpen(false); setIsNotificationsOpen(prev => !prev); }}
              >
                <span className="mobile-drawer-nav-icon position-relative">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21S18 15 18 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13.73 21A2 2 0 0 1 10.27 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {notifications.some((n) => !n.read) && (
                    <span
                      className="position-absolute bg-danger rounded-circle"
                      style={{ width: '8px', height: '8px', top: '-1px', right: '-1px' }}
                    ></span>
                  )}
                </span>
                <span className="mobile-drawer-nav-label">Notifications</span>
              </button>

              {/* My Learning */}
              <button
                type="button"
                className={`mobile-drawer-nav-item ${activeNav === 'courses' || activeView === 'courses' || activeView === 'learning' ? 'active' : ''}`}
                onClick={() => { setIsDrawerOpen(false); navigateTo('courses', 'courses'); }}
              >
                <span className="mobile-drawer-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="8" cy="6" r="2" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                    <circle cx="16" cy="12" r="2" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
                <span className="mobile-drawer-nav-label">My Learning</span>
              </button>

              {/* Leaderboard & Rankings */}
              <button
                type="button"
                className={`mobile-drawer-nav-item ${activeNav === 'leaderboard' || activeNav === 'achievements' || activeView === 'leaderboard' || activeView === 'achievements' ? 'active' : ''}`}
                onClick={() => { setIsDrawerOpen(false); navigateTo('leaderboard', 'leaderboard'); }}
              >
                <span className="mobile-drawer-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9C6 11.2091 7.79086 13 10 13H14C16.2091 13 18 11.2091 18 9V4H6V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6 5H3V8C3 9.65685 4.34315 11 6 11V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M18 5H21V8C21 9.65685 19.6569 11 18 11V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 13V18M9 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="mobile-drawer-nav-label">Leaderboard</span>
              </button>

              {/* Analytics */}
              <button
                type="button"
                className={`mobile-drawer-nav-item ${activeNav === 'analytics' || activeView === 'analytics' ? 'active' : ''}`}
                onClick={() => { setIsDrawerOpen(false); navigateTo('analytics', 'analytics'); }}
              >
                <span className="mobile-drawer-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </span>
                <span className="mobile-drawer-nav-label">Analytics</span>
              </button>

              {/* Settings */}
              <button
                type="button"
                className="mobile-drawer-nav-item"
                onClick={() => { setIsDrawerOpen(false); setIsSettingsOpen(true); }}
              >
                <span className="mobile-drawer-nav-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </span>
                <span className="mobile-drawer-nav-label">Settings</span>
              </button>
            </nav>

            {/* Bottom Section: Sign Out */}
            <div className="mobile-drawer-footer">
              <button
                type="button"
                className="mobile-drawer-logout-btn"
                onClick={() => { setIsDrawerOpen(false); onLogout?.(); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </>
      )}



      {/* 2. Main Dashboard Area */}
      <div className="dashboard-main-content">
        {/* Top Header */}
        <header className="dashboard-header position-relative">
          <div className="d-flex align-items-center gap-2">
            {/* Mobile Hamburger (visible on mobile <= 767px) */}
            <button
              type="button"
              className="dashboard-mobile-hamburger-btn d-inline-flex d-md-none"
              aria-label="Open navigation menu"
              onClick={() => setIsDrawerOpen(true)}
              title="Open menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div
              className="header-greeting-wrapper cursor-pointer"
              onClick={() => navigateTo('profile', 'profile')}
              title="Click to view Student Profile"
              style={{ cursor: 'pointer' }}
            >
              <div
                className="student-avatar-container cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsAvatarModalOpen(true)
                }}
                title="Click to customize avatar"
                style={{ cursor: 'pointer' }}
              >
                <img
                  src={studentAvatar || studentData.profile.avatar}
                  alt={studentName}
                  className="student-avatar-img"
                />
                <span className="avatar-online-dot"></span>
              </div>
              <div className="header-greeting-text">
                <h1 className="header-greeting-title">
                  Hi, {studentName} <span className="greeting-wave">👋</span>
                </h1>
                <p className="header-greeting-sub">
                  {studentData.profile.greeting}
                </p>
              </div>
            </div>
          </div>

          {/* Header Action Badges */}
          <div className="header-metrics d-flex align-items-center gap-2">
            {/* User Points Badge */}
            <div
              className="metric-badge metric-gems"
              title={pointsError ? `Error: ${pointsError}. Click to retry.` : "Points Balance (Click to refresh)"}
              id="header-gems-badge"
              onClick={fetchUserPoints}
              style={{ cursor: 'pointer' }}
            >
              <span className="metric-icon gems-icon" role="img" aria-label="💎">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 9L12 22L22 9L12 2Z" />
                </svg>
              </span>
              <span className="metric-value">
                {isPointsLoading && userPoints === null ? (
                  <span
                    className="spinner-border spinner-border-sm text-primary"
                    role="status"
                    style={{ width: '0.75rem', height: '0.75rem', borderWidth: '1.5px' }}
                  >
                    <span className="visually-hidden">Loading points...</span>
                  </span>
                ) : pointsError && userPoints === null ? (
                  <span className="text-danger" title={`Error: ${pointsError}. Click to retry.`}>
                    0.0 Points
                  </span>
                ) : (
                  `${formattedPoints} Points`
                )}
              </span>
            </div>
          </div>
        </header>

        {/* Dynamic View Router */}
        {activeView === 'analytics' ? (
          <AnalyticsView
            onBack={() => navigateTo('home', 'home')}
            onOpenCourse={(c) => handleOpenCourseDetails(c)}
            onOpenLesson={async (course, lesson, materialParams = {}) => {
              const cId = course?.id || course?.course_id || (typeof course === 'string' || typeof course === 'number' ? course : null)
              const lId = lesson?.lesson_id || lesson?.id || lesson?.lessonId || (typeof lesson === 'string' || typeof lesson === 'number' ? lesson : null)

              if (cId) {
                const token = authService.getToken()
                const access = await courseService.checkCourseAccess(cId, token, course)
                if (access.isExpired) {
                  triggerToast('Your course has expired.')
                  navigateTo('course-details', 'courses', `?courseId=${cId}`)
                  return
                }
                if (!access.hasAccess) {
                  const msg = access.isInactive
                    ? 'This course is currently inactive.'
                    : '🔒 Course purchase or enrollment required to view lesson.'
                  triggerToast(msg)
                  navigateTo('course-details', 'courses', `?courseId=${cId}`)
                  return
                }
              }
              
              const searchObj = new URLSearchParams()
              if (cId) searchObj.set('courseId', String(cId))
              if (lId) searchObj.set('lessonId', String(lId))
              if (materialParams?.tab) searchObj.set('tab', materialParams.tab)
              if (materialParams?.mode) searchObj.set('mode', materialParams.mode)
              if (materialParams?.testId) searchObj.set('testId', String(materialParams.testId))
              if (materialParams?.videoId) searchObj.set('videoId', String(materialParams.videoId))

              const searchStr = searchObj.toString() ? `?${searchObj.toString()}` : ''

              if (typeof course === 'object' && course !== null) {
                setSelectedCourse(course)
              }
              if (lId) {
                setTargetLessonId(String(lId))
              }
              setCourseAction('resume')
              setPreviousView('analytics')
              navigateTo('learning', 'courses', searchStr)
            }}
          />
        ) : activeView === 'explore' ? (
          <CourseExplorationView
            onSelectCourse={handleOpenCourseDetails}
            onOpenDetails={handleOpenCourseDetails}
            onBack={() => navigateTo('home', 'home')}
          />
        ) : activeView === 'course-details' ? (
          <CourseDetailsView
            course={selectedCourse || studentData.featuredCourse}
            onBack={() => navigateTo('courses', 'courses')}
            onSelectLesson={handleSelectLessonFromCourse}
            onContinueLearning={(c) => handleStartCourse(c, 'continue')}
          />
        ) : activeView === 'test' ? (
          <CourseLearningView
            key={`test-${location.pathname}`}
            course={selectedCourse || studentData.featuredCourse}
            action={courseAction}
            initialLessonId={targetLessonId}
            isDedicatedTestRoute
            onOpenTest={handleOpenTest}
            onBack={() => {
              const cId = searchParams.get('courseId') || (selectedCourse?.id ? String(selectedCourse.id) : null)
              const lId = searchParams.get('lessonId') || targetLessonId
              const qs = new URLSearchParams()
              if (cId) qs.set('courseId', cId)
              if (lId) qs.set('lessonId', lId)
              navigateTo('learning', 'courses', qs.toString())
            }}
            onNavigateCourses={() => navigateTo('courses', 'courses')}
          />
        ) : activeView === 'learning' ? (
          <CourseLearningView
            key={`learning-${selectedCourse?.id || 'default'}`}
            course={selectedCourse || studentData.featuredCourse}
            action={courseAction}
            initialLessonId={targetLessonId}
            onOpenTest={handleOpenTest}
            onBack={() => {
              if (selectedCourse) {
                navigateTo('course-details', 'courses')
              } else {
                navigateTo(previousView === 'learning' ? 'home' : previousView, previousView)
              }
            }}
            onNavigateCourses={() => navigateTo('courses', 'courses')}
          />
        ) : activeView === 'courses' ? (
          <MyCoursesView
            onBack={() => navigateTo('home', 'home')}
            onSelectCourse={handleOpenCourseDetails}
            initialSearch=""
          />
        ) : activeView === 'profile' ? (
          <StudentProfileView
            onBack={() => navigateTo('home', 'home')}
            onNavigateCourses={() => navigateTo('courses', 'courses')}
            studentAvatar={studentAvatar}
            onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            currentUser={currentUser}
          />
        ) : activeView === 'leaderboard' ? (
          <LeaderboardView onBack={() => navigateTo('home', 'home')} />
        ) : activeView === 'achievements' ? (
          <AchievementsView onBack={() => navigateTo('home', 'home')} />
        ) : (
          /* HOME DASHBOARD VIEW (MATCHES REFERENCE FIGMA SCREENSHOT EXACTLY) */
          <div className="dashboard-home-view mt-3 mt-md-4">
            {/* Top Row: Virtual Classroom Banner (Left) + My Rank (Right) */}
            <div className="row g-3 g-xl-4 align-items-stretch mb-3 mb-md-4">
              {/* 1. Virtual Classroom Banner */}
              <div className="col-12 col-lg-7 d-flex">
                <section
                  className="featured-banner virtual-classroom-hero-banner w-100 d-flex flex-column justify-content-between"
                  style={{
                    backgroundColor: '#1e60f0',
                    backgroundImage: 'linear-gradient(135deg, #2065f6 0%, #1752df 100%)',
                    borderRadius: '24px',
                    padding: '1.75rem 2rem',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 30px rgba(30, 96, 240, 0.16)',
                    minHeight: '250px',
                  }}
                >
                  <div className="featured-banner-content position-relative" style={{ zIndex: 2, maxWidth: '420px' }}>
                    <span
                      className="banner-tag mb-3 d-inline-flex align-items-center gap-2"
                      style={{
                        background: 'rgba(255, 255, 255, 0.18)',
                        backdropFilter: 'blur(4px)',
                        padding: '4px 14px',
                        borderRadius: '9999px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: '#ffffff',
                      }}
                    >
                      <span
                        className="live-pulse-dot"
                        style={{ backgroundColor: '#22c55e', width: '8px', height: '8px', borderRadius: '50%' }}
                      ></span>{' '}
                      Live Now
                    </span>

                    <h2
                      className="banner-course-title text-white fw-bolder mb-2"
                      style={{
                        fontSize: 'clamp(1.6rem, 2.6vw, 2.25rem)',
                        letterSpacing: '-0.025em',
                        lineHeight: 1.15,
                      }}
                    >
                      Virtual Class Room
                    </h2>

                    <p
                      className="banner-course-desc text-white mb-4"
                      style={{
                        opacity: 0.9,
                        fontSize: 'clamp(0.85rem, 1.1vw, 0.95rem)',
                        lineHeight: '1.5',
                        maxWidth: '380px',
                      }}
                    >
                      {studentData.virtualClassroom.description}
                    </p>

                    <div>
                      <div
                        className="d-inline-block"
                        style={{ cursor: classroomStatus.isActive ? 'default' : 'not-allowed' }}
                        title={
                          classroomStatus.isActive
                            ? activeClassroomSession?.hasJoined
                              ? 'Resume Virtual Classroom Session'
                              : 'Enter Virtual Classroom'
                            : 'Virtual Classroom is currently unavailable'
                        }
                      >
                        <button
                          type="button"
                          className="btn btn-enter-classroom-hero rounded-pill fw-bold d-inline-flex align-items-center gap-2 shadow-sm"
                          id="btn-enter-classroom-hero"
                          disabled={!classroomStatus.isActive || isClassroomLoading}
                          aria-disabled={!classroomStatus.isActive || isClassroomLoading}
                          tabIndex={classroomStatus.isActive ? 0 : -1}
                          onClick={
                            classroomStatus.isActive && !isClassroomLoading
                              ? handleEnterClassroom
                              : (e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                }
                          }
                          onKeyDown={(e) => {
                            if (!classroomStatus.isActive) {
                              e.preventDefault()
                              e.stopPropagation()
                            }
                          }}
                          style={{
                            backgroundColor: '#ffffff',
                            color: '#0f172a',
                            padding: '0.62rem 1.4rem',
                            fontSize: '0.88rem',
                            border: 'none',
                          }}
                        >
                          {isClassroomLoading ? (
                            <span className="d-flex align-items-center gap-2">
                              <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
                              <span>Connecting...</span>
                            </span>
                          ) : activeClassroomSession?.hasJoined ? (
                            <span className="d-flex align-items-center gap-1.5">
                              <span>Resume Classroom</span>
                              <span
                                className="badge bg-primary text-white rounded-pill px-2 py-0.5"
                                style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.02em' }}
                              >
                                Re-enter
                              </span>
                            </span>
                          ) : (
                            <span className="d-flex align-items-center gap-2">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="#2563eb">
                                <path d="M22 8L16 12L22 16V8Z" />
                                <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                              </svg>
                              <span>Enter Classroom</span>
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 3D Character Illustration on the right */}
                  <div
                    className={`featured-banner-visual ${classroomStatus.isActive ? 'cursor-pointer' : ''}`}
                    onClick={classroomStatus.isActive ? handleEnterClassroom : undefined}
                    title={
                      classroomStatus.isActive
                        ? 'Click to enter Virtual Study Room'
                        : 'Virtual Classroom is currently unavailable'
                    }
                    style={{
                      cursor: classroomStatus.isActive ? 'pointer' : 'default',
                      position: 'absolute',
                      right: '0',
                      bottom: '0',
                      height: '100%',
                      width: '45%',
                      maxWidth: '360px',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'flex-end',
                      pointerEvents: classroomStatus.isActive ? 'auto' : 'none',
                    }}
                  >
                    <img
                      src={studentData.virtualClassroom.tutorImage}
                      alt="Virtual Classroom Tutor"
                      className="banner-tutor-img"
                      style={{
                        height: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        objectFit: 'contain',
                        objectPosition: 'bottom right',
                      }}
                    />
                  </div>
                </section>
              </div>

              {/* 2. My Rank Card (Replaces Purchased Course) */}
              <div className="col-12 col-lg-5 d-flex">
                <section
                  className="my-rank-standalone-section p-3.5 p-xl-4 bg-white rounded-4 border border-light-subtle shadow-xs d-flex flex-column justify-content-between w-100 h-100"
                  style={{
                    borderRadius: '24px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                    minHeight: '250px',
                    width: '100%',
                  }}
                  aria-label="My Rank"
                >
                  <div>
                    {/* Header Row */}
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ width: '28px', height: '28px', backgroundColor: '#fef3c7', color: '#d97706' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                            <path d="M4 22h16" />
                            <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
                            <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
                            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                          </svg>
                        </span>
                        <h3 className="mb-0 fw-bold text-dark" style={{ fontSize: '1.05rem' }}>
                          My Rank
                        </h3>
                      </div>
                      {typeof myRankData.rank === 'number' && (
                        <span
                          className="badge rounded-pill px-2.5 py-1 small fw-semibold"
                          style={{
                            backgroundColor: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #dbeafe',
                            fontSize: '0.7rem',
                          }}
                        >
                          Live Standing
                        </span>
                      )}
                    </div>

                    {/* Loading State */}
                    {isRankLoading && (
                      <div className="d-flex flex-column align-items-center justify-content-center py-4 text-center">
                        <div className="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                        <span className="text-muted smaller">Loading rank...</span>
                      </div>
                    )}

                    {/* Error State */}
                    {!isRankLoading && rankError && (
                      <div className="d-flex flex-column align-items-center justify-content-center py-3 text-center">
                        <span className="text-danger small mb-2">⚠️ {rankError}</span>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm rounded-pill px-3 py-1 smaller"
                          onClick={fetchMyRank}
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {/* Active Rank Content State */}
                    {!isRankLoading && !rankError && myRankData.hasData && (
                      <div>
                        {/* Student Info & Prominent Rank Display */}
                        <div className="d-flex align-items-center justify-content-between p-2.5 rounded-3 bg-light border border-light-subtle mb-3">
                          <div className="d-flex align-items-center gap-2.5 min-w-0">
                            <InitialsAvatar
                              name={currentUser?.full_name || currentUser?.first_name || studentData.profile.name}
                              size={40}
                              className="shadow-xs"
                            />
                            <div className="min-w-0">
                              <h4
                                className="fw-bold text-dark mb-0 text-truncate"
                                style={{ fontSize: '0.9rem', lineHeight: '1.25' }}
                                title={currentUser?.full_name || studentData.profile.name}
                              >
                                {currentUser?.full_name || currentUser?.first_name || studentData.profile.name}
                              </h4>
                              <div className="d-flex align-items-center gap-1.5 flex-wrap mt-0.5">
                                {myRankData.grade && (
                                  <span className="text-muted smaller" style={{ fontSize: '0.68rem' }}>
                                    Grade {myRankData.grade}
                                  </span>
                                )}
                                {myRankData.schoolName && (
                                  <span className="text-muted smaller text-truncate" style={{ fontSize: '0.68rem', maxWidth: '120px' }} title={myRankData.schoolName}>
                                    • {myRankData.schoolName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Prominent Rank Number */}
                          <div className="text-end flex-shrink-0 ps-2">
                            <div
                              className="fw-bolder"
                              style={{
                                fontSize: '1.35rem',
                                lineHeight: '1.1',
                                color: '#2563eb',
                                letterSpacing: '-0.02em',
                              }}
                            >
                              {typeof myRankData.rank === 'number' ? `#${myRankData.rank}` : '—'}
                            </div>
                            <span className="text-muted smaller text-uppercase fw-semibold" style={{ fontSize: '0.65rem' }}>
                              Rank
                            </span>
                          </div>
                        </div>

                        {/* Supporting Metrics: Points & Participants */}
                        <div className="row g-2 mb-3 mt-3 text-center">
                          {(myRankData.points !== null || userPoints !== null) && (
                            <div className="col">
                              <div className="p-2 rounded-3 border bg-white shadow-xs">
                                <div className="fw-bold text-dark" style={{ fontSize: '0.88rem' }}>
                                  {myRankData.points !== null ? myRankData.points : userPoints}
                                </div>
                                <div className="text-muted text-uppercase smaller fw-medium" style={{ fontSize: '0.65rem' }}>
                                  Points
                                </div>
                              </div>
                            </div>
                          )}

                          {typeof myRankData.totalParticipants === 'number' && (
                            <div className="col">
                              <div className="p-2 rounded-3 border bg-white shadow-xs">
                                <div className="fw-bold text-dark" style={{ fontSize: '0.88rem' }}>
                                  {myRankData.totalParticipants}
                                </div>
                                <div className="text-muted text-uppercase smaller fw-medium" style={{ fontSize: '0.65rem' }}>
                                  Participants
                                </div>
                              </div>
                            </div>
                          )}

                          {myRankData.trend && (
                            <div className="col">
                              <div className="p-2 rounded-3 border bg-white shadow-xs">
                                <div
                                  className="fw-bold"
                                  style={{
                                    fontSize: '0.88rem',
                                    color: myRankData.trend === 'up' ? '#16a34a' : myRankData.trend === 'down' ? '#dc2626' : '#64748b',
                                  }}
                                >
                                  {myRankData.trend === 'up' ? '▲ Up' : myRankData.trend === 'down' ? '▼ Down' : '— Stable'}
                                </div>
                                <div className="text-muted text-uppercase smaller fw-medium" style={{ fontSize: '0.65rem' }}>
                                  Movement
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {!isRankLoading && !rankError && !myRankData.hasData && (
                      <div className="d-flex flex-column align-items-center justify-content-center py-3 text-center">
                        <p className="text-muted smaller mb-2" style={{ maxWidth: '240px', fontSize: '0.75rem', lineHeight: '1.4' }}>
                          Participate in lessons and tests to earn points and view your class rank.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* View Leaderboard Action */}
                  <button
                    type="button"
                    className="btn btn-outline-primary w-100 rounded-pill py-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 mt-auto"
                    style={{ fontSize: '0.82rem', borderColor: '#bfdbfe', color: '#2563eb' }}
                    onClick={() => navigateTo('leaderboard', 'leaderboard')}
                    id="btn-view-leaderboard-home"
                  >
                    <span>View Leaderboard</span>
                    <span>→</span>
                  </button>
                </section>
              </div>
            </div>

            {/* Row 2: My Learning, Analytics, and Active Courses side-by-side in 3 equal columns */}
            <section className="dashboard-quick-actions mt-3 mt-lg-4 mb-4" aria-label="Dashboard Main Actions">
              <div className="row g-3 g-xl-4 align-items-stretch">
                {/* 1. My Learnings — first on desktop (order-lg-1), second on mobile (order-2) */}
                <div className="col-12 col-md-6 col-lg-4 d-flex order-2 order-lg-1">
                  <div
                    className="quick-action-card card-my-learnings cursor-pointer p-3.5 p-xl-4 rounded-4 d-flex flex-column justify-content-between w-100 h-100 position-relative overflow-hidden"
                    onClick={() => navigateTo('courses', 'courses')}
                    id="card-quick-my-learnings"
                    style={{
                      background: 'radial-gradient(circle at 100% 100%, #ffedd5 0%, #fff7ed 35%, #ffffff 70%)',
                      border: '1px solid #f1f5f9',
                      minHeight: '220px',
                      cursor: 'pointer',
                      borderRadius: '24px',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                      position: 'relative',
                    }}
                    title="View all enrolled courses and learnings"
                  >
                    <div>
                      {/* Top Bar: Icon + Action Arrow */}
                      <div className="d-flex align-items-center justify-content-between mb-3.5">
                        <div
                          className="rounded-3 d-flex align-items-center justify-content-center shadow-xs"
                          style={{ width: '38px', height: '38px', backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '12px' }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5C4 18.1 5.1 17 6.5 17H20M4 19.5C4 20.9 5.1 22 6.5 22H20V2H6.5C5.1 2 4 3.1 4 4.5V19.5Z" />
                          </svg>
                        </div>
                        <span
                          className="rounded-circle d-flex align-items-center justify-content-center bg-white border text-primary"
                          style={{ width: '32px', height: '32px', borderColor: '#e2e8f0', color: '#2563eb' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 className="fw-bold text-dark mb-1.5" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>
                        My Learnings
                      </h3>
                      <p className="text-secondary mb-0" style={{ fontSize: '0.82rem', lineHeight: '1.45', maxWidth: '210px' }}>
                        Continue your courses, track progress and achieve your goals.
                      </p>
                    </div>

                    {/* 3D Stack of Books Graphic */}
                    <img
                      src={illustrationBooks3D}
                      alt="3D Books"
                      style={{
                        position: 'absolute',
                        right: '16px',
                        bottom: '12px',
                        width: '95px',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />
                  </div>
                </div>

                {/* 2. Analytics — second on desktop (order-lg-2), third on mobile (order-3) */}
                <div className="col-12 col-md-6 col-lg-4 d-flex order-3 order-lg-2">
                  <div
                    className="quick-action-card card-analytics cursor-pointer p-3.5 p-xl-4 rounded-4 d-flex flex-column justify-content-between w-100 h-100 position-relative overflow-hidden"
                    onClick={() => navigateTo('analytics', 'analytics')}
                    id="card-quick-analytics"
                    style={{
                      background: 'radial-gradient(circle at 100% 100%, #d1fae5 0%, #ecfdf5 35%, #ffffff 70%)',
                      border: '1px solid #f1f5f9',
                      minHeight: '220px',
                      cursor: 'pointer',
                      borderRadius: '24px',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                      position: 'relative',
                    }}
                    title="View academic analytics, streaks, and achievements"
                  >
                    <div>
                      {/* Top Bar: Icon + Action Arrow */}
                      <div className="d-flex align-items-center justify-content-between mb-3.5">
                        <div
                          className="rounded-3 d-flex align-items-center justify-content-center shadow-xs"
                          style={{ width: '38px', height: '38px', backgroundColor: '#d1fae5', color: '#10b981', borderRadius: '12px' }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                          </svg>
                        </div>
                        <span
                          className="rounded-circle d-flex align-items-center justify-content-center bg-white border text-primary"
                          style={{ width: '32px', height: '32px', borderColor: '#e2e8f0', color: '#2563eb' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 className="fw-bold text-dark mb-1.5" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>
                        Analytics
                      </h3>
                      <p className="text-secondary mb-0" style={{ fontSize: '0.82rem', lineHeight: '1.45', maxWidth: '210px' }}>
                        View your performance, progress and detailed insights.
                      </p>
                    </div>

                    {/* 3D Rising Chart Graphic */}
                    <img
                      src={illustrationChart3D}
                      alt="3D Chart"
                      style={{
                        position: 'absolute',
                        right: '16px',
                        bottom: '12px',
                        width: '95px',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />
                  </div>
                </div>

                {/* 3. Active Courses — third on desktop (order-lg-3), FIRST on mobile (order-1) */}
                <div className="col-12 col-lg-4 d-flex order-1 order-lg-3">
                  <section
                    className="active-courses-standalone-section p-3.5 p-xl-4 bg-white rounded-4 border border-light-subtle shadow-xs d-flex flex-column justify-content-between w-100 h-100 position-relative overflow-hidden"
                    style={{
                      borderRadius: '24px',
                      background: 'radial-gradient(circle at 100% 100%, #dbeafe 0%, #eff6ff 35%, #ffffff 70%)',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                      minHeight: '220px',
                      width: '100%',
                      position: 'relative',
                    }}
                    aria-label="Active Courses"
                  >
                    <div>
                      {/* Top Bar: Icon */}
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <div
                          className="rounded-3 d-flex align-items-center justify-content-center shadow-xs"
                          style={{ width: '38px', height: '38px', backgroundColor: '#dbeafe', color: '#2563eb', borderRadius: '12px' }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        </div>
                        {activeCoursesList.length > 0 && (
                          <span className="badge bg-light text-secondary border rounded-pill px-2.5 py-1 small fw-semibold" style={{ fontSize: '0.7rem' }}>
                            {activeCoursesList.length} {activeCoursesList.length === 1 ? 'Course' : 'Courses'}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="fw-bold text-dark mb-1.5" style={{ fontSize: '1.15rem', letterSpacing: '-0.01em' }}>
                        Active Courses
                      </h3>

                      {/* Loading State */}
                      {isActiveCoursesLoading && (
                        <div className="d-flex flex-column align-items-center justify-content-center py-3 text-center">
                          <div className="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                          <span className="text-muted smaller">Loading active courses...</span>
                        </div>
                      )}

                      {/* Error State */}
                      {!isActiveCoursesLoading && activeCoursesError && (
                        <div className="d-flex flex-column align-items-center justify-content-center py-2 text-center">
                          <span className="text-danger small mb-1.5">⚠️ {activeCoursesError}</span>
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm rounded-pill px-3 py-1 smaller"
                            onClick={fetchPurchasedCourse}
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Active Courses Content - Compact Horizontal Scroll if user has active courses */}
                      {!isActiveCoursesLoading && !activeCoursesError && activeCoursesList.length > 0 && (
                        <div className="active-courses-scroll-container d-flex flex-row flex-nowrap overflow-x-auto pb-2 pt-1 mb-2" style={{ zIndex: 2, position: 'relative' }}>
                          {activeCoursesList.map((courseItem) => (
                            <div
                              key={`active-course-list-${courseItem.id || courseItem.title}`}
                              className="active-course-card-compact-wrapper flex-shrink-0 w-100"
                            >
                              <div
                                className="active-course-card h-100 d-flex flex-column bg-white p-2.5 rounded-3 border"
                                onClick={() => handleStartCourse(courseItem.raw || courseItem, 'resume')}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && handleStartCourse(courseItem.raw || courseItem, 'resume')}
                                aria-label={`Continue ${courseItem.title}`}
                              >
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <span className="badge bg-primary-subtle text-primary fw-semibold" style={{ fontSize: '0.65rem' }}>
                                    {courseItem.subject || 'Course'}
                                  </span>
                                  {courseItem.progress > 0 && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#2563eb' }}>
                                      {courseItem.progress}%
                                    </span>
                                  )}
                                </div>
                                <h4 className="active-course-title-clamp fw-bold text-dark mb-1 text-truncate" style={{ fontSize: '0.82rem' }}>
                                  {courseItem.title}
                                </h4>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Empty State matching mockup */}
                      {!isActiveCoursesLoading && !activeCoursesError && activeCoursesList.length === 0 && (
                        <div className="mb-3" style={{ position: 'relative', zIndex: 2 }}>
                          <p className="text-secondary mb-2" style={{ fontSize: '0.82rem', lineHeight: '1.4' }}>
                            No active courses currently enrolled.
                          </p>
                          <button
                            type="button"
                            className="btn btn-outline-primary rounded-pill px-3 py-1.5 fw-semibold"
                            style={{ fontSize: '0.8rem', borderColor: '#2563eb', color: '#2563eb' }}
                            onClick={() => navigateTo('explore', 'explore')}
                          >
                            Browse Courses
                          </button>
                        </div>
                      )}
                    </div>

                    {/* View More Button (Outline pill pinned to bottom) */}
                    <button
                      type="button"
                      className="btn btn-outline-primary w-100 rounded-pill py-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 mt-auto"
                      style={{ fontSize: '0.82rem', borderColor: '#bfdbfe', color: '#2563eb', zIndex: 2, position: 'relative' }}
                      onClick={() => navigateTo('courses', 'courses')}
                      id="btn-view-more-active-courses"
                    >
                      <span>View More</span>
                      <span>→</span>
                    </button>

                    {/* 3D Graduation Cap Graphic */}
                    <img
                      src={illustrationCap3D}
                      alt="3D Graduation Cap"
                      style={{
                        position: 'absolute',
                        right: '12px',
                        bottom: '10px',
                        width: '98px',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />
                  </section>
                </div>
              </div>
            </section>

            {/* Row 3: Settings */}
            <section className="dashboard-settings-section mt-3 mt-lg-4" aria-label="Settings Access">
              <div className="row">
                <div className="col-12">
                  <div
                    className="quick-action-card card-settings cursor-pointer p-3 p-md-3.5 px-4 rounded-4 d-flex align-items-center justify-content-between w-100"
                    onClick={() => setIsSettingsOpen(true)}
                    id="card-quick-settings"
                    style={{
                      background: 'radial-gradient(circle at 100% 100%, #ede9fe 0%, #f5f3ff 35%, #ffffff 70%)',
                      border: '1px solid #f1f5f9',
                      minHeight: '82px',
                      cursor: 'pointer',
                      borderRadius: '24px',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                    }}
                    title="Open preferences and account settings"
                  >
                    <div className="d-flex align-items-center gap-3 min-w-0">
                      <div
                        className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 shadow-xs"
                        style={{ width: '42px', height: '42px', backgroundColor: '#f3e8ff', color: '#9333ea', borderRadius: '14px' }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h4 className="fw-bold text-dark mb-0.5" style={{ fontSize: '1.05rem', letterSpacing: '-0.01em' }}>Settings</h4>
                        <p className="text-secondary smaller mb-0 text-truncate" style={{ fontSize: '0.82rem' }}>
                          Manage your account, preferences and study settings.
                        </p>
                      </div>
                    </div>

                    <span
                      className="rounded-circle d-flex align-items-center justify-content-center bg-white border text-primary flex-shrink-0 ms-3"
                      style={{ width: '32px', height: '32px', borderColor: '#e2e8f0', color: '#2563eb' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </section>

          </div>
        )}
      </div>

      {/* Global Modals */}
      <VirtualClassroomModal
        isOpen={isClassroomOpen}
        onClose={() => {
          setIsClassroomOpen(false)
          setClassroomError(null)
        }}
        classroomData={classroomData}
        classroomError={classroomError}
        isLoading={isClassroomLoading}
        onRetry={handleEnterClassroom}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false)
          if (window.location.hash === '#settings') {
            window.location.hash = '#dashboard'
          }
        }}
        onProfileUpdated={(updatedUser) => {
          setCurrentUser(updatedUser)
          triggerToast('🎉 Profile updated successfully!')
        }}
        onLogout={onLogout}
        onOpenProfileSetup={() => {
          setIsFromRegistration(false)
          try {
            sessionStorage.removeItem('edoomate_is_new_registration')
          } catch {}
          setIsSettingsOpen(false)
          setIsProfileSetupOpen(true)
        }}
      />

      {/* Basic Profile Setup / Subject Knowledge Assessment Modal */}
      <BasicProfileSetupModal
        isOpen={isProfileSetupOpen}
        defaultGrade={currentUser?.grade || 'V'}
        showSkip={isFromRegistration}
        onSkip={() => {
          setIsProfileSetupOpen(false)
          setIsFromRegistration(false)
          try {
            sessionStorage.removeItem('edoomate_is_new_registration')
            localStorage.setItem('edoomate_assessment_skipped', 'true')
          } catch {}
          if (window.location.hash === '#profile-setup' || window.location.hash === '#assessment') {
            window.location.hash = '#dashboard'
          }
          if (location.pathname.includes('/profile-setup') || location.pathname.includes('/assessment')) {
            navigate('/dashboard', { replace: true })
          }
        }}
        onClose={() => {
          setIsProfileSetupOpen(false)
          setIsFromRegistration(false)
          try {
            sessionStorage.removeItem('edoomate_is_new_registration')
          } catch {}
          if (window.location.hash === '#profile-setup' || window.location.hash === '#assessment') {
            window.location.hash = '#dashboard'
          }
          if (location.pathname.includes('/profile-setup') || location.pathname.includes('/assessment')) {
            navigate('/dashboard', { replace: true })
          }
        }}
        onComplete={() => {
          setIsProfileSetupOpen(false)
          setIsFromRegistration(false)
          try {
            sessionStorage.removeItem('edoomate_is_new_registration')
          } catch {}
          triggerToast('🎉 Profile setup & subject assessment saved!')
          if (location.pathname.includes('/profile-setup') || location.pathname.includes('/assessment')) {
            navigate('/dashboard', { replace: true })
          }
        }}
      />

      <CourseDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        course={detailsCourse}
        onStartLearning={(c) => handleStartCourse(c, c?.progress > 0 ? 'resume' : 'start')}
      />

      <AvatarSelectionModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatar={studentAvatar}
        onAvatarSaved={(newAvatar, res) => {
          setStudentAvatar(newAvatar)
          triggerToast(res?.message || '🎉 Avatar updated and saved successfully!')
        }}
      />

      {/* Notifications Dropdown Panel */}
      <NotificationsPanel
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => {
          const updated = notificationService.markAllAsRead()
          setNotifications(updated)
          triggerToast('All notifications marked as read')
        }}
        onClearNotification={(id) => {
          const updated = notificationService.clearNotification(id)
          setNotifications(updated)
        }}
      />
    </div>
  )
}
