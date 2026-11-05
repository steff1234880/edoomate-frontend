import React from 'react'
import { getInitials, getAvatarColorScheme } from '../../utils/avatarUtils'

export { getInitials, getAvatarColorScheme }

/**
 * Reusable InitialsAvatar Component
 *
 * Props:
 * - name: string (required)
 * - size: number (default 40)
 * - fontSize: string (optional, auto-calculated if not provided)
 * - isUser: boolean (if true and inverted, styles for highlighted row)
 * - border: string (optional custom border, e.g. for podium ranks)
 * - className: string (optional)
 * - style: object (optional)
 */
export default function InitialsAvatar({
  name,
  size = 40,
  fontSize,
  isUser = false,
  border,
  className = '',
  style = {},
}) {
  const initials = getInitials(name)
  const scheme = getAvatarColorScheme(name)

  // Auto-calculate proportional font size if not explicitly provided
  const computedFontSize = fontSize || `${Math.max(11, Math.round(size * 0.42))}px`

  // When used inside the highlighted "You" row (which has a blue background),
  // invert the avatar with a white background and blue text
  const backgroundColor = isUser ? '#ffffff' : scheme.bg
  const textColor = isUser ? '#2563eb' : scheme.color

  return (
    <div
      className={`initials-avatar-circle flex-shrink-0 user-select-none ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: '50%',
        backgroundColor,
        color: textColor,
        fontSize: computedFontSize,
        fontWeight: 700,
        letterSpacing: '0.02em',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: border || (isUser ? '2px solid rgba(255, 255, 255, 0.9)' : '1px solid rgba(0, 0, 0, 0.05)'),
        boxShadow: isUser ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none',
        lineHeight: 1,
        ...style,
      }}
      aria-label={name || 'Student avatar'}
      title={name || 'Student avatar'}
    >
      <span>{initials}</span>
    </div>
  )
}
