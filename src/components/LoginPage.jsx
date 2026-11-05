import React, { useState, useEffect, useRef } from 'react'
import loginLogoCard from '../assets/login-logo-card.png'
import { authService } from '../services/authService'
import { firebaseService } from '../services/firebase'

export default function LoginPage({ onBack, onLoginSuccess }) {
  // Helper to resolve current authentication step from window hash
  const getStepFromHash = () => {
    const clean = (window.location.hash || '').split('?')[0].replace(/\/+$/, '')
    if (clean === '#signup' || clean === '#register') return 'signup'
    if (clean === '#otp' || clean === '#send-otp') return 'otp_identifier'
    if (clean === '#password') return 'password'
    if (clean === '#choose-method') return 'choose_method'
    // Default initial screen is 'email' per requirements
    return 'email'
  }

  // Helper to retrieve prefilled email from URL query, hash query, or session storage
  const getInitialEmail = () => {
    try {
      if (window.location.hash && window.location.hash.includes('?')) {
        const query = window.location.hash.split('?')[1]
        const params = new URLSearchParams(query)
        const emailParam = params.get('email')
        if (emailParam) return emailParam.trim()
      }
      if (window.location.search) {
        const searchParams = new URLSearchParams(window.location.search)
        const searchEmail = searchParams.get('email')
        if (searchEmail) return searchEmail.trim()
      }
      const saved = sessionStorage.getItem('edoomate_pending_email')
      if (saved) return saved.trim()
    } catch {
      // Fallback
    }
    return ''
  }

  // Helper to extract only the grade number/value, stripping prefixes like "Grade", "Class", "Year", etc.
  const formatGradeNumber = (item) => {
    if (item === null || item === undefined) return ''
    const raw = typeof item === 'object' ? item.name || item.label || item.value || item.id || '' : String(item)
    // Remove "Grade", "Class", "Standard", "Std", "Year", etc. prefixes
    const cleaned = String(raw).trim().replace(/^(?:grade|class|standard|std|year)\s*[:#-]?\s*/i, '').trim()
    return cleaned || String(raw).trim()
  }

  // Navigation Step: 'choose_method' | 'otp_identifier' | 'otp_verify' | 'email' | 'password' | 'signup'
  const [step, setStep] = useState(getStepFromHash)

  // Login Mode Selection: 'otp' | 'password' (defaults to 'otp' as in screenshot)
  const [selectedAuthMethod, setSelectedAuthMethod] = useState('otp')

  // OTP Flow States
  const [otpIdentifier, setOtpIdentifier] = useState('')
  const [otpCountryCode, setOtpCountryCode] = useState('91')
  const [otpDigits, setOtpDigits] = useState(['', '', '', ''])
  const [resendCountdown, setResendCountdown] = useState(0)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const otpInputRefs = useRef([])

  // Credentials & Registration Form State
  const [email, setEmail] = useState(getInitialEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Sign Up Full Fields (Matching Reference Screenshot)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState('Select Gender')
  const [countryCode, setCountryCode] = useState('91')
  const [mobile, setMobile] = useState('')
  const [grade, setGrade] = useState('Select Grade')
  const [learningType, setLearningType] = useState('Individual')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Schools List & Institute Selection State
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [schoolsList, setSchoolsList] = useState([])
  const [isSchoolsLoading, setIsSchoolsLoading] = useState(false)
  const [schoolsError, setSchoolsError] = useState('')
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Parent Details (Matching Reference Screenshot)
  const [parentName, setParentName] = useState('')
  const [parentContact, setParentContact] = useState('')
  const [parentCountryCode, setParentCountryCode] = useState('91')

  // Available Grades from API: array of objects { value, id, label } or strings
  const [availableGrades, setAvailableGrades] = useState([
    { value: 'I', label: '1' },
    { value: 'II', label: '11' },
    { value: 'III', label: '111' },
    { value: 'IV', label: '4' },
    { value: 'V', label: '5' },
    { value: 'VI', label: '6' },
    { value: 'VII', label: '7' },
    { value: 'VIII', label: '8' },
    { value: 'IX', label: '9' },
    { value: 'X', label: '10' },
  ])

  // UI & Feedback States
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [infoMessage, setInfoMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Clear a specific field error when input changes
  const clearFieldError = (fieldName) => {
    setFieldErrors((prev) => {
      if (!prev[fieldName]) return prev
      const updated = { ...prev }
      delete updated[fieldName]
      return updated
    })
    if (error) setError('')
  }

  // Fetch available grades from GET /api/grades
  useEffect(() => {
    authService.getGrades().then((gradesData) => {
      if (!gradesData) return

      if (Array.isArray(gradesData)) {
        // Array of items (strings or objects)
        const mapped = gradesData.map((item) => {
          if (typeof item === 'object' && item !== null) {
            const val = item.id !== undefined ? item.id : item.value !== undefined ? item.value : item.grade || item.name
            const rawLabel = item.name || item.label || item.grade || item.grade_name || String(val)
            return {
              value: val,
              id: item.id !== undefined ? item.id : val,
              label: formatGradeNumber(rawLabel),
            }
          }
          return {
            value: item,
            id: item,
            label: formatGradeNumber(item),
          }
        })
        if (mapped.length > 0) setAvailableGrades(mapped)
      } else if (typeof gradesData === 'object') {
        // Dictionary mapping e.g. { "I": "I", "II": "II", ... } or { "1": "Grade 1", ... }
        const mapped = Object.entries(gradesData).map(([key, val]) => {
          const rawLabel = typeof val === 'object' && val !== null ? (val.name || val.label || key) : val
          return {
            value: key,
            id: typeof val === 'object' && val?.id !== undefined ? val.id : key,
            label: formatGradeNumber(rawLabel),
          }
        })
        if (mapped.length > 0) setAvailableGrades(mapped)
      }
    })
  }, [])

  // Fetch available schools from GET /api/schools when user selects Institute
  const fetchSchools = (force = false) => {
    if (!force && (schoolsList.length > 0 || isSchoolsLoading)) return

    setIsSchoolsLoading(true)
    setSchoolsError('')

    authService
      .getSchools()
      .then((data) => {
        if (!isMountedRef.current) return
        setSchoolsList(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (!isMountedRef.current) return
        setSchoolsError(err.message || 'Unable to load schools list. Please try again.')
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsSchoolsLoading(false)
        }
      })
  }

  // Handle learning type selection with on-demand school fetching
  const handleSelectLearningType = (type) => {
    setLearningType(type)
    if (error) setError('')
    if (type === 'Institute') {
      fetchSchools()
    }
  }

  // Resend Countdown Timer
  useEffect(() => {
    let interval = null
    if (resendCountdown > 0) {
      interval = setInterval(() => {
        setResendCountdown((prev) => (prev > 1 ? prev - 1 : 0))
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [resendCountdown])

  // Sync step and prefilled email with URL hash navigation
  useEffect(() => {
    const handleHash = () => {
      const clean = (window.location.hash || '').split('?')[0].replace(/\/+$/, '')
      if (clean === '#signup' || clean === '#register') {
        setStep('signup')
        const prefilled = getInitialEmail()
        if (prefilled) {
          setEmail((prev) => prev || prefilled)
        }
      } else if (clean === '#email' || clean === '#password-login') {
        setStep('email')
      } else if (clean === '#login' || clean === '#choose-method') {
        setStep('choose_method')
      }
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  // Step 1: Check whether email is registered using existing backend API
  const handleEmailContinue = async (e) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()

    if (!trimmed) {
      setFieldErrors({ email: 'This field is required' })
      setError('Please enter your email address.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      setFieldErrors({ email: 'Please enter a valid email address.' })
      setError('Please enter a valid email address.')
      return
    }

    setFieldErrors({})
    setError('')
    setInfoMessage('')
    setIsLoading(true)

    try {
      // Check whether the email is registered using backend verification
      const result = await authService.checkEmailRegistered(trimmed)

      if (result.isRegistered) {
        // Registered: show two login method options (Login with OTP or Login with Password)
        setOtpIdentifier(trimmed)
        setStep('choose_method')
        setError('')
      } else {
        // Not registered: do not show OTP or password login options.
        // Redirect to the existing Create New Account / Signup page with email pre-filled.
        try {
          sessionStorage.setItem('edoomate_pending_email', trimmed)
        } catch {
          // Storage fallback
        }
        setStep('signup')
        window.location.hash = '#signup'
        setInfoMessage(`No existing account found for "${trimmed}". Complete the details below to create your Edoomate account!`)
        setError('')
      }
    } catch (err) {
      setError(err.message || 'Unable to verify email. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2: Submit Login credentials
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()

    if (!trimmed) {
      setFieldErrors({ email: 'This field is required' })
      setError('The email field is required.')
      setStep('email')
      return
    }
    if (!password) {
      setFieldErrors({ password: 'This field is required' })
      setError('Please enter your password.')
      return
    }

    setFieldErrors({})
    setError('')
    setIsLoading(true)

    try {
      const playerId = authService.getOneSignalPlayerId()
      const result = await authService.login({
        email: trimmed,
        password: password,
        onesignal_player_id: playerId,
      })

      if (onLoginSuccess) {
        onLoginSuccess(result)
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3: Submit Registration to create a new student account
  const handleSignupSubmit = async (e) => {
    e.preventDefault()
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const trimmedEmail = email.trim().toLowerCase()
    const cleanMobile = mobile.replace(/\D/g, '')

    const errors = {}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!trimmedFirst) {
      errors.firstName = 'This field is required'
    }
    if (!trimmedLast) {
      errors.lastName = 'This field is required'
    }
    if (gender === 'Select Gender') {
      errors.gender = 'This field is required'
    }
    if (!trimmedEmail) {
      errors.email = 'This field is required'
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.'
    }
    if (!cleanMobile) {
      errors.mobile = 'This field is required'
    } else if (cleanMobile.length < 6 || cleanMobile.length > 15) {
      errors.mobile = 'Mobile number must be between 6 and 15 digits.'
    }
    if (grade === 'Select Grade') {
      errors.grade = 'This field is required'
    }
    if (learningType === 'Institute' && !selectedSchoolId) {
      errors.school = 'This field is required'
    }
    if (!password) {
      errors.password = 'This field is required'
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.'
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'This field is required'
    } else if (password && password !== confirmPassword) {
      errors.confirmPassword = 'Confirm password does not match password.'
    }

    // Parent Contact Validation
    const trimmedParentContact = parentContact.trim()
    if (!trimmedParentContact) {
      errors.parentContact = 'This field is required'
    } else {
      const isEmail = trimmedParentContact.includes('@') || /[a-zA-Z]/.test(trimmedParentContact)
      if (isEmail) {
        const normalizedEmail = trimmedParentContact.toLowerCase()
        if (!emailRegex.test(normalizedEmail)) {
          errors.parentContact = 'Please enter a valid parent email address.'
        }
      } else {
        const cleanDigits = trimmedParentContact.replace(/\D/g, '')
        if (!cleanDigits) {
          errors.parentContact = 'Please enter a valid parent mobile number.'
        } else if (cleanDigits.length < 6 || cleanDigits.length > 15) {
          errors.parentContact = 'Parent mobile number must be between 6 and 15 digits.'
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstErrorMessage = Object.values(errors)[0]
      setError(firstErrorMessage)
      return
    }

    setFieldErrors({})

    const isEmail = trimmedParentContact.includes('@') || /[a-zA-Z]/.test(trimmedParentContact)
    let parentEmailValue = undefined
    let parentMobileValue = undefined

    if (isEmail) {
      parentEmailValue = trimmedParentContact.toLowerCase()
    } else {
      parentMobileValue = trimmedParentContact.replace(/\D/g, '')
    }

    setError('')
    setIsLoading(true)

    try {
      const selectedSchool = schoolsList.find((s) => String(s.id) === String(selectedSchoolId))
      const schoolName = selectedSchool ? selectedSchool.name : ''

      const result = await authService.register({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        gender: gender,
        email: trimmedEmail,
        country_code: countryCode,
        mobile: cleanMobile,
        grade: grade,
        study_type: learningType,
        learning_type: learningType,
        school_id: learningType === 'Institute' ? selectedSchoolId : undefined,
        school: learningType === 'Institute' ? schoolName : undefined,
        institute: learningType === 'Institute' ? schoolName : undefined,
        password: password,
        confirm_password: confirmPassword,
        parent_name: parentName.trim(),
        parent_email: parentEmailValue,
        parent_country_code: parentMobileValue ? parentCountryCode : undefined,
        parent_mobile: parentMobileValue,
        parent_contact: parentMobileValue,
      })

      if (onLoginSuccess) {
        onLoginSuccess({ ...result, isNewRegistration: true })
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your details.')
    } finally {
      setIsLoading(false)
    }
  }


  // Helper: complete backend authentication and session creation with Google user details & ID token
  const processGoogleAuthResult = async ({ user, idToken }) => {
    // 1. Extract profile details
    const userEmail = (user.email || '').trim().toLowerCase()
    const displayName = (user.displayName || '').trim()
    const nameParts = displayName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    const profilePhoto = user.photoURL || undefined
    const providerId = user.uid
    const playerId = authService.getOneSignalPlayerId()

    // 2. Dispatch Firebase ID token to the live backend for verification & session creation
    const result = await authService.googleLogin({
      id_token: idToken,
      email: userEmail,
      provider_id: providerId,
      name: displayName || userEmail.split('@')[0] || 'Student',
      first_name: firstName,
      last_name: lastName,
      profile_photo: profilePhoto,
      onesignal_player_id: playerId,
    })

    // 3. Trigger success callback to route to student dashboard
    if (onLoginSuccess) {
      onLoginSuccess(result)
    }
  }

  // Handle return from Google Redirect authentication (especially on mobile / Android Chrome)
  useEffect(() => {
    let isCancelled = false
    const checkRedirect = async () => {
      try {
        const isPending =
          typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem('edoomate_google_redirect_pending') === 'true'

        if (isPending) {
          setIsGoogleLoading(true)
        }

        const res = await firebaseService.handleRedirectResult()
        if (isCancelled) return

        if (res && res.user && res.idToken) {
          setIsGoogleLoading(true)
          await processGoogleAuthResult(res)
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || 'Google Sign-In failed. Please try again.')
        }
      } finally {
        if (!isCancelled) {
          setIsGoogleLoading(false)
        }
      }
    }

    checkRedirect()

    return () => {
      isCancelled = true
    }
  }, [])

  // Step 4: Google Sign-In with Firebase Web SDK + Live Backend API Verification
  const handleGoogleSignIn = async () => {
    if (isLoading || isGoogleLoading) return

    setError('')
    setInfoMessage('')
    setIsGoogleLoading(true)

    try {
      // 1. Authenticate with Google via Firebase Popup (or seamlessly via Redirect on mobile)
      const authRes = await firebaseService.signInWithGoogle()

      // If redirect was initiated, browser will navigate to Google authentication page
      if (authRes?.redirectStarted) {
        return
      }

      if (authRes?.user && authRes?.idToken) {
        await processGoogleAuthResult(authRes)
      }
    } catch (err) {
      setError(err.message || 'Google Sign-In failed. Please try again.')
    } finally {
      setIsGoogleLoading(false)
    }
  }

  // Header Back Button Handler
  const handleHeaderBack = () => {
    setError('')
    setInfoMessage('')
    if (step === 'otp_verify') {
      setStep('otp_identifier')
    } else if (step === 'otp_identifier') {
      setStep('choose_method')
    } else if (step === 'password') {
      setStep('choose_method')
      setPassword('')
    } else if (step === 'choose_method') {
      setStep('email')
    } else if (step === 'signup') {
      try {
        sessionStorage.removeItem('edoomate_pending_email')
      } catch {
        // Storage fallback
      }
      setStep('email')
      window.location.hash = ''
    } else if (step === 'email') {
      if (onBack) onBack()
    } else {
      if (onBack) onBack()
    }
  }

  // Handle continuing from the Choose how you want to continue screen (registered user)
  const handleChooseMethodContinue = (e) => {
    if (e) e.preventDefault()
    setError('')
    setInfoMessage('')
    if (selectedAuthMethod === 'otp') {
      // Set otpIdentifier to verified email by default
      if (email && !otpIdentifier) {
        setOtpIdentifier(email.trim().toLowerCase())
      }
      setStep('otp_identifier')
    } else {
      setStep('password')
    }
  }

  // Send OTP handler
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault()
    const raw = otpIdentifier.trim()
    if (!raw) {
      setFieldErrors({ otpIdentifier: 'This field is required' })
      setError('Please enter your registered mobile number or email address.')
      return
    }

    const isEmail = raw.includes('@')
    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(raw)) {
        setFieldErrors({ otpIdentifier: 'Please enter a valid email address.' })
        setError('Please enter a valid email address.')
        return
      }
    } else {
      const cleanMobile = raw.replace(/\D/g, '')
      if (cleanMobile.length < 7 || cleanMobile.length > 15) {
        setFieldErrors({ otpIdentifier: 'Please enter a valid mobile number (7 to 15 digits).' })
        setError('Please enter a valid mobile number (7 to 15 digits).')
        return
      }
    }

    setFieldErrors({})
    setError('')
    setInfoMessage('')
    setIsSendingOtp(true)

    try {
      const result = await authService.sendOtp({
        identifier: raw,
        country_code: otpCountryCode,
      })

      setStep('otp_verify')
      setResendCountdown(result.resendTimeout || 60)
      setInfoMessage(result.message || `OTP has been sent to ${raw}.`)
      setOtpDigits(['', '', '', ''])
      setTimeout(() => {
        if (otpInputRefs.current[0]) {
          otpInputRefs.current[0].focus()
        }
      }, 100)
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Please try again.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (resendCountdown > 0 || isSendingOtp) return
    setError('')
    setInfoMessage('')
    setIsSendingOtp(true)

    try {
      const result = await authService.resendOtp({
        identifier: otpIdentifier.trim(),
        country_code: otpCountryCode,
      })
      setResendCountdown(result.resendTimeout || 60)
      setInfoMessage('New OTP sent successfully.')
    } catch (err) {
      setError(err.message || 'Unable to resend OTP. Please try again.')
    } finally {
      setIsSendingOtp(false)
    }
  }

  // OTP Verification handler
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault()
    const code = otpDigits.join('').trim()
    if (!code || code.length !== 4) {
      setFieldErrors({ otpCode: 'This field is required' })
      setError('Please enter the 4-digit OTP code.')
      return
    }

    setFieldErrors({})
    setError('')
    setInfoMessage('')
    setIsVerifyingOtp(true)

    try {
      const result = await authService.verifyOtp({
        identifier: otpIdentifier.trim(),
        country_code: otpCountryCode,
        otp: code,
      })

      if (onLoginSuccess) {
        onLoginSuccess(result)
      }
    } catch (err) {
      setError(err.message || 'Invalid or expired OTP. Please try again.')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  // OTP Multi-box input handlers (4-digit OTP)
  const handleOtpDigitChange = (index, value) => {
    const clean = value.replace(/\D/g, '')
    if (!clean) {
      const newDigits = [...otpDigits]
      newDigits[index] = ''
      setOtpDigits(newDigits)
      return
    }

    const lastChar = clean.slice(-1)
    const newDigits = [...otpDigits]
    newDigits[index] = lastChar
    setOtpDigits(newDigits)

    if (error) setError('')

    // Auto-focus next input box (up to 4 boxes, indices 0-3)
    if (index < 3 && otpInputRefs.current[index + 1]) {
      otpInputRefs.current[index + 1].focus()
    }
  }

  const handleOtpDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      if (otpInputRefs.current[index - 1]) {
        otpInputRefs.current[index - 1].focus()
      }
    }
  }

  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!pasted) return

    const newDigits = ['', '', '', '']
    for (let i = 0; i < 4; i++) {
      newDigits[i] = pasted[i] || ''
    }
    setOtpDigits(newDigits)
    if (error) setError('')

    const nextFocusIndex = Math.min(pasted.length, 3)
    if (otpInputRefs.current[nextFocusIndex]) {
      otpInputRefs.current[nextFocusIndex].focus()
    }
  }

  // =========================================================================
  // VIEW: FULL SIGN UP PAGE MATCHING REFERENCE SCREENSHOT EXACTLY
  // =========================================================================
  if (step === 'signup') {
    return (
      <div className="signup-page-wrapper">
        {/* Soft Decorative Gradient Background Bubbles */}
        <div className="signup-bg-bubble-1"></div>
        <div className="signup-bg-bubble-2"></div>
        <div className="signup-bg-bubble-3"></div>

        <div className="signup-card-container">
          {/* Top Back Navigation Button */}
          <div className="mb-3 d-flex align-items-center justify-content-between">
            <button
              type="button"
              className="login-back-btn"
              onClick={handleHeaderBack}
              aria-label="Back"
              id="auth-back-btn"
              disabled={isLoading}
            >
              <span className="login-back-icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M10 12L6 8L10 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="login-back-text">Back</span>
            </button>
            <span className="badge bg-primary bg-opacity-10 text-primary small px-3 py-1 rounded-pill">
              New Student Registration
            </span>
          </div>

          {/* Screenshot Hero Heading */}
          <div className="signup-hero-heading">
            <span className="signup-hero-line-1">Hey there! Let’s get</span>
            <span className="signup-hero-line-2">Start</span>
            <span className="signup-hero-line-3">Create Account</span>
          </div>

          {/* Info Banner when Redirected from Unregistered Email Check */}
          {infoMessage && (
            <div
              className="alert alert-info rounded-4 py-2 px-3 small d-flex align-items-center mb-3 border-0"
              style={{ backgroundColor: '#eff6ff', color: '#1d4ed8' }}
              role="status"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-2 flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <div>{infoMessage}</div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="alert alert-danger rounded-4 py-2 px-3 small d-flex align-items-center mb-3" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-2 flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSignupSubmit} noValidate id="full-signup-form">
            {/* ---------------------------------------------------- */}
            {/* SECTION 1: ABOUT STUDENT                             */}
            {/* ---------------------------------------------------- */}
            <h5 className="signup-section-header">About Student</h5>

            {/* First name */}
            <div className="mb-3">
              <label htmlFor="signup-first-name" className="signup-field-label">
                First name <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box ${fieldErrors.firstName ? 'has-error' : ''}`}>
                <span className="signup-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </span>
                <input
                  type="text"
                  id="signup-first-name"
                  className="signup-text-input"
                  placeholder="Enter first name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    clearFieldError('firstName')
                  }}
                  required
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.firstName && (
                <div className="field-error-text">{fieldErrors.firstName}</div>
              )}
            </div>

            {/* Last name */}
            <div className="mb-3">
              <label htmlFor="signup-last-name" className="signup-field-label">
                Last name <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box ${fieldErrors.lastName ? 'has-error' : ''}`}>
                <span className="signup-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </span>
                <input
                  type="text"
                  id="signup-last-name"
                  className="signup-text-input"
                  placeholder="Enter last name"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value)
                    clearFieldError('lastName')
                  }}
                  required
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.lastName && (
                <div className="field-error-text">{fieldErrors.lastName}</div>
              )}
            </div>

            {/* Gender */}
            <div className="mb-3">
              <label htmlFor="signup-gender" className="signup-field-label">
                Gender <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box justify-content-between ${fieldErrors.gender ? 'has-error' : ''}`}>
                <select
                  id="signup-gender"
                  className="signup-select-box"
                  value={gender}
                  onChange={(e) => {
                    setGender(e.target.value)
                    clearFieldError('gender')
                  }}
                  disabled={isLoading}
                >
                  <option value="Select Gender">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                <span className="text-secondary pe-1" style={{ pointerEvents: 'none' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
              {fieldErrors.gender && (
                <div className="field-error-text">{fieldErrors.gender}</div>
              )}
            </div>

            {/* Email (Automatically Pre-filled) */}
            <div className="mb-3">
              <label htmlFor="signup-email" className="signup-field-label">
                Email <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box ${fieldErrors.email ? 'has-error' : ''}`}>
                <span className="signup-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                </span>
                <input
                  type="email"
                  id="signup-email"
                  className="signup-text-input"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearFieldError('email')
                  }}
                  required
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.email && (
                <div className="field-error-text">{fieldErrors.email}</div>
              )}
            </div>

            {/* Mobile number with Country Code and Counter */}
            <div className="mb-3">
              <label htmlFor="signup-mobile" className="signup-field-label">
                Mobile number <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box ${fieldErrors.mobile ? 'has-error' : ''}`}>
                <div className="d-flex align-items-center me-2 pe-2 border-end">
                  <select
                    id="signup-country-code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    disabled={isLoading}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontWeight: 600,
                      color: '#334155',
                      outline: 'none',
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                    }}
                  >
                    <option value="91">🇮🇳 +91</option>
                    <option value="1">🇺🇸 +1</option>
                    <option value="44">🇬🇧 +44</option>
                    <option value="971">🇦🇪 +971</option>
                    <option value="61">🇦🇺 +61</option>
                    <option value="65">🇸🇬 +65</option>
                  </select>
                </div>
                <input
                  type="tel"
                  id="signup-mobile"
                  className="signup-text-input"
                  placeholder="Enter mobile number"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => {
                    setMobile(e.target.value.replace(/\D/g, ''))
                    clearFieldError('mobile')
                  }}
                  required
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.mobile && (
                <div className="field-error-text">{fieldErrors.mobile}</div>
              )}
              <div className="signup-char-counter">{mobile.length}/10</div>
            </div>

            {/* Select Grade */}
            <div className="mb-3">
              <label htmlFor="signup-grade" className="signup-field-label">
                Grade / Class <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box justify-content-between ${fieldErrors.grade ? 'has-error' : ''}`}>
                <select
                  id="signup-grade"
                  className="signup-select-box"
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value)
                    clearFieldError('grade')
                  }}
                  disabled={isLoading}
                >
                  <option value="Select Grade">Select Grade</option>
                  {availableGrades.map((g, idx) => {
                    const gradeVal = typeof g === 'object' && g !== null ? (g.value ?? g.id ?? '') : g
                    const gradeKey = typeof g === 'object' && g !== null ? (g.id ?? g.value ?? idx) : g
                    const displayLabel = typeof g === 'object' && g !== null && g.label ? g.label : formatGradeNumber(g)
                    return (
                      <option key={gradeKey} value={gradeVal}>
                        {displayLabel}
                      </option>
                    )
                  })}
                </select>
                <span className="text-secondary pe-1" style={{ pointerEvents: 'none' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
              {fieldErrors.grade && (
                <div className="field-error-text">{fieldErrors.grade}</div>
              )}
            </div>

            {/* Learning Type */}
            <div className="mb-3">
              <label htmlFor="signup-learning-type" className="signup-field-label">
                Learning Type
              </label>

              {/* Two Selectable Learning Type Options with Visual Indication */}
              <div className="d-flex gap-2" role="radiogroup" aria-label="Learning Type">
                <button
                  type="button"
                  id="signup-learning-type-institute"
                  className={`signup-type-btn flex-fill d-flex align-items-center justify-content-center gap-2 ${
                    learningType === 'Institute' ? 'active' : ''
                  }`}
                  onClick={() => handleSelectLearningType('Institute')}
                  disabled={isLoading}
                  role="radio"
                  aria-checked={learningType === 'Institute'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
                  </svg>
                  <span>Institute</span>
                  {learningType === 'Institute' && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                <button
                  type="button"
                  id="signup-learning-type-individual"
                  className={`signup-type-btn flex-fill d-flex align-items-center justify-content-center gap-2 ${
                    learningType === 'Individual' ? 'active' : ''
                  }`}
                  onClick={() => handleSelectLearningType('Individual')}
                  disabled={isLoading}
                  role="radio"
                  aria-checked={learningType === 'Individual'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Individual</span>
                  {learningType === 'Individual' && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Form select with exactly the two options for complete form & ID compatibility */}
              <select
                id="signup-learning-type"
                name="learning_type"
                className="visually-hidden"
                value={learningType}
                onChange={(e) => handleSelectLearningType(e.target.value)}
                disabled={isLoading}
                tabIndex={-1}
                aria-label="Learning Type"
              >
                <option value="Institute">Institute</option>
                <option value="Individual">Individual</option>
              </select>
            </div>

            {/* Institute: School Dropdown */}
            {learningType === 'Institute' && (
              <div className="mb-3">
                <label htmlFor="signup-school" className="signup-field-label">
                  School / Institute <span className="text-danger">*</span>
                </label>
                <div className={`signup-input-box justify-content-between ${fieldErrors.school || schoolsError ? 'has-error' : ''}`}>
                  <span className="signup-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
                    </svg>
                  </span>
                  <select
                    id="signup-school"
                    name="school_id"
                    className="signup-select-box"
                    value={selectedSchoolId}
                    onChange={(e) => {
                      setSelectedSchoolId(e.target.value)
                      clearFieldError('school')
                    }}
                    disabled={isLoading || isSchoolsLoading}
                  >
                    {isSchoolsLoading ? (
                      <option value="">Loading schools...</option>
                    ) : schoolsError ? (
                      <option value="">Failed to load schools</option>
                    ) : schoolsList.length === 0 ? (
                      <option value="">No schools available</option>
                    ) : (
                      <>
                        <option value="">Select School</option>
                        {schoolsList.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <span className="text-secondary pe-1 d-flex align-items-center" style={{ pointerEvents: 'none' }}>
                    {isSchoolsLoading ? (
                      <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </span>
                </div>
                {fieldErrors.school && (
                  <div className="field-error-text">{fieldErrors.school}</div>
                )}

                {/* API Error State with Retry option */}
                {schoolsError && (
                  <div className="d-flex align-items-center justify-content-between mt-1 px-1">
                    <span className="text-danger small" style={{ fontSize: '0.78rem' }}>
                      {schoolsError}
                    </span>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      style={{ fontSize: '0.78rem', color: '#2563eb' }}
                      onClick={() => fetchSchools(true)}
                      disabled={isSchoolsLoading}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Empty List State */}
                {!isSchoolsLoading && !schoolsError && schoolsList.length === 0 && (
                  <div className="text-muted small mt-1 px-1" style={{ fontSize: '0.78rem' }}>
                    No affiliated schools currently found.
                  </div>
                )}
              </div>
            )}

            {/* Password */}
            <div className="mb-3">
              <label htmlFor="signup-password" className="signup-field-label">
                Password <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box ${fieldErrors.password ? 'has-error' : ''}`}>
                <span className="signup-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="signup-password"
                  className="signup-text-input"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    clearFieldError('password')
                  }}
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              {fieldErrors.password && (
                <div className="field-error-text">{fieldErrors.password}</div>
              )}
            </div>

            {/* Confirm password */}
            <div className="mb-3">
              <label htmlFor="signup-confirm-password" className="signup-field-label">
                Confirm password <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box ${fieldErrors.confirmPassword ? 'has-error' : ''}`}>
                <span className="signup-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                  </svg>
                </span>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="signup-confirm-password"
                  className="signup-text-input"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    clearFieldError('confirmPassword')
                  }}
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <div className="field-error-text">{fieldErrors.confirmPassword}</div>
              )}
            </div>

            {/* ---------------------------------------------------- */}
            {/* SECTION 2: ABOUT PARENT                              */}
            {/* ---------------------------------------------------- */}
            <h5 className="signup-section-header">About Parent</h5>

            {/* Parent name */}
            <div className="mb-3">
              <label htmlFor="signup-parent-name" className="signup-field-label">
                Parent name
              </label>
              <div className="signup-input-box">
                <span className="signup-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </span>
                <input
                  type="text"
                  id="signup-parent-name"
                  className="signup-text-input"
                  placeholder="Parent Name"
                  value={parentName}
                  onChange={(e) => {
                    setParentName(e.target.value)
                    if (error) setError('')
                  }}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Combined Parent Email or Mobile Number */}
            <div className="mb-3">
              <label htmlFor="signup-parent-contact" className="signup-field-label">
                Parent Email or Mobile Number <span className="text-danger">*</span>
              </label>
              <div className={`signup-input-box ${fieldErrors.parentContact ? 'has-error' : ''}`}>
                {/^\d+$/.test(parentContact.trim().replace(/^[\s+]+/, '')) ? (
                  <div className="d-flex align-items-center me-2 pe-2 border-end">
                    <select
                      id="signup-parent-country-code"
                      value={parentCountryCode}
                      onChange={(e) => setParentCountryCode(e.target.value)}
                      disabled={isLoading}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontWeight: 600,
                        color: '#334155',
                        outline: 'none',
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                      }}
                      aria-label="Parent Country Code"
                    >
                      <option value="91">🇮🇳 +91</option>
                      <option value="1">🇺🇸 +1</option>
                      <option value="44">🇬🇧 +44</option>
                      <option value="971">🇦🇪 +971</option>
                      <option value="61">🇦🇺 +61</option>
                      <option value="65">🇸🇬 +65</option>
                    </select>
                  </div>
                ) : (
                  <span className="signup-input-icon">
                    {parentContact.includes('@') ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                      </svg>
                    )}
                  </span>
                )}
                <input
                  type="text"
                  id="signup-parent-contact"
                  name="parent_contact"
                  className="signup-text-input"
                  placeholder="Enter parent email or mobile number"
                  value={parentContact}
                  onChange={(e) => {
                    setParentContact(e.target.value)
                    clearFieldError('parentContact')
                  }}
                  disabled={isLoading}
                />
              </div>
              {fieldErrors.parentContact && (
                <div className="field-error-text">{fieldErrors.parentContact}</div>
              )}
            </div>

            {/* ---------------------------------------------------- */}
            {/* SCREENSHOT "CONTINUE" BUTTON                         */}
            {/* ---------------------------------------------------- */}
            <button
              type="submit"
              className="signup-btn-continue"
              id="signup-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Continue</span>
              )}
            </button>


            {/* Switch back to Log In */}
            <div className="text-center mt-4">
              <span className="text-muted small">Already have an account? </span>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                style={{ color: '#2563eb' }}
                onClick={() => {
                  setStep('email')
                  window.location.hash = '#login'
                  setError('')
                  setInfoMessage('')
                }}
                id="link-go-to-login"
              >
                Log in
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // =========================================================================
  // VIEW: LOGIN FLOW (STEP 1: EMAIL & STEP 2: PASSWORD)
  // =========================================================================
  return (
    <div className="login-page-container">
      {/* Left Panel: Edoomate Branding & Welcome Visual */}
      <div className="login-left-panel d-none d-lg-flex">
        <div className="login-left-content text-center">
          <div className="login-card-shadow-wrap mb-4">
            <img
              src={loginLogoCard}
              alt="Edoo Mate Logo"
              className="login-brand-card-img img-fluid"
            />
          </div>
          <h2 className="login-welcome-title">Welcome Back!</h2>
          <p className="login-welcome-subtitle">
            Ready to continue your learning journey?
          </p>
        </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="login-right-panel">
        {/* Top Back Navigation Button */}
        <div className="login-header-nav">
          <button
            type="button"
            className="login-back-btn"
            onClick={handleHeaderBack}
            aria-label="Back"
            id="auth-back-btn"
            disabled={isLoading || isGoogleLoading}
          >
            <span className="login-back-icon">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="login-back-text">
              {step === 'choose_method' ? 'Home' : 'Back'}
            </span>
          </button>
        </div>

        {/* Mobile Welcome Header (visible on mobile/tablet) */}
        <div className="d-lg-none text-center mb-4 mt-2">
          <img
            src={loginLogoCard}
            alt="Edoo Mate Logo"
            className="login-mobile-brand-img mb-3"
            style={{ width: '110px' }}
          />
        </div>

        <div className="login-form-wrapper">
          {/* Main Headings */}
          {step === 'choose_method' ? (
            <div className="login-headings-block mb-3">
              <h1 className="auth-selection-title">
                Choose how you want<br />to continue
              </h1>
            </div>
          ) : step === 'otp_identifier' ? (
            <div className="login-headings-block">
              <h1 className="login-main-heading">
                <span className="heading-line-1">OTP Login</span>
                <span className="heading-line-2">Enter your</span>
                <span className="heading-line-3">registered details.</span>
              </h1>
              <p className="login-form-subtitle">
                We will send an OTP verification code to log you in.
              </p>
            </div>
          ) : step === 'otp_verify' ? (
            <div className="login-headings-block">
              <h1 className="login-main-heading">
                <span className="heading-line-1">Verify OTP</span>
                <span className="heading-line-2">Enter the</span>
                <span className="heading-line-3">4-digit code.</span>
              </h1>
              <p className="login-form-subtitle">
                Enter the code sent to {otpIdentifier}
              </p>
            </div>
          ) : step === 'password' ? (
            <div className="login-headings-block">
              <h1 className="login-main-heading">
                <span className="heading-line-1">Welcome!</span>
                <span className="heading-line-2">Enter your</span>
                <span className="heading-line-3">password.</span>
              </h1>
              <p className="login-form-subtitle">
                Sign in to continue to your student dashboard.
              </p>
            </div>
          ) : (
            <div className="login-headings-block">
              <h1 className="login-main-heading">
                <span className="heading-line-1">Hey there!</span>
                <span className="heading-line-2">Let's get you</span>
                <span className="heading-line-3">back in.</span>
              </h1>
              <p className="login-form-subtitle">
                Enter your details to access your account.
              </p>
            </div>
          )}

          {/* Global Error Banner */}
          {error && (
            <div
              className="alert alert-danger rounded-4 py-2 px-3 small d-flex align-items-center mb-3"
              role="alert"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="me-2 flex-shrink-0"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div>{error}</div>
            </div>
          )}

          {/* Global Info Banner */}
          {infoMessage && (
            <div
              className="alert alert-info rounded-4 py-2 px-3 small d-flex align-items-center mb-3 border-0"
              style={{ backgroundColor: '#eff6ff', color: '#1d4ed8' }}
              role="status"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-2 flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <div>{infoMessage}</div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 0: CHOOSE HOW YOU WANT TO CONTINUE (MATCHING REFERENCE SCREENSHOT)  */}
          {/* ========================================================================= */}
          {step === 'choose_method' && (
            <form onSubmit={handleChooseMethodContinue} noValidate id="choose-method-form">
              {email && (
                <div className="mb-3 p-2 px-3 bg-light rounded-3 d-flex justify-content-between align-items-center">
                  <div className="text-truncate me-2 small">
                    <span className="text-muted">Registered Email: </span>
                    <strong className="text-dark">{email}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                    onClick={() => {
                      setStep('email')
                      setError('')
                      setInfoMessage('')
                    }}
                    id="btn-choose-method-change-email"
                  >
                    Change
                  </button>
                </div>
              )}
              {/* Pill Container with "Send OTP" and "Use Password" */}
              <div className="auth-method-pill-card" role="radiogroup" aria-label="Login Method Selection">
                {/* Option 1: Send OTP */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedAuthMethod === 'otp'}
                  className={`auth-method-option-btn ${selectedAuthMethod === 'otp' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedAuthMethod('otp')
                    if (error) setError('')
                  }}
                  id="btn-choose-send-otp"
                >
                  <span className="auth-method-icon-wrap">
                    {/* Paper Airplane Icon */}
                    <svg className="auth-method-icon-svg" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M2.5 12L21.5 3L12.5 22L10.5 13.5L2.5 12Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M10.5 13.5L21.5 3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="auth-method-label">Send OTP</span>
                </button>

                {/* Option 2: Use Password */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedAuthMethod === 'password'}
                  className={`auth-method-option-btn ${selectedAuthMethod === 'password' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedAuthMethod('password')
                    if (error) setError('')
                  }}
                  id="btn-choose-use-password"
                >
                  <span className="auth-method-icon-wrap">
                    {/* *** Asterisks Password Icon */}
                    <svg className="auth-method-icon-svg" viewBox="0 0 24 24" fill="none">
                      <circle cx="6" cy="12" r="2" fill="currentColor" />
                      <circle cx="12" cy="12" r="2" fill="currentColor" />
                      <circle cx="18" cy="12" r="2" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="auth-method-label">Use Password</span>
                </button>
              </div>

              {/* Blue Continue Button matching screenshot */}
              <button
                type="submit"
                className="auth-btn-blue-continue"
                id="choose-method-continue-btn"
              >
                <span>Continue</span>
              </button>

              {/* Divider: Or sign in with */}
              <div className="login-divider-row">
                <div className="divider-line"></div>
                <span className="divider-label">Or sign in with</span>
                <div className="divider-line"></div>
              </div>

              {/* Social Buttons: Google */}
              <div className="login-social-buttons">
                <button
                  type="button"
                  className="social-btn google-btn"
                  id="google-signin-btn-choose-step"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || isGoogleLoading}
                  aria-label="Sign in with Google"
                >
                  {isGoogleLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true"></span>
                      <span>Connecting to Google...</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Sign in with Google</span>
                    </>
                  )}
                </button>
              </div>

              {/* Link to Sign Up */}
              <div className="text-center mt-4">
                <span className="text-muted small">Don't have an account? </span>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                  style={{ color: '#2563eb' }}
                  onClick={() => {
                    setStep('signup')
                    window.location.hash = '#signup'
                    setError('')
                  }}
                  id="link-go-to-signup-from-choose"
                >
                  Sign up
                </button>
              </div>
            </form>
          )}

          {/* ========================================================================= */}
          {/* STEP: OTP IDENTIFIER (MOBILE OR EMAIL ENTRY)                             */}
          {/* ========================================================================= */}
          {step === 'otp_identifier' && (
            <form onSubmit={handleSendOtp} noValidate id="otp-identifier-form">
              <div className="mb-3">
                <label htmlFor="otp-identifier-input" className="login-field-label">
                  Mobile Number or Email
                </label>
                <div className="auth-phone-row">
                  {!otpIdentifier.includes('@') && (
                    <div className="auth-country-select-box">
                      <select
                        value={otpCountryCode}
                        onChange={(e) => setOtpCountryCode(e.target.value)}
                        aria-label="Country Code"
                      >
                        <option value="91">🇮🇳 +91</option>
                        <option value="1">🇺🇸 +1</option>
                        <option value="44">🇬🇧 +44</option>
                        <option value="971">🇦🇪 +971</option>
                        <option value="61">🇦🇺 +61</option>
                        <option value="65">🇸🇬 +65</option>
                      </select>
                    </div>
                  )}
                  <div className={`login-input-group flex-grow-1 ${fieldErrors.otpIdentifier || error ? 'has-error' : ''}`}>
                    <span className="login-input-icon">
                      {otpIdentifier.includes('@') ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M3 7C3 5.89543 3.89543 5 5 5H19C20.1046 5 21 5.89543 21 7V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 7L12 13L21 7" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                        </svg>
                      )}
                    </span>
                    <input
                      type="text"
                      id="otp-identifier-input"
                      className="login-input-field"
                      placeholder="e.g. 9876543210 or name@example.com"
                      value={otpIdentifier}
                      onChange={(e) => {
                        setOtpIdentifier(e.target.value)
                        clearFieldError('otpIdentifier')
                      }}
                      autoFocus
                      required
                      disabled={isSendingOtp}
                    />
                  </div>
                </div>
                {fieldErrors.otpIdentifier && (
                  <div className="field-error-text">{fieldErrors.otpIdentifier}</div>
                )}
              </div>

              {/* Send OTP Button */}
              <button
                type="submit"
                className="auth-btn-blue-continue mt-4"
                id="btn-submit-send-otp"
                disabled={isSendingOtp || !otpIdentifier.trim()}
              >
                {isSendingOtp ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <span>Send OTP</span>
                )}
              </button>

              <div className="text-center mt-3">
                <button
                  type="button"
                  className="btn btn-link btn-sm text-decoration-none text-muted"
                  onClick={() => {
                    setStep('choose_method')
                    setError('')
                  }}
                >
                  ← Back to options
                </button>
              </div>
            </form>
          )}

          {/* ========================================================================= */}
          {/* STEP: OTP VERIFICATION (4 DIGIT CODE ENTRY)                               */}
          {/* ========================================================================= */}
          {step === 'otp_verify' && (
            <form onSubmit={handleVerifyOtp} noValidate id="otp-verify-form">
              <div className="text-center mb-2">
                <span className="text-muted small">Sent to: </span>
                <strong className="text-dark small">{otpIdentifier}</strong>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 ms-2 text-decoration-none"
                  style={{ fontSize: '0.825rem' }}
                  onClick={() => {
                    setStep('otp_identifier')
                    setError('')
                  }}
                >
                  Edit
                </button>
              </div>

              {/* 4 Digit Input Boxes */}
              <div className="otp-boxes-grid" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpInputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    className={`otp-box-input ${digit ? 'filled' : ''} ${fieldErrors.otpCode ? 'border-danger' : ''}`}
                    value={digit}
                    onChange={(e) => {
                      handleOtpDigitChange(idx, e.target.value)
                      clearFieldError('otpCode')
                    }}
                    onKeyDown={(e) => handleOtpDigitKeyDown(idx, e)}
                    disabled={isVerifyingOtp}
                    aria-label={`Digit ${idx + 1}`}
                  />
                ))}
              </div>
              {fieldErrors.otpCode && (
                <div className="field-error-text justify-content-center text-center">{fieldErrors.otpCode}</div>
              )}

              {/* Verify OTP Button */}
              <button
                type="submit"
                className="auth-btn-blue-continue"
                id="btn-verify-otp-submit"
                disabled={isVerifyingOtp || otpDigits.join('').trim().length !== 4}
              >
                {isVerifyingOtp ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify OTP</span>
                )}
              </button>

              {/* Resend Countdown */}
              <div className="otp-resend-row">
                <span>Didn't receive code?</span>
                {resendCountdown > 0 ? (
                  <span className="text-muted fw-semibold">Resend in {resendCountdown}s</span>
                ) : (
                  <button
                    type="button"
                    className="otp-resend-btn"
                    onClick={handleResendOtp}
                    disabled={isSendingOtp}
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </form>
          )}

          {/* STEP 1: EMAIL ENTRY & AUTOMATIC REGISTRATION CHECK */}
          {step === 'email' && (
            <form onSubmit={handleEmailContinue} noValidate>
              <div className="mb-3">
                <label htmlFor="login-email" className="login-field-label">
                  Email <span className="text-danger">*</span>
                </label>
                <div className={`login-input-group ${fieldErrors.email || error ? 'has-error' : ''}`}>
                  <span className="login-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 7C3 5.89543 3.89543 5 5 5H19C20.1046 5 21 5.89543 21 7V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z"
                        stroke="#2563EB"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M3 7L12 13L21 7"
                        stroke="#2563EB"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <input
                    type="email"
                    id="login-email"
                    className="login-input-field"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      clearFieldError('email')
                    }}
                    autoFocus
                    required
                    disabled={isLoading || isGoogleLoading}
                  />
                </div>
                {fieldErrors.email && (
                  <div className="field-error-text">{fieldErrors.email}</div>
                )}
              </div>

              {/* Continue Button */}
              <button
                type="submit"
                className={`login-btn-continue ${email.trim() ? 'active' : ''} d-flex align-items-center justify-content-center`}
                id="login-continue-btn"
                disabled={isLoading || isGoogleLoading || !email.trim()}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    <span>Checking account...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </button>

              {/* Divider: Or sign in with */}
              <div className="login-divider-row">
                <div className="divider-line"></div>
                <span className="divider-label">Or sign in with</span>
                <div className="divider-line"></div>
              </div>

              {/* Social Buttons: Google */}
              <div className="login-social-buttons">
                <button
                  type="button"
                  className="social-btn google-btn"
                  id="google-signin-btn"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || isGoogleLoading}
                  aria-label="Sign in with Google"
                >
                  {isGoogleLoading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm text-secondary"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      <span>Connecting to Google...</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Sign in with Google</span>
                    </>
                  )}
                </button>
              </div>

              {/* Toggle to Sign Up */}
              <div className="text-center mt-4">
                <span className="text-muted small">Don't have an account? </span>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                  style={{ color: '#2563eb' }}
                  onClick={() => {
                    setStep('signup')
                    window.location.hash = '#signup'
                    setError('')
                  }}
                  id="link-go-to-signup"
                >
                  Sign up
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: PASSWORD ENTRY FOR REGISTERED STUDENTS */}
          {step === 'password' && (
            <form onSubmit={handleLoginSubmit} noValidate>
              <div className="mb-3 p-2 px-3 bg-light rounded-3 d-flex justify-content-between align-items-center">
                <div className="text-truncate me-2 small">
                  <span className="text-muted">Account: </span>
                  <strong className="text-dark">{email}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                  onClick={() => {
                    setStep('choose_method')
                    setError('')
                    setPassword('')
                  }}
                  disabled={isLoading || isGoogleLoading}
                  id="btn-change-auth-method"
                >
                  Change Method
                </button>
              </div>

              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label htmlFor="login-password" className="login-field-label mb-0">
                    Password <span className="text-danger">*</span>
                  </label>
                  <a
                    href="#forgot-password"
                    className="login-forgot-link"
                    onClick={(e) => {
                      e.preventDefault()
                      alert(`A password reset link will be sent to ${email} once confirmed by admin.`)
                    }}
                  >
                    Forgot Password?
                  </a>
                </div>
                <div className={`login-input-group ${error ? 'has-error' : ''}`}>
                  <span className="login-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect
                        x="3"
                        y="11"
                        width="18"
                        height="11"
                        rx="2"
                        stroke="#2563EB"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11"
                        stroke="#2563EB"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password"
                    className="login-input-field"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (error) setError('')
                    }}
                    autoFocus
                    required
                    disabled={isLoading || isGoogleLoading}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                          stroke="#64748B"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <line
                          x1="1"
                          y1="1"
                          x2="23"
                          y2="23"
                          stroke="#64748B"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                          stroke="#64748B"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                          stroke="#64748B"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Login Submit Button */}
              <button
                type="submit"
                className="login-btn-continue active d-flex align-items-center justify-content-center"
                id="login-submit-btn"
                disabled={isLoading || isGoogleLoading}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Log In</span>
                )}
              </button>

              {/* Divider: Or sign in with */}
              <div className="login-divider-row">
                <div className="divider-line"></div>
                <span className="divider-label">Or sign in with</span>
                <div className="divider-line"></div>
              </div>

              {/* Social Buttons: Google */}
              <div className="login-social-buttons">
                <button
                  type="button"
                  className="social-btn google-btn"
                  id="google-signin-btn-password-step"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || isGoogleLoading}
                  aria-label="Sign in with Google"
                >
                  {isGoogleLoading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm text-secondary"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      <span>Connecting to Google...</span>
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Sign in with Google</span>
                    </>
                  )}
                </button>
              </div>

              {/* Switch back to sign up */}
              <div className="text-center mt-3">
                <span className="text-muted small">Need an account? </span>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                  style={{ color: '#2563eb' }}
                  onClick={() => {
                    setStep('signup')
                    window.location.hash = '#signup'
                    setError('')
                  }}
                >
                  Sign up instead
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
