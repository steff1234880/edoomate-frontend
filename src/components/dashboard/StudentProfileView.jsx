import React, { useState } from 'react'
import { studentData } from '../../data/studentData'
import { authService } from '../../services/authService'

export default function StudentProfileView({
  onBack,
  onNavigateCourses,
  studentAvatar,
  onOpenAvatarModal,
  onOpenSettings,
  currentUser: propUser,
}) {
  const currentUser = propUser || authService.getUser()
  const studentName =
    currentUser?.full_name ||
    (currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim() : null) ||
    currentUser?.username ||
    studentData.profile.name

  const studentEmail = currentUser?.email || 'kristin.watson@edoomate.edu'
  const studentGrade = currentUser?.grade ? `Grade ${currentUser.grade}` : 'Grade 10 Honors'
  const studentSchool = currentUser?.institute ? `• ${currentUser.institute}` : ''

  const [bio, setBio] = useState(
    'Passionate 10th-grade STEM scholar specializing in kinematics, calculus, and computational sciences. Aiming for National Science Olympiad honors!'
  )
  const [isEditingBio, setIsEditingBio] = useState(false)
  const [bioSavedToast, setBioSavedToast] = useState(false)

  const handleSaveBio = () => {
    setIsEditingBio(false)
    setBioSavedToast(true)
    setTimeout(() => setBioSavedToast(false), 2500)
  }

  const currentAvatar = studentAvatar || studentData.profile.avatar

  return (
    <div className="student-profile-view animate-fade-in">
      {/* Top Navigation */}
      <div className="d-flex align-items-center justify-content-between p-3 bg-white border-bottom rounded-4 mb-4 shadow-sm gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          onClick={onBack}
          aria-label="Back to Dashboard"
          title="Back to Dashboard"
          style={{ width: '32px', height: '32px', padding: 0 }}
        >
          ←
        </button>
        <span className="badge bg-light text-primary border px-2.5 px-sm-3 py-1.5 py-sm-2 rounded-pill small fw-semibold flex-shrink-0">
          Student ID: #EDO-2026-9481
        </span>
      </div>

      {/* Profile Header Card */}
      <div className="card border-0 rounded-4 shadow-sm overflow-hidden mb-4 bg-white">
        <div
          className="profile-cover-gradient p-4 text-white position-relative"
          style={{
            minHeight: '130px',
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)',
          }}
        >
          <div className="position-absolute end-0 top-0 p-3 opacity-25">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 9L12 22L22 9L12 2Z" />
            </svg>
          </div>
        </div>

        <div className="card-body p-4 pt-0 position-relative">
          <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4" style={{ marginTop: '-45px' }}>
            <div className="d-flex align-items-end gap-3">
              <div
                className="student-avatar-container position-relative cursor-pointer"
                style={{ width: '84px', height: '84px', cursor: onOpenAvatarModal ? 'pointer' : 'default' }}
                onClick={onOpenAvatarModal}
                title={onOpenAvatarModal ? 'Click to change avatar' : studentName}
              >
                <img
                  src={currentAvatar}
                  alt={studentName}
                  className="rounded-circle border border-4 border-white shadow"
                  style={{ width: '84px', height: '84px', objectFit: 'cover' }}
                />
                <span
                  className="position-absolute bottom-0 end-0 bg-success border border-2 border-white rounded-circle"
                  style={{ width: '18px', height: '18px' }}
                  title="Online"
                ></span>
              </div>
              <div className="mb-2">
                <h3 className="fw-bold mb-0 text-dark fs-5">{studentName}</h3>
                <span className="text-muted small">{studentEmail} • {studentGrade} {studentSchool}</span>
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm rounded-pill px-3 fw-semibold"
                onClick={() => setIsEditingBio(!isEditingBio)}
              >
                {isEditingBio ? 'Cancel' : 'Edit Bio'}
              </button>
              {onOpenSettings && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-1 shadow-sm"
                  onClick={onOpenSettings}
                  id="btn-profile-open-settings"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>Edit Profile</span>
                </button>
              )}
              {onOpenAvatarModal && (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-1"
                  onClick={onOpenAvatarModal}
                  id="btn-profile-change-avatar"
                >
                  <span>Change Avatar</span>
                </button>
              )}
            </div>
          </div>

          {/* Bio Section */}
          <div className="p-3 bg-light rounded-3 mb-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <strong className="small text-secondary fw-semibold">About Me:</strong>
              {bioSavedToast && <span className="small text-success fw-bold">✓ Saved</span>}
            </div>
            {isEditingBio ? (
              <div className="mt-2">
                <textarea
                  className="form-control form-control-sm mb-2"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
                <button type="button" className="btn btn-primary btn-sm rounded-pill px-3" onClick={handleSaveBio}>
                  Save Changes
                </button>
              </div>
            ) : (
              <p className="mb-0 small text-dark" style={{ lineHeight: '1.6' }}>
                {bio}
              </p>
            )}
          </div>

          {/* Metric Stats Cards */}
          <div className="row g-3">
            <div className="col-6 col-md-3">
              <div className="p-3 rounded-3 border bg-light text-center">
                <div className="fs-4 mb-1">🔥</div>
                <div className="fw-bold fs-6 text-dark">{studentData.performance.streak.value}</div>
                <div className="text-muted small" style={{ fontSize: '0.72rem' }}>Current Streak</div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="p-3 rounded-3 border bg-light text-center">
                <div className="fs-4 mb-1">💎</div>
                <div className="fw-bold fs-6 text-dark">{studentData.performance.gems.value}</div>
                <div className="text-muted small" style={{ fontSize: '0.72rem' }}>Total Gems</div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="p-3 rounded-3 border bg-light text-center">
                <div className="fs-4 mb-1">⭐</div>
                <div className="fw-bold fs-6 text-dark">{studentData.performance.experience.value}</div>
                <div className="text-muted small" style={{ fontSize: '0.72rem' }}>Experience XP</div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="p-3 rounded-3 border bg-light text-center">
                <div className="fs-4 mb-1">📚</div>
                <div className="fw-bold fs-6 text-dark">3 Enrolled</div>
                <div className="text-muted small" style={{ fontSize: '0.72rem' }}>Active Courses</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Badges & Achievements Grid */}
      <div className="card border-0 rounded-4 shadow-sm p-4 bg-white mb-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="fw-bold fs-6 mb-0">Earned Academic Badges</h5>
          <span className="badge bg-primary bg-opacity-10 text-primary">3 of 8 Unlocked</span>
        </div>
        <div className="row g-3">
          {[
            { title: 'Science Whiz', desc: 'Completed Advanced Kinematics Module 1', icon: '🏆', color: '#fef9c3' },
            { title: '5-Day Streak', desc: 'Maintained consecutive daily study', icon: '🔥', color: '#ffedd5' },
            { title: 'Math Genius', desc: 'Scored 90%+ on Algebra Assessment', icon: '📐', color: '#e0f2fe' },
          ].map((badge, i) => (
            <div key={i} className="col-12 col-md-4">
              <div className="p-3 border rounded-3 d-flex align-items-center gap-3 bg-light">
                <span
                  className="rounded-circle d-flex align-items-center justify-content-center fs-4 flex-shrink-0"
                  style={{ width: '48px', height: '48px', backgroundColor: badge.color }}
                >
                  {badge.icon}
                </span>
                <div>
                  <div className="fw-bold small text-dark">{badge.title}</div>
                  <div className="text-muted smaller" style={{ fontSize: '0.7rem' }}>
                    {badge.desc}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Enrolled Courses Quick View */}
      <div className="card border-0 rounded-4 shadow-sm p-4 bg-white">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="fw-bold fs-6 mb-0">My Enrolled Subjects</h5>
          <button
            type="button"
            className="btn btn-link btn-sm text-decoration-none fw-semibold p-0"
            onClick={onNavigateCourses}
          >
            Manage All Courses →
          </button>
        </div>
        <div className="list-group list-group-flush">
          {studentData.courses.map((course) => (
            <div
              key={course.id}
              className="list-group-item d-flex justify-content-between align-items-center px-0 py-2 border-light"
            >
              <div className="d-flex align-items-center gap-3">
                <img
                  src={course.thumbnail}
                  alt={course.title}
                  style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '6px' }}
                />
                <div>
                  <div className="fw-bold small text-dark">{course.title}</div>
                  <div className="text-muted smaller" style={{ fontSize: '0.7rem' }}>
                    {course.lessons} • {course.status}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm rounded-pill px-3 py-1 fw-semibold"
                style={{ fontSize: '0.75rem' }}
                onClick={onNavigateCourses}
              >
                Open Course
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
