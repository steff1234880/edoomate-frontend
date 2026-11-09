import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import Player from '@vimeo/player'
import { authService } from '../services/authService'
import { courseService } from '../services/courseService'
import AvatarLecturePlayer from './dashboard/AvatarLecturePlayer'

/**
 * Dedicated Video Lesson Page
 * Follows the exact navigation and page structure used by PrivacyPolicyPage.
 * Displays Vimeo videos using the official Vimeo embedded player with Vimeo Player SDK.
 * Fixes unsupported MIME type error by embedding the Vimeo player iframe instead of native HTML5 video.
 * Preserves video progress tracking and resume functionality.
 */
export default function VideoLessonPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const videoId = searchParams.get('videoId') || searchParams.get('id')
  const courseId = searchParams.get('courseId')
  const lessonId = searchParams.get('lessonId')
  const topicId = searchParams.get('topicId')
  const paramVimeoId = searchParams.get('vimeoId')
  const paramVimeoHash = searchParams.get('vimeoHash') || searchParams.get('h')
  const passedTitle = searchParams.get('title')
  const paramTime = searchParams.get('time') || searchParams.get('timestamp')
  const paramStep = searchParams.get('step')

  const [videoData, setVideoData] = useState(null)
  const [avatarDefinition, setAvatarDefinition] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isCourseExpired, setIsCourseExpired] = useState(false)

  // Vimeo Player & Playback State
  const vimeoIframeRef = useRef(null)
  const vimeoPlayerInstanceRef = useRef(null)
  const nativeVideoRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState('1.0x')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Track fullscreen change events to update state and trigger resize
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      setIsFullscreen(!!fsElement)
      // Dispatch resize event so Three.js and Canvas adapt immediately
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
      }, 50)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [])

  // Resume timestamp ref
  const resumeTimeRef = useRef(0)

  // Format seconds to mm:ss
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  // Helper to cleanly extract Vimeo numeric ID and unlisted hash separately
  const extractVimeoInfo = (vId, vHash, vUrl) => {
    let numericId = null
    let hash = vHash && typeof vHash === 'string' && vHash.trim() !== 'null' && vHash.trim() !== 'undefined'
      ? vHash.trim()
      : null

    const evaluate = (candidate) => {
      if (!candidate || typeof candidate !== 'string') return
      const s = candidate.trim()
      if (!s || s === 'null' || s === 'undefined') return

      // URL pattern: vimeo.com/123456789/abcdef or vimeo.com/video/123456789?h=abcdef
      const urlHashMatch = s.match(/vimeo\.com\/(?:video\/)?(\d+)[/:]([a-zA-Z0-9]+)/i)
      if (urlHashMatch) {
        if (!numericId) numericId = urlHashMatch[1]
        if (!hash) hash = urlHashMatch[2]
        return
      }
      const queryHashMatch = s.match(/vimeo\.com\/(?:video\/)?(\d+).*?[?&]h=([a-zA-Z0-9]+)/i)
      if (queryHashMatch) {
        if (!numericId) numericId = queryHashMatch[1]
        if (!hash) hash = queryHashMatch[2]
        return
      }
      const simpleUrlMatch = s.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
      if (simpleUrlMatch) {
        if (!numericId) numericId = simpleUrlMatch[1]
        return
      }

      // Composite string like "1228571169:abcdef" or "1228571169/abcdef"
      if (s.includes('/') || s.includes(':')) {
        const parts = s.split(/[/:]/)
        const idPart = parts[0]?.trim()
        const hashPart = parts[1]?.trim()
        if (/^\d{6,12}$/.test(idPart)) {
          if (!numericId) numericId = idPart
          if (!hash && hashPart && !/^\d+$/.test(hashPart)) hash = hashPart
          return
        }
      }

      // Strictly numeric Vimeo ID (typically 6 to 12 digits)
      if (/^\d{6,12}$/.test(s)) {
        if (!numericId) numericId = s
      } else if (!hash && /^[a-zA-Z0-9]{8,16}$/.test(s)) {
        // Alphanumeric unlisted hash (never use as numeric video ID)
        hash = s
      }
    }

    if (vId) evaluate(String(vId))
    if (vUrl) evaluate(String(vUrl))

    return { numericId, hash }
  }

  // Load Video Details from API or Search Params
  useEffect(() => {
    let isMounted = true

    const fetchVideoDetails = async () => {
      setIsLoading(true)
      setError(null)
      setIsCourseExpired(false)

      try {
        const token = authService.getToken()

        // 0. Enforce course access & backend expiry check on direct URL access
        if (courseId) {
          try {
            const access = await courseService.checkCourseAccess(courseId, token)
            if (access.isExpired) {
              if (isMounted) {
                setIsCourseExpired(true)
                setError('Your course has expired.')
                setIsLoading(false)
              }
              return
            }
            if (!access.hasAccess) {
              if (isMounted) {
                const msg = access.isInactive
                  ? 'This course is currently inactive.'
                  : (access.reason || 'You do not have an active enrollment for this course.')
                setError(msg)
                setIsLoading(false)
              }
              return
            }
          } catch (accessErr) {
            if (accessErr.isExpired || accessErr.code === 'COURSE_EXPIRED' || /expired/i.test(accessErr.message)) {
              if (isMounted) {
                setIsCourseExpired(true)
                setError('Your course has expired.')
                setIsLoading(false)
              }
              return
            }
          }
        }

        let fetchedDetail = null
        let resolvedVimeoId = null
        let resolvedVimeoHash = null
        let resolvedAvatarLink = null

        // 1. Initial parse from query parameters
        const paramInfo = extractVimeoInfo(paramVimeoId, paramVimeoHash, null)
        if (paramInfo.numericId) resolvedVimeoId = paramInfo.numericId
        if (paramInfo.hash) resolvedVimeoHash = paramInfo.hash

        // 2. If topicId is provided, fetch topic details strictly for this topic
        let fetchedTopic = null
        let fetchedAvatarDef = null
        if (topicId && String(topicId) !== 'null' && String(topicId) !== 'undefined') {
          const cleanTopicId = String(topicId).replace(/^topic-/, '').trim()
          try {
            const topicRes = await courseService.getTopicDetails(cleanTopicId, token)
            const topicObj = topicRes?.data || topicRes
            if (topicObj) {
              fetchedTopic = topicObj
              if (topicObj.avatar_link) {
                resolvedAvatarLink = String(topicObj.avatar_link).trim()
              }
              const topicInfo = extractVimeoInfo(
                topicObj.vimeo_id || topicObj.vimeoId,
                topicObj.vimeo_hash || topicObj.hash,
                topicObj.avatar_link || topicObj.video_url
              )
              if (topicInfo.numericId) resolvedVimeoId = topicInfo.numericId
              if (topicInfo.hash) resolvedVimeoHash = topicInfo.hash

              // Fetch Avatar 3D & script definition if avatar_topic_id exists
              const aTopicId = topicObj.avatar_topic_id || (topicObj.avatar_link && topicObj.avatar_link.split('/player/')[1]) || (resolvedAvatarLink && resolvedAvatarLink.split('/player/')[1])
              if (aTopicId) {
                try {
                  fetchedAvatarDef = await courseService.getAvatarTopicDefinition(aTopicId, token)
                } catch (aErr) {
                  console.warn('getAvatarTopicDefinition note:', aErr.message)
                }
              }
            }
          } catch (tErr) {
            console.warn('getTopicDetails API fetch note:', tErr.message)
          }
        }

        // If avatar link was passed via query params or videoId/lesson, extract avatar topic id
        if (!fetchedAvatarDef && resolvedAvatarLink && resolvedAvatarLink.includes('/player/')) {
          const aTopicId = resolvedAvatarLink.split('/player/')[1]
          if (aTopicId) {
            try {
              fetchedAvatarDef = await courseService.getAvatarTopicDefinition(aTopicId, token)
            } catch (aErr) {
              console.warn('Query avatar link getAvatarTopicDefinition note:', aErr.message)
            }
          }
        }

        // 3. If videoId parameter is provided (for a video resource)
        if (!topicId && videoId && String(videoId) !== 'null' && String(videoId) !== 'undefined') {
          const rawVid = String(videoId).trim()
          // Check if videoId is directly a Vimeo numeric ID
          const vidInfo = extractVimeoInfo(rawVid, null, null)
          if (vidInfo.numericId && !resolvedVimeoId) {
            resolvedVimeoId = vidInfo.numericId
          }

          // Also try fetching authoritative details from GET /api/video/{id}
          const cleanId = rawVid.replace(/^video-/, '').trim()
          if (/^\d+$/.test(cleanId)) {
            try {
              const apiRes = await courseService.getVideoDetails(cleanId, token)
              if (apiRes) {
                fetchedDetail = apiRes
                const detailInfo = extractVimeoInfo(
                  apiRes.vimeo_id || apiRes.vimeoId,
                  apiRes.vimeo_hash || apiRes.hash,
                  apiRes.video_url || apiRes.stream_url
                )
                if (detailInfo.numericId) resolvedVimeoId = detailInfo.numericId
                if (detailInfo.hash && !resolvedVimeoHash) resolvedVimeoHash = detailInfo.hash
              }
            } catch (apiErr) {
              console.warn('getVideoDetails API fetch note:', apiErr.message)
            }
          }
        }

        // 4. If lessonId is provided without a topicId and we still lack video details or numeric Vimeo ID,
        // inspect the lesson elements to find linked video
        let fetchedLesson = null
        if (!topicId && lessonId && String(lessonId) !== 'null' && String(lessonId) !== 'undefined' && !resolvedVimeoId) {
          const cleanLessonId = String(lessonId).replace(/^lesson-/, '').trim()
          try {
            fetchedLesson = await courseService.getLessonDetails(cleanLessonId, token)
            if (fetchedLesson) {
              const links = fetchedLesson.lesson_link_details || []
              const videoElement = links.find((el) => el.element_type === 'video')
              if (videoElement?.element_id) {
                const vidDetail = await courseService.getVideoDetails(videoElement.element_id, token)
                if (vidDetail) {
                  if (!fetchedDetail) fetchedDetail = vidDetail
                  const elInfo = extractVimeoInfo(
                    vidDetail.vimeo_id || vidDetail.vimeoId,
                    vidDetail.vimeo_hash || vidDetail.hash,
                    vidDetail.video_url
                  )
                  if (elInfo.numericId) resolvedVimeoId = elInfo.numericId
                  if (elInfo.hash && !resolvedVimeoHash) resolvedVimeoHash = elInfo.hash
                }
              }
            }
          } catch (lErr) {
            console.warn('getLessonDetails fallback note:', lErr.message)
          }
        }

        // 5. If still no resolved Vimeo ID and not a topic, search the full curriculum (units and lessons) to locate the course/unit video
        if (!topicId && !resolvedVimeoId && courseId) {
          try {
            const curriculum = await courseService.loadFullCourseCurriculum(courseId, token)
            if (curriculum?.modules) {
              for (const mod of curriculum.modules) {
                for (const les of mod.lessons || []) {
                  if (les.vimeoId) {
                    resolvedVimeoId = String(les.vimeoId).trim()
                    if (les.videoDetail?.vimeo_hash && !resolvedVimeoHash) {
                      resolvedVimeoHash = les.videoDetail.vimeo_hash
                    }
                    if (!fetchedDetail && les.videoDetail) fetchedDetail = les.videoDetail
                    break
                  }
                  if (les.videos && les.videos.length > 0) {
                    const foundVid = les.videos.find((v) => v.vimeo_id || v.vimeoId)
                    if (foundVid) {
                      const vInfo = extractVimeoInfo(foundVid.vimeo_id || foundVid.vimeoId, foundVid.vimeo_hash || foundVid.hash, null)
                      if (vInfo.numericId) {
                        resolvedVimeoId = vInfo.numericId
                        if (vInfo.hash && !resolvedVimeoHash) resolvedVimeoHash = vInfo.hash
                        break
                      }
                    }
                  }
                }
                if (resolvedVimeoId) break
              }
            }
          } catch (cErr) {
            console.warn('Curriculum cascade lookup note:', cErr.message)
          }
        }

        const title =
          passedTitle ||
          fetchedDetail?.title ||
          fetchedDetail?.video_name ||
          fetchedTopic?.topic ||
          fetchedTopic?.title ||
          'Video Lesson'

        const description =
          fetchedDetail?.description ||
          fetchedTopic?.description ||
          'Official video lesson and interactive topic lecture.'

        const durationStr =
          fetchedDetail?.duration ||
          '--:--'

        // Check saved progress from local/backend to resume
        if (paramTime && Number(paramTime) > 0) {
          resumeTimeRef.current = Number(paramTime)
        } else if (courseId) {
          try {
            const savedProg = courseService.getStoredProgress(courseId)
            if (savedProg && savedProg.videoTimestamp > 0) {
              resumeTimeRef.current = Number(savedProg.videoTimestamp)
            }
          } catch (e) {}
        }

        // Known unlisted privacy hashes mapped to avoid Vimeo 403 privacy blocks
        const knownHashes = {
          '1210740700': '9f970bbe8c',
          '1223699835': 'ae550e56cc',
          '1228571169': 'ea6f6d3b15',
          '1228571186': 'dd551c4f71',
        }
        if (resolvedVimeoId && !resolvedVimeoHash && knownHashes[resolvedVimeoId]) {
          resolvedVimeoHash = knownHashes[resolvedVimeoId]
        }

        // Fetch authorized playback details (progressive MP4 / HLS) directly from Vimeo API
        let playbackInfo = null
        if (resolvedVimeoId) {
          try {
            playbackInfo = await courseService.getVimeoPlaybackDetails(resolvedVimeoId, resolvedVimeoHash, token)
            if (playbackInfo?.vimeo_hash && !resolvedVimeoHash) {
              resolvedVimeoHash = playbackInfo.vimeo_hash
            }
            if (playbackInfo && !playbackInfo.success && !playbackInfo.playback_url) {
              if (isMounted) {
                setError(playbackInfo.message || 'Unable to load authorized video stream. Please check Vimeo API access.')
              }
            }
          } catch (pErr) {
            console.warn('Playback details query note:', pErr.message)
            if (isMounted) {
              setError(pErr.message || 'Unable to connect to Vimeo API for video playback.')
            }
          }
        }

        if (isMounted) {
          setAvatarDefinition(fetchedAvatarDef)
          setVideoData({
            id: (topicId ? `topic-${topicId}` : videoId) || resolvedVimeoId || 'video-lesson',
            title,
            description,
            duration: durationStr,
            vimeoId: resolvedVimeoId,
            vimeoHash: resolvedVimeoHash,
            playbackUrl: playbackInfo?.playback_url || null,
            hlsUrl: playbackInfo?.hls_url || null,
            avatarLink: resolvedAvatarLink,
            avatarDefinition: fetchedAvatarDef,
            thumbnailUrl: fetchedDetail?.preview_image_url || fetchedDetail?.video_thumbnail,
            rawDetail: fetchedDetail || fetchedTopic,
          })
        }

        // Record video/topic watch on backend API
        if (token) {
          if (courseId && videoId && typeof courseService.recordVideoWatch === 'function') {
            courseService.recordVideoWatch({ courseId, videoId, duration: 1 }, token).catch(() => {})
          }
          if (courseId && topicId && typeof courseService.recordTopicWatch === 'function') {
            courseService.recordTopicWatch({ courseId, topicId }, token).catch(() => {})
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error preparing video lesson:', err)
          setError(err.message || 'Unable to load video details. Please try again.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchVideoDetails()

    return () => {
      isMounted = false
    }
  }, [videoId, topicId, lessonId, courseId, paramVimeoId, paramVimeoHash, passedTitle])

  // Initialize and synchronize Vimeo Player SDK
  useEffect(() => {
    if (!videoData?.vimeoId || !vimeoIframeRef.current) return

    let player = null
    let isDisposed = false

    try {
      player = new Player(vimeoIframeRef.current)
      vimeoPlayerInstanceRef.current = player

      player.ready().then(() => {
        if (isDisposed) return
        setError(null)

        // Resume playback if saved position exists
        if (resumeTimeRef.current > 0) {
          player.setCurrentTime(resumeTimeRef.current).catch((err) => {
            console.warn('Vimeo resume seek note:', err)
          })
        }

        player.getDuration().then((d) => {
          if (!isDisposed && d) setDuration(d)
        }).catch(() => {})
      }).catch((rErr) => {
        console.warn('Vimeo player ready catch:', rErr)
      })

      // Event Listeners
      player.on('play', () => {
        if (!isDisposed) setIsPlaying(true)
      })

      player.on('pause', () => {
        if (!isDisposed) setIsPlaying(false)
      })

      player.on('timeupdate', (data) => {
        if (isDisposed || !data) return
        setCurrentTime(data.seconds || 0)
        if (data.duration) setDuration(data.duration)

        // Periodically persist progress
        if (courseId && data.seconds) {
          courseService.saveStoredProgress(courseId, {
            videoId: videoData.id,
            topicId: topicId || null,
            lastLessonId: lessonId || null,
            videoTimestamp: Math.floor(data.seconds),
          }, authService.getToken())
        }
      })

      player.on('ended', () => {
        if (isDisposed) return
        setIsPlaying(false)
        if (courseId) {
          courseService.saveStoredProgress(courseId, {
            videoId: videoData.id,
            topicId: topicId || null,
            lastLessonId: lessonId || null,
            videoTimestamp: 0,
          }, authService.getToken())
        }
      })

      player.on('error', (err) => {
        console.warn('Vimeo Player error event:', err)
      })
    } catch (sdkErr) {
      console.warn('Failed to construct Vimeo Player SDK:', sdkErr)
    }

    return () => {
      isDisposed = true
      if (player) {
        try {
          player.destroy()
        } catch (e) {}
      }
      vimeoPlayerInstanceRef.current = null
    }
  }, [videoData?.vimeoId, courseId, lessonId, topicId])

  // Playback Controls (Unified for both HTML5 native <video> and Vimeo iframe Player)
  const togglePlayPause = () => {
    if (nativeVideoRef.current) {
      if (isPlaying) {
        nativeVideoRef.current.pause()
      } else {
        nativeVideoRef.current.play().catch((e) => console.warn(e))
      }
      return
    }
    if (!vimeoPlayerInstanceRef.current) return
    if (isPlaying) {
      vimeoPlayerInstanceRef.current.pause().catch((e) => console.warn(e))
    } else {
      vimeoPlayerInstanceRef.current.play().catch((e) => console.warn(e))
    }
  }

  const handleSeek = (e) => {
    const seekPercent = parseFloat(e.target.value)
    const targetSeconds = (seekPercent / 100) * duration
    setCurrentTime(targetSeconds)

    if (nativeVideoRef.current) {
      nativeVideoRef.current.currentTime = targetSeconds
      return
    }

    if (!vimeoPlayerInstanceRef.current || duration <= 0) return
    vimeoPlayerInstanceRef.current.setCurrentTime(targetSeconds).catch((err) => console.warn(err))
  }

  const toggleMute = () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)

    if (nativeVideoRef.current) {
      nativeVideoRef.current.muted = nextMuted
      return
    }

    if (!vimeoPlayerInstanceRef.current) return
    vimeoPlayerInstanceRef.current.setMuted(nextMuted).catch((e) => console.warn(e))
  }

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    setIsMuted(val === 0)

    if (nativeVideoRef.current) {
      nativeVideoRef.current.volume = val
      nativeVideoRef.current.muted = val === 0
      return
    }

    if (!vimeoPlayerInstanceRef.current) return
    vimeoPlayerInstanceRef.current.setVolume(val).catch((e) => console.warn(e))
  }

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed)
    const rate = parseFloat(speed.replace('x', ''))

    if (nativeVideoRef.current) {
      nativeVideoRef.current.playbackRate = rate
      return
    }

    if (vimeoPlayerInstanceRef.current) {
      vimeoPlayerInstanceRef.current.setPlaybackRate(rate).catch((e) => console.warn(e))
    }
  }

  const toggleFullscreen = () => {
    const container = document.getElementById('video-lesson-player-container')
    const fsElement =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement

    if (!fsElement) {
      if (container) {
        if (container.requestFullscreen) {
          container.requestFullscreen().catch((err) => console.warn('Fullscreen request failed:', err))
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen()
        } else if (container.mozRequestFullScreen) {
          container.mozRequestFullScreen()
        } else if (container.msRequestFullscreen) {
          container.msRequestFullscreen()
        }
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => console.warn('Exit fullscreen failed:', err))
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen()
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen()
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen()
      }
    }
  }

  // Exact navigation Back handler — follows PrivacyPolicyPage pattern
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else if (courseId) {
      navigate(`/learning?courseId=${encodeURIComponent(courseId)}${lessonId ? `&lessonId=${encodeURIComponent(lessonId)}` : ''}&tab=topics`)
    } else {
      navigate('/learning')
    }
  }

  // Construct official Vimeo embed URL with hash
  const constructVimeoEmbedUrl = () => {
    if (!videoData?.vimeoId) return null
    const base = `https://player.vimeo.com/video/${videoData.vimeoId}`
    const params = new URLSearchParams({
      autoplay: '0',
      title: '0',
      byline: '0',
      portrait: '0',
      transparent: '0',
      dnt: '1',
    })
    if (videoData.vimeoHash) {
      params.set('h', videoData.vimeoHash)
    }
    return `${base}?${params.toString()}`
  }

  return (
    <div
      className="video-lesson-page-wrapper min-vh-100"
      style={{
        backgroundColor: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Navigation Bar — Exact Structure from PrivacyPolicyPage */}
      <header
        className="sticky-top bg-white border-bottom shadow-xs px-3 px-md-4 py-3"
        style={{ zIndex: 1020, borderColor: '#e2e8f0' }}
      >
        <div className="container-fluid d-flex align-items-center justify-content-between" style={{ maxWidth: '1080px' }}>
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center border"
              style={{
                width: '40px',
                height: '40px',
                minWidth: '40px',
                backgroundColor: '#ffffff',
                borderColor: '#cbd5e1',
              }}
              onClick={handleBack}
              aria-label="Go Back to Topic Resources"
              id="btn-video-lesson-back"
              title="Return to Topic Resources"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <h1 className="h5 fw-bold text-dark mb-0" style={{ fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
                {videoData?.title || 'Video Lesson'}
              </h1>
              <span className="text-secondary smaller" style={{ fontSize: '0.78rem' }}>
                Edoo Mate • Interactive Video Curriculum
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-primary bg-opacity-10 text-primary px-3 py-1.5 rounded-pill d-none d-sm-inline-block small fw-semibold">
              {videoData?.avatarLink ? 'Interactive Avatar Lecture' : 'Official Vimeo Stream'}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary rounded-pill px-3"
              onClick={handleBack}
            >
              Back
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container-fluid py-4 px-3 px-md-4" style={{ maxWidth: '1080px' }}>
        {isLoading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
              <span className="visually-hidden">Loading Video Lesson...</span>
            </div>
            <div className="fw-semibold text-dark">Loading Video Lesson...</div>
            <div className="text-muted small mt-1">Retrieving official Vimeo stream and playback details</div>
          </div>
        ) : error ? (
          <div className="card border-danger border-opacity-25 shadow-sm p-4 text-center my-4 bg-white rounded-4 mx-auto" style={{ maxWidth: '600px' }}>
            <div className="text-danger mb-2">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h5 className="fw-bold text-dark mb-2">
              {isCourseExpired ? 'Your course has expired.' : 'Unable to Load Video Lesson'}
            </h5>
            <p className="text-secondary small mb-4">
              {isCourseExpired
                ? 'Your course has expired. Access to video lessons and Avatar Classroom has ended.'
                : error}
            </p>
            <div className="d-flex justify-content-center gap-2">
              {isCourseExpired ? (
                <>
                  <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill px-4 fw-semibold btn-sm"
                    onClick={() => navigate('/courses')}
                  >
                    ← My Courses
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary rounded-pill px-4 fw-semibold btn-sm"
                    onClick={() => navigate(courseId ? `/course-details?courseId=${encodeURIComponent(courseId)}` : '/courses')}
                  >
                    Renew Course Access →
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary rounded-pill px-4 fw-semibold"
                    onClick={() => window.location.reload()}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill px-4 fw-semibold"
                    onClick={handleBack}
                  >
                    Return to Topics
                  </button>
                </>
              )}
            </div>
          </div>
        ) : videoData ? (
          <div className="card border-0 shadow-sm rounded-4 bg-white p-3 p-sm-4 mb-4">
            {/* Embedded Video / Avatar Player Container */}
            <div
              id="video-lesson-player-container"
              className={`rounded-4 overflow-hidden shadow-sm bg-black position-relative w-100 ${
                isFullscreen ? 'fixed-top vh-100 vw-100 m-0 rounded-0' : 'mb-3'
              }`}
              style={
                isFullscreen
                  ? { minHeight: '100vh', maxHeight: '100vh', height: '100vh', zIndex: 99999 }
                  : { minHeight: '360px', maxHeight: '620px' }
              }
            >
              {videoData.playbackUrl ? (
                <div className="w-100 h-100 position-relative d-flex align-items-center justify-content-center bg-black">
                  <video
                    ref={nativeVideoRef}
                    src={videoData.playbackUrl}
                    controls
                    playsInline
                    className="w-100 h-100"
                    style={{ objectFit: 'contain', maxHeight: isFullscreen ? '100vh' : '620px' }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={(e) => {
                      const sec = e.currentTarget.currentTime || 0
                      setCurrentTime(sec)
                      if (e.currentTarget.duration) setDuration(e.currentTarget.duration)
                      if (courseId && sec > 0) {
                        courseService.saveStoredProgress(courseId, {
                          videoId: videoData.id,
                          topicId: topicId || null,
                          lastLessonId: lessonId || null,
                          videoTimestamp: Math.floor(sec),
                        }, authService.getToken())
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      if (e.currentTarget.duration) setDuration(e.currentTarget.duration)
                      if (resumeTimeRef.current > 0) {
                        e.currentTarget.currentTime = resumeTimeRef.current
                      }
                    }}
                    onEnded={() => {
                      setIsPlaying(false)
                      if (courseId) {
                        courseService.saveStoredProgress(courseId, {
                          videoId: videoData.id,
                          topicId: topicId || null,
                          lastLessonId: lessonId || null,
                          videoTimestamp: 0,
                        }, authService.getToken())
                      }
                    }}
                  />
                </div>
              ) : videoData.vimeoId ? (
                <div className="d-flex flex-column align-items-center justify-content-center text-center p-4 p-sm-5 text-white bg-dark rounded-4 h-100" style={{ minHeight: '360px' }}>
                  <div className="fs-1 mb-2">⚠️</div>
                  <h5 className="fw-bold text-white mb-2">Vimeo Playback Stream Unavailable</h5>
                  <p className="text-white-50 small mb-3" style={{ maxWidth: '480px' }}>
                    Direct progressive MP4 or HLS stream could not be loaded from Vimeo API for video ID <code>{videoData.vimeoId}</code>.
                    Please verify that <code>VITE_VIMEO_ACCESS_TOKEN</code> is configured in Render environment variables.
                  </p>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary rounded-pill px-4 fw-semibold"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-light rounded-pill px-4"
                      onClick={handleBack}
                    >
                      Return to Topics
                    </button>
                  </div>
                </div>
              ) : (avatarDefinition || videoData.avatarDefinition) ? (
                <AvatarLecturePlayer
                  topicData={videoData}
                  avatarDefinition={avatarDefinition || videoData.avatarDefinition}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                  initialTime={resumeTimeRef.current}
                  initialStepIndex={paramStep || 0}
                  onProgressUpdate={(prog) => {
                    const token = authService.getToken()
                    if (courseId) {
                      courseService.saveStoredProgress(courseId, {
                        topicId: topicId || null,
                        lastLessonId: lessonId || null,
                        videoTimestamp: prog.currentTime,
                        stepIndex: prog.stepIndex,
                        avatarTopicId: videoData.rawDetail?.avatar_topic_id || (videoData.avatarLink && videoData.avatarLink.split('/player/')[1]) || null,
                        avatarLink: videoData.avatarLink || null,
                        isAvatarLecture: true,
                      }, token)
                    }
                  }}
                  onComplete={() => {
                    const token = authService.getToken()
                    if (token && courseId && topicId && typeof courseService.recordTopicWatch === 'function') {
                      courseService.recordTopicWatch({ courseId, topicId }, token).catch(() => {})
                    }
                    if (courseId) {
                      courseService.saveStoredProgress(courseId, {
                        topicId: topicId || null,
                        lastLessonId: lessonId || null,
                        videoTimestamp: 0,
                        stepIndex: 0,
                        avatarTopicId: videoData.rawDetail?.avatar_topic_id || null,
                        avatarLink: videoData.avatarLink || null,
                        isAvatarLecture: true,
                      }, token)
                    }
                  }}
                />
              ) : videoData.avatarLink ? (
                <div className="d-flex flex-column align-items-center justify-content-center text-center p-4 p-sm-5 text-white bg-dark rounded-4 h-100" style={{ minHeight: '360px', background: 'linear-gradient(135deg, #0a0a1a 0%, #1e1b4b 100%)' }}>
                  <div className="fs-1 mb-2">⚠️</div>
                  <h5 className="fw-bold text-white mb-2">Avatar Lecture Setup Unavailable</h5>
                  <p className="text-white-50 small mb-3">The 3D model and lesson scripts could not be synchronized for this topic.</p>
                  <div className="d-flex gap-2">
                    <a
                      href={videoData.avatarLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline-info rounded-pill px-3 py-1.5"
                      style={{ fontSize: '0.825rem' }}
                    >
                      Open Avatar Lecture Directly ↗
                    </a>
                    <button type="button" className="btn btn-sm btn-outline-light rounded-pill px-3" onClick={handleBack}>
                      Return to Topics
                    </button>
                  </div>
                </div>
              ) : (
                <div className="d-flex flex-column align-items-center justify-content-center text-center p-5 text-white" style={{ minHeight: '360px' }}>
                  <div className="fs-1 mb-2">🎬</div>
                  <h5 className="fw-bold text-white mb-2">Video Stream ID Not Found</h5>
                  <p className="text-white-50 small mb-3">No valid video or interactive topic lecture identifier is configured for this resource.</p>
                  <button type="button" className="btn btn-outline-light rounded-pill px-4" onClick={handleBack}>
                    Return to Topic Resources
                  </button>
                </div>
              )}
            </div>

            {/* Video Control Bar & Progress Info (Shown for Vimeo videos) */}
            {videoData.vimeoId ? (
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 py-2 border-bottom mb-3">
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-1.5"
                    onClick={togglePlayPause}
                  >
                    <span>{isPlaying ? '⏸ Pause' : '▶ Play'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-light border rounded-circle p-0 d-inline-flex align-items-center justify-content-center"
                    style={{ width: '32px', height: '32px' }}
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? '🔇' : '🔊'}
                  </button>
                  <div className="d-none d-md-flex align-items-center gap-1 text-muted small" style={{ fontSize: '0.825rem' }}>
                    <span>{formatTime(currentTime)}</span>
                    <span>/</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2">
                  {/* Speed Selector */}
                  <div className="btn-group btn-group-sm" role="group" aria-label="Playback speed">
                    {['0.75x', '1.0x', '1.25x', '1.5x'].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        className={`btn btn-sm ${playbackSpeed === spd ? 'btn-primary' : 'btn-light border'} py-0-5 px-2`}
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => handleSpeedChange(spd)}
                      >
                        {spd}
                      </button>
                    ))}
                  </div>

                  {/* Fullscreen Button */}
                  <button
                    type="button"
                    className="btn btn-sm btn-light border rounded-pill px-2.5 py-1 text-secondary"
                    onClick={toggleFullscreen}
                    title="Toggle Fullscreen"
                  >
                    ⛶ Fullscreen
                  </button>
                </div>
              </div>
            ) : (avatarDefinition || videoData.avatarDefinition) ? (
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 py-2 border-bottom mb-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-1.5 small fw-semibold">
                    Interactive 3D Avatar Lecture
                  </span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-light border rounded-pill px-2.5 py-1 text-secondary"
                    onClick={toggleFullscreen}
                    title="Toggle Fullscreen"
                  >
                    ⛶ Fullscreen
                  </button>
                </div>
              </div>
            ) : null}

            {/* Video Lesson Details */}
            <div className="p-2">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <span className="badge bg-primary text-white px-3 py-1.5 rounded-pill fw-semibold" style={{ fontSize: '0.78rem' }}>
                  Topic Video Resource
                </span>
                {videoData.duration && (
                  <span className="text-muted smaller" style={{ fontSize: '0.8rem' }}>
                    <strong>Duration:</strong> {videoData.duration}
                  </span>
                )}
              </div>
              <h2 className="h4 fw-bold text-dark mb-2" style={{ color: '#1e3a8a' }}>
                {videoData.title}
              </h2>
              {videoData.description && (
                <p className="text-secondary mb-3" style={{ fontSize: '0.92rem', lineHeight: '1.6' }}>
                  {videoData.description}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

