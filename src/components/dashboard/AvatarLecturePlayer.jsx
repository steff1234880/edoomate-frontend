import React, { useEffect, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { courseService } from '../../services/courseService.js'

// Module-level model & loader cache to avoid repeated downloading/parsing across step transitions or remounts
let sharedDracoLoader = null
const gltfModelCache = new Map()

function getDracoLoader() {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader()
    sharedDracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
  }
  return sharedDracoLoader
}

/**
 * Optimized Native React Avatar Lecture Renderer
 * - Single Three.js WebGLRenderer & Canvas.
 * - Model caching prevents repeated network downloads and parsing.
 * - Audio time tracking decoupled from React state (refs + direct DOM time updates).
 * - Morph targets and animations updated per frame without triggering React re-renders.
 * - Deep GPU memory and Three.js geometry/material resource disposal.
 */
export default function AvatarLecturePlayer({
  topicData,
  avatarDefinition,
  initialTime = 0,
  initialStepIndex = 0,
  onComplete,
  isFullscreen = false,
  onToggleFullscreen,
  onProgressUpdate,
}) {
  const containerRef = useRef(null)
  const audioRef = useRef(null)
  const timeDisplayRef = useRef(null)

  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    const s = Number(initialStepIndex)
    return !isNaN(s) && s >= 0 ? s : 0
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoadingModel, setIsLoadingModel] = useState(true)
  const [modelError, setModelError] = useState(null)
  const initialSeekDoneRef = useRef(false)

  // Interactive Question Checkpoint & Q&A States
  const [questionInput, setQuestionInput] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [avatarAnswer, setAvatarAnswer] = useState(null)
  const [isAtCheckpoint, setIsAtCheckpoint] = useState(false)
  const [qaCountdown, setQaCountdown] = useState(0)
  const qaCountdownTimerRef = useRef(null)
  const activeAnswerAudioRef = useRef(null)
  const autoSpeechTimerRef = useRef(null)

  // Determine intended scene background image (from topic definition or topic data)
  const rawBgImage =
    avatarDefinition?.topic?.background_image ||
    topicData?.rawDetail?.background_image ||
    topicData?.rawDetail?.background_image_url ||
    topicData?.thumbnailUrl ||
    null

  const bgImageUrl = useMemo(() => {
    if (!rawBgImage) return null
    if (rawBgImage.startsWith('http://') || rawBgImage.startsWith('https://')) {
      return rawBgImage
    }
    return `https://edoomate.myieltspartner.com/storage/topic_background_images/${rawBgImage}`
  }, [rawBgImage])

  const scripts = avatarDefinition?.scripts || []
  const currentScript = scripts[currentStepIndex] || null

  // Fast binary search to find closest blendshape frame in O(log N)
  const searchClosestFrame = (frames, targetTime) => {
    if (!frames || frames.length === 0) return null
    let left = 0
    let right = frames.length - 1
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      if (Math.abs(frames[mid].time - targetTime) <= 0.016) {
        return frames[mid]
      }
      if (frames[mid].time < targetTime) {
        left = mid + 1
      } else {
        right = mid - 1
      }
    }
    const idx = Math.max(0, Math.min(frames.length - 1, left))
    return frames[idx]
  }

  // Three.js instances ref
  const threeRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    model: null,
    mixer: null,
    clock: new THREE.Clock(),
    morphMeshes: [],
    morphDictMap: {},
    animActions: {},
    currentAction: null,
    animFrameId: null,
    isMounted: true,
    currentBlendshapeFrames: null,
  })

  // Synchronize script frames ref without re-triggering Three.js useEffect
  useEffect(() => {
    threeRef.current.currentBlendshapeFrames = currentScript?.tts_json || null
  }, [currentScript])

  // 1. Initialize Single Three.js Scene, Camera, Lights, and Optimized Render Loop
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    threeRef.current.isMounted = true

    // Remove any leftover canvas from previous renders
    container.replaceChildren()

    const width = container.clientWidth || 640
    const height = container.clientHeight || 480

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50)
    camera.position.set(0, 1.48, 1.25)
    camera.lookAt(0, 1.40, 0)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)) // Cap pixel ratio to 1.5 for ultra-smooth 60fps
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    container.appendChild(renderer.domElement)

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.4)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6)
    dirLight.position.set(2, 4, 3)
    scene.add(dirLight)

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.8)
    fillLight.position.set(-2, 2, 2)
    scene.add(fillLight)

    threeRef.current.scene = scene
    threeRef.current.camera = camera
    threeRef.current.renderer = renderer

    // Resize handler with requestAnimationFrame throttle
    let resizeReqId = null
    const handleResize = () => {
      if (resizeReqId) cancelAnimationFrame(resizeReqId)
      resizeReqId = requestAnimationFrame(() => {
        if (!container || !renderer || !camera) return
        const w = container.clientWidth || window.innerWidth
        const h = container.clientHeight || window.innerHeight
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      })
    }
    window.addEventListener('resize', handleResize)

    // ResizeObserver on the container to detect size changes instantly (e.g. entering/exiting fullscreen)
    let ro = null
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => {
        handleResize()
      })
      ro.observe(container)
    }

    // 2. Optimized Render Loop (Animation mixer + facial blendshapes synchronized in render step)
    const animate = () => {
      if (!threeRef.current.isMounted) return
      threeRef.current.animFrameId = requestAnimationFrame(animate)

      const delta = threeRef.current.clock.getDelta()

      // Mixer animation tick
      if (threeRef.current.mixer) {
        threeRef.current.mixer.update(delta)
      }

      // Natural camera-facing head orientation & gaze correction
      // Body clips ('talk1', 'sidetalk') turn the spine, neck and head away from the camera.
      // Compute the exact target orientation toward camera in 3D world space, then convert into bone local space.
      const headBone = threeRef.current.headBone
      const neckBone = threeRef.current.neckBone
      if (headBone && neckBone) {
        // Ensure world matrices are up-to-date after mixer update
        threeRef.current.model.updateMatrixWorld(true)

        // 1. Gently bias neck toward camera
        const neckPos = new THREE.Vector3()
        neckBone.getWorldPosition(neckPos)
        const neckDistXZ = Math.hypot(camera.position.x - neckPos.x, camera.position.z - neckPos.z)
        const neckYaw = Math.atan2(camera.position.x - neckPos.x, camera.position.z - neckPos.z)
        const neckPitch = Math.atan2(-(camera.position.y - neckPos.y), neckDistXZ)

        const neckTargetWorld = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(neckPitch * 0.35, neckYaw * 0.45, 0, 'YXZ')
        )
        const spineWorld = new THREE.Quaternion()
        neckBone.parent.getWorldQuaternion(spineWorld)
        const neckTargetLocal = spineWorld.clone().invert().multiply(neckTargetWorld)
        neckBone.quaternion.slerp(neckTargetLocal, 0.65)
        neckBone.updateMatrixWorld(true)

        // 2. Direct head orientation toward camera
        const headPos = new THREE.Vector3()
        headBone.getWorldPosition(headPos)
        const headDistXZ = Math.hypot(camera.position.x - headPos.x, camera.position.z - headPos.z)
        const headYaw = Math.atan2(camera.position.x - headPos.x, camera.position.z - headPos.z)
        const headPitch = Math.atan2(-(camera.position.y - headPos.y), headDistXZ)

        // Preserve subtle nod/tilt from speech animation while locking yaw and pitch directly to camera
        const nodAngle = THREE.MathUtils.clamp(headBone.rotation.x, -0.15, 0.15) * 0.4
        const headTargetWorld = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(headPitch + nodAngle, headYaw, 0, 'YXZ')
        )
        const neckWorld = new THREE.Quaternion()
        neckBone.getWorldQuaternion(neckWorld)
        const headTargetLocal = neckWorld.clone().invert().multiply(headTargetWorld)
        headBone.quaternion.slerp(headTargetLocal, 0.88)
      }

      // Real-time blendshape lip-sync update directly from audio currentTime (zero React state overhead)
      const audio = activeAnswerAudioRef.current || audioRef.current
      if (audio && !audio.paused && threeRef.current.currentBlendshapeFrames) {
        const curTime = audio.currentTime
        const closest = searchClosestFrame(threeRef.current.currentBlendshapeFrames, curTime)
        if (closest && closest.blendshapes) {
          applyDirectBlendshapes(closest.blendshapes)
        }
      } else if (!audio || audio.paused) {
        // Natural mouth closure when audio is not playing
        applyDirectBlendshapes(null)
      }

      renderer.render(scene, camera)
    }
    animate()

    // 3. Load or Retrieve Cached 3D Model Instance
    const glbPath = avatarDefinition?.topic?.glb_path
    if (glbPath) {
      setIsLoadingModel(true)
      setModelError(null)

      const fullGlbUrl = glbPath.startsWith('http')
        ? glbPath
        : `https://my-avatar.in${glbPath.startsWith('/') ? glbPath : `/${glbPath}`}`

      const setupLoadedGltf = (gltf) => {
        if (!threeRef.current.isMounted || !threeRef.current.scene) return

        if (threeRef.current.model) {
          threeRef.current.scene.remove(threeRef.current.model)
        }

        // Clone model scene using SkeletonUtils to preserve bone bindings for SkinnedMesh
        const model = SkeletonUtils.clone(gltf.scene)
        model.position.set(0, 0, 0)
        model.scale.set(1, 1, 1)

        // Collect all meshes with morph targets (Head_Mesh, Teeth_Mesh, Tongue_Mesh, Eye_Mesh, EyeAO_Mesh, Eyelash_Mesh)
        // and map every morph target name to its mesh and target index for immediate viseme application.
        const morphMeshes = []
        const morphDictMap = {} // targetName -> [{ mesh, index }]
        let headBone = null
        let neckBone = null

        model.traverse((node) => {
          if (node.isBone) {
            const lowerBone = node.name.toLowerCase()
            if (lowerBone === 'head' || (lowerBone.includes('head') && !lowerBone.includes('top'))) {
              headBone = node
            } else if (lowerBone === 'neck' || lowerBone.includes('neck')) {
              neckBone = node
            }
          } else if (node.isMesh && node.morphTargetDictionary && node.morphTargetInfluences) {
            morphMeshes.push(node)
            Object.entries(node.morphTargetDictionary).forEach(([name, idx]) => {
              if (!morphDictMap[name]) morphDictMap[name] = []
              morphDictMap[name].push({ mesh: node, index: idx })
            })
          }
        })
        threeRef.current.morphMeshes = morphMeshes
        threeRef.current.morphDictMap = morphDictMap
        threeRef.current.headBone = headBone
        threeRef.current.neckBone = neckBone

        // Setup AnimationMixer with idle and speaking actions
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model)
          threeRef.current.mixer = mixer

          const idleClip =
            gltf.animations.find((a) => a.name === 'ideal1a' || a.name === 'idle2') ||
            gltf.animations[0]
          const talkClip =
            gltf.animations.find((a) => a.name === 'talk1' || a.name === 'sidetalk') ||
            idleClip

          const idleAction = mixer.clipAction(idleClip)
          const talkAction = mixer.clipAction(talkClip)

          idleAction.play()
          threeRef.current.animActions = {
            idle: idleAction,
            talk: talkAction,
          }
          threeRef.current.currentAction = idleAction
        }

        threeRef.current.scene.add(model)
        threeRef.current.model = model
        setIsLoadingModel(false)
      }

      if (gltfModelCache.has(fullGlbUrl)) {
        setupLoadedGltf(gltfModelCache.get(fullGlbUrl))
      } else {
        const loader = new GLTFLoader()
        loader.setDRACOLoader(getDracoLoader())

        loader.load(
          fullGlbUrl,
          (gltf) => {
            gltfModelCache.set(fullGlbUrl, gltf)
            setupLoadedGltf(gltf)
          },
          undefined,
          (err) => {
            console.error('Failed to load Avatar 3D GLB model:', err)
            if (threeRef.current.isMounted) {
              setModelError('Failed to load 3D Avatar mesh. Please check your network.')
              setIsLoadingModel(false)
            }
          }
        )
      }
    }

    // Cleanup and deep disposal of Three.js GPU resources
    return () => {
      threeRef.current.isMounted = false
      window.removeEventListener('resize', handleResize)
      if (ro) ro.disconnect()
      if (resizeReqId) cancelAnimationFrame(resizeReqId)
      if (threeRef.current.animFrameId) {
        cancelAnimationFrame(threeRef.current.animFrameId)
      }
      if (threeRef.current.mixer) {
        threeRef.current.mixer.stopAllAction()
      }
      if (threeRef.current.model && scene) {
        scene.remove(threeRef.current.model)
        threeRef.current.model.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose()
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m?.dispose())
            } else {
              child.material?.dispose()
            }
          }
        })
      }
      renderer.dispose()
      container.replaceChildren()
    }
  }, [avatarDefinition?.topic?.glb_path])

  // Crossfade between idle and talking body animations
  useEffect(() => {
    const { animActions, currentAction } = threeRef.current
    if (!animActions || !animActions.idle || !animActions.talk) return

    const targetAction = isPlaying ? animActions.talk : animActions.idle
    if (targetAction && targetAction !== currentAction) {
      targetAction.reset()
      targetAction.enabled = true
      targetAction.fadeIn(0.35)
      targetAction.play()

      if (currentAction) {
        currentAction.fadeOut(0.35)
      }
      threeRef.current.currentAction = targetAction
    }
  }, [isPlaying])

  // Map of ARKit camelCase shape names to ReadyPlayerMe / Mixamo underscore aliases
  const VISEME_ALIASES = useMemo(
    () => ({
      browDownLeft: 'browDown_L',
      browDownRight: 'browDown_R',
      browInnerUp: 'browInnerUp',
      browOuterUpLeft: 'browOuterUp_L',
      browOuterUpRight: 'browOuterUp_R',
      cheekPuff: 'cheekPuff',
      cheekSquintLeft: 'cheekSquint_L',
      cheekSquintRight: 'cheekSquint_R',
      eyeBlinkLeft: 'eyeBlink_L',
      eyeBlinkRight: 'eyeBlink_R',
      eyeLookDownLeft: 'eyeLookDown_L',
      eyeLookDownRight: 'eyeLookDown_R',
      eyeLookInLeft: 'eyeLookIn_L',
      eyeLookInRight: 'eyeLookIn_R',
      eyeLookOutLeft: 'eyeLookOut_L',
      eyeLookOutRight: 'eyeLookOut_R',
      eyeLookUpLeft: 'eyeLookUp_L',
      eyeLookUpRight: 'eyeLookUp_R',
      eyeSquintLeft: 'eyeSquint_L',
      eyeSquintRight: 'eyeSquint_R',
      eyeWideLeft: 'eyeWide_L',
      eyeWideRight: 'eyeWide_R',
      jawForward: 'jawForward',
      jawLeft: 'jaw_L',
      jawOpen: 'jawOpen',
      jawRight: 'jaw_R',
      mouthClose: 'mouthClose',
      mouthDimpleLeft: 'mouthDimple_L',
      mouthDimpleRight: 'mouthDimple_R',
      mouthFrownLeft: 'mouthFrown_L',
      mouthFrownRight: 'mouthFrown_R',
      mouthFunnel: 'mouthFunnel',
      mouthLeft: 'mouth_L',
      mouthLowerDownLeft: 'mouthLowerDown_L',
      mouthLowerDownRight: 'mouthLowerDown_R',
      mouthPressLeft: 'mouthPress_L',
      mouthPressRight: 'mouthPress_R',
      mouthPucker: 'mouthPucker',
      mouthRight: 'mouth_R',
      mouthRollLower: 'mouthRollLower',
      mouthRollUpper: 'mouthRollUpper',
      mouthShrugLower: 'mouthShrugLower',
      mouthShrugUpper: 'mouthShrugUpper',
      mouthSmileLeft: 'mouthSmile_L',
      mouthSmileRight: 'mouthSmile_R',
      mouthStretchLeft: 'mouthStretch_L',
      mouthStretchRight: 'mouthStretch_R',
      mouthUpperUpLeft: 'mouthUpperUp_L',
      mouthUpperUpRight: 'mouthUpperUp_R',
      noseSneerLeft: 'noseSneer_L',
      noseSneerRight: 'noseSneer_R',
      tongueOut: 'tongueOut',
    }),
    []
  )

  // Lateral eye-gaze drift shapes to zero out so eyes stay locked directly at the viewer/camera
  const LATERAL_EYE_SHAPES = useMemo(
    () =>
      new Set([
        'eyeLookInLeft',
        'eyeLookOutLeft',
        'eyeLookInRight',
        'eyeLookOutRight',
        'eyeLookIn_L',
        'eyeLookOut_L',
        'eyeLookIn_R',
        'eyeLookOut_R',
      ]),
    []
  )

  // Direct blendshapes application to morph targets (zero React state overhead)
  // Operates directly on GPU morphTargetInfluences across all morph meshes.
  const applyDirectBlendshapes = (blendshapes) => {
    const morphMeshes = threeRef.current.morphMeshes
    const morphDictMap = threeRef.current.morphDictMap
    if (!morphMeshes || morphMeshes.length === 0) return

    // 1. Reset all morph target influences to 0 when speech is inactive or between frames
    // This prevents mouth/visemes from getting stuck, compounding, or freezing in an open state.
    for (let i = 0; i < morphMeshes.length; i++) {
      const influences = morphMeshes[i].morphTargetInfluences
      if (influences) {
        for (let j = 0; j < influences.length; j++) {
          influences[j] = 0
        }
      }
    }

    if (!blendshapes || Object.keys(blendshapes).length === 0) return

    // 2. Apply phoneme/viseme weights from the current audio frame
    for (const [shapeName, weight] of Object.entries(blendshapes)) {
      if (LATERAL_EYE_SHAPES.has(shapeName)) continue

      const clampedWeight = Math.max(0, Math.min(1, weight))
      if (clampedWeight <= 0.001) continue

      // Check direct name match
      let targets = morphDictMap[shapeName]
      if (!targets) {
        // Check alias match (e.g. jawLeft -> jaw_L)
        const aliasName = VISEME_ALIASES[shapeName]
        if (aliasName) {
          targets = morphDictMap[aliasName]
        }
      }

      if (targets) {
        for (let i = 0; i < targets.length; i++) {
          const { mesh, index } = targets[i]
          mesh.morphTargetInfluences[index] = clampedWeight
        }
      }
    }
  }

  // Handle initial resume time seek when audio element loads
  const handleAudioLoadedMetadata = () => {
    const audio = audioRef.current
    if (!audio) return
    if (!initialSeekDoneRef.current && initialTime && Number(initialTime) > 0) {
      initialSeekDoneRef.current = true
      const targetSec = Math.min(Number(initialTime), audio.duration || Number(initialTime))
      audio.currentTime = targetSec
    }
  }

  // Audio time update handler: updates time counter directly in DOM ref & throttles progress save
  const lastSavedProgressSecRef = useRef(0)
  const handleAudioTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio || !timeDisplayRef.current) return
    const cur = Math.floor(audio.currentTime || 0)
    const dur = Math.floor(audio.duration || 0)
    timeDisplayRef.current.textContent = `${cur}s / ${dur}s`

    // Report progress to parent listener (throttled every 3s)
    if (onProgressUpdate && Math.abs(cur - lastSavedProgressSecRef.current) >= 3) {
      lastSavedProgressSecRef.current = cur
      onProgressUpdate({
        currentTime: cur,
        stepIndex: currentStepIndex,
        duration: dur,
      })
    }
  }

  // Check whether the given script is an interactive question checkpoint
  // (e.g. script contains "Any Questions? Or Shall we continue?" or is an interactive checkpoint)
  const isQuestionCheckpoint = (script) => {
    if (!script || !script.content) return false
    const text = String(script.content).toLowerCase()
    return (
      text.includes('any questions') ||
      text.includes('shall we continue') ||
      text.includes('ask below') ||
      text.includes('your turn')
    )
  }

  // Clear auto-start speech timer safely
  const clearAutoSpeechTimer = () => {
    if (autoSpeechTimerRef.current) {
      clearTimeout(autoSpeechTimerRef.current)
      autoSpeechTimerRef.current = null
    }
  }

  // Clear countdown timer safely
  const clearQaTimer = () => {
    if (qaCountdownTimerRef.current) {
      clearInterval(qaCountdownTimerRef.current)
      qaCountdownTimerRef.current = null
    }
    setQaCountdown(0)
  }

  // Stop answer playback if user navigates or skips
  const stopAnswerPlayback = () => {
    if (activeAnswerAudioRef.current) {
      activeAnswerAudioRef.current.pause()
      activeAnswerAudioRef.current.src = ''
      activeAnswerAudioRef.current = null
    }
  }

  // Step Navigation
  const playStep = (stepIdx) => {
    if (stepIdx < 0 || stepIdx >= scripts.length) return
    clearAutoSpeechTimer()
    clearQaTimer()
    stopAnswerPlayback()
    setIsAtCheckpoint(false)
    setAvatarAnswer(null)
    setQuestionInput('')

    setCurrentStepIndex(stepIdx)
    setIsPlaying(false)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    applyDirectBlendshapes({})

    if (onProgressUpdate) {
      onProgressUpdate({
        currentTime: 0,
        stepIndex: stepIdx,
      })
    }
  }

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    clearAutoSpeechTimer()

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      if (onProgressUpdate) {
        onProgressUpdate({
          currentTime: Math.floor(audio.currentTime || 0),
          stepIndex: currentStepIndex,
        })
      }
    } else {
      audio.play().then(() => setIsPlaying(true)).catch((e) => console.warn('Audio play note:', e))
    }
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
    applyDirectBlendshapes({})

    // If the step that just ended was a designated question checkpoint,
    // pause auto-advance and display the question input for the student!
    if (isQuestionCheckpoint(currentScript)) {
      setIsAtCheckpoint(true)
      // Start 30s auto-continue countdown (matching provider behavior)
      clearQaTimer()
      let remaining = 30
      setQaCountdown(remaining)
      qaCountdownTimerRef.current = setInterval(() => {
        remaining -= 1
        if (remaining <= 0) {
          clearQaTimer()
          setIsAtCheckpoint(false)
          // Advance to next step
          if (currentStepIndex < scripts.length - 1) {
            playStep(currentStepIndex + 1)
          } else if (onComplete) {
            onComplete()
          }
        } else {
          setQaCountdown(remaining)
        }
      }, 1000)
      return
    }

    // Normal steps: auto-advance to next step
    if (currentStepIndex < scripts.length - 1) {
      setTimeout(() => {
        playStep(currentStepIndex + 1)
      }, 500)
    } else if (onComplete) {
      onComplete()
    }
  }

  // Handle student asking a question
  const handleAskQuestion = async (e) => {
    if (e) e.preventDefault()
    const trimmed = questionInput.trim()
    if (!trimmed || isAsking) return

    clearQaTimer()
    setIsAsking(true)
    setAvatarAnswer(null)

    try {
      const topicId = avatarDefinition?.topic?.id || topicData?.rawDetail?.id || topicData?.id
      const acsContent = currentScript?.content || ''

      const response = await courseService.askAvatarQuestion({
        topic_id: topicId,
        question: trimmed,
        acs_content: acsContent,
      })

      if (response && response.answer) {
        setAvatarAnswer(response.answer)
        setQuestionInput('')

        // If provider returned speech audio and lip-sync blendshapes for the answer, play it through avatar
        if (response.tts_audio) {
          const answerAudioUrl = `/api/avatar/audio?url=${encodeURIComponent(response.tts_audio)}`
          const answerAudio = new Audio(answerAudioUrl)
          activeAnswerAudioRef.current = answerAudio

          // Temporarily attach answer blendshapes to Three.js render loop
          if (response.tts_json && response.tts_json.length > 0) {
            threeRef.current.currentBlendshapeFrames = response.tts_json
          }

          setIsPlaying(true)
          answerAudio.play().then(() => {
            answerAudio.onended = () => {
              setIsPlaying(false)
              applyDirectBlendshapes({})
              activeAnswerAudioRef.current = null
              // Restore step blendshapes
              threeRef.current.currentBlendshapeFrames = currentScript?.tts_json || null
            }
          }).catch((err) => {
            console.warn('Answer audio playback note:', err)
            setIsPlaying(false)
          })
        }
      } else {
        setAvatarAnswer("Thank you for your question! Let's continue with the lesson.")
      }
    } catch (err) {
      console.error('Error asking avatar question:', err)
      setAvatarAnswer('Sorry, I could not process your question right now. Let us continue!')
    } finally {
      setIsAsking(false)
    }
  }

  // Automatic speech-start timing:
  // Whenever a new teaching step becomes active, wait exactly 5 seconds after the step content is ready,
  // then automatically start the avatar's speech without requiring the student to click Speak.
  // Cancels previous timers if the step changes, audio is already playing, or on unmount.
  useEffect(() => {
    clearAutoSpeechTimer()

    // Do not auto-play if at interactive question checkpoint or model is loading or no audio for step
    if (isAtCheckpoint || isLoadingModel || !currentScript?.tts_audio) {
      return
    }

    autoSpeechTimerRef.current = setTimeout(() => {
      const audio = audioRef.current
      if (audio && !activeAnswerAudioRef.current) {
        audio.play()
          .then(() => setIsPlaying(true))
          .catch((err) => console.warn('Auto speech playback note:', err))
      }
    }, 5000)

    return () => {
      clearAutoSpeechTimer()
    }
  }, [currentStepIndex, isLoadingModel, isAtCheckpoint])

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      clearAutoSpeechTimer()
      clearQaTimer()
      stopAnswerPlayback()
    }
  }, [])

  const getAudioUrl = () => {
    if (!currentScript?.tts_audio) return null
    return `/api/avatar/audio?url=${encodeURIComponent(currentScript.tts_audio)}`
  }

  return (
    <div
      className={`avatar-lecture-renderer rounded-4 overflow-hidden shadow-sm position-relative w-100 ${
        isFullscreen ? 'h-100 rounded-0 m-0' : 'mb-3'
      }`}
      style={{
        minHeight: isFullscreen ? '100vh' : '480px',
        maxHeight: isFullscreen ? '100vh' : '620px',
        height: isFullscreen ? '100vh' : 'auto',
        backgroundColor: '#0f172a',
        backgroundImage: bgImageUrl ? `url("${bgImageUrl}")` : 'linear-gradient(180deg, #0a0a2e 0%, #1a1a4a 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="avatar-canvas-host w-100 h-100 position-relative"
        style={{
          minHeight: isFullscreen ? '100vh' : '480px',
          maxHeight: isFullscreen ? '100vh' : '620px',
          height: isFullscreen ? '100vh' : '100%',
        }}
      />

      {/* Loading Skeleton */}
      {isLoadingModel && (
        <div className="position-absolute top-50 start-50 translate-middle text-center text-white p-4" style={{ zIndex: 10 }}>
          <div className="spinner-border text-primary mb-2" role="status"></div>
          <div className="fw-semibold">Loading 3D Avatar & Lecture...</div>
          <div className="text-white-50 small mt-1">Preparing 3D model and speech animations</div>
        </div>
      )}

      {/* Model Error */}
      {modelError && (
        <div className="position-absolute top-50 start-50 translate-middle text-center text-danger p-4 bg-dark bg-opacity-75 rounded-4" style={{ zIndex: 10 }}>
          <div className="fs-2 mb-2">⚠️</div>
          <div className="fw-semibold text-white">{modelError}</div>
        </div>
      )}

      {/* Teaching Script Slide Media (Image or Video attachment) */}
      {currentScript?.image_urls && currentScript.image_urls.length > 0 && (
        <div
          className="position-absolute top-0 end-0 m-3 p-1 rounded-3 shadow-lg bg-black bg-opacity-75"
          style={{ maxWidth: '40%', maxHeight: '45%', zIndex: 12, overflow: 'hidden' }}
        >
          <img
            src={currentScript.image_urls[0]}
            alt="Slide visual reference"
            className="img-fluid rounded-2 object-fit-contain"
            style={{ maxHeight: '200px' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      )}

      {/* Optional attached script slide video if provided by topic */}
      {currentScript?.videolink && (
        <div
          className="position-absolute top-0 end-0 m-3 p-1 rounded-3 shadow-lg bg-black bg-opacity-75"
          style={{ maxWidth: '40%', maxHeight: '45%', zIndex: 12, overflow: 'hidden' }}
        >
          <video
            src={currentScript.videolink}
            controls
            playsInline
            muted
            className="w-100 rounded-2"
            style={{ maxHeight: '200px' }}
            onError={(e) => {
              e.currentTarget.parentElement.style.display = 'none'
            }}
          />
        </div>
      )}

      {/* Teaching Script Overlay Box */}
      {currentScript && (
        <div
          className="position-absolute bottom-0 start-0 end-0 p-3 p-md-4 text-white"
          style={{
            background: 'linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.8) 70%, transparent 100%)',
            zIndex: 15,
          }}
        >
          {/* Step Badge & Progress */}
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <span className="badge bg-primary rounded-pill px-3 py-1 fw-semibold small">
              Step {currentStepIndex + 1} of {scripts.length}
            </span>
            <div ref={timeDisplayRef} className="text-white-50 small">
              0s / 0s
            </div>
          </div>

          {/* Script Content Text */}
          <p className="text-white small mb-3" style={{ fontSize: '0.92rem', lineHeight: '1.5', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
            {currentScript.content}
          </p>

          {/* Interactive Question Input Checkpoint (only shown at designated question checkpoints) */}
          {isAtCheckpoint && (
            <div className="mb-3 p-3 rounded-3 bg-black bg-opacity-60 border border-info border-opacity-30">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                <span className="badge bg-info bg-opacity-25 text-info border border-info border-opacity-50 px-2.5 py-1 small fw-medium">
                  💬 Student Question Checkpoint
                </span>
                {qaCountdown > 0 && (
                  <span className="text-white-50 small">
                    Auto-continuing in <strong className="text-info">{qaCountdown}s</strong>
                  </span>
                )}
              </div>

              {/* Student Question Form */}
              <form onSubmit={handleAskQuestion} className="d-flex align-items-center gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm bg-dark text-white border-secondary rounded-pill px-3 py-1.5"
                  placeholder="Type your question"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  disabled={isAsking}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-sm btn-info rounded-pill px-3 fw-semibold text-dark d-inline-flex align-items-center gap-1"
                  disabled={isAsking || !questionInput.trim()}
                >
                  {isAsking ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <span>Asking...</span>
                    </>
                  ) : (
                    <span>Ask</span>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light rounded-pill px-3"
                  onClick={() => {
                    clearQaTimer()
                    setIsAtCheckpoint(false)
                    if (currentStepIndex < scripts.length - 1) {
                      playStep(currentStepIndex + 1)
                    } else if (onComplete) {
                      onComplete()
                    }
                  }}
                >
                  Continue →
                </button>
              </form>

              {/* Avatar Response Message */}
              {avatarAnswer && (
                <div className="mt-2.5 p-2.5 rounded-2 bg-primary bg-opacity-20 border border-primary border-opacity-30 text-white small">
                  <div className="fw-semibold text-info mb-1 d-flex align-items-center gap-1">
                    <span>👩‍🏫 Avatar:</span>
                  </div>
                  <div style={{ lineHeight: '1.45' }}>{avatarAnswer}</div>
                </div>
              )}
            </div>
          )}

          {/* Controls Bar */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-2 border-top border-white border-opacity-10">
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary rounded-pill px-3 fw-semibold d-inline-flex align-items-center gap-1.5"
                onClick={togglePlayPause}
                disabled={isLoadingModel}
              >
                <span>{isPlaying ? '⏸ Pause' : '▶ Speak'}</span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline-light rounded-pill px-3"
                onClick={() => playStep(currentStepIndex - 1)}
                disabled={currentStepIndex === 0}
              >
                ← Previous
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline-light rounded-pill px-3"
                onClick={() => playStep(currentStepIndex + 1)}
                disabled={currentStepIndex >= scripts.length - 1}
              >
                Next →
              </button>
            </div>

            {/* Steps indicator dots & Fullscreen Toggle */}
            <div className="d-flex align-items-center gap-2">
              <div className="d-flex align-items-center gap-1">
                {scripts.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`border-0 rounded-circle p-0 ${idx === currentStepIndex ? 'bg-primary' : 'bg-white bg-opacity-25'}`}
                    style={{ width: '8px', height: '8px', cursor: 'pointer' }}
                    onClick={() => playStep(idx)}
                    title={`Jump to step ${idx + 1}`}
                  />
                ))}
              </div>

              {onToggleFullscreen && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light rounded-pill px-2.5 py-1 text-white border-white border-opacity-25"
                  onClick={onToggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                >
                  {isFullscreen ? '✕ Exit' : '⛶ Fullscreen'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden Audio Player for Speech Playback & Lip-Sync */}
      {currentScript?.tts_audio && (
        <audio
          ref={audioRef}
          src={getAudioUrl()}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onTimeUpdate={handleAudioTimeUpdate}
          onEnded={handleAudioEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={(e) => console.warn('Audio playback note:', e)}
          preload="auto"
        />
      )}
    </div>
  )
}
