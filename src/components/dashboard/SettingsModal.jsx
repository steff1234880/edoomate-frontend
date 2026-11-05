import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../services/authService'
import { courseService } from '../../services/courseService'
import { notificationService } from '../../services/notificationService'

export default function SettingsModal({ isOpen, onClose, onProfileUpdated, onLogout, onOpenProfileSetup }) {
  const navigate = useNavigate()
  // Ref for scrollable modal card
  const cardRef = useRef(null)

  // Navigation View: 'main' | 'edit-profile' | 'assessment' | 'notifications' | 'password' | 'support' | 'privacy' | 'terms'
  const [currentView, setCurrentView] = useState('main')

  // Stored user from local session as initial fallback
  const sessionUser = authService.getUser()

  // Real Profile State from GET /api/user
  const [userProfile, setUserProfile] = useState(null)
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(null)

  // Profile Edit Form State
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    mobile: '',
    gender: 'MALE',
    grade: 'X',
    institute: '',
    place: '',
    dob: '',
    parent_name: '',
    parent_contact: '',
    whatsapp: '',
  })
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('')
  const [availableGrades, setAvailableGrades] = useState(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'])

  // Password / Security State
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState(null)
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('')

  // Assessment & Course Progress State (GET /api/course-progress)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null)

  // Notifications State
  const [notificationsList, setNotificationsList] = useState([])
  const [pushPlayerId, setPushPlayerId] = useState(null)

  // Help & Support Form State
  const [supportForm, setSupportForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    message: '',
  })
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false)
  const [supportSuccessMsg, setSupportSuccessMsg] = useState('')
  const [supportErrorMsg, setSupportErrorMsg] = useState('')

  // Delete Account Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [customDeleteReason, setCustomDeleteReason] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [backendReasons, setBackendReasons] = useState([])
  const [isLoadingReasons, setIsLoadingReasons] = useState(false)
  const [deleteOtpNeeded, setDeleteOtpNeeded] = useState(false)
  const [deleteOtpCode, setDeleteOtpCode] = useState('')
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState('')

  // Logout Confirmation Modal State
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)

  // Profile Questionnaire State (GET /api/profile-questions & /api/profile-questions/student/{studentId})
  const [questionnaireList, setQuestionnaireList] = useState([])
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({}) // { [questionText]: selectedOptionString }
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0)
  const [isLoadingQuestionnaire, setIsLoadingQuestionnaire] = useState(false)
  const [isSubmittingQuestionnaire, setIsSubmittingQuestionnaire] = useState(false)
  const [isQuestionnaireCompleted, setIsQuestionnaireCompleted] = useState(false)
  const [questionnaireError, setQuestionnaireError] = useState(null)
  const [questionnaireSuccessMsg, setQuestionnaireSuccessMsg] = useState('')

  // Reset view to 'main' when modal opens, and fetch fresh user profile
  useEffect(() => {
    if (!isOpen) return

    setCurrentView('main')
    setIsDeleteModalOpen(false)
    setIsLogoutModalOpen(false)
    setDeleteError(null)
    setDeleteReason('')
    setCustomDeleteReason('')

    if (cardRef.current) {
      cardRef.current.scrollTo({ top: 0, behavior: 'instant' })
    }

    let isMounted = true

    const fetchProfile = async () => {
      setIsProfileLoading(true)
      setProfileError(null)

      try {
        const user = await authService.getUserProfile()
        if (!isMounted) return

        setUserProfile(user)

        const details = user.details || user.student_details || {}
        let formattedDob = ''
        if (details.dob || user.dob) {
          const rawDob = String(details.dob || user.dob).trim()
          formattedDob = rawDob.split(' ')[0]
        }

        setProfileData({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || '',
          mobile: user.mobile || '',
          gender: user.gender || 'MALE',
          grade: user.grade || 'X',
          institute: user.institute || '',
          place: user.place || '',
          dob: formattedDob,
          parent_name: details.parent_name || user.parent_name || '',
          parent_contact: details.parent_contact || user.parent_contact || '',
          whatsapp: details.whatsapp || user.whatsapp || '',
        })
      } catch (err) {
        if (!isMounted) return
        setProfileError(err.message || 'Unable to load profile data.')
        if (sessionUser) {
          setUserProfile(sessionUser)
          setProfileData((prev) => ({
            ...prev,
            first_name: sessionUser.first_name || sessionUser.full_name?.split(' ')[0] || '',
            last_name: sessionUser.last_name || '',
            email: sessionUser.email || '',
            mobile: sessionUser.mobile || '',
            gender: sessionUser.gender || 'MALE',
            grade: sessionUser.grade || 'X',
            institute: sessionUser.institute || '',
            place: sessionUser.place || '',
          }))
        }
      } finally {
        if (isMounted) setIsProfileLoading(false)
      }
    }

    const fetchGrades = async () => {
      try {
        const gradesMap = await authService.getGrades()
        if (gradesMap && typeof gradesMap === 'object' && isMounted) {
          const gradesList = Object.keys(gradesMap)
          if (gradesList.length > 0) {
            setAvailableGrades(gradesList)
          }
        }
      } catch {
        // Fallback default
      }
    }

    // Fetch reasons from backend if available
    const fetchReasons = async () => {
      setIsLoadingReasons(true)
      try {
        const token = authService.getToken()
        const reasons = await authService.getDeletionReasons(token)
        if (Array.isArray(reasons) && reasons.length > 0 && isMounted) {
          setBackendReasons(reasons)
        }
      } catch {
        // Fallback to standard reasons list
      } finally {
        if (isMounted) setIsLoadingReasons(false)
      }
    }

    fetchProfile()
    fetchGrades()
    fetchReasons()

    // Sync notification status
    const playerId = notificationService.getOneSignalPlayerId()
    setPushPlayerId(playerId)
    const currentNotifs = notificationService.getCachedNotifications()
    setNotificationsList(currentNotifs)

    return () => {
      isMounted = false
    }
  }, [isOpen])

  // Prevent background body scrolling when Settings modal is open
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    const prevOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'contain'
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.overscrollBehavior = prevOverscroll
    }
  }, [isOpen])

  // Reset scroll to top whenever subview changes
  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [currentView])

  // Fetch Assessment progress when assessment subview is opened
  useEffect(() => {
    if (currentView !== 'assessment') return

    let isMounted = true
    const fetchAnalytics = async () => {
      setIsAnalyticsLoading(true)
      setAnalyticsError(null)
      try {
        const token = authService.getToken()
        if (!token) throw new Error('Authentication required.')
        const data = await courseService.getStudentAnalytics(token)
        if (isMounted) {
          setAnalyticsData(data?.data || data)
        }
      } catch (err) {
        if (isMounted) {
          setAnalyticsError(err.message || 'Failed to load assessment details.')
        }
      } finally {
        if (isMounted) setIsAnalyticsLoading(false)
      }
    }

    fetchAnalytics()
    return () => {
      isMounted = false
    }
  }, [currentView])

  // Fetch / sync notifications when notifications subview is opened
  useEffect(() => {
    if (currentView !== 'notifications') return

    const token = authService.getToken()
    if (token) {
      notificationService.getNotifications(token).then((data) => {
        if (Array.isArray(data)) {
          setNotificationsList(data)
        }
      })
    }
    const unsubscribe = notificationService.subscribe((updated) => {
      setNotificationsList(updated)
    })
    return () => unsubscribe()
  }, [currentView])

  // Sync Support Form with user profile data whenever Support view opens or userProfile updates
  useEffect(() => {
    if (currentView !== 'support') return

    const resolvedUser = userProfile || sessionUser || {}
    const resolvedFirstName =
      resolvedUser.first_name ||
      resolvedUser.full_name?.split(' ')[0] ||
      profileData.first_name ||
      ''
    const resolvedLastName =
      resolvedUser.last_name ||
      (resolvedUser.full_name?.split(' ').slice(1).join(' ') || '') ||
      profileData.last_name ||
      ''
    const resolvedEmail = resolvedUser.email || profileData.email || ''
    const resolvedPhone =
      resolvedUser.mobile ||
      resolvedUser.phone ||
      resolvedUser.phone_number ||
      profileData.mobile ||
      ''

    setSupportForm((prev) => ({
      ...prev,
      first_name: prev.first_name || resolvedFirstName,
      last_name: prev.last_name || resolvedLastName,
      email: prev.email || resolvedEmail,
      phone: prev.phone || resolvedPhone,
    }))
    setSupportErrorMsg('')
  }, [currentView, userProfile, profileData])

  // Helper: dynamic student information computation
  const studentName =
    userProfile?.full_name ||
    [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ') ||
    userProfile?.username ||
    sessionUser?.full_name ||
    'Swab Test'

  const studentEmail = userProfile?.email || sessionUser?.email || 'swab1@gmail.com'

  const userInitials = (() => {
    const fn = (userProfile?.first_name || sessionUser?.first_name || '').trim()
    const ln = (userProfile?.last_name || sessionUser?.last_name || '').trim()
    if (fn && ln) {
      return (fn[0] + ln[0]).toUpperCase()
    }
    const fullName = (studentName || '').trim()
    if (fullName) {
      const parts = fullName.split(/\s+/)
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase()
      }
      return parts[0].substring(0, 2).toUpperCase()
    }
    return 'ST'
  })()

  const enrolledDays = (() => {
    const raw = userProfile?.enrolled_days ?? sessionUser?.enrolled_days
    if (raw !== undefined && raw !== null) {
      const parsed = Math.abs(Math.round(Number(raw)))
      if (!isNaN(parsed) && parsed > 0) return parsed
      if (parsed === 0) return 1
    }
    return 28 // fallback matching reference screenshot
  })()

  // Load Profile Questionnaire data from backend APIs
  useEffect(() => {
    if (currentView !== 'questionnaire') return

    let isMounted = true
    const loadQuestionnaire = async () => {
      setIsLoadingQuestionnaire(true)
      setQuestionnaireError(null)
      setQuestionnaireSuccessMsg('')
      setActiveQuestionIdx(0)

      try {
        const token = authService.getToken()
        const studentId = userProfile?.id || sessionUser?.id || sessionUser?.student_id || sessionUser?.sub

        // Fetch questions from GET /api/profile-questions and previous answers concurrently
        const [questions, studentAnswersRes] = await Promise.all([
          courseService.getProfileQuestions(token),
          studentId ? courseService.getStudentProfileAnswers(studentId, token) : Promise.resolve(null),
        ])

        if (!isMounted) return

        setQuestionnaireList(questions || [])

        // Map previously saved answers into state keyed by question text
        const savedMap = {}
        const savedList = Array.isArray(studentAnswersRes?.data) ? studentAnswersRes.data : []
        savedList.forEach((item) => {
          if (item?.question && item?.answer) {
            savedMap[item.question] = item.answer
          }
        })
        setQuestionnaireAnswers(savedMap)

        // Check completion status from API or user profile
        const completed = Boolean(
          studentAnswersRes?.is_profile_question_completed ||
          userProfile?.is_profile_question_completed ||
          savedList.length > 0
        )
        setIsQuestionnaireCompleted(completed)
      } catch (err) {
        if (!isMounted) return
        console.warn('Failed to load questionnaire data:', err.message)
        setQuestionnaireError(err.message || 'Failed to load questionnaire questions.')
      } finally {
        if (isMounted) setIsLoadingQuestionnaire(false)
      }
    }

    loadQuestionnaire()
    return () => {
      isMounted = false
    }
  }, [currentView, userProfile?.id, userProfile?.is_profile_question_completed])

  // Handle Profile Field Changes
  const handleProfileChange = (e) => {
    const { name, value } = e.target
    setProfileData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  // Save Profile Update (PUT /api/student/profile/update)
  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setIsSavingProfile(true)
    setProfileError(null)
    setProfileSuccessMsg('')

    if (!profileData.first_name.trim()) {
      setProfileError('First name is required.')
      setIsSavingProfile(false)
      return
    }

    try {
      const payload = {
        first_name: profileData.first_name.trim(),
        last_name: profileData.last_name.trim(),
        gender: profileData.gender,
        grade: profileData.grade,
        institute: profileData.institute.trim(),
        place: profileData.place.trim(),
        dob: profileData.dob || null,
        parent_name: profileData.parent_name.trim(),
        parent_contact: profileData.parent_contact.trim(),
        whatsapp: profileData.whatsapp.trim(),
        mobile: profileData.mobile.trim(),
      }

      const response = await authService.updateStudentProfile(payload)
      const updatedUser = response?.data || response

      setUserProfile((prev) => ({ ...prev, ...updatedUser }))
      setProfileSuccessMsg(response?.message || 'Profile updated successfully!')

      if (onProfileUpdated && updatedUser) {
        onProfileUpdated(updatedUser)
      }
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile. Please try again.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  // Change Password (POST /api/student/change-password)
  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccessMsg('')

    if (!passwordForm.current_password) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (!passwordForm.new_password) {
      setPasswordError('Please enter a new password.')
      return
    }
    if (passwordForm.new_password.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('New password and confirm password do not match.')
      return
    }

    setIsSavingPassword(true)

    try {
      const response = await authService.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
        confirm_password: passwordForm.confirm_password,
      })

      setPasswordSuccessMsg(response?.message || 'Password changed successfully!')
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password. Please check your credentials.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  // Default documented backend-supported deletion reasons from GET /api/student/deletion-reasons
  const defaultReasons = [
    { id: 1, label: 'Lack of time' },
    { id: 2, label: 'I find the notifications too distracting' },
    { id: 3, label: 'I want to create a new account' },
    { id: 4, label: 'I have completed' },
    { id: 5, label: 'I have changed my plans' },
    { id: 6, label: 'I found a better platform' },
    { id: 7, label: 'I have completed my preparation' },
    { id: 8, label: 'I entered the wrong details' },
    { id: 9, label: 'I have security issues' },
    { id: 10, label: 'It did not meet my expectations' },
  ]

  const activeReasons = backendReasons.length > 0 ? backendReasons.map((r) => {
    if (typeof r === 'string') return { id: r, label: r }
    return {
      id: r.id !== undefined ? r.id : String(r.value || r.key || r.label || r.reason),
      label: r.reason || r.label || r.name || r.text || String(r.id),
    }
  }) : defaultReasons

  // Confirm Account Deletion (POST /api/student/delete-account & /api/student/verify-delete-otp)
  const handleConfirmDeleteAccount = async () => {
    if (!deleteReason) {
      setDeleteError('Please choose a reason for deleting your account.')
      return
    }

    setIsDeletingAccount(true)
    setDeleteError(null)

    try {
      // Send the reason ID required by the backend API validator
      const res = await authService.deleteAccount({ deletion_reason: deleteReason })

      if (res?.requires_otp) {
        setDeleteOtpNeeded(true)
        setDeleteEmail(res.email || '')
        setIsDeletingAccount(false)
        return
      }

      setDeleteSuccessMsg('Your account has been permanently deleted.')
      setTimeout(() => {
        setIsDeleteModalOpen(false)
        onClose()
        if (onLogout) {
          onLogout()
        } else {
          window.location.hash = '#login'
          window.location.reload()
        }
      }, 1000)
    } catch (err) {
      setDeleteError(err.message || 'Unable to delete account. Please try again.')
      setIsDeletingAccount(false)
    }
  }

  const handleConfirmDeleteOtp = async () => {
    if (!deleteOtpCode || deleteOtpCode.trim().length < 4) {
      setDeleteError('Please enter the 4-6 digit verification code sent to your email.')
      return
    }

    setIsDeletingAccount(true)
    setDeleteError(null)

    try {
      await authService.verifyDeleteOtp({ otp: deleteOtpCode.trim(), email: deleteEmail })
      setDeleteSuccessMsg('Your account has been permanently deleted.')
      setTimeout(() => {
        setIsDeleteModalOpen(false)
        onClose()
        if (onLogout) {
          onLogout()
        } else {
          window.location.hash = '#login'
          window.location.reload()
        }
      }, 1000)
    } catch (err) {
      setDeleteError(err.message || 'Invalid or expired verification code.')
      setIsDeletingAccount(false)
    }
  }

  // Select an option for a question (single choice) - only allowed if not completed
  const handleSelectQuestionnaireOption = (questionText, optionValue) => {
    if (isQuestionnaireCompleted) return
    setQuestionnaireAnswers((prev) => ({
      ...prev,
      [questionText]: optionValue,
    }))
    setQuestionnaireError(null)
  }

  // Handle Next or Submit in questionnaire
  const handleQuestionnaireNextOrSubmit = async () => {
    // If already completed, this view is strictly read-only
    if (isQuestionnaireCompleted) {
      const isLast = activeQuestionIdx === questionnaireList.length - 1
      if (!isLast) {
        setActiveQuestionIdx((prev) => prev + 1)
      } else {
        setCurrentView('main')
      }
      return
    }

    const currentQuestion = questionnaireList[activeQuestionIdx]
    if (!currentQuestion) return

    const selectedAnswer = questionnaireAnswers[currentQuestion.question]
    if (!selectedAnswer) {
      setQuestionnaireError('Please select an option before proceeding.')
      return
    }

    const isLast = activeQuestionIdx === questionnaireList.length - 1
    if (!isLast) {
      setQuestionnaireError(null)
      setActiveQuestionIdx((prev) => prev + 1)
      return
    }

    // Submit answers to backend
    setIsSubmittingQuestionnaire(true)
    setQuestionnaireError(null)

    try {
      const token = authService.getToken()
      const studentId = userProfile?.id || sessionUser?.id || sessionUser?.student_id || sessionUser?.sub

      // Format answers according to API requirements: [{ question, answer }]
      const formattedAnswers = questionnaireList.map((q) => ({
        question: q.question,
        answer: questionnaireAnswers[q.question] || '',
      }))

      await courseService.submitProfileQuestions(
        {
          student_id: Number(studentId),
          answers: formattedAnswers,
        },
        token
      )

      setIsQuestionnaireCompleted(true)
      setQuestionnaireSuccessMsg('Profile responses submitted successfully!')
      
      // Update local profile completion status if available
      if (userProfile) {
        setUserProfile((prev) => ({ ...prev, is_profile_question_completed: true }))
      }

      // Briefly display confirmation, then return to settings main view
      setTimeout(() => {
        setCurrentView('main')
      }, 1200)
    } catch (err) {
      console.warn('Backend questionnaire submission failed:', err.message)
      setQuestionnaireError(err.message || 'Failed to submit questionnaire. Please try again.')
    } finally {
      setIsSubmittingQuestionnaire(false)
    }
  }

  // Confirm Logout
  const handleConfirmLogout = async () => {
    setIsLogoutModalOpen(false)
    onClose()
    if (onLogout) {
      await onLogout()
    } else {
      await authService.logout()
      window.location.hash = '#login'
      window.location.reload()
    }
  }

  // Handle Support Ticket Submit (POST /api/contact-us)
  const handleSupportSubmit = async (e) => {
    e.preventDefault()
    if (isSubmittingSupport) return

    setSupportErrorMsg('')
    setSupportSuccessMsg('')

    const firstName = supportForm.first_name.trim()
    const lastName = supportForm.last_name.trim()
    const email = supportForm.email.trim()
    const phone = supportForm.phone.trim()
    const message = supportForm.message.trim()

    // Validate required fields
    if (!firstName) {
      setSupportErrorMsg('First name is required.')
      return
    }
    if (!email) {
      setSupportErrorMsg('Email is required.')
      return
    }
    if (!message) {
      setSupportErrorMsg('Message is required.')
      return
    }

    setIsSubmittingSupport(true)

    try {
      const token = authService.getToken()
      const studentId = userProfile?.id || sessionUser?.id || sessionUser?.student_id || sessionUser?.sub

      const payload = {
        first_name: firstName,
        last_name: lastName,
        email: email,
        mobile: phone,
        phone: phone,
        message: message,
        user_id: studentId ? Number(studentId) : null,
      }

      const res = await courseService.submitSupportInquiry(payload, token)

      const successText = res?.message || 'Your message has been sent successfully. Support ticket raised.'
      setSupportSuccessMsg(successText)

      // Clear message while keeping auto-filled user contact details
      setSupportForm((prev) => ({
        ...prev,
        message: '',
      }))

      // Reset success feedback after 5 seconds
      setTimeout(() => {
        setSupportSuccessMsg('')
      }, 5000)
    } catch (err) {
      console.warn('Support ticket submission failed:', err.message)
      setSupportErrorMsg(err.message || 'Failed to submit your support inquiry. Please try again.')
    } finally {
      setIsSubmittingSupport(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="settings-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="settings-modal-card" ref={cardRef}>
        {/* =========================================================================
            VIEW 1: MAIN SETTINGS PAGE (EXACT REFERENCE SCREENSHOT REPRODUCTION)
            ========================================================================= */}
        {currentView === 'main' && (
          <div className="settings-view-scroll-content">
            {/* Top Navigation Bar: Back Arrow + "Settings" */}
            <div className="settings-top-bar settings-top-bar-main">
              <button
                type="button"
                className="settings-back-btn"
                onClick={onClose}
                id="settings-back-btn"
                aria-label="Back"
                title="Back to Dashboard"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="settings-top-title">Settings</h1>
            </div>

            {/* Blue Curved Header with Centered Overlapping Avatar */}
            <div className="settings-curved-banner">
              <div className="settings-avatar-wrapper">
                <div className="settings-avatar-circle" id="settings-avatar-initials">
                  {userInitials}
                </div>
              </div>
            </div>

            {/* Dynamic Student Name & Enrollment Duration */}
            <div className="settings-user-info">
              <h2 className="settings-user-name" id="settings-student-name">
                {studentName}
              </h2>
              <p className="settings-user-sub" id="settings-student-sub">
                {studentEmail} • Enrolled {enrolledDays} {enrolledDays === 1 ? 'day' : 'days'}
              </p>
            </div>

            {/* Grouped Menu Card with 3 Sections */}
            <div className="settings-menu-card">
              {/* SECTION 1: Profile, Assessment, Notifications, Security */}
              <button
                type="button"
                className="settings-menu-row"
                onClick={() => setCurrentView('edit-profile')}
                id="menu-edit-profile"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Edit profile information</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="settings-menu-row"
                onClick={() => {
                  if (onOpenProfileSetup) {
                    onOpenProfileSetup()
                  } else {
                    setCurrentView('assessment')
                  }
                }}
                id="menu-assessment"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    {/* Exact rounded badge with 3 vertical bars from screenshot */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <rect width="20" height="20" rx="3" fill="#475569" />
                      <rect x="5" y="11" width="2.5" height="5" rx="1" fill="#ffffff" />
                      <rect x="9.5" y="8" width="2.5" height="8" rx="1" fill="#ffffff" />
                      <rect x="14" y="5" width="2.5" height="11" rx="1" fill="#ffffff" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Accessment</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="settings-menu-row"
                onClick={() => setCurrentView('questionnaire')}
                id="menu-profile-questionnaire"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Profile Questionnaire</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  {userProfile?.is_profile_question_completed && (
                    <span className="badge bg-success bg-opacity-10 text-success rounded-pill px-2 py-1 small fw-normal" style={{ fontSize: '0.72rem' }}>
                      Completed
                    </span>
                  )}
                  <span className="settings-menu-chevron">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="settings-menu-row"
                onClick={() => setCurrentView('notifications')}
                id="menu-notifications"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21S18 15 18 8Z" />
                      <path d="M13.73 21A2 2 0 0 1 10.27 21" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Notifications</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="settings-menu-row"
                onClick={() => setCurrentView('password')}
                id="menu-password-security"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Password and Security</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              {/* DIVIDER 1 */}
              <div className="settings-menu-divider" />

              {/* SECTION 2: Help & Support, Privacy, Terms */}
              <button
                type="button"
                className="settings-menu-row"
                onClick={() => setCurrentView('support')}
                id="menu-help-support"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 .88-.36 1.68-.93 2.25z" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Help & Support</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="settings-menu-row"
                onClick={() => {
                  if (onClose) onClose()
                  navigate('/privacy-policy')
                }}
                id="menu-privacy-policy"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Privacy policy</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="settings-menu-row"
                onClick={() => {
                  if (onClose) onClose()
                  navigate('/terms-conditions')
                }}
                id="menu-terms-conditions"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Terms & Conditions</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              {/* DIVIDER 2 */}
              <div className="settings-menu-divider" />

              {/* SECTION 3: Delete & Logout */}
              <button
                type="button"
                className="settings-menu-row"
                onClick={() => setIsDeleteModalOpen(true)}
                id="menu-delete-account"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon text-danger">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </span>
                  <span className="settings-menu-label settings-menu-label-delete">Delete</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="settings-menu-row"
                onClick={() => setIsLogoutModalOpen(true)}
                id="menu-logout"
              >
                <div className="settings-menu-left">
                  <span className="settings-menu-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </span>
                  <span className="settings-menu-label">Logout</span>
                </div>
                <span className="settings-menu-chevron">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 2: EDIT PROFILE INFORMATION (PUT /api/student/profile/update)
            ========================================================================= */}
        {currentView === 'edit-profile' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-profile"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Edit Profile Information</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4">
              {isProfileLoading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary mb-3" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <div className="fw-semibold text-dark">Fetching your profile details...</div>
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} id="editProfileForm">
                  {profileSuccessMsg && (
                    <div className="alert alert-success d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <div className="fw-semibold">{profileSuccessMsg}</div>
                    </div>
                  )}

                  {profileError && (
                    <div className="alert alert-danger d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{profileError}</span>
                    </div>
                  )}

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputFirstName">
                        First Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3"
                        id="inputFirstName"
                        name="first_name"
                        value={profileData.first_name}
                        onChange={handleProfileChange}
                        placeholder="First name"
                        required
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputLastName">
                        Last Name
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3"
                        id="inputLastName"
                        name="last_name"
                        value={profileData.last_name}
                        onChange={handleProfileChange}
                        placeholder="Last name"
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputEmail">
                        Email Address <span className="badge bg-light text-muted border ms-1">Account ID</span>
                      </label>
                      <input
                        type="email"
                        className="form-control form-control-sm rounded-3 bg-light text-muted"
                        id="inputEmail"
                        name="email"
                        value={profileData.email}
                        readOnly
                        disabled
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputMobile">
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        className="form-control form-control-sm rounded-3"
                        id="inputMobile"
                        name="mobile"
                        value={profileData.mobile}
                        onChange={handleProfileChange}
                        placeholder="e.g. 9876543210"
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="selectGender">
                        Gender
                      </label>
                      <select
                        className="form-select form-select-sm rounded-3"
                        id="selectGender"
                        name="gender"
                        value={profileData.gender}
                        onChange={handleProfileChange}
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="selectGrade">
                        Grade / Class
                      </label>
                      <select
                        className="form-select form-select-sm rounded-3"
                        id="selectGrade"
                        name="grade"
                        value={profileData.grade}
                        onChange={handleProfileChange}
                      >
                        {availableGrades.map((g) => (
                          <option key={g} value={g}>
                            Grade {g}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputInstitute">
                        School / Institute
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3"
                        id="inputInstitute"
                        name="institute"
                        value={profileData.institute}
                        onChange={handleProfileChange}
                        placeholder="School name"
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputPlace">
                        City / Place
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3"
                        id="inputPlace"
                        name="place"
                        value={profileData.place}
                        onChange={handleProfileChange}
                        placeholder="City"
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputDob">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        className="form-control form-control-sm rounded-3"
                        id="inputDob"
                        name="dob"
                        value={profileData.dob}
                        onChange={handleProfileChange}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputWhatsapp">
                        WhatsApp Contact
                      </label>
                      <input
                        type="tel"
                        className="form-control form-control-sm rounded-3"
                        id="inputWhatsapp"
                        name="whatsapp"
                        value={profileData.whatsapp}
                        onChange={handleProfileChange}
                        placeholder="WhatsApp number"
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputParentName">
                        Parent / Guardian Name
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3"
                        id="inputParentName"
                        name="parent_name"
                        value={profileData.parent_name}
                        onChange={handleProfileChange}
                        placeholder="Parent's name"
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputParentContact">
                        Parent Contact Number
                      </label>
                      <input
                        type="tel"
                        className="form-control form-control-sm rounded-3"
                        id="inputParentContact"
                        name="parent_contact"
                        value={profileData.parent_contact}
                        onChange={handleProfileChange}
                        placeholder="Parent's phone"
                      />
                    </div>
                  </div>

                  <div className="d-flex justify-content-end gap-2 pt-4 mt-3 border-top">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                      onClick={() => setCurrentView('main')}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm rounded-pill px-4 fw-semibold"
                      disabled={isSavingProfile}
                      id="btn-save-profile"
                    >
                      {isSavingProfile ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 3: ASSESSMENT (GET /api/course-progress)
            ========================================================================= */}
        {currentView === 'assessment' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-assessment"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Academic Assessments & Evaluation</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4">
              {isAnalyticsLoading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary mb-3" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <div className="fw-semibold text-dark">Loading your assessment metrics...</div>
                </div>
              ) : analyticsError ? (
                <div className="alert alert-danger p-3 rounded-3 small">
                  <strong>Error:</strong> {analyticsError}
                </div>
              ) : (
                <div>
                  <div className="p-3 bg-light rounded-4 mb-3 border">
                    <div className="d-flex align-items-center gap-2 mb-2 text-primary fw-bold small">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect width="20" height="20" rx="3" fill="#2563eb" />
                        <rect x="5" y="11" width="2.5" height="5" rx="1" fill="#ffffff" />
                        <rect x="9.5" y="8" width="2.5" height="8" rx="1" fill="#ffffff" />
                        <rect x="14" y="5" width="2.5" height="11" rx="1" fill="#ffffff" />
                      </svg>
                      <span>Live Academic Evaluation</span>
                    </div>
                    <p className="text-muted small mb-0" style={{ fontSize: '0.8rem' }}>
                      Assessment performance is dynamically synchronized with your tests, quizzes, and learning milestone results on Edoomate.
                    </p>
                  </div>

                  {/* KPI Cards Grid */}
                  <div className="row g-2 mb-4">
                    <div className="col-6">
                      <div className="p-3 bg-white border rounded-3 text-center shadow-xs">
                        <div className="text-muted small mb-1" style={{ fontSize: '0.74rem' }}>Tests Attended</div>
                        <div className="fw-bolder fs-5 text-dark">
                          {analyticsData?.overall_details?.tests_attended || '0/0'}
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 bg-white border rounded-3 text-center shadow-xs">
                        <div className="text-muted small mb-1" style={{ fontSize: '0.74rem' }}>Overall Progress</div>
                        <div className="fw-bolder fs-5 text-primary">
                          {analyticsData?.overall_details?.total_progress || 0}%
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 bg-white border rounded-3 text-center shadow-xs">
                        <div className="text-muted small mb-1" style={{ fontSize: '0.74rem' }}>Enrolled Courses</div>
                        <div className="fw-bolder fs-5 text-dark">
                          {analyticsData?.overall_details?.courses_enrolled || 0}
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 bg-white border rounded-3 text-center shadow-xs">
                        <div className="text-muted small mb-1" style={{ fontSize: '0.74rem' }}>Study Time</div>
                        <div className="fw-bolder fs-5 text-dark">
                          {analyticsData?.overall_details?.total_time_spent || '00:00:00'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Course Assessment List */}
                  <h6 className="fw-bold text-dark small mb-2">Subject Assessments</h6>
                  {Array.isArray(analyticsData?.courses) && analyticsData.courses.length > 0 ? (
                    <div className="list-group list-group-flush border rounded-3 overflow-hidden">
                      {analyticsData.courses.map((course, idx) => (
                        <div key={idx} className="list-group-item p-3 border-bottom">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="fw-semibold text-dark small">{course.title || course.name}</span>
                            <span className="badge bg-primary bg-opacity-10 text-primary small">
                              {course.progress || 0}% Complete
                            </span>
                          </div>
                          <div className="progress" style={{ height: '6px' }}>
                            <div
                              className="progress-bar bg-primary"
                              role="progressbar"
                              style={{ width: `${course.progress || 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-light rounded-3 text-center border text-muted small">
                      <div className="fs-3 mb-2">📝</div>
                      <div>No assessments submitted yet.</div>
                      <div className="smaller text-secondary mt-1">Enroll in courses and take unit tests to view your assessment scores here.</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW: PROFILE QUESTIONNAIRE (GET /api/profile-questions & POST submit)
            ========================================================================= */}
        {currentView === 'questionnaire' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            {/* Top Navigation Bar */}
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-questionnaire"
                aria-label="Back to Settings"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Profile Questionnaire</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4 d-flex flex-column flex-grow-1">
              {isLoadingQuestionnaire ? (
                <div className="text-center py-5 my-auto">
                  <div className="spinner-border text-primary mb-3" role="status">
                    <span className="visually-hidden">Loading questions...</span>
                  </div>
                  <div className="fw-semibold text-dark">Loading questionnaire...</div>
                </div>
              ) : questionnaireList.length === 0 ? (
                <div className="text-center py-5 my-auto text-muted">
                  <div className="fs-1 mb-2">📋</div>
                  <div className="fw-semibold text-dark mb-1">No Questions Available</div>
                  <p className="small text-secondary">There are currently no profile questionnaire questions to display.</p>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm rounded-pill px-4 mt-2"
                    onClick={() => setCurrentView('main')}
                  >
                    Return to Settings
                  </button>
                </div>
              ) : (
                <div className="d-flex flex-column flex-grow-1">
                  {/* Progress Header */}
                  <div className="mb-4">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="badge bg-primary bg-opacity-10 text-primary fw-bold px-3 py-1 rounded-pill" style={{ fontSize: '0.82rem' }}>
                        Question {activeQuestionIdx + 1} of {questionnaireList.length}
                      </span>
                      <span className="small text-muted fw-semibold">
                        {Math.round(((activeQuestionIdx + 1) / questionnaireList.length) * 100)}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="progress" style={{ height: '6px', backgroundColor: '#e2e8f0', borderRadius: '999px' }}>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        style={{
                          width: `${((activeQuestionIdx + 1) / questionnaireList.length) * 100}%`,
                          backgroundColor: '#2563eb',
                          borderRadius: '999px',
                          transition: 'width 0.3s ease',
                        }}
                        aria-valuenow={activeQuestionIdx + 1}
                        aria-valuemin="1"
                        aria-valuemax={questionnaireList.length}
                      />
                    </div>
                  </div>

                  {/* Feedback Messages */}
                  {isQuestionnaireCompleted && (
                    <div className="alert alert-info d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <div>
                        <strong>Submitted & Locked:</strong> Your questionnaire answers have been permanently saved in your profile.
                      </div>
                    </div>
                  )}

                  {questionnaireSuccessMsg && (
                    <div className="alert alert-success d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <div className="fw-semibold">{questionnaireSuccessMsg}</div>
                    </div>
                  )}

                  {questionnaireError && (
                    <div className="alert alert-danger d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{questionnaireError}</span>
                    </div>
                  )}

                  {/* Active Question Prompt */}
                  {(() => {
                    const activeQ = questionnaireList[activeQuestionIdx]
                    if (!activeQ) return null
                    const currentSelected = questionnaireAnswers[activeQ.question] || ''

                    return (
                      <div className="flex-grow-1 d-flex flex-column">
                        <div className="mb-4">
                          <h3 className="h6 fw-bold text-dark mb-1" style={{ fontSize: '1.05rem', lineHeight: '1.45' }}>
                            {activeQ.question}
                          </h3>
                          <span className="text-secondary smaller">
                            {isQuestionnaireCompleted
                              ? 'Your submitted response (Read-only):'
                              : 'Select one option that best applies to you:'}
                          </span>
                        </div>

                        {/* Options List */}
                        <div className="d-flex flex-column gap-2 mb-4">
                          {Array.isArray(activeQ.options) &&
                            activeQ.options.map((opt, optIdx) => {
                              const isSelected = currentSelected === opt

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={isQuestionnaireCompleted}
                                  className={`w-100 text-start p-3 rounded-3 d-flex align-items-center justify-content-between border transition-all ${
                                    isSelected
                                      ? 'border-primary bg-primary bg-opacity-10 text-primary shadow-xs'
                                      : isQuestionnaireCompleted
                                      ? 'border-slate-200 bg-light text-muted opacity-75'
                                      : 'border-slate-200 bg-white text-dark hover-bg-light'
                                  }`}
                                  style={{
                                    borderWidth: isSelected ? '2px' : '1px',
                                    borderColor: isSelected ? '#2563eb' : '#e2e8f0',
                                    cursor: isQuestionnaireCompleted ? 'default' : 'pointer',
                                  }}
                                  onClick={() => handleSelectQuestionnaireOption(activeQ.question, opt)}
                                >
                                  <div className="d-flex align-items-center gap-3">
                                    <div
                                      className={`rounded-circle d-flex align-items-center justify-content-center border ${
                                        isSelected ? 'bg-primary border-primary text-white' : 'border-secondary bg-white'
                                      }`}
                                      style={{
                                        width: '20px',
                                        height: '20px',
                                        minWidth: '20px',
                                      }}
                                    >
                                      {isSelected && (
                                        <div
                                          style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: '#ffffff',
                                          }}
                                        />
                                      )}
                                    </div>
                                    <span className={`small ${isSelected ? 'fw-bold text-primary' : isQuestionnaireCompleted ? 'text-muted' : 'fw-medium text-dark'}`}>
                                      {opt}
                                    </span>
                                  </div>

                                  {isSelected && (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </button>
                              )
                            })}
                        </div>

                        {/* Navigation / Actions Bar */}
                        <div className="mt-auto pt-3 border-top d-flex align-items-center justify-content-between gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                            disabled={activeQuestionIdx === 0 || isSubmittingQuestionnaire}
                            onClick={() => {
                              setQuestionnaireError(null)
                              setActiveQuestionIdx((prev) => Math.max(0, prev - 1))
                            }}
                          >
                            Previous
                          </button>

                          <div className="d-flex align-items-center gap-2">
                            {isQuestionnaireCompleted ? (
                              activeQuestionIdx === questionnaireList.length - 1 ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-primary btn-sm rounded-pill px-4 fw-bold shadow-xs"
                                  onClick={() => setCurrentView('main')}
                                >
                                  Back to Settings
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm rounded-pill px-4 fw-bold shadow-xs"
                                  onClick={handleQuestionnaireNextOrSubmit}
                                >
                                  Next
                                </button>
                              )
                            ) : activeQuestionIdx === questionnaireList.length - 1 ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm rounded-pill px-4 fw-bold shadow-xs"
                                disabled={isSubmittingQuestionnaire}
                                onClick={handleQuestionnaireNextOrSubmit}
                                id="btn-submit-questionnaire"
                              >
                                {isSubmittingQuestionnaire ? (
                                  <span className="d-flex align-items-center gap-2">
                                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                                    <span>Saving...</span>
                                  </span>
                                ) : (
                                  'Finish & Save'
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm rounded-pill px-4 fw-bold shadow-xs"
                                onClick={handleQuestionnaireNextOrSubmit}
                                id="btn-next-questionnaire"
                              >
                                Next
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 4: NOTIFICATIONS
            ========================================================================= */}
        {currentView === 'notifications' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-notifs"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Notifications</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4">
              {/* Push Subscription Card */}
              <div className="p-3 border rounded-3 bg-light mb-3 d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-2">
                  <div
                    className={`rounded-circle d-flex align-items-center justify-content-center text-white ${
                      pushPlayerId ? 'bg-success' : 'bg-secondary'
                    }`}
                    style={{ width: '32px', height: '32px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21S18 15 18 8Z" />
                      <path d="M13.73 21A2 2 0 0 1 10.27 21" />
                    </svg>
                  </div>
                  <div>
                    <div className="fw-semibold small text-dark">OneSignal Push Service</div>
                    <div className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                      {pushPlayerId ? 'Device active for instant course alerts' : 'Push notifications registered with device'}
                    </div>
                  </div>
                </div>
                <span className={`badge ${pushPlayerId ? 'bg-success' : 'bg-primary'} rounded-pill`}>
                  {pushPlayerId ? 'Active' : 'Connected'}
                </span>
              </div>

              {/* Action Toolbar */}
              {notificationsList.length > 0 && (
                <div className="d-flex justify-content-end mb-2">
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-decoration-none p-0 small fw-semibold"
                    onClick={() => {
                      const updated = notificationService.markAllAsRead()
                      setNotificationsList(updated)
                    }}
                  >
                    Mark all as read
                  </button>
                </div>
              )}

              {/* Notification List */}
              {notificationsList.length > 0 ? (
                <div className="list-group list-group-flush border rounded-3 overflow-hidden">
                  {notificationsList.map((notif) => (
                    <div key={notif.id} className="list-group-item p-3 border-bottom d-flex align-items-start gap-3">
                      <span className="fs-5">{notif.icon || '🔔'}</span>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-semibold text-dark small">{notif.title}</span>
                          <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>{notif.time || 'Recently'}</span>
                        </div>
                        <p className="text-secondary small mb-0" style={{ fontSize: '0.8rem' }}>{notif.message}</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-muted p-0"
                        onClick={() => {
                          const updated = notificationService.clearNotification(notif.id)
                          setNotificationsList(updated)
                        }}
                        title="Dismiss notification"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-light rounded-3 text-center border text-muted small my-3">
                  <div className="fs-2 mb-2">🔔</div>
                  <div className="fw-semibold text-dark">You're all caught up!</div>
                  <div className="smaller text-secondary mt-1">No unread notifications at this time.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 5: PASSWORD AND SECURITY (POST /api/student/change-password)
            ========================================================================= */}
        {currentView === 'password' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-password"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Password and Security</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4">
              <form onSubmit={handleChangePassword} id="changePasswordForm">
                <div className="p-3 border rounded-3 bg-light mb-3">
                  <div className="d-flex align-items-center gap-2 text-primary fw-semibold small mb-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Security Guidelines</span>
                  </div>
                  <p className="text-muted small mb-0" style={{ fontSize: '0.8rem' }}>
                    Choose a secure password of at least 6 characters. Do not share your credentials with others.
                  </p>
                </div>

                {passwordSuccessMsg && (
                  <div className="alert alert-success d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <div className="fw-semibold">{passwordSuccessMsg}</div>
                  </div>
                )}

                {passwordError && (
                  <div className="alert alert-danger d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <div className="fw-semibold">{passwordError}</div>
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputCurrentPassword">
                    Current Password <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      className="form-control rounded-start-3"
                      id="inputCurrentPassword"
                      value={passwordForm.current_password}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))
                      }
                      placeholder="Enter current password"
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary rounded-end-3"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputNewPassword">
                    New Password <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      className="form-control rounded-start-3"
                      id="inputNewPassword"
                      value={passwordForm.new_password}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))
                      }
                      placeholder="At least 6 characters"
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary rounded-end-3"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="form-label small fw-semibold text-secondary mb-1" htmlFor="inputConfirmPassword">
                    Confirm New Password <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-control rounded-start-3"
                      id="inputConfirmPassword"
                      value={passwordForm.confirm_password}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                      }
                      placeholder="Re-enter new password"
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary rounded-end-3"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 pt-3 border-top">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                    onClick={() => setCurrentView('main')}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm rounded-pill px-4 fw-semibold"
                    disabled={isSavingPassword}
                    id="btn-update-password"
                  >
                    {isSavingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 6: HELP & SUPPORT
            ========================================================================= */}
        {currentView === 'support' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-support"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Help & Support</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4">
              {/* Support Inquiry Form */}
              <h6 className="fw-bold text-dark small mb-2">Submit Support Inquiry</h6>
              {supportSuccessMsg && (
                <div className="alert alert-success d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div className="fw-semibold">{supportSuccessMsg}</div>
                </div>
              )}

              {supportErrorMsg && (
                <div className="alert alert-danger d-flex align-items-center gap-2 p-2 px-3 rounded-3 mb-3 small">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{supportErrorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSupportSubmit} className="border p-3 rounded-3 bg-light">
                {/* Auto-filled User Identity Fields */}
                <div className="row g-2 mb-2">
                  <div className="col-12 col-sm-6">
                    <label className="form-label smaller fw-semibold text-secondary mb-1">
                      First Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3"
                      placeholder="First name"
                      value={supportForm.first_name}
                      onChange={(e) => setSupportForm((p) => ({ ...p, first_name: e.target.value }))}
                      required
                      disabled={isSubmittingSupport}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label smaller fw-semibold text-secondary mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3"
                      placeholder="Last name"
                      value={supportForm.last_name}
                      onChange={(e) => setSupportForm((p) => ({ ...p, last_name: e.target.value }))}
                      disabled={isSubmittingSupport}
                    />
                  </div>
                </div>

                <div className="row g-2 mb-2">
                  <div className="col-12 col-sm-6">
                    <label className="form-label smaller fw-semibold text-secondary mb-1">
                      Email <span className="text-danger">*</span>
                    </label>
                    <input
                      type="email"
                      className="form-control form-control-sm rounded-3"
                      placeholder="name@example.com"
                      value={supportForm.email}
                      onChange={(e) => setSupportForm((p) => ({ ...p, email: e.target.value }))}
                      required
                      disabled={isSubmittingSupport}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label smaller fw-semibold text-secondary mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      className="form-control form-control-sm rounded-3"
                      placeholder="Contact phone"
                      value={supportForm.phone}
                      onChange={(e) => setSupportForm((p) => ({ ...p, phone: e.target.value }))}
                      disabled={isSubmittingSupport}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label smaller fw-semibold text-secondary mb-1">
                    Your Message <span className="text-danger">*</span>
                  </label>
                  <textarea
                    className="form-control form-control-sm rounded-3"
                    rows={3}
                    placeholder="Describe your issue or feedback..."
                    value={supportForm.message}
                    onChange={(e) => setSupportForm((p) => ({ ...p, message: e.target.value }))}
                    required
                    disabled={isSubmittingSupport}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm rounded-pill px-4 fw-semibold shadow-xs"
                  disabled={isSubmittingSupport}
                  id="btn-submit-support"
                >
                  {isSubmittingSupport ? (
                    <span className="d-flex align-items-center gap-2">
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <span>Sending...</span>
                    </span>
                  ) : (
                    'Submit Inquiry'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 7: PRIVACY POLICY
            ========================================================================= */}
        {currentView === 'privacy' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-privacy"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Privacy Policy</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4">
              <div className="p-3 bg-light rounded-3 mb-3 border">
                <span className="badge bg-primary bg-opacity-10 text-primary mb-1">Policy Verified</span>
                <p className="text-secondary smaller mb-0" style={{ fontSize: '0.78rem' }}>
                  Effective Date: October 2026. Edoomate is committed to safeguarding student data and ensuring complete transparency.
                </p>
              </div>

              <div className="privacy-body text-secondary small" style={{ lineHeight: '1.65', fontSize: '0.85rem' }}>
                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">1. Information We Collect</h6>
                <p>
                  We collect information necessary to deliver educational services, including your name, email address, school affiliation, grade level, and course progression records. For minors, parent/guardian contact details are recorded.
                </p>

                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">2. How We Use Student Data</h6>
                <p>
                  Student information is used exclusively to tailor learning content, track assessment milestones, record points and leaderboard standings, and facilitate instructor communication. We never sell student data to third parties.
                </p>

                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">3. Security & Protection</h6>
                <p>
                  All credentials and communications are encrypted using industry-standard TLS 1.3 protocols. Authentication tokens are securely stored and verified against our backend API on every request.
                </p>

                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">4. Student Rights & Account Deletion</h6>
                <p>
                  Students and authorized parents/guardians possess the right to review, rectify, or request permanent deletion of their account records at any time directly through the Settings menu.
                </p>

                <div className="p-3 bg-light rounded-3 mt-3 border">
                  <strong>Privacy Officer Contact:</strong> <a href="mailto:privacy@edoomate.com" className="text-primary text-decoration-none">privacy@edoomate.com</a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 8: TERMS & CONDITIONS
            ========================================================================= */}
        {currentView === 'terms' && (
          <div className="d-flex flex-column w-100 flex-grow-1 bg-white">
            <div className="settings-top-bar settings-top-bar-sticky">
              <button
                type="button"
                className="settings-back-btn"
                onClick={() => setCurrentView('main')}
                id="back-to-settings-from-terms"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h2 className="settings-top-title fs-6">Terms & Conditions</h2>
            </div>

            <div className="settings-subview-body p-3 p-sm-4">
              <div className="p-3 bg-light rounded-3 mb-3 border">
                <span className="badge bg-secondary bg-opacity-10 text-secondary mb-1">Student Agreement</span>
                <p className="text-secondary smaller mb-0" style={{ fontSize: '0.78rem' }}>
                  By accessing the Edoomate learning platform, you agree to comply with the academic guidelines set forth below.
                </p>
              </div>

              <div className="terms-body text-secondary small" style={{ lineHeight: '1.65', fontSize: '0.85rem' }}>
                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">1. Student Conduct & Academic Integrity</h6>
                <p>
                  Learners must participate with integrity during all virtual classes, exams, and peer interactions. Cheating, sharing test answers, or uploading unauthorized materials is strictly prohibited.
                </p>

                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">2. Course Material & Intellectual Property</h6>
                <p>
                  All syllabus documents, recorded lectures, quizzes, and learning media are the proprietary intellectual property of Edoomate and its partner educators. Content may not be recorded or distributed.
                </p>

                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">3. Virtual Classroom Protocol</h6>
                <p>
                  Students must maintain respectful classroom decorum during live interactive sessions. Inappropriate language or disruption will result in immediate removal from the virtual room.
                </p>

                <h6 className="fw-bold text-dark fs-6 mt-3 mb-1">4. Account Responsibilities</h6>
                <p>
                  Each student is solely responsible for maintaining the confidentiality of their login credentials. Any activity taking place under your account is your responsibility.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL DIALOG: DELETE ACCOUNT CONFIRMATION (POST /api/student/delete-account)
            ========================================================================= */}
        {isDeleteModalOpen && (
          <div
            className="position-absolute inset-0 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center p-3 animate-fade-in"
            style={{ zIndex: 30 }}
          >
            <div className="bg-white rounded-4 p-4 shadow-xl w-100" style={{ maxWidth: '400px' }}>
              <div className="d-flex align-items-center gap-3 mb-3 text-danger">
                <div className="rounded-circle bg-danger bg-opacity-10 p-2 d-flex align-items-center justify-content-center" style={{ width: '44px', height: '44px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <h5 className="fw-bold mb-0 text-dark fs-6">Delete Student Account?</h5>
                  <span className="text-danger smaller fw-semibold">Permanent & Irreversible</span>
                </div>
              </div>

              {deleteSuccessMsg ? (
                <div className="text-center py-3">
                  <div className="rounded-circle bg-success bg-opacity-10 text-success mx-auto p-3 d-flex align-items-center justify-content-center mb-3" style={{ width: '56px', height: '56px' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h6 className="fw-bold text-dark mb-1">Account Deleted</h6>
                  <p className="text-secondary small mb-0">{deleteSuccessMsg}</p>
                </div>
              ) : deleteOtpNeeded ? (
                <div>
                  <p className="text-secondary small mb-3" style={{ fontSize: '0.82rem', lineHeight: '1.5' }}>
                    A confirmation code has been sent to <strong>{deleteEmail}</strong>. Please enter the verification code below to permanently delete your account.
                  </p>

                  {deleteError && (
                    <div className="alert alert-danger p-2 small mb-3">
                      {deleteError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label smaller fw-semibold text-secondary mb-1">
                      Verification Code <span className="text-danger">*</span>:
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3 text-center fw-bold letter-spacing-1"
                      placeholder="Enter verification OTP"
                      value={deleteOtpCode}
                      onChange={(e) => {
                        setDeleteOtpCode(e.target.value)
                        setDeleteError(null)
                      }}
                      maxLength={6}
                      disabled={isDeletingAccount}
                    />
                  </div>

                  <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                      onClick={() => {
                        setDeleteOtpNeeded(false)
                        setIsDeleteModalOpen(false)
                      }}
                      disabled={isDeletingAccount}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm rounded-pill px-4 fw-semibold"
                      onClick={handleConfirmDeleteOtp}
                      disabled={isDeletingAccount || !deleteOtpCode}
                      id="btn-verify-delete-account"
                    >
                      {isDeletingAccount ? 'Verifying...' : 'Verify & Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-secondary small mb-3" style={{ fontSize: '0.82rem', lineHeight: '1.5' }}>
                    This action cannot be undone. All your course enrollments, learning progress, quiz scores, and point balances will be permanently deleted from Edoomate.
                  </p>

                  {deleteError && (
                    <div className="alert alert-danger p-2 small mb-3">
                      {deleteError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label smaller fw-semibold text-secondary mb-1">
                      Please select a reason for deletion <span className="text-danger">*</span>:
                    </label>
                    <select
                      className="form-select form-select-sm rounded-3 mb-2"
                      value={deleteReason}
                      onChange={(e) => {
                        setDeleteReason(e.target.value)
                        setDeleteError(null)
                      }}
                      id="selectDeleteReason"
                    >
                      <option value="">-- Choose a reason --</option>
                      {activeReasons.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                      onClick={() => setIsDeleteModalOpen(false)}
                      disabled={isDeletingAccount}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm rounded-pill px-4 fw-semibold"
                      onClick={handleConfirmDeleteAccount}
                      disabled={isDeletingAccount || !deleteReason}
                      id="btn-confirm-delete-account"
                    >
                      {isDeletingAccount ? 'Deleting Account...' : 'Permanently Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL DIALOG: LOGOUT CONFIRMATION
            ========================================================================= */}
        {isLogoutModalOpen && (
          <div
            className="position-absolute inset-0 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center p-3 animate-fade-in"
            style={{ zIndex: 30 }}
          >
            <div className="bg-white rounded-4 p-4 shadow-xl w-100" style={{ maxWidth: '380px' }}>
              <div className="d-flex align-items-center gap-3 mb-3 text-primary">
                <div className="rounded-circle bg-primary bg-opacity-10 p-2 d-flex align-items-center justify-content-center" style={{ width: '42px', height: '42px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </div>
                <div>
                  <h5 className="fw-bold mb-0 text-dark fs-6">Sign Out?</h5>
                  <span className="text-muted smaller">End your current session</span>
                </div>
              </div>

              <p className="text-secondary small mb-3" style={{ fontSize: '0.84rem' }}>
                Are you sure you want to log out of Edoomate? You can sign back in at any time with your credentials.
              </p>

              <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                  onClick={() => setIsLogoutModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-4 fw-semibold"
                  onClick={handleConfirmLogout}
                  id="btn-confirm-logout"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
