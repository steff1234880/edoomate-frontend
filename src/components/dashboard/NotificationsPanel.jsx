import React from 'react'

export default function NotificationsPanel({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllRead,
  onClearNotification,
}) {
  if (!isOpen) return null

  const list = Array.isArray(notifications) ? notifications : []
  const unreadCount = list.filter((n) => !n.read).length

  return (
    <>
      {/* Click-outside backdrop */}
      <div
        className="notifications-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1055,
          background: 'transparent',
        }}
        aria-hidden="true"
      />

      <div className="notifications-dropdown-menu shadow-lg animate-fade-in" id="notifications-panel">
      <div className="notifications-header d-flex align-items-center justify-content-between p-3 border-bottom">
        <div className="d-flex align-items-center gap-2">
          <h5 className="mb-0 fw-bold fs-6">Notifications</h5>
          {unreadCount > 0 && (
            <span className="badge bg-primary rounded-pill px-2 py-1" style={{ fontSize: '0.7rem' }}>
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="d-flex align-items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none p-0 text-primary fw-semibold"
              style={{ fontSize: '0.75rem' }}
              onClick={onMarkAllRead}
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            className="btn-close ms-2"
            style={{ fontSize: '0.65rem' }}
            onClick={onClose}
            aria-label="Close"
          ></button>
        </div>
      </div>

      <div className="notifications-list p-2" style={{ maxHeight: '340px', overflowY: 'auto' }}>
        {list.length === 0 ? (
          <div className="text-center py-4 text-muted small">
            <div className="fs-3 mb-2">🔔</div>
            No notifications yet
          </div>
        ) : (
          list.map((item) => (
            <div
              key={item.id}
              className={`notification-item p-2 mb-1 rounded-3 d-flex align-items-start gap-2 ${
                item.read ? 'bg-white' : 'bg-light border-start border-3 border-primary'
              }`}
              style={{ transition: 'background-color 0.15s ease' }}
            >
              <span className="notification-icon fs-5 mt-1">{item.icon || '🔔'}</span>
              <div className="flex-grow-1 min-w-0">
                <div className="d-flex justify-content-between align-items-baseline">
                  <h6 className="mb-0 fw-semibold text-dark text-truncate" style={{ fontSize: '0.82rem' }}>
                    {item.title}
                  </h6>
                  <span className="text-muted ms-2 flex-shrink-0" style={{ fontSize: '0.68rem' }}>
                    {item.time}
                  </span>
                </div>
                <p className="mb-0 text-secondary mt-1" style={{ fontSize: '0.75rem', lineHeight: '1.3' }}>
                  {item.message}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-muted border-0 align-self-start"
                title="Dismiss"
                style={{ fontSize: '0.75rem' }}
                onClick={() => onClearNotification(item.id)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-top bg-light text-center rounded-bottom">
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
          Real-time alerts & study updates
        </span>
      </div>
    </div>
    </>
  )
}
