/**
 * Edoomate Notification Service
 * Connects to live backend API: https://edoomate.myieltspartner.com/api
 *
 * Current Backend Status:
 * - Push Notification Device Registration: POST /api/login accepts optional `onesignal_player_id`.
 * - In-app Notification Inbox Fetch: No dedicated endpoint (e.g. GET /api/notifications) exists in
 *   the Edoomate Postman collection or active backend routes (returns 404).
 * - This service handles real-time notification events, OneSignal player ID synchronization,
 *   and local notification state management without mock data.
 */

const API_BASE_URL = 'https://edoomate.myieltspartner.com/api'
const NOTIFICATIONS_STORAGE_KEY = 'edoomate_notifications'

// Listeners for incoming real-time notifications
const listeners = new Set()

export const notificationService = {
  /**
   * Retrieve notification list for the authenticated student.
   * Checks if backend supports a notification-fetch endpoint; if not, returns empty array.
   * No mock data is used.
   *
   * @param {string} token - Bearer auth token
   * @returns {Promise<Array>} List of real notifications (empty if no endpoint exists on backend)
   */
  async getNotifications(token) {
    if (!token) return []

    // Attempt to fetch from backend if endpoint is deployed in future
    try {
      const response = await fetch(`${API_BASE_URL}/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data && data.success && Array.isArray(data.data)) {
          return data.data
        }
      }
    } catch {
      // Backend does not currently provide a notification-fetch endpoint
    }

    // Return stored real incoming notifications if any, otherwise empty array
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}

    return []
  },

  /**
   * Save / update notifications in local storage
   */
  saveNotifications(notifications) {
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications))
      listeners.forEach((fn) => fn(notifications))
    } catch {}
  },

  /**
   * Add a real-time notification (e.g. from OneSignal push event or system event)
   */
  addNotification(notification) {
    try {
      const current = this.getCachedNotifications()
      const newItem = {
        id: notification.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        title: notification.title || 'Notification',
        message: notification.message || '',
        time: notification.time || 'Just now',
        read: false,
        icon: notification.icon || '🔔',
        timestamp: Date.now(),
        ...notification,
      }
      const updated = [newItem, ...current]
      this.saveNotifications(updated)
      return updated
    } catch {
      return []
    }
  },

  /**
   * Retrieve cached notifications synchronously
   */
  getCachedNotifications() {
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead() {
    const current = this.getCachedNotifications()
    const updated = current.map((n) => ({ ...n, read: true }))
    this.saveNotifications(updated)
    return updated
  },

  /**
   * Dismiss/clear a single notification by ID
   */
  clearNotification(id) {
    const current = this.getCachedNotifications()
    const updated = current.filter((n) => n.id !== id)
    this.saveNotifications(updated)
    return updated
  },

  /**
   * Subscribe to real-time notification updates
   */
  subscribe(callback) {
    listeners.add(callback)
    return () => listeners.delete(callback)
  },

  /**
   * Verified OneSignal Player ID Management
   */
  getOneSignalPlayerId() {
    try {
      const stored = localStorage.getItem('edoomate_onesignal_player_id')
      if (stored) return stored
      if (typeof window !== 'undefined' && window.OneSignal?.User?.pushSubscription?.id) {
        return window.OneSignal.User.pushSubscription.id
      }
    } catch {}
    return null
  },

  setOneSignalPlayerId(playerId) {
    try {
      if (playerId) {
        localStorage.setItem('edoomate_onesignal_player_id', playerId)
      } else {
        localStorage.removeItem('edoomate_onesignal_player_id')
      }
    } catch {}
  },
}
