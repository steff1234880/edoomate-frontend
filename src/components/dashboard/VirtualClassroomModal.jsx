import React, { useState, useEffect } from 'react'
import { studentData } from '../../data/studentData'
import { authService } from '../../services/authService'
import { courseService } from '../../services/courseService'

export default function VirtualClassroomModal({
  isOpen,
  onClose,
  classroomData,
  classroomError,
  isLoading,
  onRetry,
}) {
  const currentUser = authService.getUser()
  const studentName =
    currentUser?.first_name ||
    currentUser?.full_name?.split(' ')[0] ||
    studentData.profile.name

  // Retrieve any previously saved session progress / chat history
  const savedSession = courseService.getStoredClassroomSession()
  const savedState = savedSession?.savedState || {}

  const defaultWelcomeMessage = {
    id: 1,
    sender: 'AI Tutor Maya',
    avatar: studentData.virtualClassroom.tutorImage,
    text: `Hello ${studentName}! Welcome to the Virtual Study Room. What questions or topics can I assist you with today?`,
    isAi: true,
    time: 'Just now',
  }

  const [messages, setMessages] = useState(() => {
    if (Array.isArray(savedState.messages) && savedState.messages.length > 0) {
      return savedState.messages
    }
    return [defaultWelcomeMessage]
  })

  const [inputText, setInputText] = useState('')
  const [isMicOn, setIsMicOn] = useState(() => Boolean(savedState.isMicOn))
  const [isCamOn, setIsCamOn] = useState(() => Boolean(savedState.isCamOn))
  const [controlNotice, setControlNotice] = useState('')

  // When classroom opens or resumes, ensure session is recorded as active
  useEffect(() => {
    if (isOpen && !classroomError) {
      courseService.saveStoredClassroomSession({
        id: classroomData?.id || classroomData?.session_id || 'active_classroom',
        title: classroomData?.title || classroomData?.room_name || classroomData?.name,
        isCurrentlyInRoom: true,
      })
    }
  }, [isOpen, classroomError, classroomData])

  // Custom leave handler to save progress before closing
  const handleLeaveClassroom = () => {
    courseService.leaveClassroomSession({
      messages,
      isMicOn,
      isCamOn,
      lastTopicDiscussed: messages[messages.length - 1]?.text?.slice(0, 80) || '',
    })
    onClose()
  }

  if (!isOpen) return null

  const quickPrompts = [
    'How do I calculate max height?',
    'Why is horizontal velocity constant?',
    'Solve a kinematics practice problem',
  ]

  const triggerControlNotice = (msg) => {
    setControlNotice(msg)
    setTimeout(() => setControlNotice(''), 3000)
  }

  const handleSendMessage = (textToSend) => {
    const query = textToSend || inputText.trim()
    if (!query) return

    const userMsg = {
      id: Date.now(),
      sender: studentName,
      avatar: currentUser?.profile_photo || studentData.profile.avatar,
      text: query,
      isAi: false,
      time: 'Just now',
    }

    setMessages((prev) => [...prev, userMsg])
    setInputText('')

    // Generate intelligent AI study response
    setTimeout(() => {
      let reply =
        "Great question! Remember that in projectile motion, horizontal motion is treated as uniform (zero acceleration, a_x = 0) and vertical motion is uniformly accelerated by gravity (a_y = -9.8 m/s²). Let's review the trajectory step by step!"
      if (query.toLowerCase().includes('max height')) {
        reply =
          'To find maximum height H: at the peak, vertical velocity v_y = 0. Using v_y² = v_0y² - 2gH, we get H = (v_0 · sin θ)² / (2g).'
      } else if (query.toLowerCase().includes('constant')) {
        reply =
          "Horizontal velocity v_x remains constant because gravity acts purely downward along the vertical y-axis. With zero net horizontal force, Newton's first law guarantees constant velocity!"
      } else if (query.toLowerCase().includes('solve') || query.toLowerCase().includes('problem')) {
        reply =
          'Practice problem: A ball is launched at 20 m/s at 30° above horizontal. v_0x = 20·cos(30°) = 17.32 m/s. v_0y = 20·sin(30°) = 10 m/s. Time to reach the peak is t = 10 / 9.8 ≈ 1.02 seconds!'
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'AI Tutor Maya',
          avatar: studentData.virtualClassroom.tutorImage,
          text: reply,
          isAi: true,
          time: 'Just now',
        },
      ])
    }, 800)
  }

  // Session attributes derived from real API response or defaults
  const sessionTitle =
    classroomData?.title ||
    classroomData?.room_name ||
    classroomData?.name ||
    'Advanced Physics: Kinematics Collaboration'

  const tutorName =
    classroomData?.tutor_name ||
    classroomData?.instructor ||
    classroomData?.teacher ||
    'AI Tutor Maya'

  const videoStreamUrl =
    classroomData?.stream_url ||
    classroomData?.video_url ||
    classroomData?.preview_video_url ||
    null

  const meetingUrl =
    classroomData?.meeting_url ||
    classroomData?.zoom_url ||
    classroomData?.redirect_url ||
    null

  return (
    <div
      className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3 animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        zIndex: 1050,
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleLeaveClassroom()
      }}
    >
      <div
        className="modal-content-custom bg-white rounded-4 shadow-2xl overflow-hidden d-flex flex-column"
        style={{
          width: '100%',
          maxWidth: '980px',
          height: '88vh',
          maxHeight: '740px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="classroomModalTitle"
      >
        {/* Classroom Header */}
        <div className="classroom-modal-header d-flex align-items-center justify-content-between p-3 px-md-4 border-bottom bg-light">
          <div className="d-flex align-items-center gap-3">
            {classroomError ? (
              <span className="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill px-3 py-1 d-inline-flex align-items-center gap-2 small fw-semibold">
                <span>⚠️</span> Classroom Notice
              </span>
            ) : (
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-danger rounded-pill px-3 py-1 d-inline-flex align-items-center gap-2 small">
                  <span className="live-pulse-dot" style={{ width: '8px', height: '8px' }}></span> Live AI Study Room
                </span>
                {savedSession?.hasJoined && (
                  <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 small fw-semibold">
                    ✓ Session Resumed
                  </span>
                )}
              </div>
            )}
            <div>
              <h5 className="mb-0 fw-bold fs-6 text-dark" id="classroomModalTitle">
                {sessionTitle}
              </h5>
              <span className="text-muted small">
                {tutorName} • {currentUser?.grade ? `Grade ${currentUser.grade}` : 'Active Study Session'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm rounded-pill px-3 fw-semibold"
            onClick={handleLeaveClassroom}
            id="btn-leave-classroom"
          >
            Leave Classroom ✕
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center p-5 bg-light text-center">
            <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <h5 className="fw-bold text-dark mb-1">Connecting to Virtual Classroom...</h5>
            <p className="text-muted small mb-0">
              Verifying student credentials and requesting live session from Edoomate API
            </p>
          </div>
        )}

        {/* Error / Inactive State */}
        {!isLoading && classroomError && (
          <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center p-4 p-md-5 bg-light text-center">
            <div
              className="rounded-circle d-flex align-items-center justify-content-center mb-3 shadow-sm"
              style={{
                width: '64px',
                height: '64px',
                backgroundColor: '#fff1f2',
                color: '#e11d48',
                border: '2px solid #ffe4e6',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
                <path d="M23 7l-7 5 7 5V7z" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </div>

            <h4 className="fw-bold text-dark mb-2">Classroom Session Unavailable</h4>
            <p className="text-muted mb-3 small" style={{ maxWidth: '520px', lineHeight: 1.6 }}>
              {classroomError}
            </p>

            <div className="p-3 border rounded-3 bg-white mb-4 text-start small" style={{ maxWidth: '520px', width: '100%' }}>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-muted fw-semibold">Backend API Endpoint:</span>
                <span className="badge bg-light text-secondary border">GET /api/virtual-classroom</span>
              </div>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-muted fw-semibold">Authenticated Student:</span>
                <span className="fw-semibold text-dark">{currentUser?.email || studentName}</span>
              </div>
              <div className="d-flex align-items-center justify-content-between">
                <span className="text-muted fw-semibold">Access Status:</span>
                <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
                  No Active Session Broadcast
                </span>
              </div>
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm rounded-pill px-4"
                onClick={onClose}
              >
                Back to Dashboard
              </button>
              {onRetry && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-4 fw-semibold d-inline-flex align-items-center gap-2"
                  onClick={onRetry}
                  id="btn-retry-classroom"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Retry Connection</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Live Classroom Active Interface */}
        {!isLoading && !classroomError && (
          <div className="classroom-modal-body d-flex flex-column flex-md-row flex-grow-1 overflow-hidden">
            {/* Left Stage */}
            <div className="classroom-stage flex-grow-1 p-3 bg-dark d-flex flex-column justify-content-between position-relative">
              {/* Optional External Live Meeting Alert */}
              {meetingUrl && (
                <div className="alert alert-info py-2 px-3 mb-2 rounded-3 small d-flex align-items-center justify-content-between">
                  <span>External video meeting available for this classroom:</span>
                  <a
                    href={meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm rounded-pill px-3 py-1 fw-bold text-white text-decoration-none"
                  >
                    Open Live Video Room ↗
                  </a>
                </div>
              )}

              {/* Tutor Main Feed or Video Player */}
              <div
                className="tutor-stage-display rounded-4 overflow-hidden position-relative flex-grow-1 d-flex align-items-center justify-content-center bg-black"
                style={{ minHeight: '260px' }}
              >
                {videoStreamUrl ? (
                  <video
                    src={videoStreamUrl}
                    controls
                    autoPlay
                    className="w-100 h-100"
                    style={{ objectFit: 'contain' }}
                  />
                ) : (
                  <img
                    src={classroomData?.image_url || studentData.virtualClassroom.tutorImage}
                    alt={tutorName}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
                <div className="position-absolute bottom-0 start-0 p-3 text-white bg-dark bg-opacity-75 w-100 d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-success rounded-circle p-1"></span>
                    <span className="small fw-semibold">{tutorName} (Interactive Host)</span>
                  </div>
                  <span className="badge bg-primary rounded-pill small">Active Classroom</span>
                </div>
              </div>

              {/* Peer Thumbnails Strip */}
              <div className="peer-thumbnails-strip mt-3 d-flex align-items-center gap-2 overflow-x-auto pb-1">
                {[
                  { name: `You (${studentName})`, img: currentUser?.profile_photo || studentData.profile.avatar, bg: '#3b82f6' },
                  { name: 'Alex R.', bg: '#10b981', label: 'AR' },
                  { name: 'Sarah M.', bg: '#8b5cf6', label: 'SM' },
                  { name: 'David K.', bg: '#f59e0b', label: 'DK' },
                ].map((p, idx) => (
                  <div
                    key={idx}
                    className="peer-thumb-box bg-secondary bg-opacity-50 text-white rounded-3 p-1 d-flex flex-column align-items-center justify-content-center flex-shrink-0"
                    style={{ width: '80px', height: '60px' }}
                  >
                    {p.img ? (
                      <img
                        src={p.img}
                        alt={p.name}
                        className="rounded-circle"
                        style={{ width: '28px', height: '28px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="rounded-circle text-white d-flex align-items-center justify-content-center small fw-bold"
                        style={{ width: '28px', height: '28px', backgroundColor: p.bg }}
                      >
                        {p.label}
                      </div>
                    )}
                    <span className="smaller text-truncate mt-1 text-center" style={{ fontSize: '0.65rem', maxWidth: '75px' }}>
                      {p.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Notice Toast */}
              {controlNotice && (
                <div
                  className="position-absolute bottom-3 start-50 translate-middle-x bg-dark text-white px-3 py-1 rounded-pill small border border-secondary shadow"
                  style={{ zIndex: 10 }}
                >
                  {controlNotice}
                </div>
              )}

              {/* Room Controls Bar */}
              <div className="classroom-controls-bar d-flex justify-content-center gap-3 mt-3">
                <button
                  type="button"
                  className={`btn btn-sm rounded-pill px-3 fw-semibold ${isMicOn ? 'btn-danger' : 'btn-light'}`}
                  onClick={() => {
                    setIsMicOn(!isMicOn)
                    triggerControlNotice(isMicOn ? 'Microphone muted' : 'Microphone unmuted')
                  }}
                  id="btn-classroom-mic"
                >
                  {isMicOn ? 'Mute Mic' : 'Unmute Mic'}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm rounded-pill px-3 fw-semibold ${isCamOn ? 'btn-danger' : 'btn-light'}`}
                  onClick={() => {
                    setIsCamOn(!isCamOn)
                    triggerControlNotice(isCamOn ? 'Camera disabled' : 'Camera enabled')
                  }}
                  id="btn-classroom-cam"
                >
                  {isCamOn ? 'Stop Video' : 'Start Video'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                  onClick={() => triggerControlNotice('Screen sharing initiated')}
                  id="btn-classroom-share"
                >
                  Share Screen
                </button>
              </div>
            </div>

            {/* Right AI Chat Sidebar */}
            <div
              className="classroom-chat-panel border-start bg-white d-flex flex-column"
              style={{ width: '100%', maxWidth: '380px' }}
            >
              <div className="p-3 border-bottom bg-light">
                <h6 className="mb-0 fw-bold small text-dark">Instant AI Tutoring & Discussion</h6>
                <span className="text-muted smaller" style={{ fontSize: '0.72rem' }}>
                  Ask questions and collaborate in real-time
                </span>
              </div>

              {/* Messages Scroll Area */}
              <div className="messages-scroll-area flex-grow-1 p-3 overflow-y-auto d-flex flex-column gap-3">
                {messages.map((m) => (
                  <div key={m.id} className={`d-flex flex-column ${m.isAi ? 'align-items-start' : 'align-items-end'}`}>
                    <div className="d-flex align-items-center gap-1 mb-1">
                      <span className="fw-semibold text-dark smaller" style={{ fontSize: '0.7rem' }}>
                        {m.sender}
                      </span>
                      <span className="text-muted smaller" style={{ fontSize: '0.65rem' }}>
                        • {m.time}
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-4 small ${
                        m.isAi ? 'bg-light text-dark border' : 'bg-primary text-white'
                      }`}
                      style={{ maxWidth: '92%', lineHeight: '1.45' }}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Prompts */}
              <div className="p-2 border-top bg-light">
                <div className="d-flex flex-wrap gap-1">
                  {quickPrompts.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="btn btn-outline-primary btn-sm rounded-pill py-0 px-2"
                      style={{ fontSize: '0.68rem' }}
                      onClick={() => handleSendMessage(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Form */}
              <div className="p-3 border-top">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                  }}
                  className="d-flex gap-2"
                >
                  <input
                    type="text"
                    className="form-control form-control-sm rounded-pill px-3"
                    placeholder={`Ask ${tutorName} a question...`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary btn-sm rounded-pill px-3 fw-semibold">
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
