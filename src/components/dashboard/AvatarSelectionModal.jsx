import React, { useState, useEffect } from 'react'
import { avatarService, AVATAR_OPTIONS } from '../../services/avatarService'
import { authService } from '../../services/authService'
import { studentData } from '../../data/studentData'

export default function AvatarSelectionModal({ isOpen, onClose, onAvatarSaved, currentAvatar }) {
  const activeCurrent = currentAvatar || avatarService.getCurrentAvatar()
  const [selectedAvatar, setSelectedAvatar] = useState(activeCurrent)
  const [prevOpen, setPrevOpen] = useState(isOpen)
  const [activeCategory, setActiveCategory] = useState('All')
  const [isSaving, setIsSaving] = useState(false)

  // Reset selectedAvatar when modal transitions from closed to open
  if (isOpen && !prevOpen) {
    setPrevOpen(true)
    setSelectedAvatar(activeCurrent)
  } else if (!isOpen && prevOpen) {
    setPrevOpen(false)
  }

  // Current user info
  const currentUser = authService.getUser()
  const studentName =
    currentUser?.first_name ||
    currentUser?.full_name?.split(' ')[0] ||
    studentData.profile.name ||
    'Kristin'

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const categories = ['All', '3D Illustrated', 'Students']

  const filteredAvatars =
    activeCategory === 'All'
      ? AVATAR_OPTIONS
      : AVATAR_OPTIONS.filter((av) => av.category === activeCategory)

  // Find info for current preview
  const currentOption = AVATAR_OPTIONS.find((av) => av.src === selectedAvatar) || {
    title: 'Custom Avatar',
    tag: 'Selected',
    description: 'Customized student profile appearance',
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await avatarService.saveAvatar(selectedAvatar)
      if (onAvatarSaved) {
        onAvatarSaved(selectedAvatar, result)
      }
      onClose()
    } catch (err) {
      console.error('Failed to save avatar:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3 animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        zIndex: 1060,
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-content-custom bg-white rounded-4 shadow-2xl overflow-hidden d-flex flex-column animate-scale-up"
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '90vh',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        {/* Modal Header */}
        <div className="d-flex align-items-center justify-content-between p-3 px-4 border-bottom bg-light">
          <div>
            <h4 className="fw-bold mb-0 text-dark fs-5">Choose Your Avatar</h4>
            <p className="text-muted small mb-0 mt-1">
              Personalize your Edoomate profile with a 3D scholar avatar illustration.
            </p>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close"
            id="btn-close-avatar-modal"
          ></button>
        </div>

        {/* Modal Body: Scrollable */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 145px)' }}>
          {/* Live Preview Card */}
          <div
            className="p-3 p-md-4 rounded-4 mb-4 d-flex flex-column flex-sm-row align-items-center gap-4 text-center text-sm-start"
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
              border: '1px solid #dbeafe',
            }}
          >
            {/* Large Preview Circle */}
            <div className="position-relative flex-shrink-0">
              <div
                className="rounded-circle overflow-hidden shadow-md"
                style={{
                  width: '96px',
                  height: '96px',
                  border: '4px solid #ffffff',
                  boxShadow: '0 8px 24px rgba(37, 99, 235, 0.2)',
                }}
              >
                <img
                  src={selectedAvatar}
                  alt={currentOption.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <span
                className="position-absolute bottom-0 end-0 bg-success border border-2 border-white rounded-circle"
                style={{ width: '18px', height: '18px' }}
                title="Online"
              ></span>
            </div>

            {/* Preview Details */}
            <div className="flex-grow-1">
              <div className="d-flex flex-wrap align-items-center justify-content-center justify-content-sm-start gap-2 mb-1">
                <span className="badge bg-primary px-3 py-1 rounded-pill small fw-semibold">
                  Preview Selection
                </span>
                {currentOption.tag && (
                  <span className="badge bg-warning bg-opacity-20 text-dark border border-warning px-2 py-1 rounded-pill small">
                    ★ {currentOption.tag}
                  </span>
                )}
              </div>
              <h5 className="fw-bold text-dark mb-1 fs-5">
                {studentName} • {currentOption.title}
              </h5>
              <p className="text-muted small mb-0" style={{ maxWidth: '420px' }}>
                {currentOption.description}
              </p>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="d-flex align-items-center gap-2 mb-3">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  activeCategory === cat ? 'btn-primary' : 'btn-outline-secondary'
                }`}
                style={{ fontSize: '0.82rem' }}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Avatar Cards Grid */}
          <div className="row g-3">
            {filteredAvatars.map((avatar) => {
              const isSelected = selectedAvatar === avatar.src

              return (
                <div key={avatar.id} className="col-6 col-sm-4 col-md-4">
                  <div
                    className={`card h-100 rounded-4 p-3 cursor-pointer text-center position-relative transition-all ${
                      isSelected
                        ? 'border-primary shadow-md bg-primary bg-opacity-10'
                        : 'border bg-white hover-shadow'
                    }`}
                    style={{
                      cursor: 'pointer',
                      borderWidth: isSelected ? '2px' : '1px',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                    }}
                    onClick={() => setSelectedAvatar(avatar.src)}
                    id={`avatar-option-${avatar.id}`}
                  >
                    {/* Selected Checkmark Badge */}
                    {isSelected && (
                      <span
                        className="position-absolute top-0 end-0 m-2 badge bg-primary rounded-circle d-flex align-items-center justify-content-center text-white"
                        style={{ width: '22px', height: '22px', fontSize: '11px', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                      >
                        ✓
                      </span>
                    )}

                    {/* Circular Avatar Thumb */}
                    <div className="mx-auto mb-2 position-relative" style={{ width: '80px', height: '80px' }}>
                      <img
                        src={avatar.src}
                        alt={avatar.title}
                        className="rounded-circle w-100 h-100 shadow-sm"
                        style={{
                          objectFit: 'cover',
                          border: isSelected ? '3px solid #0070f3' : '2px solid #e2e8f0',
                        }}
                      />
                    </div>

                    {/* Title and Tag */}
                    <h6 className="fw-bold small mb-1 text-dark text-truncate" title={avatar.title}>
                      {avatar.title}
                    </h6>
                    <span
                      className="badge rounded-pill bg-light text-secondary border small px-2 py-0"
                      style={{ fontSize: '0.68rem' }}
                    >
                      {avatar.category}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="d-flex align-items-center justify-content-between p-3 px-4 border-top bg-light">
          <button
            type="button"
            className="btn btn-outline-secondary rounded-pill px-4 fw-semibold"
            onClick={onClose}
            id="btn-cancel-avatar-selection"
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn btn-primary rounded-pill px-4 fw-semibold d-inline-flex align-items-center gap-2"
            onClick={handleSave}
            disabled={isSaving}
            id="btn-save-avatar-selection"
          >
            {isSaving ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Save Avatar</span>
                <span>✓</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
