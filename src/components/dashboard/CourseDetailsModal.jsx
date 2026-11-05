import React from 'react'

export default function CourseDetailsModal({ isOpen, onClose, course, onStartLearning }) {
  if (!isOpen || !course) return null

  const modules = course.modules || []
  const totalLessons = modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) || course.lessons || '12 Lessons'
  const videoBadge = course.videoUrl || course.preview_video_url ? 'Video Lectures Included' : 'Interactive Self-Study'

  return (
    <div
      className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3 animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        zIndex: 1060,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="modal-content-custom bg-white rounded-4 shadow-xl overflow-hidden d-flex flex-column"
        style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom bg-light">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-primary rounded-pill px-3 py-1 text-uppercase" style={{ fontSize: '0.7rem' }}>
              {course.badge || 'GRADE 10'}
            </span>
            <span className="badge bg-light text-secondary border rounded-pill px-2 py-1" style={{ fontSize: '0.7rem' }}>
              {course.subject || 'GENERAL'}
            </span>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-auto">
          {/* Course Hero Visual */}
          <div
            className="rounded-4 overflow-hidden mb-3 position-relative"
            style={{ maxHeight: '200px', backgroundColor: '#0f172a' }}
          >
            <img
              src={course.thumbnail || course.vortexImage || 'https://edoomate.myieltspartner.com/images/admin_panel/shape_1.png'}
              alt={course.title}
              className="w-100 h-100 object-fit-cover"
              style={{ maxHeight: '200px', objectFit: 'cover' }}
            />
            <div
              className="position-absolute bottom-0 start-0 end-0 p-3"
              style={{ background: 'linear-gradient(to top, rgba(15,23,42,0.85) 0%, transparent 100%)' }}
            >
              <h4 className="fw-bold text-white mb-0 fs-5">{course.title}</h4>
              <span className="text-white-50 small">{videoBadge}</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-secondary small mb-3" style={{ lineHeight: '1.6' }}>
            {course.description ||
              'Master core academic competencies, structural problem solving, and analytical methodologies through curated curriculum units and guided assessments.'}
          </p>

          {/* Key Course Stats */}
          <div className="row g-2 mb-4 text-center">
            <div className="col-4">
              <div className="p-2 border rounded-3 bg-light">
                <div className="small text-muted">Curriculum</div>
                <div className="fw-bold text-dark small">{modules.length || 3} Modules</div>
              </div>
            </div>
            <div className="col-4">
              <div className="p-2 border rounded-3 bg-light">
                <div className="small text-muted">Total Lessons</div>
                <div className="fw-bold text-dark small">{totalLessons}</div>
              </div>
            </div>
            <div className="col-4">
              <div className="p-2 border rounded-3 bg-light">
                <div className="small text-muted">Certificate</div>
                <div className="fw-bold text-success small">Included ✓</div>
              </div>
            </div>
          </div>

          {/* Syllabus Outline Preview */}
          {modules.length > 0 && (
            <div className="mb-3">
              <h6 className="fw-bold small text-dark mb-2">Curriculum Outline</h6>
              <div className="d-flex flex-column gap-2">
                {modules.map((m, idx) => (
                  <div key={m.id || idx} className="p-2 px-3 rounded-3 border bg-light d-flex justify-content-between align-items-center">
                    <span className="small fw-semibold text-dark text-truncate">{m.title}</span>
                    <span className="badge bg-white text-secondary border small">{m.lessons?.length || 0} Lessons</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-top bg-light d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm rounded-pill px-3" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm rounded-pill px-4 fw-semibold d-inline-flex align-items-center gap-2"
            onClick={() => {
              onClose()
              if (onStartLearning) onStartLearning(course)
            }}
          >
            <span>{course.progress > 0 ? 'Resume Lesson' : 'Start Learning'}</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
