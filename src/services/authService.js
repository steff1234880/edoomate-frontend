/**
 * Edoomate Authentication Service
 * Connects to the backend REST API: https://edoomate.myieltspartner.com/api
 */

const API_BASE_URL = 'https://edoomate.myieltspartner.com/api'
const TOKEN_KEY = 'edoomate_auth_token'
const USER_KEY = 'edoomate_auth_user'

export const authService = {
  /**
   * Send OTP to student identifier (mobile or email)
   * Dispatches to backend OTP endpoint: POST /api/otp/generate
   * @param {Object} param0 - { identifier, country_code }
   * @returns {Promise<Object>}
   */
  async sendOtp({ identifier, country_code = '91' }) {
    const raw = (identifier || '').trim()
    if (!raw) {
      throw new Error('Please enter your registered mobile number or email address.')
    }

    if (this.isAccountDeleted(raw)) {
      throw new Error('This account has been permanently deleted and cannot be logged into.')
    }

    const isEmail = raw.includes('@')
    const cleanCountry = String(country_code || '91').replace(/\D/g, '') || '91'
    const cleanMobile = raw.replace(/\D/g, '')

    if (!isEmail) {
      if (cleanMobile.length < 7 || cleanMobile.length > 15) {
        throw new Error('Please enter a valid mobile number (7 to 15 digits).')
      }
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(raw)) {
        throw new Error('Please enter a valid email address.')
      }
    }

    // Backend route /api/otp/generate expects username and email or mobile/country_code
    const payload = isEmail
      ? { username: raw.toLowerCase(), email: raw.toLowerCase() }
      : { username: cleanMobile, mobile: cleanMobile, country_code: cleanCountry }

    let response
    let data

    // Primary: POST /api/otp/generate
    try {
      response = await fetch(`${API_BASE_URL}/otp/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      data = await response.json().catch(() => null)
    } catch {
      throw new Error('Unable to connect to the Edoomate server. Please check your internet connection.')
    }

    if (response.status === 404) {
      throw new Error(data?.message || 'The OTP generation endpoint was not found on the server.')
    }

    if (response.status === 422) {
      if (data?.errors && typeof data.errors === 'object') {
        const errs = Object.values(data.errors).flat().join(' ')
        throw new Error(errs || data?.message || 'Invalid details for OTP request.')
      }
      throw new Error(data?.message || 'Invalid details for OTP request.')
    }

    // Backend returns 200 with data.message = "Student details not found" if mobile/email not in system
    if (data?.data?.message === 'Student details not found' || data?.message === 'Student details not found') {
      throw new Error('Student account not found with the provided details. Please check your details or sign up.')
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(data?.message || `Failed to send OTP (HTTP ${response.status}).`)
    }

    return {
      success: true,
      message: data?.data?.message || data?.message || `OTP sent successfully to ${raw}.`,
      resendTimeout: data?.data?.resend_timeout || data?.resend_timeout || 60,
      otpExpiry: data?.data?.expires_in || 300,
      data: data?.data || data,
    }
  },

  /**
   * Verify student OTP and obtain authenticated session
   * Dispatches to backend OTP verification endpoint: POST /api/otp/verify
   * @param {Object} param0 - { identifier, country_code, otp }
   * @returns {Promise<Object>} { success, user, token, message }
   */
  async verifyOtp({ identifier, country_code = '91', otp }) {
    const raw = (identifier || '').trim()
    const cleanOtp = String(otp || '').trim()

    if (!raw) {
      throw new Error('Identifier (mobile/email) is required.')
    }
    if (!cleanOtp) {
      throw new Error('Please enter the OTP code.')
    }
    if (cleanOtp.length !== 4) {
      throw new Error('OTP must be exactly 4 digits.')
    }

    if (this.isAccountDeleted(raw)) {
      throw new Error('This account has been permanently deleted and cannot be logged into.')
    }

    const isEmail = raw.includes('@')
    const cleanCountry = String(country_code || '91').replace(/\D/g, '') || '91'
    const cleanMobile = raw.replace(/\D/g, '')

    // The backend POST /api/otp/verify requires:
    // username, OTP, otp, country_code, device, device_type, unique_id
    const payload = {
      username: isEmail ? raw.toLowerCase() : cleanMobile,
      OTP: cleanOtp,
      otp: cleanOtp,
      ...(isEmail ? { email: raw.toLowerCase() } : { mobile: cleanMobile }),
      country_code: cleanCountry,
      device: 'web',
      device_type: 'browser',
      unique_id: typeof window !== 'undefined' ? (window.navigator?.userAgent || 'edoomate-web-client') : 'edoomate-web-client',
    }

    const playerId = this.getOneSignalPlayerId()
    if (playerId) {
      payload.onesignal_player_id = playerId
    }

    let response
    let data
    try {
      response = await fetch(`${API_BASE_URL}/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      data = await response.json().catch(() => null)
    } catch {
      throw new Error('Unable to connect to the Edoomate server. Please check your internet connection.')
    }

    // Backend returns 404 with message: "Student not found" when the OTP code is wrong or expired
    if (response.status === 404) {
      if (data?.message === 'Student not found') {
        throw new Error('The OTP entered is incorrect or has expired. Please check and try again.')
      }
      throw new Error(data?.message || 'Verification endpoint was not found on the server.')
    }

    if (response.status === 422) {
      if (data?.errors && typeof data.errors === 'object') {
        const errs = Object.values(data.errors).flat().join(' ')
        throw new Error(errs || data?.message || 'Invalid or expired OTP.')
      }
      throw new Error(data?.message || 'Invalid or expired OTP.')
    }

    if (response.status === 401 || response.status === 403 || (data && data.success === false)) {
      throw new Error(data?.message || 'The OTP entered is incorrect or has expired.')
    }

    if (!response.ok) {
      throw new Error(data?.message || `Verification failed with HTTP ${response.status}.`)
    }

    const responseData = data?.data || {}
    let token = responseData.token || data?.token || data?.access_token || null
    let user = responseData.user || data?.user || null

    if (!user) {
      const stored = this.getUser()
      user = {
        email: isEmail ? raw.toLowerCase() : (stored?.email || undefined),
        mobile: !isEmail ? cleanMobile : (stored?.mobile || undefined),
        full_name: stored?.full_name || stored?.name || raw.split('@')[0],
        first_name: stored?.first_name || raw.split('@')[0],
        status_name: 'ACTIVE',
      }
    }

    if (!token) {
      const storedToken = this.getToken()
      token = storedToken || `otp_session_${Date.now()}`
    }

    this.saveSession(token, user)

    return {
      success: true,
      user,
      token,
      message: data?.message || 'OTP verified successfully.',
      has_login: true,
    }
  },

  /**
   * Resend OTP to student identifier
   */
  async resendOtp(params) {
    return this.sendOtp(params)
  },

  /**
   * Authenticate user with the backend API
   * Endpoint: POST /api/login
   * @param {Object} credentials - { username or email, password }
   * @returns {Promise<Object>} API response object
   */
  async login({ email, username, password, onesignal_player_id }) {
    const identifier = (username || email || '').trim()

    // Client-side validation prior to network dispatch
    if (!identifier) {
      throw new Error('Please enter your email or username.')
    }
    if (!password) {
      throw new Error('Please enter your password.')
    }

    if (this.isAccountDeleted(identifier)) {
      throw new Error('This account has been permanently deleted and can no longer be accessed.')
    }

    const payload = {
      username: identifier,
      password: password,
    }

    // Attach optional OneSignal player ID if present or stored
    const playerId = onesignal_player_id || this.getOneSignalPlayerId()
    if (playerId) {
      payload.onesignal_player_id = playerId
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } catch (networkError) {
      throw new Error(
        'Unable to connect to the Edoomate server. Please check your internet connection.'
      )
    }

    let data
    try {
      data = await response.json()
    } catch (parseError) {
      throw new Error(
        `Server returned status ${response.status}. Please try again later.`
      )
    }

    // Handle 422 Validation Errors
    if (response.status === 422) {
      if (data.errors && typeof data.errors === 'object') {
        const errorMessages = Object.values(data.errors).flat()
        const combined = errorMessages.join(' ')
        throw new Error(combined || data.message || 'Validation error.')
      }
      throw new Error(data.message || 'Validation error.')
    }

    // Handle 403 / 401 Unauthorized, Inactive or Deleted Accounts
    if (response.status === 403 || response.status === 401 || data.success === false) {
      const msg = String(data?.message || '')
      if (
        msg.toLowerCase().includes('temporarily inactive') ||
        msg.toLowerCase().includes('inactive') ||
        msg.toLowerCase().includes('deleted') ||
        msg.toLowerCase().includes('deactivated')
      ) {
        this.recordDeletedAccount(identifier)
        throw new Error('This account has been permanently deleted and can no longer be accessed.')
      }
      throw new Error(data.message || 'Invalid username or password.')
    }

    // Handle server errors
    if (!response.ok) {
      throw new Error(data.message || `Request failed with status ${response.status}.`)
    }

    // Extract authentication token from response
    // Edoomate API returns: data.data.token and data.data.user
    const responseData = data.data || {}
    const token = responseData.token || data.token || data.access_token || null
    const user = responseData.user || data.user || { email: identifier, full_name: identifier }

    // Check if the user object returned reflects a deactivated / deleted account
    if (
      user?.status === 0 ||
      user?.status === '0' ||
      String(user?.status_name || '').toUpperCase() === 'INACTIVE' ||
      user?.account_deletion_reason
    ) {
      this.recordDeletedAccount(identifier)
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
          })
        } catch {}
      }
      this.clearSession()
      throw new Error('This account has been permanently deleted and can no longer be accessed.')
    }

    if (token) {
      this.saveSession(token, user)
    }

    return {
      success: true,
      user,
      token,
      message: data.message || 'Login successfully',
    }
  },

  /**
   * Authenticate student with Google / Firebase credentials
   * Endpoint: POST /api/google-login
   * @param {Object} param0 - { id_token, email, provider_id, name, first_name, last_name, profile_photo, onesignal_player_id }
   * @returns {Promise<Object>} API response and saved session
   */
  async googleLogin({
    id_token,
    email,
    provider_id,
    name,
    first_name,
    last_name,
    profile_photo,
    onesignal_player_id,
  }) {
    if (!email && !provider_id && !id_token) {
      throw new Error('Google authentication requires valid credentials.')
    }

    const payload = {
      provider: 'google',
      provider_id: provider_id || '',
      email: (email || '').trim().toLowerCase(),
      name: name || '',
      id_token: id_token || '',
    }

    if (first_name) payload.first_name = first_name
    if (last_name) payload.last_name = last_name
    if (profile_photo) payload.profile_photo = profile_photo

    // Attach OneSignal player ID if present or stored
    const playerId = onesignal_player_id || this.getOneSignalPlayerId()
    if (playerId) {
      payload.onesignal_player_id = playerId
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/google-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } catch {
      throw new Error(
        'Unable to connect to the Edoomate server. Please check your internet connection.'
      )
    }

    let data
    try {
      data = await response.json()
    } catch {
      throw new Error(`Server returned status ${response.status}. Please try again later.`)
    }

    if (response.status === 422) {
      if (data?.errors && typeof data.errors === 'object') {
        const msgs = Object.values(data.errors).flat().join(' ')
        throw new Error(msgs || data.message || 'Validation error during Google sign-in.')
      }
      throw new Error(data?.message || 'Validation error during Google sign-in.')
    }

    if (response.status === 401 || response.status === 403 || data.success === false) {
      throw new Error(data?.message || 'Google sign-in unauthorized or failed.')
    }

    if (!response.ok) {
      throw new Error(data?.message || `Request failed with status ${response.status}.`)
    }

    // Extract authentication token and user profile
    const responseData = data.data || {}
    const token = responseData.token || data.token || data.access_token || null
    const user = responseData.user || data.user || { email: payload.email, full_name: payload.name }

    if (token) {
      this.saveSession(token, user)
    }

    return {
      success: true,
      user,
      token,
      message: data.message || 'Logged in successfully with Google',
    }
  },

  /**
   * Check if an email address is already registered in the backend
   * Validates format, then queries backend endpoints (/api/otp/generate and /api/register)
   * to determine whether the user is registered or unregistered.
   * @param {string} email - Student email address
   * @returns {Promise<{ isRegistered: boolean, email: string }>}
   */
  async checkEmailRegistered(email) {
    const trimmed = (email || '').trim().toLowerCase()
    if (!trimmed) {
      throw new Error('Please enter your email address.')
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      throw new Error('Please enter a valid email address.')
    }

    if (this.isAccountDeleted(trimmed)) {
      throw new Error('This account has been permanently deleted and can no longer be accessed.')
    }

    // Step 1: Check with Edoomate OTP generate endpoint
    // When registered: status 200 { success: true, message: 'OTP resend successfully' }
    // When unregistered: status 422 { success: false, errors: { email: ['The email does not exist in our records.'] } }
    let otpResponse
    let otpData
    try {
      otpResponse = await fetch(`${API_BASE_URL}/otp/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email: trimmed }),
      })
      otpData = await otpResponse.json().catch(() => null)
    } catch {
      throw new Error('Unable to connect to the Edoomate server. Please check your internet connection.')
    }

    if (otpResponse.ok && (otpData?.success === true || otpResponse.status === 200)) {
      return { isRegistered: true, email: trimmed, otpSent: true }
    }

    if (otpResponse.status === 422 && otpData?.errors?.email) {
      const emailErrors = otpData.errors.email
      const notFound = emailErrors.some((msg) =>
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('not exist')
      )
      if (notFound) {
        return { isRegistered: false, email: trimmed }
      }
      const isInvalid = emailErrors.some((msg) =>
        msg.toLowerCase().includes('valid email')
      )
      if (isInvalid) {
        throw new Error('Please enter a valid email address.')
      }
    }

    // Step 2: Corroborate with POST /api/register validation endpoint
    let regResponse
    let regData
    try {
      regResponse = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email: trimmed }),
      })
      regData = await regResponse.json().catch(() => null)
    } catch {
      throw new Error('Unable to connect to the Edoomate server. Please check your internet connection.')
    }

    if (regResponse.status === 422 && regData?.errors?.email) {
      const regErrors = regData.errors.email
      const isTaken = regErrors.some((msg) =>
        msg.toLowerCase().includes('already been taken') ||
        msg.toLowerCase().includes('already exists')
      )
      if (isTaken) {
        return { isRegistered: true, email: trimmed }
      }
      const isInvalid = regErrors.some((msg) =>
        msg.toLowerCase().includes('valid email')
      )
      if (isInvalid) {
        throw new Error('Please enter a valid email address.')
      }
    }

    // Default: not registered
    return { isRegistered: false, email: trimmed }
  },

  /**
   * Register a new student account
   * Endpoint: POST /api/register
   * @param {Object} data - { first_name, last_name, email, country_code, mobile, password, confirm_password }
   * @returns {Promise<Object>} API response and auto-logged in session
   */
  async register({
    first_name,
    last_name,
    gender,
    email,
    country_code = '91',
    mobile,
    grade,
    learning_type,
    study_type,
    password,
    confirm_password,
    parent_name,
    parent_email,
    parent_country_code = '91',
    parent_mobile,
    parent_contact,
    school_id,
    school,
    institute,
  }) {
    const trimmedFirst = (first_name || '').trim()
    const trimmedLast = (last_name || '').trim()
    const trimmedEmail = (email || '').trim().toLowerCase()
    const cleanCountry = String(country_code || '91').replace(/\D/g, '') || '91'
    const cleanMobile = String(mobile || '').replace(/\D/g, '')

    if (!trimmedFirst) throw new Error('Please enter your first name.')
    if (!trimmedLast) throw new Error('Please enter your last name.')
    if (!trimmedEmail) throw new Error('Please enter your email address.')
    if (!cleanMobile) throw new Error('Please enter your mobile phone number.')
    if (cleanMobile.length < 6 || cleanMobile.length > 15) {
      throw new Error('Mobile number must be between 6 and 15 digits.')
    }
    if (!password) throw new Error('Please enter a password.')
    if (password.length < 6) throw new Error('Password must be at least 6 characters.')
    if (password !== confirm_password) {
      throw new Error('Confirm password does not match password.')
    }

    // Parent Contact Validation (At least ONE is required)
    const trimmedParentEmail = (parent_email || '').trim().toLowerCase()
    const cleanParentMobile = String(parent_contact || parent_mobile || '').replace(/\D/g, '')
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!trimmedParentEmail && !cleanParentMobile) {
      throw new Error('Please enter either parent email or parent mobile number.')
    }
    if (trimmedParentEmail && !emailRegex.test(trimmedParentEmail)) {
      throw new Error('Please enter a valid parent email address.')
    }
    if (cleanParentMobile && (cleanParentMobile.length < 6 || cleanParentMobile.length > 15)) {
      throw new Error('Parent mobile number must be between 6 and 15 digits.')
    }

    const payload = {
      first_name: trimmedFirst,
      last_name: trimmedLast,
      email: trimmedEmail,
      country_code: cleanCountry,
      mobile: cleanMobile,
      password,
      confirm_password,
    }

    if (gender && gender !== 'Select Gender') {
      payload.gender = gender.toUpperCase()
    }
    if (grade && grade !== 'Select Grade') {
      payload.grade = String(grade).replace('Grade ', '').trim()
    }
    const type = study_type || learning_type
    if (type && type !== 'Select Learning Type') {
      payload.study_type = type
      payload.learning_type = type
    }
    if (parent_name) {
      payload.parent_name = parent_name.trim()
    }
    if (trimmedParentEmail) {
      payload.parent_email = trimmedParentEmail
    }
    if (cleanParentMobile) {
      payload.parent_contact = cleanParentMobile
      payload.parent_mobile = cleanParentMobile
      payload.parent_country_code = String(parent_country_code || '91').replace(/\D/g, '') || '91'
    }
    if (school_id) {
      payload.school_id = school_id
    }
    if (school) {
      payload.school = school
    }
    if (institute || school) {
      payload.institute = institute || school
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } catch (networkError) {
      throw new Error(
        'Unable to connect to the Edoomate server. Please check your internet connection.'
      )
    }

    let data
    try {
      data = await response.json()
    } catch (parseError) {
      throw new Error(`Server returned status ${response.status}. Please try again later.`)
    }

    if (response.status === 422) {
      if (data?.errors && typeof data.errors === 'object') {
        const errorMessages = Object.values(data.errors).flat()
        throw new Error(errorMessages.join(' ') || data.message || 'Validation error.')
      }
      throw new Error(data?.message || 'Validation error.')
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(data?.message || `Registration failed with status ${response.status}.`)
    }

    // Auto-login upon successful registration
    try {
      const loginResult = await this.login({
        email: trimmedEmail,
        password: password,
      })
      return {
        ...data,
        ...loginResult,
        message: data.message || 'Registered successfully!',
      }
    } catch (loginErr) {
      return {
        ...data,
        success: true,
        message: data.message || 'Registered successfully! Please log in.',
      }
    }
  },

  /**
   * Persist session securely in localStorage
   */
  saveSession(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch (e) {
      // Storage might be unavailable or disabled
    }
  },

  /**
   * Retrieve stored auth token
   */
  getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch (e) {
      return null
    }
  },

  /**
   * Retrieve stored user object
   */
  getUser() {
    try {
      const stored = localStorage.getItem(USER_KEY)
      return stored ? JSON.parse(stored) : null
    } catch (e) {
      return null
    }
  },

  /**
   * Check if current session is active
   */
  isAuthenticated() {
    return Boolean(this.getToken())
  },

  /**
   * OneSignal Player ID Management for Push Notifications
   */
  setOneSignalPlayerId(playerId) {
    try {
      if (playerId) {
        localStorage.setItem('edoomate_onesignal_player_id', playerId)
      } else {
        localStorage.removeItem('edoomate_onesignal_player_id')
      }
    } catch (e) {
      // Storage unavailable
    }
  },

  getOneSignalPlayerId() {
    try {
      const stored = localStorage.getItem('edoomate_onesignal_player_id')
      if (stored) return stored
      if (typeof window !== 'undefined' && window.OneSignal?.User?.pushSubscription?.id) {
        return window.OneSignal.User.pushSubscription.id
      }
    } catch (e) {
      // Storage unavailable
    }
    return null
  },

  /**
   * Clear all local storage session items
   */
  clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem('edoomate_notifications')
    } catch (e) {
      // Storage unavailable
    }
  },

  /**
   * Deleted Accounts Registry
   */
  getDeletedAccounts() {
    try {
      const stored = localStorage.getItem('edoomate_deleted_accounts')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  },

  recordDeletedAccount(identifier) {
    if (!identifier) return
    try {
      const list = this.getDeletedAccounts()
      const clean = String(identifier).trim().toLowerCase()
      if (!list.includes(clean)) {
        list.push(clean)
        localStorage.setItem('edoomate_deleted_accounts', JSON.stringify(list))
      }
    } catch {
      // Storage unavailable
    }
  },

  isAccountDeleted(identifier) {
    if (!identifier) return false
    const clean = String(identifier).trim().toLowerCase()
    const list = this.getDeletedAccounts()
    return list.includes(clean)
  },

  /**
   * Clear session and log out via backend API
   */
  async logout() {
    const token = this.getToken()
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        })
      } catch (err) {
        console.warn('Backend logout request failed or network offline:', err)
      }
    }
    this.clearSession()
  },

  /**
   * Fetch student profile details from backend
   * Endpoint: GET /api/user
   */
  async getUserProfile(explicitToken = null) {
    const token = explicitToken || this.getToken()
    if (!token) {
      throw new Error('Authentication required. Please log in again.')
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      })
    } catch (networkError) {
      throw new Error('Unable to connect to the Edoomate server. Please check your network connection.')
    }

    const data = await response.json().catch(() => null)

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session has expired. Please log in again.')
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(data?.message || `Failed to fetch user profile (HTTP ${response.status}).`)
    }

    return data?.data || data
  },

  /**
   * Fetch student's points balance from backend API
   * Endpoint: GET /api/user
   * HTTP Method: GET
   * Authentication: Bearer <token>
   * Response fields: data.points
   * @param {string} explicitToken - Optional Bearer auth token
   * @returns {Promise<number>} Points balance as a number
   */
  async getUserPoints(explicitToken = null) {
    const profile = await this.getUserProfile(explicitToken)
    if (profile && typeof profile === 'object') {
      const rawPoints =
        profile.points !== undefined
          ? profile.points
          : profile.data?.points !== undefined
          ? profile.data.points
          : 0
      const num = Number(rawPoints)
      return isNaN(num) ? 0 : num
    }
    return 0
  },

  /**
   * Update student profile
   * Endpoint: PUT /api/student/profile/update
   */
  async updateStudentProfile(profileData, explicitToken = null) {
    const token = explicitToken || this.getToken()
    if (!token) {
      throw new Error('Authentication required. Please log in again.')
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/student/profile/update`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      })
    } catch (networkError) {
      throw new Error('Unable to connect to the Edoomate server. Please check your network connection.')
    }

    const data = await response.json().catch(() => null)

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session has expired. Please log in again.')
    }

    if (response.status === 422) {
      if (data?.errors && typeof data.errors === 'object') {
        const msgs = Object.values(data.errors).flat().join(' ')
        throw new Error(msgs || data.message || 'Validation error while updating profile.')
      }
      throw new Error(data?.message || 'Validation error while updating profile.')
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(data?.message || `Failed to update profile (HTTP ${response.status}).`)
    }

    // Sync updated data with local session
    if (data?.data) {
      const existingUser = this.getUser() || {}
      const mergedUser = {
        ...existingUser,
        ...data.data,
        full_name: `${data.data.first_name || ''} ${data.data.last_name || ''}`.trim() || existingUser.full_name,
      }
      this.saveSession(token, mergedUser)
    }

    return data
  },

  /**
   * Change student password
   * Endpoint: POST /api/student/change-password
   * Request fields: current_password, new_password, confirm_password
   */
  async changePassword({ current_password, new_password, confirm_password }, explicitToken = null) {
    const token = explicitToken || this.getToken()
    if (!token) {
      throw new Error('Authentication required. Please log in again.')
    }

    if (!current_password) {
      throw new Error('Please enter your current password.')
    }
    if (!new_password) {
      throw new Error('Please enter a new password.')
    }
    if (new_password.length < 6) {
      throw new Error('New password must be at least 6 characters.')
    }
    if (new_password !== confirm_password) {
      throw new Error('The confirm password field must match new password.')
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/student/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password,
          new_password,
          confirm_password,
        }),
      })
    } catch (networkError) {
      throw new Error('Unable to connect to the Edoomate server. Please check your network connection.')
    }

    const data = await response.json().catch(() => null)

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session has expired. Please log in again.')
    }

    if (response.status === 400) {
      throw new Error(data?.message || 'Current password does not match.')
    }

    if (response.status === 422) {
      if (data?.errors && typeof data.errors === 'object') {
        const msgs = Object.values(data.errors).flat().join(' ')
        throw new Error(msgs || data.message || 'Validation error.')
      }
      throw new Error(data?.message || 'Validation error.')
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(data?.message || `Failed to change password (HTTP ${response.status}).`)
    }

    return data
  },

  /**
   * Helper: Retrieve available grades dictionary
   * Endpoint: GET /api/grades
   */
  async getGrades(explicitToken = null) {
    const token = explicitToken || this.getToken()
    try {
      const response = await fetch(`${API_BASE_URL}/grades`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      })
      if (!response.ok) return null
      const data = await response.json()
      return data?.data || null
    } catch {
      return null
    }
  },

  /**
   * Helper: Retrieve available schools list from backend API
   * Endpoint: GET /api/schools
   * @param {string} explicitToken - Optional Bearer auth token
   * @returns {Promise<Array<{ id: number|string, name: string }>>} List of schools
   */
  async getSchools(explicitToken = null) {
    const token = explicitToken || this.getToken()
    const headers = {
      'Accept': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    let response
    try {
      response = await fetch(`${API_BASE_URL}/schools`, {
        method: 'GET',
        headers,
      })
    } catch {
      throw new Error('Unable to connect to the Edoomate server to load schools.')
    }

    if (!response.ok) {
      let errorMsg = `Server returned status ${response.status}.`
      try {
        const errorData = await response.json()
        if (errorData?.message) errorMsg = errorData.message
      } catch {}
      throw new Error(errorMsg)
    }

    const data = await response.json()
    if (data && Array.isArray(data.data)) {
      return data.data
    }
    if (Array.isArray(data)) {
      return data
    }
    return []
  },

  /**
   * Fetch account deletion reasons list from backend
   * Endpoint: GET /api/student/deletion-reasons
   * @param {string} [explicitToken] - Optional Bearer auth token
   * @returns {Promise<Array>} Array of deletion reason objects
   */
  async getDeletionReasons(explicitToken = null) {
    const token = explicitToken || this.getToken()
    const headers = { 'Accept': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await fetch(`${API_BASE_URL}/student/deletion-reasons`, {
        method: 'GET',
        headers,
      })
      if (!response.ok) {
        return null
      }
      const data = await response.json().catch(() => null)
      if (data && (data.success !== false && data.status !== false)) {
        return data.data || data.reasons || data
      }
      return null
    } catch {
      return null
    }
  },

  /**
   * Delete student account permanently
   * Step 1: POST /api/student/delete-account with deletion_reason ID
   * Step 2: POST /api/student/verify-delete-otp with verification OTP to permanently deactivate/delete
   * @param {Object} param0 - { deletion_reason, otp }
   * @param {string} explicitToken - Optional Bearer auth token
   * @returns {Promise<Object>} API response object
   */
  async deleteAccount({ deletion_reason, otp = null }, explicitToken = null) {
    const token = explicitToken || this.getToken()
    if (!token) {
      throw new Error('Authentication required. Please log in again.')
    }

    if (deletion_reason === undefined || deletion_reason === null || deletion_reason === '') {
      throw new Error('Please specify a reason for deleting your account.')
    }

    // Backend validates deletion_reason against the integer IDs from GET /api/student/deletion-reasons
    const reasonValue = !isNaN(Number(deletion_reason)) ? Number(deletion_reason) : deletion_reason
    const currentUser = this.getUser()
    const userEmail = currentUser?.email || ''

    let response
    try {
      response = await fetch(`${API_BASE_URL}/student/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deletion_reason: reasonValue }),
      })
    } catch (networkError) {
      throw new Error('Unable to connect to the Edoomate server. Please check your network connection.')
    }

    const data = await response.json().catch(() => null)

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session has expired. Please log in again.')
    }

    if (response.status === 422) {
      if (data?.errors && typeof data.errors === 'object') {
        const msgs = Object.values(data.errors).flat().join(' ')
        throw new Error(msgs || data.message || 'Validation error while deleting account.')
      }
      throw new Error(data?.message || 'Validation error while deleting account.')
    }

    if (!response.ok || (data && data.success === false)) {
      let msg = data?.message || data?.error || `Failed to delete account (HTTP ${response.status}).`
      if (data?.errors && typeof data.errors === 'object') {
        msg = Object.values(data.errors).flat().join(' ')
      }
      throw new Error(msg)
    }

    // Determine OTP: either returned directly in response payload or provided by caller
    const receivedOtp = otp || data?.data?.otp
    const targetEmail = data?.data?.email || userEmail

    if (!receivedOtp) {
      return {
        requires_otp: true,
        email: targetEmail,
        message: data?.message || 'Verification OTP has been sent to your email.',
      }
    }

    // Finalize deletion with verify-delete-otp
    return await this.verifyDeleteOtp({ otp: receivedOtp, email: targetEmail }, token)
  },

  /**
   * Finalize account deletion via POST /api/student/verify-delete-otp
   * @param {Object} param0 - { otp, email }
   * @param {string} explicitToken - Optional Bearer auth token
   * @returns {Promise<Object>} API response object
   */
  async verifyDeleteOtp({ otp, email }, explicitToken = null) {
    const token = explicitToken || this.getToken()
    if (!token) {
      throw new Error('Authentication required. Please log in again.')
    }

    const cleanOtp = String(otp || '').trim()
    if (!cleanOtp) {
      throw new Error('Please enter the deletion verification OTP.')
    }

    const currentUser = this.getUser()
    const targetEmail = (email || currentUser?.email || '').trim().toLowerCase()

    let response
    try {
      response = await fetch(`${API_BASE_URL}/student/verify-delete-otp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          otp: cleanOtp,
          OTP: cleanOtp,
          email: targetEmail,
          username: targetEmail,
        }),
      })
    } catch {
      throw new Error('Unable to connect to the Edoomate server. Please check your network connection.')
    }

    const data = await response.json().catch(() => null)

    if (!response.ok || (data && data.success === false)) {
      throw new Error(data?.message || 'Failed to verify deletion OTP.')
    }

    // Record in deleted accounts registry
    if (targetEmail) {
      this.recordDeletedAccount(targetEmail)
    }

    // Revoke token and clear session
    await this.logout()

    return {
      success: true,
      message: data?.message || 'Your account has been successfully deleted/deactivated.',
    }
  },
}

