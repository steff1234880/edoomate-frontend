/**
 * Edoomate Avatar Service
 * Handles avatar discovery, preview, selection, persistence, and backend sync.
 */

import classroomGirlImg from '../assets/dashboard/classroom-girl-hd.jpg'
import boy3dImg from '../assets/dashboard/avatar-boy-3d.jpg'
import girl3dImg from '../assets/dashboard/avatar-girl-3d.jpg'
import kristinImg from '../assets/dashboard/kristin-avatar-clean.jpg'
import alexImg from '../assets/dashboard/avatar-alex-hd.jpg'
import sarahImg from '../assets/dashboard/avatar-sarah-hd.jpg'
import davidImg from '../assets/dashboard/avatar-david-hd.jpg'
import { authService } from './authService'

const STORAGE_AVATAR_KEY = 'edoomate_student_avatar'
const API_BASE_URL = 'https://edoomate.myieltspartner.com/api'

/**
 * Curated collection of student avatar illustrations
 * Includes 3D character illustrations matching the Edoomate design reference
 */
export const AVATAR_OPTIONS = [
  {
    id: 'avatar-scholar-girl-3d',
    title: '3D Scholar Girl',
    category: '3D Illustrated',
    tag: 'Featured',
    src: classroomGirlImg,
    description: 'Curious scholar with glasses exploring STEM and literature',
  },
  {
    id: 'avatar-stem-girl-3d',
    title: '3D Tech Explorer',
    category: '3D Illustrated',
    tag: 'New',
    src: girl3dImg,
    description: 'Enthusiastic student with headphones and study guides',
  },
  {
    id: 'avatar-boy-3d',
    title: '3D Campus Innovator',
    category: '3D Illustrated',
    tag: 'Popular',
    src: boy3dImg,
    description: 'Creative STEM scholar with a passion for robotics',
  },
  {
    id: 'avatar-kristin-classic',
    title: 'Kristin (Default)',
    category: 'Students',
    tag: 'Classic',
    src: kristinImg,
    description: 'Senior 10th-grade honors scholar',
  },
  {
    id: 'avatar-alex',
    title: 'Alex Rivera',
    category: 'Students',
    tag: 'Science Whiz',
    src: alexImg,
    description: 'Physics and astrophysics enthusiast',
  },
  {
    id: 'avatar-sarah',
    title: 'Sarah Miller',
    category: 'Students',
    tag: 'Math Genius',
    src: sarahImg,
    description: 'Calculus and geometry specialist',
  },
  {
    id: 'avatar-david',
    title: 'David Kim',
    category: 'Students',
    tag: 'History Buff',
    src: davidImg,
    description: 'World history and civilizations researcher',
  },
]

export const avatarService = {
  /**
   * Retrieve all available avatar illustrations
   */
  getAvailableAvatars() {
    return AVATAR_OPTIONS
  },

  /**
   * Get the active student avatar from localStorage or auth profile
   */
  getCurrentAvatar() {
    try {
      const saved = localStorage.getItem(STORAGE_AVATAR_KEY)
      if (saved) return saved

      const user = authService.getUser()
      if (user && user.avatar) return user.avatar
    } catch (e) {
      // Storage access error fallback
    }
    return kristinImg
  },

  /**
   * Save selected avatar.
   * Checks backend support first; if unsupported (e.g. 404/405),
   * persists to localStorage without breaking user state.
   */
  async saveAvatar(avatarUrl) {
    let backendSupported = false
    const token = authService.getToken()

    // Inspect backend endpoint if user is authenticated
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/user`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ avatar: avatarUrl }),
        })

        if (response.ok) {
          backendSupported = true
        } else {
          // Backend returned 404/405 - API does not support avatar mutation
          console.info(
            `Edoomate API does not support avatar mutation (HTTP ${response.status}). Using localStorage persistence.`
          )
        }
      } catch (err) {
        console.warn('Backend avatar update request failed or offline:', err.message)
      }
    }

    // Persist reliably in localStorage
    try {
      localStorage.setItem(STORAGE_AVATAR_KEY, avatarUrl)

      // Also update avatar inside authenticated user object if present
      const user = authService.getUser()
      if (user) {
        user.avatar = avatarUrl
        localStorage.setItem('edoomate_auth_user', JSON.stringify(user))
      }
    } catch (storageError) {
      console.warn('Failed to save avatar to localStorage:', storageError)
    }

    // Dispatch global event for instantaneous reactive updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('edoomate_avatar_changed', {
          detail: { avatar: avatarUrl, backendSupported },
        })
      )
    }

    return {
      success: true,
      avatar: avatarUrl,
      backendSupported,
      message: backendSupported
        ? 'Avatar updated on server and saved successfully!'
        : 'Avatar updated and saved locally!',
    }
  },
}
