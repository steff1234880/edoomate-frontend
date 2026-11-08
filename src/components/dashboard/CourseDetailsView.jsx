import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { courseService } from '../../services/courseService'
import { authService } from '../../services/authService'

/**
 * CourseDetailsView
 *
 * Implements:
 * 1. Course Details Page (Reference Screenshot 1):
 *    - Course Banner, course name, grade/subject badges, progress %
 *    - Key Course Metrics: Units, Lessons, Practice Tests, Video Lessons, Duration
 *    - Continue Learning / Start Learning button
 *    - List of units belonging to the selected course
 * 2. Unit Click -> Expand Lesson Names as a Dropdown:
 *    - Expand/collapse unit inline on the same page
 *    - Display lesson names in dropdown/accordion style underneath
 *    - Clicking unit again collapses it
 *    - Does NOT navigate directly to lesson details
 * 3. Lesson Name Click:
 *    - Calls onSelectLesson(course, lesson) to navigate to Lesson Details (Screenshot 2)
 */
export default function CourseDetailsView({
  course,
  onBack,
  onSelectLesson,
  onContinueLearning,
  onPaymentSuccess,
}) {
  const [courseData, setCourseData] = useState(course || null)
  const [units, setUnits] = useState([])
  const [expandedUnitIds, setExpandedUnitIds] = useState({})
  const [unitLessons, setUnitLessons] = useState({}) // { [unitId]: [lessons] }
  const [loadingUnits, setLoadingUnits] = useState({}) // { [unitId]: boolean }
  const [isLoadingCourse, setIsLoadingCourse] = useState(false)
  const [courseError, setCourseError] = useState(null)

  // Selected media state for the Hero media section
  const [selectedHeroMedia, setSelectedHeroMedia] = useState(null)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoLoading, setIsVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState(null)

  // Access control & enrollment state
  const [accessState, setAccessState] = useState({
    isLoading: true,
    hasAccess: false,
    isExpired: false,
    status: 'checking',
    reason: '',
  })

  // Checkout & Payment View Navigation ('none' | 'checkout' | 'payment_gateway' | 'verifying' | 'result')
  const [checkoutFlowView, setCheckoutFlowView] = useState('none')
  const [paymentSession, setPaymentSession] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState(null) // 'success' | 'failed' | 'pending' | 'cancelled'
  const [paymentError, setPaymentError] = useState(null)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  const currentUser = authService.getUser() || {}

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const verifyingSessionRef = useRef(null)
  const courseId = course?.id || course?.course_id || searchParams.get('courseId')


  // Verify Course Access via authoritative backend API (GET /api/my-learning)
  const verifyAccess = async (meta = course) => {
    setAccessState((prev) => ({ ...prev, isLoading: true }))
    try {
      const token = authService.getToken()
      const access = await courseService.checkCourseAccess(courseId, token, meta)
      setAccessState({
        isLoading: false,
        hasAccess: access.hasAccess,
        isExpired: access.isExpired,
        status: access.status,
        reason: access.reason,
      })
      return access
    } catch (err) {
      setAccessState({
        isLoading: false,
        hasAccess: false,
        isExpired: false,
        status: 'error',
        reason: err.message || 'Access verification failed',
      })
      return { hasAccess: false }
    }
  }

  // Fetch full course details & units from API
  useEffect(() => {
    let isMounted = true

    async function fetchCourseInfo() {
      if (!courseId) return
      setIsLoadingCourse(true)
      setCourseError(null)

      try {
        const token = authService.getToken()
        const cleanId = String(courseId).replace(/^api-/, '')
        const apiDetails = await courseService.getCourseDetails(cleanId, token)

        if (!isMounted) return

        if (apiDetails) {
          setCourseData((prev) => ({
            ...prev,
            ...apiDetails,
          }))
          verifyAccess(apiDetails)

          // Extract units from course_link_details
          const linkUnits = apiDetails.course_link_details || []
          if (linkUnits.length > 0) {
            setUnits(linkUnits)
          } else if (apiDetails.modules && apiDetails.modules.length > 0) {
            setUnits(apiDetails.modules)
          } else if (course?.modules && course.modules.length > 0) {
            setUnits(course.modules)
          }
        } else if (course?.modules && course.modules.length > 0) {
          setUnits(course.modules)
        }
      } catch (err) {
        console.warn('Failed to load course details from API:', err)
        if (isMounted) {
          setCourseError('Unable to load latest course details from server.')
          if (course?.modules) setUnits(course.modules)
        }
      } finally {
        if (isMounted) setIsLoadingCourse(false)
      }
    }

    fetchCourseInfo()

    return () => {
      isMounted = false
    }
  }, [courseId])

  // Toggle unit accordion & load lessons on demand if not already loaded
  const toggleUnit = async (unit) => {
    const uId = unit.unit_id || unit.id || unit.element_id
    if (!uId) return

    const isCurrentlyExpanded = Boolean(expandedUnitIds[uId])

    // If collapsing, just toggle off
    if (isCurrentlyExpanded) {
      setExpandedUnitIds((prev) => ({ ...prev, [uId]: false }))
      return
    }

    // Expand
    setExpandedUnitIds((prev) => ({ ...prev, [uId]: true }))

    // If unit already has lessons in state or in object, don't re-fetch
    if (unitLessons[uId] && unitLessons[uId].length > 0) {
      return
    }

    if (Array.isArray(unit.lessons) && unit.lessons.length > 0) {
      setUnitLessons((prev) => ({ ...prev, [uId]: unit.lessons }))
      return
    }

    // Fetch unit details from API (GET /api/unit/{id})
    setLoadingUnits((prev) => ({ ...prev, [uId]: true }))
    try {
      const token = authService.getToken()
      const unitResp = await courseService.getUnitDetails(uId, token)

      const rawLessons = unitResp?.unit_link_details || []
      const lessonsList = rawLessons.map((l, idx) => {
        const lImg = l.lesson_image_url || (l.lesson_image ? (l.lesson_image.startsWith('http') ? l.lesson_image : `https://edoomate.myieltspartner.com/storage/lesson_image/${l.lesson_image}`) : null)
        const lVideo = l.video_url || l.stream_url || l.preview_video_url || null
        return {
          id: `lesson-${l.element_id || l.id}`,
          elementId: l.element_id || l.id,
          lessonId: l.element_id || l.id,
          title: l.title || `Lesson ${idx + 1}`,
          order: l.order || idx + 1,
          imageUrl: lImg,
          videoUrl: lVideo,
          elementType: l.element_type || 'lesson',
          duration: unitResp?.unit_details?.duration || '15 min',
          unitId: uId,
          unitTitle: unit.title || unitResp?.unit_name,
        }
      })

      setUnitLessons((prev) => ({
        ...prev,
        [uId]: lessonsList,
      }))
    } catch (err) {
      console.warn(`Failed to fetch lessons for unit ${uId}:`, err)
    } finally {
      setLoadingUnits((prev) => ({ ...prev, [uId]: false }))
    }
  }

  // Derive metrics from course details or fallbacks
  const cDetails = courseData?.course_details || {}
  const totalUnits = cDetails.total_units ?? units.length ?? 1
  const totalLessons = cDetails.total_lessons ?? courseData?.total_lessons ?? 8
  const totalTests = cDetails.total_tests ?? 0
  const totalVideos = cDetails.total_videos ?? 1
  const durationText =
    cDetails.total_duration ||
    courseData?.total_duration ||
    courseData?.duration ||
    '05:21:43'

  // Progress calculation
  let progress = courseData?.progress ?? 0
  if (courseData?.progress_percentage !== undefined) {
    progress = courseData.progress_percentage
  }

  // Normalize course video URL if present (from preview_video_url or preview_video)
  const courseVideoUrl =
    courseData?.preview_video_url ||
    (courseData?.preview_video && courseData.preview_video !== 'undefined'
      ? courseData.preview_video.startsWith('http')
        ? courseData.preview_video
        : courseData.preview_video.startsWith('/')
        ? `https://edoomate.myieltspartner.com${courseData.preview_video}`
        : `https://edoomate.myieltspartner.com/storage/course_videos/${courseData.preview_video}`
      : null)

  // Normalize course thumbnail/image URL
  const courseImageUrl =
    courseData?.video_thumbnails_url ||
    courseData?.thumbnail_url ||
    courseData?.thumbnail ||
    (courseData?.video_thumbnail
      ? courseData.video_thumbnail.startsWith('http')
        ? courseData.video_thumbnail
        : `https://edoomate.myieltspartner.com/storage/video_thumbnails/${courseData.video_thumbnail}`
      : null) ||
    courseData?.vortexImage ||
    'https://edoomate.myieltspartner.com/images/admin_panel/shape_1.png'

  // Determine active hero media:
  // If user selected a specific lesson or material, use that; otherwise use course's designated media
  const activeMedia = selectedHeroMedia || {
    type: courseVideoUrl ? 'video' : 'image',
    videoUrl: courseVideoUrl,
    imageUrl: courseImageUrl,
    title: courseData?.title || 'Course Media',
    isCourseMedia: true,
  }

  // Banner image fallback for poster / placeholder
  const bannerImage = activeMedia.imageUrl || courseImageUrl

  // Pricing & Access calculations
  const price = courseData?.discounted_price || courseData?.price || '29.00'
  const isFree = courseData?.is_free === true || courseData?.is_free === 1 || parseFloat(price) === 0
  const isExpired = accessState.isExpired
  const hasAccess = !isExpired && (isFree || accessState.hasAccess)

  // Clean URL query parameters helper to avoid lingering or duplicate session triggers
  const cleanUrlParams = () => {
    try {
      const url = new URL(window.location.href)
      let changed = false
      ;['session_id', 'stripe_session_id', 'payment_status', 'status'].forEach((param) => {
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param)
          changed = true
        }
      })
      if (changed) {
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash)
      }
    } catch {}
  }

  // Guard against back-navigation showing open checkout modal when course already owned/active
  useEffect(() => {
    if (hasAccess && checkoutFlowView === 'checkout') {
      setCheckoutFlowView('none')
    }
  }, [hasAccess, checkoutFlowView])

  // Handle browser back-button (popstate) to dismiss checkout overlay cleanly
  useEffect(() => {
    const handlePopState = () => {
      if (checkoutFlowView === 'checkout' || checkoutFlowView === 'verifying') {
        setCheckoutFlowView('none')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [checkoutFlowView])

  // Automatic Stripe Return Callback & Authoritative Confirmation Handler
  useEffect(() => {
    const sessionId = searchParams.get('session_id') || searchParams.get('stripe_session_id')
    const paymentStatusParam = searchParams.get('payment_status') || searchParams.get('status')

    if (!sessionId && !paymentStatusParam) return

    // 1. Returning with session_id from successful Stripe Checkout
    if (sessionId) {
      const sessionKey = `edoomate_stripe_${sessionId}`
      const isAlreadyConfirmed = sessionStorage.getItem(sessionKey) === 'confirmed'

      // Prevent duplicate verification if already confirmed
      if (isAlreadyConfirmed) {
        cleanUrlParams()
        courseService.clearMyLearningCache()
        if (onPaymentSuccess) {
          onPaymentSuccess(courseData)
        } else {
          navigate('/courses', { replace: true })
        }
        return
      }

      // In-flight guard to prevent duplicate concurrent confirmation API calls
      if (verifyingSessionRef.current === sessionId) return
      verifyingSessionRef.current = sessionId

      const token = authService.getToken()
      if (!token) {
        cleanUrlParams()
        return
      }

      setIsProcessingPayment(true)
      setCheckoutFlowView('verifying')

      courseService
        .verifyPaymentStatus(courseId, token, sessionId)
        .then((result) => {
          setIsProcessingPayment(false)
          verifyingSessionRef.current = null

          if (result.isVerified || result.hasAccess) {
            // Mark session as confirmed in sessionStorage
            sessionStorage.setItem(sessionKey, 'confirmed')
            // Invalidate caches so newly purchased course is immediately available in My Learning
            courseService.clearMyLearningCache()
            cleanUrlParams()

            setPaymentStatus('success')
            setCheckoutFlowView('none')
            setAccessState({
              isLoading: false,
              hasAccess: true,
              isExpired: false,
              isInactive: false,
              status: 'active',
              reason: 'Payment verified and course access granted.',
            })

            // Requirements 2 & 3: Once payment is confirmed, redirect the user directly to the My Learning page
            if (onPaymentSuccess) {
              onPaymentSuccess(courseData)
            } else {
              navigate('/courses', { replace: true })
            }
          } else if (result.status === 'failed') {
            cleanUrlParams()
            setPaymentStatus('failed')
            setPaymentError(result.message || 'Payment confirmation failed with server.')
            setCheckoutFlowView('result')
          } else {
            cleanUrlParams()
            setPaymentStatus('pending')
            setCheckoutFlowView('result')
          }
        })
        .catch((err) => {
          setIsProcessingPayment(false)
          verifyingSessionRef.current = null
          cleanUrlParams()
          setPaymentStatus('failed')
          setPaymentError(err.message || 'Error verifying Stripe payment.')
          setCheckoutFlowView('result')
        })
    } else if (paymentStatusParam === 'cancelled' || paymentStatusParam === 'cancel') {
      cleanUrlParams()
      setIsProcessingPayment(false)
      setPaymentStatus('cancelled')
      setPaymentError('You cancelled the Stripe checkout session. Your card was not charged.')
      setCheckoutFlowView('result')
    }
  }, [searchParams, courseId, onPaymentSuccess, navigate, courseData])

  // 1. Open Course Checkout Screen (Screenshot 2)
  const handleOpenCheckout = () => {
    // Prevent duplicate purchases if user already has access
    if (hasAccess) {
      if (onContinueLearning) onContinueLearning(courseData)
      return
    }
    setPaymentError(null)
    setPaymentStatus(null)
    setCheckoutFlowView('checkout')
  }

  // 2. Click "Proceed to Buy" on Course Checkout -> Call Real POST /payment/stripe/checkout -> Redirect to Stripe
  const handleProceedToPayment = async () => {
    if (hasAccess) {
      setCheckoutFlowView('none')
      if (onContinueLearning) onContinueLearning(courseData)
      return
    }

    const token = authService.getToken()
    if (!token) {
      setPaymentError('Please log in to continue purchase.')
      return
    }

    if (isProcessingPayment) return

    setIsProcessingPayment(true)
    setPaymentError(null)

    try {
      const cleanCourseId = Number(String(courseId).replace(/^api-/, ''))
      // Create actual Stripe payment session via backend API POST /payment/stripe/checkout
      const session = await courseService.createPaymentSession(
        { courseId: cleanCourseId, user: currentUser, course: courseData },
        token
      )

      setPaymentSession(session)
      setIsProcessingPayment(false)

      const redirectUrl = session?.redirect_url || session?.checkout_url
      if (redirectUrl && redirectUrl.startsWith('http')) {
        // Redirect browser to actual Stripe-hosted checkout page
        window.location.href = redirectUrl
        return
      }

      throw new Error('Stripe redirect URL was not returned by the payment service.')
    } catch (err) {
      console.warn('Failed to initiate Stripe payment session:', err)
      setIsProcessingPayment(false)
      setPaymentError(err.message || 'Unable to initiate Stripe checkout. Please try again.')
    }
  }

  // 4. Retry Payment: Initiates a fresh Stripe checkout attempt without creating duplicate orders
  const handleRetryPayment = () => {
    if (hasAccess) {
      setCheckoutFlowView('none')
      if (onContinueLearning) onContinueLearning(courseData)
      return
    }
    setPaymentError(null)
    setPaymentStatus(null)
    setCheckoutFlowView('checkout')
    handleProceedToPayment()
  }

  // 5. Retry Verification: Checks existing transaction/enrollment status with server without re-charging
  const handleRetryVerification = async () => {
    setIsProcessingPayment(true)
    setPaymentError(null)
    setCheckoutFlowView('verifying')

    const token = authService.getToken()
    const sessionId = searchParams.get('session_id') || searchParams.get('stripe_session_id') || paymentSession?.stripe_session_id || paymentSession?.session_id

    try {
      const result = await courseService.verifyPaymentStatus(courseId, token, sessionId)
      setIsProcessingPayment(false)

      if (result.isVerified || result.hasAccess) {
        if (sessionId) {
          sessionStorage.setItem(`edoomate_stripe_${sessionId}`, 'confirmed')
        }
        courseService.clearMyLearningCache()
        cleanUrlParams()
        setPaymentStatus('success')
        setCheckoutFlowView('none')
        setAccessState({
          isLoading: false,
          hasAccess: true,
          isExpired: false,
          isInactive: false,
          status: 'active',
          reason: 'Payment verified and course access granted.',
        })
        if (onPaymentSuccess) {
          onPaymentSuccess(courseData)
        } else {
          navigate('/courses', { replace: true })
        }
      } else {
        setPaymentStatus('pending')
        setCheckoutFlowView('result')
      }
    } catch (err) {
      setIsProcessingPayment(false)
      setPaymentStatus('failed')
      setPaymentError(err.message || 'Unable to verify payment status with server.')
      setCheckoutFlowView('result')
    }
  }

  // Handle Cancel on payment page
  const handleCancelPayment = () => {
    setPaymentStatus('cancelled')
    setPaymentError('You cancelled the payment process. Your card was not charged.')
    setCheckoutFlowView('result')
  }


  // Top header action click
  const handlePrimaryAction = () => {
    if (hasAccess) {
      if (onContinueLearning) onContinueLearning(courseData)
    } else {
      handleOpenCheckout()
    }
  }

  return (
    <div className="course-details-view animate-fade-in pb-5">
      {/* Top Header / Breadcrumb Bar */}
      <div className="bg-white border rounded-4 p-3 mb-4 shadow-sm">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              onClick={onBack}
              id="btn-back-to-my-learning"
              aria-label="Back to My Learning"
              title="Back to My Learning"
              style={{ width: '32px', height: '32px', padding: 0 }}
            >
              ←
            </button>
            <nav aria-label="breadcrumb" className="d-none d-sm-block">
              <ol className="breadcrumb mb-0 small fw-semibold">
                <li className="breadcrumb-item">
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none text-muted align-baseline"
                    onClick={onBack}
                  >
                    My Learning
                  </button>
                </li>
                <li className="breadcrumb-item active text-primary" aria-current="page">
                  {courseData?.title || 'Course Details'}
                </li>
              </ol>
            </nav>
          </div>

          {/* Header Action: Check Out vs Start/Continue Learning */}
          <div className="course-header-actions-wrap d-flex align-items-center gap-2">
            {!hasAccess && (
              <span className="course-header-price-badge badge bg-light text-dark border rounded-pill px-3 py-2 small fw-bold d-inline-flex align-items-center justify-content-center flex-shrink-0">
                ${price}
              </span>
            )}
            <button
              type="button"
              className={`btn ${hasAccess ? 'btn-primary' : 'btn-success'} btn-sm rounded-pill px-4 fw-semibold d-inline-flex align-items-center justify-content-center gap-2 shadow-sm course-header-action-btn`}
              onClick={handlePrimaryAction}
              id={hasAccess ? 'btn-header-continue-learning' : 'btn-header-checkout'}
            >
              {accessState.isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm flex-shrink-0" role="status" aria-hidden="true"></span>
                  <span className="text-truncate">Checking...</span>
                </>
              ) : hasAccess ? (
                <>
                  <span className="text-truncate">{progress > 0 ? 'Continue Learning' : 'Start Course'}</span>
                  <span className="flex-shrink-0">→</span>
                </>
              ) : isExpired ? (
                <>
                  <span className="flex-shrink-0">⏳</span>
                  <span className="course-header-btn-text text-truncate">Your course has expired. Renew (${price})</span>
                </>
              ) : (
                <>
                  <span className="flex-shrink-0">🔒</span>
                  <span className="course-header-btn-text text-truncate">Check Out (${price})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>



      {/* Main Course Hero Banner (Reference Screenshot 1) */}
      <div className="card border-0 rounded-4 shadow-sm overflow-hidden mb-4 bg-white">
        <div className="row g-0 align-items-stretch">
          {/* Left / Top Hero Media Section: Working Video Player or Image */}
          <div
            className="col-12 col-lg-5 position-relative d-flex align-items-center justify-content-center"
            style={{ minHeight: '280px', backgroundColor: '#0f172a', overflow: 'hidden' }}
          >
            {activeMedia.type === 'video' && activeMedia.videoUrl ? (
              <div className="w-100 h-100 position-relative d-flex align-items-center justify-content-center bg-black">
                {/* Working HTML5 Video Player */}
                <video
                  key={activeMedia.videoUrl}
                  src={activeMedia.videoUrl}
                  poster={bannerImage}
                  controls
                  playsInline
                  autoPlay={Boolean(selectedHeroMedia)}
                  className="w-100 h-100"
                  style={{
                    maxHeight: '340px',
                    minHeight: '280px',
                    objectFit: 'contain',
                    backgroundColor: '#000',
                  }}
                  onLoadStart={() => {
                    setIsVideoLoading(true)
                    setVideoError(null)
                  }}
                  onLoadedData={() => {
                    setIsVideoLoading(false)
                    setVideoError(null)
                  }}
                  onPlaying={() => {
                    setIsVideoLoading(false)
                    setIsVideoPlaying(true)
                    setVideoError(null)
                  }}
                  onPause={() => setIsVideoPlaying(false)}
                  onError={(e) => {
                    setIsVideoLoading(false)
                    setIsVideoPlaying(false)
                    const err = e.currentTarget.error
                    setVideoError(
                      err?.code === 4
                        ? 'Video format unsupported by browser or source media unavailable.'
                        : 'Unable to stream video from server.'
                    )
                  }}
                />

                {/* Video Loading Overlay */}
                {isVideoLoading && (
                  <div
                    className="position-absolute inset-0 d-flex flex-column align-items-center justify-content-center bg-dark bg-opacity-75 text-white"
                    style={{ zIndex: 3 }}
                  >
                    <div className="spinner-border text-primary spinner-border-sm mb-2" role="status"></div>
                    <span className="smaller">Loading video preview...</span>
                  </div>
                )}

                {/* Video Error Fallback */}
                {videoError && (
                  <div
                    className="position-absolute inset-0 d-flex flex-column align-items-center justify-content-center p-3 text-center bg-dark bg-opacity-90 text-white"
                    style={{ zIndex: 4 }}
                  >
                    <span className="fs-4 mb-1">⚠️</span>
                    <span className="small fw-semibold mb-1">Video Playback Notice</span>
                    <span className="smaller text-muted mb-2" style={{ maxWidth: '280px' }}>
                      {videoError}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm rounded-pill px-3 py-1 smaller"
                      onClick={() => {
                        setVideoError(null)
                        setSelectedHeroMedia(null)
                      }}
                    >
                      Show Course Image
                    </button>
                  </div>
                )}

                {/* Top Badge Indicating Media Type */}
                <div
                  className="position-absolute top-0 start-0 m-3 d-flex align-items-center gap-2"
                  style={{ zIndex: 2 }}
                >
                  <span className="badge bg-danger rounded-pill px-2.5 py-1 small fw-semibold d-inline-flex align-items-center gap-1.5 shadow-sm">
                    <span>▶</span>
                    <span>{selectedHeroMedia ? 'Selected Video Lesson' : 'Course Video Preview'}</span>
                  </span>
                  {selectedHeroMedia && (
                    <button
                      type="button"
                      className="btn btn-sm btn-dark bg-opacity-75 rounded-pill px-2 py-0.5 text-white border-0 smaller"
                      title="Return to Course Thumbnail"
                      onClick={() => {
                        setSelectedHeroMedia(null)
                        setVideoError(null)
                      }}
                    >
                      ✕ Reset
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Designated Course / Lesson Image */
              <div className="w-100 h-100 position-relative">
                <img
                  src={bannerImage}
                  alt={activeMedia.title || courseData?.title}
                  className="w-100 h-100 object-fit-cover"
                  style={{ objectFit: 'cover', minHeight: '280px' }}
                  onError={(e) => {
                    e.currentTarget.src =
                      'https://edoomate.myieltspartner.com/images/admin_panel/shape_1.png'
                  }}
                />

                {/* Top Badge for Media Type */}
                <div className="position-absolute top-0 start-0 m-3" style={{ zIndex: 2 }}>
                  <span className="badge bg-dark bg-opacity-75 text-white border border-secondary rounded-pill px-2.5 py-1 small fw-semibold d-inline-flex align-items-center gap-1">
                    <span>🖼</span>
                    <span>{selectedHeroMedia ? 'Lesson Image' : 'Course Overview'}</span>
                  </span>
                  {selectedHeroMedia && (
                    <button
                      type="button"
                      className="btn btn-sm btn-dark bg-opacity-75 rounded-pill px-2 py-0.5 text-white border-0 ms-2 smaller"
                      title="Return to Course Thumbnail"
                      onClick={() => setSelectedHeroMedia(null)}
                    >
                      ✕ Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Gradient Overlay with Grade & Subject Badges */}
            <div
              className="position-absolute bottom-0 start-0 end-0 p-3"
              style={{
                background: 'linear-gradient(to top, rgba(15,23,42,0.92) 0%, transparent 100%)',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            >
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-primary text-white rounded-pill px-3 py-1 small fw-semibold">
                  GRADE {courseData?.grade || 'VII'}
                </span>
                <span className="badge bg-light text-secondary border rounded-pill px-2.5 py-1 small fw-semibold">
                  {courseData?.subject || 'ENGLISH'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Banner Information & Stats */}
          <div className="col-12 col-lg-7 p-4 p-md-5 d-flex flex-column justify-content-between">
            <div>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <h1 className="fw-bolder text-dark mb-0 fs-3">{courseData?.title}</h1>
                {!isExpired && (
                  <span className="badge bg-success bg-opacity-10 text-success border border-success rounded-pill px-3 py-1 small fw-bold">
                    {progress}% Complete
                  </span>
                )}
              </div>

              {/* Course Description */}
              <div
                className="text-muted small mb-4"
                style={{ lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{
                  __html:
                    courseData?.description ||
                    '<p>Comprehensive course covering fundamental and advanced academic curriculum with guided modules, tests, and interactive resources.</p>',
                }}
              />

              {/* Progress Bar: only shown for active non-expired courses */}
              {!isExpired && (
                <div className="mb-4">
                  <div className="d-flex justify-content-between small text-muted mb-1">
                    <span>Course Progress</span>
                    <span className="fw-bold text-dark">{progress}%</span>
                  </div>
                  <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
                    <div
                      className="progress-bar bg-primary rounded-pill"
                      role="progressbar"
                      style={{ width: `${progress}%` }}
                      aria-valuenow={progress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    ></div>
                  </div>
                </div>
              )}

              {/* Course Key Statistics Badges / Metrics */}
              <div className="row g-2 text-center mb-4">
                <div className="col-6 col-md-4 col-xl-2-4">
                  <div className="p-2 border rounded-3 bg-light">
                    <div className="smaller text-muted" style={{ fontSize: '0.72rem' }}>Units</div>
                    <div className="fw-bold text-dark fs-6">{totalUnits}</div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-xl-2-4">
                  <div className="p-2 border rounded-3 bg-light">
                    <div className="smaller text-muted" style={{ fontSize: '0.72rem' }}>Lessons</div>
                    <div className="fw-bold text-dark fs-6">{totalLessons}</div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-xl-2-4">
                  <div className="p-2 border rounded-3 bg-light">
                    <div className="smaller text-muted" style={{ fontSize: '0.72rem' }}>Practice Tests</div>
                    <div className="fw-bold text-dark fs-6">{totalTests}</div>
                  </div>
                </div>
                <div className="col-6 col-md-4 col-xl-2-4">
                  <div className="p-2 border rounded-3 bg-light">
                    <div className="smaller text-muted" style={{ fontSize: '0.72rem' }}>Video Lessons</div>
                    <div className="fw-bold text-dark fs-6">{totalVideos}</div>
                  </div>
                </div>
                <div className="col-12 col-md-4 col-xl-2-4">
                  <div className="p-2 border rounded-3 bg-light">
                    <div className="smaller text-muted" style={{ fontSize: '0.72rem' }}>Duration</div>
                    <div className="fw-bold text-dark fs-6">{durationText}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Action: Check Out vs Start/Continue Learning */}
            <div>
              <button
                type="button"
                className={`btn ${hasAccess ? 'btn-primary' : 'btn-success'} rounded-pill px-4 py-2-5 fw-bold d-inline-flex align-items-center gap-2 shadow-sm course-hero-action-btn`}
                onClick={handlePrimaryAction}
                id={hasAccess ? 'btn-hero-continue-learning' : 'btn-hero-checkout'}
              >
                {accessState.isLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm flex-shrink-0" role="status" aria-hidden="true"></span>
                    <span>Checking Access...</span>
                  </>
                ) : hasAccess ? (
                  <>
                    <span>{progress > 0 ? 'Continue Learning' : 'Start Course'}</span>
                    <span className="flex-shrink-0">→</span>
                  </>
                ) : isExpired ? (
                  <>
                    <span className="course-hero-btn-icon flex-shrink-0">⏳</span>
                    <span className="course-hero-btn-text text-center">
                      <span className="d-block course-hero-line-1">Your course has expired.</span>
                      <span className="d-block course-hero-line-2">Renew Access (${price})</span>
                    </span>
                    <span className="course-hero-btn-arrow flex-shrink-0">→</span>
                  </>
                ) : (
                  <>
                    <span className="flex-shrink-0">🔒</span>
                    <span>Check Out & Unlock Full Course (${price})</span>
                    <span className="flex-shrink-0">→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Units List Section (Accordion Dropdowns) */}
      <div className="card border-0 rounded-4 shadow-sm p-3 p-md-4 bg-white curriculum-section-card">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 pb-2 border-bottom">
          <div className="min-w-0">
            <h4 className="fw-bold text-dark fs-5 mb-1 curriculum-section-title">Course Units & Curriculum</h4>
            <p className="text-muted small mb-0 curriculum-section-subtitle">
              Click a unit to expand its lessons. Select any lesson name to open the lesson page.
            </p>
          </div>
          <span className="badge bg-primary rounded-pill px-3 py-1-5 small flex-shrink-0">
            {units.length} Unit{units.length !== 1 ? 's' : ''} Available
          </span>
        </div>

        {/* Loading Units State */}
        {isLoadingCourse && (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
            <div className="small text-muted">Loading course units...</div>
          </div>
        )}

        {/* Units Accordion List */}
        {!isLoadingCourse && units.length > 0 && (
          <div className="d-flex flex-column gap-3">
            {units.map((unit, uIdx) => {
              const uId = unit.unit_id || unit.id || unit.element_id
              const isExpanded = Boolean(expandedUnitIds[uId])
              const lessons = unitLessons[uId] || unit.lessons || []
              const isLoadingThisUnit = Boolean(loadingUnits[uId])
              const unitDetails = unit.unit_details || {}
              const lessonCount = unitDetails.no_of_lessons ?? lessons.length ?? 0
              const unitDuration =
                unitDetails.duration ||
                unitDetails.total_duration ||
                unit.duration ||
                unit.total_duration ||
                null

              return (
                <div
                  key={uId || uIdx}
                  className={`curriculum-unit-card ${isExpanded ? 'is-expanded' : ''}`}
                >
                  {/* Unit Click Header — Expands/collapses dropdown inline */}
                  <div
                    className="curriculum-unit-header d-flex align-items-center justify-content-between"
                    onClick={() => toggleUnit(unit)}
                    id={`unit-accordion-toggle-${uId}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleUnit(unit)
                      }
                    }}
                    aria-expanded={isExpanded}
                  >
                    {/* Left: Circular Number Badge + Title & Meta Stack */}
                    <div className="d-flex align-items-center gap-2.5 gap-sm-3 min-w-0 me-2 me-sm-3 flex-grow-1">
                      <span className="unit-circle-badge flex-shrink-0" aria-hidden="true">
                        {uIdx + 1}
                      </span>
                      <div className="min-w-0 flex-grow-1">
                        {/* Compact metadata row above title */}
                        <div className="unit-meta-row">
                          <span className="unit-badge-pill">
                            Unit {uIdx + 1}
                          </span>
                          {unitDuration && (
                            <span className="unit-duration-pill">
                              <span className="unit-duration-icon" aria-hidden="true">⏱</span>
                              <span>{unitDuration}</span>
                            </span>
                          )}
                        </div>
                        {/* Unit Title */}
                        <h5 className="unit-main-title">
                          {unit.title || unit.unit_name || `Unit ${uIdx + 1}`}
                        </h5>
                      </div>
                    </div>

                    {/* Right: Lesson count + Expand/Collapse Chevron Indicator */}
                    <div className="d-flex align-items-center gap-2 flex-shrink-0 ms-auto">
                      <span className="unit-lessons-count-pill d-none d-sm-inline-flex align-items-center">
                        {lessonCount} Lesson{lessonCount !== 1 ? 's' : ''}
                      </span>
                      <span
                        className="unit-chevron-indicator"
                        aria-label={isExpanded ? 'Collapse unit' : 'Expand unit'}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Expanded Dropdown Lesson Names List */}
                  {isExpanded && (
                    <div className="p-2-5 p-sm-3 bg-white d-flex flex-column gap-2 animate-fade-in curriculum-lessons-list">
                      {isLoadingThisUnit && (
                        <div className="text-center py-3 text-muted small">
                          <span className="spinner-border spinner-border-sm me-2 text-primary" role="status"></span>
                          Loading lessons for this unit...
                        </div>
                      )}

                      {!isLoadingThisUnit && lessons.length === 0 && (
                        <div className="p-3 text-center text-muted small bg-light rounded-3">
                          No lessons registered under this unit.
                        </div>
                      )}

                      {!isLoadingThisUnit &&
                        lessons.map((lesson, lIdx) => {
                          const lId = lesson.lessonId || lesson.elementId || lesson.id
                          return (
                            <div
                              key={lId || lIdx}
                              className={`curriculum-lesson-card p-2-5 p-sm-3 rounded-3 border ${hasAccess ? 'bg-light hover-bg-white cursor-pointer' : 'bg-white opacity-90'} d-flex align-items-center justify-content-between transition-all shadow-xs`}
                              onClick={() => {
                                if (hasAccess) {
                                  if (onSelectLesson) {
                                    onSelectLesson(courseData, lesson)
                                  }
                                } else {
                                  handleOpenCheckout()
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                              id={`lesson-item-${lId}`}
                            >
                              <div className="d-flex align-items-start align-items-sm-center gap-2.5 gap-sm-3 min-w-0 flex-grow-1 lesson-left-col">
                                <span
                                  className={`rounded-circle border fw-bold d-flex align-items-center justify-content-center flex-shrink-0 lesson-num-badge ${hasAccess ? 'bg-white text-primary' : 'bg-light text-muted'}`}
                                  style={{ width: '28px', height: '28px', fontSize: '0.75rem' }}
                                >
                                  {hasAccess ? lIdx + 1 : '🔒'}
                                </span>
                                <div className="min-w-0 flex-grow-1">
                                  <div className="fw-semibold text-dark small lesson-title-text">
                                    {lesson.title || `Lesson ${lIdx + 1}`}
                                  </div>
                                  <div className="text-muted smaller lesson-meta-text" style={{ fontSize: '0.72rem' }}>
                                    {hasAccess
                                      ? `${lesson.duration || '15 min'} • Study Material & Quizzes`
                                      : isExpired
                                      ? 'Locked • Your course has expired. Renew to access.'
                                      : 'Locked • Purchase course to unlock lesson'}
                                  </div>
                                </div>
                              </div>

                              <div className="d-flex align-items-center gap-1.5 gap-sm-2 ms-2 flex-shrink-0 lesson-actions-col">
                                {(lesson.videoUrl || lesson.imageUrl) && (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-light border rounded-pill px-2 py-1 text-muted d-inline-flex align-items-center gap-1 lesson-preview-btn"
                                    style={{ fontSize: '0.72rem' }}
                                    title={lesson.videoUrl ? 'Preview video in hero section' : 'Preview image in hero section'}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedHeroMedia({
                                        type: lesson.videoUrl ? 'video' : 'image',
                                        videoUrl: lesson.videoUrl,
                                        imageUrl: lesson.imageUrl,
                                        title: lesson.title,
                                        isCourseMedia: false,
                                      })
                                      window.scrollTo({ top: 120, behavior: 'smooth' })
                                    }}
                                  >
                                    <span>{lesson.videoUrl ? '▶ Preview' : '🖼 View'}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`btn btn-sm ${hasAccess ? 'btn-outline-primary' : 'btn-outline-secondary'} rounded-pill px-2.5 px-sm-3 py-1 fw-semibold d-inline-flex align-items-center gap-1 lesson-open-btn`}
                                  style={{ fontSize: '0.75rem' }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (hasAccess) {
                                      if (onSelectLesson) {
                                        onSelectLesson(courseData, lesson)
                                      }
                                    } else {
                                      handleOpenCheckout()
                                    }
                                  }}
                                >
                                  {hasAccess ? (
                                    <>
                                      <span>Open</span>
                                      <span className="d-none d-sm-inline">Lesson</span>
                                      <span>→</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>Unlock</span>
                                      <span>🔒</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Empty Units State */}
        {!isLoadingCourse && units.length === 0 && (
          <div className="p-4 bg-light rounded-3 text-center text-muted small">
            No units currently configured for this course.
          </div>
        )}
      </div>

      {/* =========================================================================
          VIEW 1: Course Checkout Page (Matches Reference Screenshot 2)
          Header with back arrow "Course checkout", Course Card (Thumb, Title, Grade, Duration, Validity),
          Order Summary (Original Price, Discount, Total Payable), and "Proceed to Buy" button.
          ========================================================================= */}
      {checkoutFlowView === 'checkout' && (
        <div
          className="course-checkout-page position-fixed top-0 start-0 end-0 bottom-0 bg-white d-flex flex-column animate-fade-in"
          style={{ zIndex: 1100, overflowY: 'auto' }}
        >
          {/* Top Bar with Back Arrow and Title */}
          <div className="d-flex align-items-center p-3 px-4 border-bottom bg-white shadow-xs sticky-top">
            <button
              type="button"
              className="btn btn-link text-dark p-0 me-3 text-decoration-none d-flex align-items-center"
              onClick={() => setCheckoutFlowView('none')}
              id="btn-checkout-back-to-details"
              aria-label="Back to Course Details"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
            <h5 className="mb-0 fw-bold text-dark fs-6" style={{ letterSpacing: '-0.01em' }}>
              Course checkout
            </h5>
          </div>

          {/* Main Checkout Content */}
          <div className="container py-4" style={{ maxWidth: '480px' }}>
            {/* Top Course Card */}
            <div className="p-3 border rounded-3 bg-white mb-4 d-flex align-items-center gap-3 shadow-xs">
              <div
                className="rounded-3 overflow-hidden flex-shrink-0"
                style={{ width: '84px', height: '64px', backgroundColor: '#0f172a' }}
              >
                <img
                  src={bannerImage}
                  alt={courseData?.title}
                  className="w-100 h-100 object-fit-cover"
                  style={{ objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.src = 'https://edoomate.myieltspartner.com/images/admin_panel/shape_1.png'
                  }}
                />
              </div>
              <div className="min-w-0 flex-grow-1">
                <h6 className="fw-bold text-dark mb-1 text-truncate" style={{ fontSize: '0.96rem' }}>
                  {courseData?.title || 'KS3 English Year 7'}
                </h6>
                <div className="text-secondary small mb-1" style={{ fontSize: '0.78rem' }}>
                  Grade {courseData?.grade || 'VII'}
                </div>
                <div className="text-muted smaller" style={{ fontSize: '0.74rem' }}>
                  Total Hours {courseData?.course_details?.course_hours || '5.4'} | Valid For {courseData?.validity_days || 30} Days
                </div>
              </div>
            </div>

            {/* Separator Line */}
            <hr className="my-4 text-muted opacity-25" />

            {/* Order Summary Heading */}
            <h6 className="fw-bold text-dark mb-3" style={{ fontSize: '0.98rem' }}>
              Order Summary
            </h6>

            {/* Price Rows */}
            <div className="d-flex flex-column gap-2-5 mb-4">
              <div className="d-flex justify-content-between align-items-center text-dark" style={{ fontSize: '0.9rem' }}>
                <span className="fw-semibold">Original Price</span>
                <span className="fw-bold">{parseFloat(courseData?.price || price).toFixed(2)}</span>
              </div>
              <div className="d-flex justify-content-between align-items-center text-dark" style={{ fontSize: '0.9rem' }}>
                <span className="fw-semibold">Discount</span>
                <span className="fw-bold">{courseData?.discount_percentage ? `${courseData.discount_percentage} %` : '0.00 %'}</span>
              </div>
              <div className="d-flex justify-content-between align-items-center text-dark pt-2" style={{ fontSize: '0.95rem' }}>
                <span className="fw-bold">Total Payable</span>
                <span className="fw-bold text-dark">{parseFloat(price).toFixed(2)}</span>
              </div>
            </div>

            {paymentError && (
              <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3">
                {paymentError}
              </div>
            )}

            {/* Separator Line */}
            <hr className="my-5 text-muted opacity-25" />

            {/* Bottom Proceed to Buy Button (Exact blue pill button from screenshot 2) */}
            <div className="pt-4">
              <button
                type="button"
                className="btn btn-primary w-100 py-3 fw-bold rounded-3 shadow-sm d-flex align-items-center justify-content-center"
                style={{
                  backgroundColor: '#3b82f6',
                  borderColor: '#3b82f6',
                  fontSize: '0.96rem',
                  letterSpacing: '0.01em',
                }}
                onClick={handleProceedToPayment}
                disabled={isProcessingPayment}
                id="btn-checkout-proceed-to-buy"
              >
                {isProcessingPayment ? (
                  <span className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" role="status"></span>
                    <span>Creating Payment Session...</span>
                  </span>
                ) : (
                  <span>Proceed to Buy</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* =========================================================================
          VIEW 3: Verification & Entitlement Loading State
          ========================================================================= */}
      {checkoutFlowView === 'verifying' && (
        <div
          className="position-fixed top-0 start-0 end-0 bottom-0 bg-white d-flex flex-column align-items-center justify-content-center animate-fade-in"
          style={{ zIndex: 1100 }}
        >
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3.2rem', height: '3.2rem' }}></div>
          <h5 className="fw-bold text-dark mb-2">Verifying Payment with Server...</h5>
          <p className="text-muted small text-center" style={{ maxWidth: '380px' }}>
            Checking your course enrollment entitlement via GET /api/my-learning. Please do not close or refresh this page.
          </p>
        </div>
      )}

      {/* =========================================================================
          VIEW 4: Verification Result Screen (Success vs Pending/Failed)
          ========================================================================= */}
      {checkoutFlowView === 'result' && (
        <div
          className="position-fixed top-0 start-0 end-0 bottom-0 bg-white d-flex flex-column align-items-center justify-content-center p-4 animate-fade-in"
          style={{ zIndex: 1100 }}
        >
          <div className="card border-0 rounded-4 shadow-sm p-4 text-center bg-white" style={{ maxWidth: '440px', width: '100%' }}>
            {paymentStatus === 'success' ? (
              <div>
                <div
                  className="rounded-circle bg-success bg-opacity-10 text-success d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '64px', height: '64px', fontSize: '2rem' }}
                >
                  ✓
                </div>
                <h5 className="fw-bold text-dark mb-2">Course Access Activated!</h5>
                <p className="text-muted small mb-4">
                  Payment verified with the backend. Full access to <strong>{courseData?.title}</strong> is now unlocked.
                </p>
                <button
                  type="button"
                  className="btn btn-primary w-100 rounded-pill py-2-5 fw-bold shadow-sm"
                  onClick={() => {
                    setCheckoutFlowView('none')
                    if (onContinueLearning) {
                      onContinueLearning(courseData)
                    }
                  }}
                  id="btn-result-open-learning"
                >
                  Open Learning Page →
                </button>
              </div>
            ) : paymentStatus === 'pending' ? (
              <div>
                <div
                  className="rounded-circle bg-warning bg-opacity-10 text-warning d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '64px', height: '64px', fontSize: '2rem' }}
                >
                  ⏳
                </div>
                <h5 className="fw-bold text-dark mb-2">Payment Verification Pending</h5>
                <p className="text-muted small mb-3">
                  The backend has not yet finalized active enrollment for <strong>{courseData?.title}</strong>. Course access remains restricted in accordance with backend business rules.
                </p>
                <div className="p-3 bg-light rounded-3 text-start small text-secondary mb-4 border">
                  <div>• Product: <code>{courseData?.apple_product_id || 'Standard Course'}</code></div>
                  <div>• Server Verification: <strong>Awaiting authorization in /api/my-learning</strong></div>
                </div>
                <div className="d-flex flex-column gap-2">
                  <button
                    type="button"
                    className="btn btn-primary rounded-pill py-2 fw-semibold"
                    onClick={handleRetryVerification}
                    id="btn-retry-payment-verification"
                  >
                    Retry Verification 🔄
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill py-2"
                    onClick={() => setCheckoutFlowView('none')}
                  >
                    Return to Course Details
                  </button>
                </div>
              </div>
            ) : paymentStatus === 'cancelled' ? (
              <div>
                <div
                  className="rounded-circle bg-secondary bg-opacity-10 text-secondary d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '64px', height: '64px', fontSize: '2rem' }}
                >
                  ↩️
                </div>
                <h5 className="fw-bold text-dark mb-2">Payment Cancelled</h5>
                <p className="text-muted small mb-4">
                  {paymentError || 'You cancelled the payment transaction. No charges were made to your account.'}
                </p>
                <div className="d-flex flex-column gap-2">
                  <button
                    type="button"
                    className="btn btn-primary rounded-pill py-2 fw-semibold"
                    onClick={handleRetryPayment}
                    id="btn-retry-payment-after-cancel"
                  >
                    Retry Payment 💳
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill py-2"
                    onClick={() => setCheckoutFlowView('none')}
                  >
                    Return to Course Details
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div
                  className="rounded-circle bg-danger bg-opacity-10 text-danger d-inline-flex align-items-center justify-content-center mb-3"
                  style={{ width: '64px', height: '64px', fontSize: '2rem' }}
                >
                  ✕
                </div>
                <h5 className="fw-bold text-dark mb-2">Payment Failed</h5>
                <p className="text-muted small mb-4">
                  {paymentError || 'Your payment was declined or could not be processed. Course access remains locked.'}
                </p>
                <div className="d-flex flex-column gap-2">
                  <button
                    type="button"
                    className="btn btn-primary rounded-pill py-2 fw-semibold"
                    onClick={handleRetryPayment}
                    id="btn-retry-payment"
                  >
                    Retry Payment 💳
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill py-2"
                    onClick={() => setCheckoutFlowView('checkout')}
                  >
                    Return to Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


