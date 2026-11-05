/**
 * Utility functions for generating student initials and colors
 */

/**
 * Dynamically extract up to 2 uppercase initials from a person's name.
 * Handles whitespace, single names, missing/null names gracefully.
 *
 * Examples:
 * - "John Doe" -> "JD"
 * - "Bradley Henry" -> "BH"
 * - "Guy Hawkins" -> "GH"
 * - "Jenny Wilson" -> "JW"
 * - "Annette Black" -> "AB"
 * - "Kristin" -> "K"
 * - "" / null / undefined -> "?"
 */
export function getInitials(name) {
  if (!name || typeof name !== 'string') return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'

  // Split on spaces or hyphens to extract name components
  const parts = trimmed.split(/[\s-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }

  const firstInitial = parts[0].charAt(0).toUpperCase()
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase()
  return `${firstInitial}${lastInitial}`
}

/**
 * Curated palette of soft, subtle background tints matching Edoomate's design
 */
export const AVATAR_PALETTE = [
  { bg: '#dbeafe', color: '#1d4ed8' }, // Blue
  { bg: '#ede9fe', color: '#6d28d9' }, // Purple
  { bg: '#dcfce7', color: '#15803d' }, // Green
  { bg: '#fef3c7', color: '#b45309' }, // Amber
  { bg: '#ffe4e6', color: '#be123c' }, // Rose
  { bg: '#ccfbf1', color: '#0f766e' }, // Teal
  { bg: '#f3e8ff', color: '#7e22ce' }, // Violet
  { bg: '#ffedd5', color: '#c2410c' }, // Orange
]

/**
 * Deterministically pick an avatar color scheme based on name string
 */
export function getAvatarColorScheme(name) {
  if (!name || typeof name !== 'string') return AVATAR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[index]
}
