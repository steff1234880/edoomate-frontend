import React, { useState, useEffect } from 'react'
import { authService } from '../../services/authService'
import { courseService } from '../../services/courseService'

export default function BasicProfileSetupModal({
  isOpen,
  onClose,
  onComplete,
  onSkip,
  showSkip = false,
  defaultGrade = 'V',
  initialSubjects = null,
}) {
  const [subjectsList, setSubjectsList] = useState(initialSubjects || [])
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false)
  const [subjectsError, setSubjectsError] = useState(null)
  const [grade, setGrade] = useState(defaultGrade)

  // Assessment flow states
  const [activeSubject, setActiveSubject] = useState(null)
  const [assessmentQuestions, setAssessmentQuestions] = useState([])
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false)
  const [questionsError, setQuestionsError] = useState(null)
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0)
  const [userAnswers, setUserAnswers] = useState({}) // { [qn_id]: string | string[] }
  const [isSubmittingAssessment, setIsSubmittingAssessment] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [assessmentResult, setAssessmentResult] = useState(null)
  const [toastNotification, setToastNotification] = useState(null)

  // Safe helper to extract text from possible Lexical/rich text objects
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

  // Load subject assessment statuses from backend
  const fetchSubjectAssessments = async (currentGrade) => {
    setIsLoadingSubjects(true)
    setSubjectsError(null)
    const token = authService.getToken()

    try {
      // 1. Fetch live subject assessments from GET /api/subject-assessments?grade={grade}
      const assessmentData = await courseService.getSubjectAssessments({
        grade: currentGrade,
        token,
      })

      // 2. Fetch full subjects dictionary from /api/subjects
      const allSubjectsDict = await courseService.getSubjects().catch(() => ({
        GENERAL: 'General',
        ENGLISH: 'English',
        SCIENCE: 'Science',
        MATHS: 'Maths',
        HISTORY: 'History',
        GEOGRAPHY: 'Geography',
        COMPUTER: 'Computer',
      }))

      const backendSubjects = Array.isArray(assessmentData?.subjects) ? assessmentData.subjects : []

      // Exact 7 subjects required by the reference screenshot
      const referenceKeys = ['GENERAL', 'ENGLISH', 'SCIENCE', 'MATHS', 'HISTORY', 'GEOGRAPHY', 'COMPUTER']
      const mergedList = referenceKeys.map((key) => {
        const found = backendSubjects.find((s) => (s.subject_key || '').toUpperCase() === key)

        // API is_completed is the primary permanent source of truth
        const isCompleted = Boolean(found?.is_completed)
        
        // Extract real score from API result (primary)
        const resObj = found?.result || {}
        const rawScore =
          resObj.score ??
          resObj.marks ??
          resObj.obtained_marks ??
          resObj.marks_obtained ??
          resObj.total_score

        // Extract maximum marks or total marks/questions if available
        const rawMaxMarks =
          resObj.max_marks ??
          resObj.maximum_marks ??
          resObj.total_marks ??
          resObj.max_score ??
          found?.assessment?.max_marks ??
          found?.assessment?.total_marks ??
          found?.assessment?.total_question

        // Extract real percentage from API result or calculate when score and maximum marks are available
        let computedPercentage = null
        const apiPercentage =
          resObj.score_percentage ??
          resObj.percentage ??
          resObj.percent

        if (apiPercentage !== undefined && apiPercentage !== null && !isNaN(Number(apiPercentage))) {
          computedPercentage = Number(apiPercentage)
        } else if (
          rawScore !== undefined &&
          rawScore !== null &&
          !isNaN(Number(rawScore)) &&
          rawMaxMarks !== undefined &&
          rawMaxMarks !== null &&
          Number(rawMaxMarks) > 0
        ) {
          computedPercentage = (Number(rawScore) / Number(rawMaxMarks)) * 100
        }

        const formattedScore =
          rawScore !== undefined && rawScore !== null && !isNaN(Number(rawScore))
            ? Number(rawScore).toFixed(1)
            : null

        const formattedPercentage =
          computedPercentage !== null
            ? Number(computedPercentage).toFixed(computedPercentage < 1 && computedPercentage > 0 ? 2 : 1)
            : null

        // Assessment availability determined strictly by matching backend grade and status from API
        const assessmentGrade = found?.assessment?.grade || found?.grade || currentGrade
        const isGradeMatch = String(assessmentGrade || '').trim().toUpperCase() === String(currentGrade || '').trim().toUpperCase()

        // Extract real API status string
        const apiStatus = String(found?.status || '').toUpperCase()
        const hasAssessment = Boolean(found?.has_assessment)

        // Active when has_assessment is true and API status is not NOT_AVAILABLE / INACTIVE / UNAVAILABLE
        const isAvailable = Boolean(hasAssessment && apiStatus !== 'NOT_AVAILABLE' && apiStatus !== 'INACTIVE' && apiStatus !== 'UNAVAILABLE' && isGradeMatch)
        const isActive = isAvailable && !isCompleted

        return {
          key,
          name: allSubjectsDict[key] || found?.subject_name || key.charAt(0) + key.slice(1).toLowerCase(),
          hasAssessment,
          grade: assessmentGrade,
          isGradeMatch,
          isAvailable,
          isActive,
          isCompleted,
          status: isCompleted ? 'COMPLETED' : (isActive ? (apiStatus || 'NOT_STARTED') : (apiStatus || 'NOT_AVAILABLE')),
          apiStatus: apiStatus || (isActive ? 'NOT_STARTED' : 'NOT_AVAILABLE'),
          score: formattedScore,
          percentage: formattedPercentage,
          assessment: found?.assessment || null,
          takeUrl: found?.take_assessment_url || null,
        }
      })

      // Map real backend response data strictly without hardcoded assumptions.
      // If the backend has marked a subject complete or if a score exists, show it.
      setSubjectsList(mergedList)
    } catch (err) {
      console.warn('Failed to load subject assessments:', err)
      setSubjectsError(err.message || 'Unable to fetch assessments.')
      // Fallback matching real backend subject dictionary when offline/error
      const fallbackList = [
        { key: 'GENERAL', name: 'General', isCompleted: false, isAvailable: false, isActive: false, hasAssessment: false, status: 'NOT_AVAILABLE' },
        { key: 'ENGLISH', name: 'English', isCompleted: false, isAvailable: true, isActive: true, hasAssessment: true, status: 'NOT_STARTED' },
        { key: 'SCIENCE', name: 'Science', isCompleted: false, isAvailable: true, isActive: true, hasAssessment: true, status: 'NOT_STARTED' },
        { key: 'MATHS', name: 'Maths', isCompleted: false, isAvailable: false, isActive: false, hasAssessment: false, status: 'NOT_AVAILABLE' },
        { key: 'HISTORY', name: 'History', isCompleted: false, isAvailable: false, isActive: false, hasAssessment: false, status: 'NOT_AVAILABLE' },
        { key: 'GEOGRAPHY', name: 'Geography', isCompleted: false, isAvailable: false, isActive: false, hasAssessment: false, status: 'NOT_AVAILABLE' },
        { key: 'COMPUTER', name: 'Computer', isCompleted: false, isAvailable: false, isActive: false, hasAssessment: false, status: 'NOT_AVAILABLE' },
      ]
      setSubjectsList(fallbackList)
    } finally {
      setIsLoadingSubjects(false)
    }
  }

  // Load subject list on modal open or grade change
  useEffect(() => {
    if (isOpen) {
      const user = authService.getUser()
      const studentGrade = user?.grade || defaultGrade || 'V'
      setGrade(studentGrade)
      fetchSubjectAssessments(studentGrade)
      setActiveSubject(null)
      setAssessmentResult(null)
      setUserAnswers({})
    }
  }, [isOpen, defaultGrade])

  // Toast helper for subtle feedback
  const showToast = (msg) => {
    setToastNotification(msg)
    setTimeout(() => {
      setToastNotification(null)
    }, 2800)
  }

  // Open assessment for an incomplete subject
  const handleStartSubjectAssessment = async (subj) => {
    if (!subj) return
    if (subj.isCompleted) return // already completed

    // Strict availability & grade check: determine from backend response fields
    const assessmentGrade = subj.assessment?.grade || subj.grade || grade
    const gradeMatches = String(assessmentGrade || '').trim().toUpperCase() === String(grade || '').trim().toUpperCase()

    if (!subj.isActive || !subj.isAvailable || !subj.hasAssessment || subj.status === 'NOT_AVAILABLE' || !gradeMatches) {
      showToast('Assessment for ' + subj.name + ' is currently not available.')
      return
    }

    setActiveSubject(subj)
    setIsLoadingQuestions(true)
    setQuestionsError(null)
    setSubmitError(null)
    setActiveQuestionIdx(0)
    setUserAnswers({})
    setAssessmentResult(null)

    const token = authService.getToken()

    try {
      const testData = await courseService.getAssessmentQuestions({
        grade,
        subject: subj.key,
        testId: subj.assessment?.id,
        takeUrl: subj.takeUrl,
        token,
      })

      // Robust question extraction across all possible backend payload shapes
      const extractQuestions = (data) => {
        if (!data || typeof data !== 'object') return []
        if (Array.isArray(data)) return data

        // 1. Direct questions list
        const direct = data.questions || data.test_questions || data.data
        if (Array.isArray(direct) && direct.length > 0) return direct

        // 2. Questions nested inside sections (assessment_section_details in APK/backend)
        const sections =
          data.assessment_section_details ||
          data.test_section_details ||
          data.sections ||
          data.test_sections
        if (Array.isArray(sections) && sections.length > 0) {
          const fromSections = sections.flatMap((s) => s?.questions || s?.test_questions || [])
          if (fromSections.length > 0) return fromSections
        }

        // 3. Questions nested inside sub-objects (e.g. test_details, assessment, test)
        for (const key of ['test_details', 'assessment', 'test', 'data']) {
          if (data[key] && typeof data[key] === 'object') {
            const nested = extractQuestions(data[key])
            if (nested.length > 0) return nested
          }
        }

        return []
      }

      const rawList = extractQuestions(testData)

      const normalized = rawList.map((q, idx) => {
        if (!q || typeof q !== 'object') {
          return {
            qn_id: idx + 1,
            question: `Question ${idx + 1}`,
            options: [],
            isMulti: false,
            limit: 1,
            points: 1,
          }
        }

        const qnId = q.qn_id ?? q.id ?? q.question_id ?? idx + 1
        let rawOptions = q.options || q.question_options || q.choices || q.answers || []
        if (typeof rawOptions === 'string') {
          try {
            rawOptions = JSON.parse(rawOptions)
          } catch {
            rawOptions = []
          }
        }

        let normalizedOptions = []
        if (Array.isArray(rawOptions)) {
          normalizedOptions = rawOptions.map((opt, oIdx) => {
            if (typeof opt === 'string' || typeof opt === 'number') {
              return { value: String(opt), label: String(opt) }
            }
            if (!opt || typeof opt !== 'object') {
              return { value: String.fromCharCode(65 + oIdx), label: `Option ${oIdx + 1}` }
            }
            const optVal =
              opt?.value ??
              opt?.option_value ??
              opt?.key ??
              opt?.id ??
              opt?.option_id ??
              opt?.option ??
              String.fromCharCode(65 + oIdx)
            const rawLabel = opt?.label || opt?.text || opt?.title || opt?.option || optVal
            return {
              value: String(optVal),
              label: toSafeText(rawLabel, `Option ${oIdx + 1}`),
            }
          })
        } else if (rawOptions && typeof rawOptions === 'object') {
          normalizedOptions = Object.entries(rawOptions).map(([key, val], oIdx) => ({
            value: key,
            label: typeof val === 'string' ? val : toSafeText(val?.label || val?.text || val, key),
          }))
        }

        // Multi-select detection
        const explicitLimit = Number(q.max_answers || q.correct_answers_count || q.max_selections) || 0
        const isMulti = explicitLimit > 1 || q.isMultiSelect || q.qn_type === 'MULTIPLE_CHOICE'

        return {
          qn_id: qnId,
          question: toSafeText(q.question || q.question_text || q.title, `Question ${idx + 1}`),
          options: normalizedOptions,
          isMulti,
          limit: Math.max(1, explicitLimit || 1),
          points: q.points || q.marks || 1,
          answer: q.answer || q.correct_answer || q.correct_option || '1',
          rawQuestion: q,
        }
      })

      if (normalized.length === 0) {
        // No questions returned by backend — do not use placeholder/dummy questions
        const noQErr = 'No questions found for this assessment. Please try again later.'
        setQuestionsError(noQErr)
        showToast(noQErr)
        setActiveSubject(null)
      } else {
        setAssessmentQuestions(normalized)
      }
    } catch (err) {
      console.warn('Could not load assessment questions:', err.message)
      // Show error to user — do not fall back to placeholder/dummy questions
      const errMsg = err.message || 'Failed to load assessment questions. Please try again.'
      setQuestionsError(errMsg)
      showToast(errMsg)
      setActiveSubject(null)
    } finally {
      setIsLoadingQuestions(false)
    }
  }

  // Handle single or multi-select option toggle
  const handleToggleOption = (qnId, optValue, isMulti, limit) => {
    setUserAnswers((prev) => {
      const current = prev[qnId]
      if (isMulti) {
        const arr = Array.isArray(current) ? [...current] : current ? [current] : []
        const exists = arr.includes(optValue)
        let next
        if (exists) {
          next = arr.filter((v) => v !== optValue)
        } else {
          if (arr.length < limit) {
            next = [...arr, optValue]
          } else {
            next = [...arr.slice(1), optValue]
          }
        }
        return { ...prev, [qnId]: next }
      } else {
        return { ...prev, [qnId]: optValue }
      }
    })
  }

  // Submit assessment answers
  const handleSubmitAssessment = async () => {
    if (isSubmittingAssessment) return

    // Prevent duplicate submissions if already completed
    if (activeSubject?.isCompleted || activeSubject?.status === 'COMPLETED') {
      setSubmitError('This assessment has already been submitted and completed.')
      return
    }

    setIsSubmittingAssessment(true)
    setSubmitError(null)

    const token = authService.getToken()
    if (!token) {
      const errAuth = 'Authentication token is missing. Please log in to submit your assessment.'
      setSubmitError(errAuth)
      setIsSubmittingAssessment(false)
      return
    }

    const qList = assessmentQuestions
    if (!qList || qList.length === 0) {
      setSubmitError('No assessment questions found to submit.')
      setIsSubmittingAssessment(false)
      return
    }

    // Resolve student ID from authenticated session, user profile, or JWT token
    const currentUser = authService.getUser()
    let studentId = currentUser?.id || currentUser?.student_id || currentUser?.user_id || null

    if (!studentId && token) {
      try {
        const base64Url = token.split('.')[1]
        if (base64Url) {
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          )
          const parsedJwt = JSON.parse(jsonPayload)
          if (parsedJwt?.sub && !isNaN(Number(parsedJwt.sub))) {
            studentId = Number(parsedJwt.sub)
          }
        }
      } catch {
        // Fallback to profile API if token decoding fails
      }
    }

    // If still missing, query user profile directly
    if (!studentId) {
      try {
        const userProfile = await authService.getUserProfile(token)
        studentId = userProfile?.id || userProfile?.data?.id
      } catch {
        // Continue
      }
    }

    if (!studentId) {
      setSubmitError('Unable to identify your student account. Please log in again.')
      setIsSubmittingAssessment(false)
      return
    }

    const rawTestId = activeSubject?.assessment?.id || 1
    const cleanTestId = String(rawTestId).replace(/^test-/, '').trim()
    const numTestId = Number(cleanTestId)
    const testId = !isNaN(numTestId) && String(numTestId) === cleanTestId ? numTestId : rawTestId

    // Construct authoritative backend student-assessment payload:
    // PUT /api/student-assessments/submit/{assessment_id}
    // requires: { student_id, answers: [{ qn_id, question, options, selected_option, correct_answer, points }] }
    const studentAssessmentAnswers = qList.map((q, idx) => {
      const userVal = userAnswers[q.qn_id] !== undefined ? userAnswers[q.qn_id] : userAnswers[idx + 1]
      let selectedOption = ''
      if (Array.isArray(userVal)) {
        selectedOption = userVal.join(',')
      } else if (userVal !== undefined && userVal !== null) {
        selectedOption = String(userVal)
      }

      const correctAnswer = String(q.answer ?? q.rawQuestion?.answer ?? q.rawQuestion?.correct_answer ?? '1')
      const qOptions = Array.isArray(q.options) && q.options.length > 0
        ? q.options.map((opt, oIdx) => ({
            value: !isNaN(Number(opt.value)) ? Number(opt.value) : oIdx + 1,
            label: opt.label || `Option ${oIdx + 1}`,
          }))
        : [
            { value: 1, label: 'Option 1' },
            { value: 2, label: 'Option 2' },
          ]

      return {
        qn_id: Number(q.qn_id) || (idx + 1),
        question: q.question || `Question ${idx + 1}`,
        options: qOptions,
        selected_option: selectedOption,
        correct_answer: correctAnswer,
        points: Number(q.points) || 1,
      }
    })

    const studentAssessmentPayload = {
      student_id: Number(studentId),
      answers: studentAssessmentAnswers,
    }

    try {
      // 1. Submit directly to authoritative assessment endpoint: PUT /api/student-assessments/submit/{assessmentId}
      // Must succeed at backend before updating state or showing success
      const resultData = await courseService.submitStudentAssessment(testId, studentAssessmentPayload, token)

      // 2. Refresh subject assessments from backend to obtain persistently stored scores
      const refreshedData = await courseService.getSubjectAssessments({ grade, token }).catch(() => null)
      const refreshedSubj = Array.isArray(refreshedData?.subjects)
        ? refreshedData.subjects.find((s) => (s.subject_key || '').toUpperCase() === (activeSubject?.key || '').toUpperCase())
        : null

      // Compute score and percentage confirmed by the server response or refreshed records
      const totalQ = qList.length
      const scoreVal = refreshedSubj?.result?.score ?? refreshedSubj?.result?.total_score ?? resultData?.score ?? resultData?.total_score
      const pctVal = refreshedSubj?.result?.percentage ?? refreshedSubj?.result?.score_percentage ?? resultData?.percentage ?? resultData?.score_percentage

      let scoreNum = scoreVal !== undefined && scoreVal !== null && !isNaN(Number(scoreVal))
        ? Number(scoreVal)
        : null

      // If server returned 0 or null, calculate from confirmed correct answers submitted
      if (scoreNum === null) {
        const correctCount = studentAssessmentAnswers.filter((a) => a.selected_option && a.selected_option === a.correct_answer).length
        scoreNum = correctCount
      }

      const pctNum = pctVal !== undefined && pctVal !== null && !isNaN(Number(pctVal))
        ? Number(pctVal)
        : totalQ > 0 ? (scoreNum / totalQ) * 100 : 0

      const formattedScore = scoreNum.toFixed(1)
      const formattedPercentage = pctNum.toFixed(pctNum < 1 && pctNum > 0 ? 2 : 1)

      const finalResult = {
        score: formattedScore,
        percentage: formattedPercentage,
        status: 'COMPLETED',
      }

      // Persist completed status locally so user state is instantly consistent even during network lag
      setAssessmentResult(finalResult)

      // Update state with updated assessment records from the backend
      await fetchSubjectAssessments(grade)
    } catch (err) {
      console.warn('Backend assessment submission failed:', err.message)
      setSubmitError(err.message || 'Failed to submit assessment to server. Please try again.')
    } finally {
      setIsSubmittingAssessment(false)
    }
  }

  // Handle Skip for Now - Navigate directly to dashboard without submitting
  const handleSkip = () => {
    try {
      localStorage.setItem('edoomate_assessment_skipped', 'true')
    } catch {
      // Storage unavailable
    }

    // Reset without saving incomplete answers
    setUserAnswers({})
    setActiveSubject(null)
    setAssessmentResult(null)

    if (onSkip) {
      onSkip()
    } else if (onClose) {
      onClose()
    }
  }

  // Handle final completion / Next button
  const handleProceedNext = () => {
    if (onComplete) {
      onComplete()
    } else if (onClose) {
      onClose()
    }
  }

  if (!isOpen) return null

  const currentQ = assessmentQuestions[activeQuestionIdx]
  const isLastQuestion = activeQuestionIdx === assessmentQuestions.length - 1

  return (
    <div
      className="profile-setup-screen-container"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#eaf2ff',
        zIndex: 1050,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Decorative Background Curved Bubbles */}
      <div
        style={{
          position: 'absolute',
          bottom: '-120px',
          left: '-60px',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          backgroundColor: '#cfe2ff',
          opacity: 0.65,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-80px',
          right: '-40px',
          width: '240px',
          height: '240px',
          borderRadius: '50%',
          backgroundColor: '#93c5fd',
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Main Full-Screen Mobile Card Wrapper */}
      <div
        className="d-flex flex-column h-100 w-100"
        style={{
          maxWidth: '430px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Toast feedback for unavailable assessments */}
        {toastNotification && (
          <div
            style={{
              position: 'fixed',
              top: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2000,
              backgroundColor: '#1e293b',
              color: '#ffffff',
              padding: '10px 18px',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 500,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              pointerEvents: 'none',
              animation: 'fadeIn 0.2s ease',
              maxWidth: '90%',
              textAlign: 'center',
            }}
          >
            {toastNotification}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TOP HEADER: Round Back Button + Basic Profile Setup + Skip for Now        */}
        {/* ========================================================================= */}
        <div className="pt-4 px-3 px-sm-4 pb-2">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <div className="d-flex align-items-center gap-3">
              <button
                type="button"
                className="btn btn-white bg-white rounded-circle shadow-sm d-flex align-items-center justify-content-center p-0 border"
                style={{
                  width: '42px',
                  height: '42px',
                  minWidth: '42px',
                  borderColor: '#e2e8f0',
                }}
                onClick={() => {
                  if (activeSubject) {
                    setActiveSubject(null)
                    setAssessmentResult(null)
                  } else if (onClose) {
                    onClose()
                  }
                }}
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h1 className="h5 fw-bold text-dark mb-0" style={{ fontSize: '1.2rem', letterSpacing: '-0.01em' }}>
                Basic Profile Setup
              </h1>
            </div>

            {/* Clearly visible "Skip for Now" Header Action (ONLY when showSkip is true) */}
            {showSkip && (
              <button
                type="button"
                className="btn btn-link text-decoration-none fw-semibold p-0"
                style={{
                  fontSize: '0.9rem',
                  color: '#1d8cf8',
                }}
                onClick={handleSkip}
                id="btn-skip-assessment-header"
              >
                Skip for Now
              </button>
            )}
          </div>

          {/* Subtitle */}
          <div className="ps-1 pt-1">
            <p className="text-secondary mb-0" style={{ fontSize: '0.88rem', color: '#64748b' }}>
              Let's personalize your learning
            </p>
          </div>

          {/* Section Heading */}
          <div className="ps-1 pt-3 pb-1">
            <h2 className="fw-bolder text-dark mb-0" style={{ fontSize: '1.35rem', letterSpacing: '-0.02em', color: '#0f172a' }}>
              Assess your subject knowledge
            </h2>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SCROLLABLE SUBJECT LIST AREA                                              */}
        {/* ========================================================================= */}
        <div
          className="flex-grow-1 overflow-y-auto px-3 px-sm-4 pt-2"
          style={{
            scrollbarWidth: 'none',
            paddingBottom: showSkip ? '125px' : '90px', // dynamically adjusted for presence of Skip button
          }}
        >
          {!activeSubject ? (
            <div>
              {isLoadingSubjects ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary spinner-border-sm me-2" role="status" />
                  <span className="text-muted small">Loading assessments...</span>
                </div>
              ) : subjectsError && subjectsList.length === 0 ? (
                <div className="alert alert-light border small text-muted text-center py-3">
                  {subjectsError}
                  <button
                    type="button"
                    className="btn btn-link btn-sm d-block mx-auto mt-1 p-0"
                    onClick={() => fetchSubjectAssessments(grade)}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {subjectsList.map((subj) => (
                    <div key={subj.key}>
                      {subj.isCompleted ? (
                        /* 1. COMPLETED SUBJECT: White card with subject name, COMPLETED badge, score, percentage */
                        <div
                          className="bg-white rounded-3 shadow-xs border p-3"
                          style={{
                            borderRadius: '14px',
                            borderColor: '#edf2f7',
                            backgroundColor: '#ffffff',
                          }}
                        >
                          {/* Top Row: Subject Name + Green COMPLETED Badge */}
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-bold text-dark" style={{ fontSize: '0.98rem' }}>
                              {subj.name}
                            </span>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: '#dcfce7',
                                color: '#16a34a',
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                letterSpacing: '0.04em',
                                padding: '0.35rem 0.65rem',
                                borderRadius: '8px',
                              }}
                            >
                              COMPLETED
                            </span>
                          </div>

                          {/* Subtle Separator Line */}
                          <div
                            style={{
                              height: '1px',
                              backgroundColor: '#f1f5f9',
                              marginBottom: '0.65rem',
                            }}
                          />

                          {/* Bottom Row: Score on left, Percentage on right */}
                          <div className="d-flex align-items-center justify-content-between">
                            <span className="text-dark fw-semibold" style={{ fontSize: '0.86rem', color: '#334155' }}>
                              Score : {subj.score !== null && subj.score !== undefined ? subj.score : '0.0'}
                            </span>
                            <span className="text-dark fw-semibold" style={{ fontSize: '0.86rem', color: '#334155' }}>
                              {subj.percentage !== null && subj.percentage !== undefined ? `${subj.percentage} %` : ''}
                            </span>
                          </div>
                        </div>
                      ) : subj.isActive ? (
                        /* 2. ACTIVE ASSESSMENT: White background with dark text */
                        <div
                          onClick={() => handleStartSubjectAssessment(subj)}
                          className="d-flex align-items-center justify-content-between p-3 rounded-3 shadow-xs border"
                          style={{
                            backgroundColor: '#ffffff',
                            borderColor: '#e2e8f0',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f8fafc'
                            e.currentTarget.style.borderColor = '#cbd5e1'
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.08)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#ffffff'
                            e.currentTarget.style.borderColor = '#e2e8f0'
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)'
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`Start ${subj.name} assessment`}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-bold text-dark" style={{ fontSize: '0.98rem', color: '#0f172a' }}>
                              {subj.name}
                            </span>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: '#eff6ff',
                                color: '#1d8cf8',
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                letterSpacing: '0.03em',
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px',
                              }}
                            >
                              ACTIVE
                            </span>
                          </div>
                          <span className="d-flex align-items-center" style={{ color: '#1d8cf8' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        </div>
                      ) : (
                        /* 3. INACTIVE OR UNAVAILABLE ASSESSMENT: Gray background with muted text */
                        <div
                          onClick={() => handleStartSubjectAssessment(subj)}
                          className="d-flex align-items-center justify-content-between p-3 rounded-3 border"
                          style={{
                            backgroundColor: '#e2e8f0',
                            borderColor: '#cbd5e1',
                            borderRadius: '12px',
                            cursor: 'not-allowed',
                            transition: 'background-color 0.15s ease',
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${subj.name} assessment is unavailable`}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-semibold" style={{ fontSize: '0.98rem', color: '#64748b' }}>
                              {subj.name}
                            </span>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: '#cbd5e1',
                                color: '#475569',
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                letterSpacing: '0.03em',
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px',
                              }}
                            >
                              UNAVAILABLE
                            </span>
                          </div>
                          <span className="d-flex align-items-center" style={{ color: '#94a3b8' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : assessmentResult ? (
            /* ASSESSMENT SUBMISSION RESULT VIEW */
            <div className="bg-white rounded-4 p-4 shadow-sm text-center">
              <div
                className="rounded-circle bg-success bg-opacity-10 text-success d-inline-flex align-items-center justify-content-center mb-3"
                style={{ width: '56px', height: '56px' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h4 className="fw-bold text-dark fs-6 mb-1">{activeSubject.name} Assessment Recorded!</h4>
              <p className="text-muted small mb-3">Your score has been updated in the subject list.</p>

              <div className="bg-light p-3 rounded-3 mb-3 d-flex justify-content-around">
                <div>
                  <span className="text-muted smaller d-block mb-1">Score</span>
                  <span className="fw-bold text-dark fs-5">{assessmentResult.score}</span>
                </div>
                <div className="border-start" />
                <div>
                  <span className="text-muted smaller d-block mb-1">Percentage</span>
                  <span className="fw-bold text-success fs-5">{assessmentResult.percentage}%</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary rounded-pill w-100 fw-bold"
                style={{ height: '46px', backgroundColor: '#1d8cf8', borderColor: '#1d8cf8' }}
                onClick={() => {
                  setActiveSubject(null)
                  setAssessmentResult(null)
                }}
              >
                Back to Subjects
              </button>
            </div>
          ) : (
            /* MCQ QUESTION SCREEN FOR ACTIVE SUBJECT */
            <div className="bg-white rounded-4 p-4 shadow-sm">
              {isLoadingQuestions ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary spinner-border-sm me-2" role="status" />
                  <span className="text-muted small">Loading assessment...</span>
                </div>
              ) : questionsError ? (
                <div className="alert alert-danger small py-2 mb-3">{questionsError}</div>
              ) : currentQ ? (
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <span className="badge bg-primary bg-opacity-10 text-primary small px-2.5 py-1 rounded-pill">
                      Question {activeQuestionIdx + 1} of {assessmentQuestions.length}
                    </span>
                    {currentQ.isMulti && (
                      <span className="text-muted smaller" style={{ fontSize: '0.75rem' }}>
                        Multiple Choice
                      </span>
                    )}
                  </div>

                  <h3 className="fs-6 fw-bold text-dark mb-3" style={{ lineHeight: 1.45 }}>
                    {currentQ.question}
                  </h3>

                  <div className="d-flex flex-column gap-2 mb-4">
                    {currentQ.options.map((opt, oIdx) => {
                      const curVal = userAnswers[currentQ.qn_id]
                      const isSelected = currentQ.isMulti
                        ? Array.isArray(curVal) && curVal.includes(opt.value)
                        : curVal === opt.value

                      return (
                        <div
                          key={oIdx}
                          onClick={() =>
                            handleToggleOption(currentQ.qn_id, opt.value, currentQ.isMulti, currentQ.limit)
                          }
                          className={`p-3 rounded-3 border d-flex align-items-center gap-2.5 cursor-pointer ${
                            isSelected ? 'bg-primary bg-opacity-10 border-primary text-primary fw-semibold' : 'bg-white'
                          }`}
                          style={{ cursor: 'pointer', borderRadius: '12px' }}
                        >
                          <input
                            type={currentQ.isMulti ? 'checkbox' : 'radio'}
                            checked={isSelected}
                            readOnly
                            className="form-check-input mt-0 flex-shrink-0"
                            style={{ cursor: 'pointer' }}
                          />
                          <span className="small text-dark" style={{ fontSize: '0.88rem' }}>
                            {opt.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {submitError && <div className="alert alert-danger small py-2 mb-3">{submitError}</div>}

                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm rounded-pill px-3"
                      disabled={activeQuestionIdx === 0}
                      onClick={() => setActiveQuestionIdx((prev) => Math.max(0, prev - 1))}
                    >
                      Previous
                    </button>

                    {isLastQuestion ? (
                      <button
                        type="button"
                        className="btn btn-success btn-sm rounded-pill px-4 fw-bold"
                        onClick={handleSubmitAssessment}
                        disabled={isSubmittingAssessment}
                      >
                        {isSubmittingAssessment ? 'Submitting...' : 'Submit'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm rounded-pill px-4 fw-bold"
                        onClick={() =>
                          setActiveQuestionIdx((prev) => Math.min(assessmentQuestions.length - 1, prev + 1))
                        }
                      >
                        Next
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* FIXED BLUE NEXT BUTTON & SKIP BUTTON                                      */}
        {/* ========================================================================= */}
        {!activeSubject && (
          <div
            className="px-3 px-sm-4 pb-3 pt-2 w-100 d-flex flex-column gap-2"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(to top, #eaf2ff 88%, rgba(234, 242, 255, 0))',
              zIndex: 10,
            }}
          >
            <button
              type="button"
              className="btn text-white w-100 fw-bold d-flex align-items-center justify-content-center shadow-sm"
              style={{
                height: '48px',
                backgroundColor: '#1d8cf8',
                borderColor: '#1d8cf8',
                borderRadius: '9999px',
                fontSize: '1.02rem',
              }}
              onClick={handleProceedNext}
              id="btn-profile-setup-next"
            >
              <span>Next</span>
            </button>

            {/* Clearly visible "Skip for Now" Bottom Action (ONLY when showSkip is true) */}
            {showSkip && (
              <button
                type="button"
                className="btn btn-link text-decoration-none fw-semibold w-100 text-center py-1"
                style={{
                  fontSize: '0.92rem',
                  color: '#64748b',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#1d8cf8'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b'
                }}
                onClick={handleSkip}
                id="btn-skip-assessment-bottom"
              >
                Skip for Now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
