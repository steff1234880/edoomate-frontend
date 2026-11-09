import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import LoginPage from './components/LoginPage'
import StudentDashboard from './components/StudentDashboard'
import PrivacyPolicyPage from './components/PrivacyPolicyPage'
import TermsConditionsPage from './components/TermsConditionsPage'
import VideoLessonPage from './components/VideoLessonPage'
import { authService } from './services/authService'
import { courseService } from './services/courseService'

/**
 * Route Guard for protected dashboard views
 */
function ProtectedRoute({ children }) {
  const isAuth = authService.isAuthenticated()
  const location = useLocation()

  if (!isAuth) {
    // Save attempted URL to return after login
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  return children
}

/**
 * Public route guard: if user already authenticated, redirect to /dashboard
 */
function PublicOnlyRoute({ children }) {
  const isAuth = authService.isAuthenticated()
  if (isAuth) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  // Backward compatibility: handle legacy hash redirects if user visits with #learning, #dashboard, etc.
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.startsWith('#')) {
      const cleanHash = hash.replace(/^#\/?/, '').split('?')[0]
      const queryString = hash.includes('?') ? '?' + hash.split('?')[1] : ''

      if (['dashboard', 'analytics', 'explore', 'search', 'courses', 'course-details', 'leaderboard', 'achievements', 'profile', 'learning', 'settings', 'notifications', 'profile-setup', 'assessment', 'privacy-policy', 'privacy', 'terms', 'terms-conditions', 'terms-and-conditions', 'video-lesson'].includes(cleanHash)) {
        const targetPath = cleanHash === 'search' ? '/explore' : (cleanHash === 'privacy' ? '/privacy-policy' : (cleanHash === 'terms' || cleanHash === 'terms-conditions' ? '/terms-and-conditions' : `/${cleanHash}`))
        navigate(`${targetPath}${queryString}`, { replace: true })
      } else if (cleanHash === 'login' || cleanHash === 'signup' || cleanHash === 'register') {
        navigate(`/${cleanHash}${queryString}`, { replace: true })
      } else if (cleanHash === 'landing' || cleanHash === '') {
        navigate(`/${queryString}`, { replace: true })
      }
    }
  }, [navigate])

  const handleLoginSuccess = (loginResult) => {
    // Check if there was a redirect query parameter
    const params = new URLSearchParams(location.search)
    const redirectUrl = params.get('redirect')
    if (redirectUrl) {
      navigate(redirectUrl, { replace: true })
    } else if (loginResult?.isNewRegistration) {
      try {
        sessionStorage.setItem('edoomate_is_new_registration', 'true')
      } catch {}
      navigate('/profile-setup', { replace: true, state: { fromRegistration: true } })
    } else {
      navigate('/dashboard', { replace: true })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleLogout = async () => {
    courseService.clearMyLearningCache()
    await authService.logout()
    navigate('/login', { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Determine active view class for root styling
  const getRootClass = () => {
    const path = location.pathname.toLowerCase()
    if (path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/register')) {
      return 'login-active'
    }
    if (path === '/' && !authService.isAuthenticated()) {
      return 'landing-active'
    }
    return 'dashboard-active'
  }

  return (
    <div className={`app-root ${getRootClass()}`}>
      <Routes>
        {/* Landing / Root Route */}
        <Route
          path="/"
          element={
            authService.isAuthenticated() ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LandingPage onNavigateLogin={() => navigate('/login')} />
            )
          }
        />

        {/* Auth Routes */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage
                onBack={() => navigate('/')}
                onLoginSuccess={handleLoginSuccess}
              />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnlyRoute>
              <LoginPage
                onBack={() => navigate('/')}
                onLoginSuccess={handleLoginSuccess}
              />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <LoginPage
                onBack={() => navigate('/')}
                onLoginSuccess={handleLoginSuccess}
              />
            </PublicOnlyRoute>
          }
        />

        {/* Protected Dashboard & Learning Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/course-details"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learning"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/test/:testId"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/test"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/explore"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/achievements"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile-setup"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessment"
          element={
            <ProtectedRoute>
              <StudentDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/video-lesson"
          element={
            <ProtectedRoute>
              <VideoLessonPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/privacy-policy"
          element={<PrivacyPolicyPage />}
        />
        <Route
          path="/privacy"
          element={<Navigate to="/privacy-policy" replace />}
        />
        <Route
          path="/terms-and-conditions"
          element={<TermsConditionsPage />}
        />
        <Route
          path="/terms-conditions"
          element={<TermsConditionsPage />}
        />
        <Route
          path="/terms"
          element={<Navigate to="/terms-and-conditions" replace />}
        />

        {/* Catch-all Fallback */}
        <Route
          path="*"
          element={
            authService.isAuthenticated() ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
      </Routes>
    </div>
  )
}
