import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Custom server proxy middleware for Avatar Lecture provider
function avatarProxyPlugin() {
  return {
    name: 'avatar-lecture-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // 1. Topic definition proxy: GET /api/avatar/topic/:avatarTopicId
        const topicMatch = req.url.match(/^\/api\/avatar\/topic\/([a-f0-9-]+)/i)
        if (topicMatch) {
          const avatarTopicId = topicMatch[1]
          try {
            const providerUrl = `https://my-avatar.in/api/topic/${avatarTopicId}`
            const upstreamRes = await fetch(providerUrl, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Edoomate-Learning-Platform/1.0',
              },
            })

            const data = await upstreamRes.json().catch(() => null)
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.statusCode = upstreamRes.status
            res.end(JSON.stringify(data))
            return
          } catch (err) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Failed to fetch topic from avatar provider', message: err.message }))
            return
          }
        }

        // 2. Audio speech proxy: GET /api/avatar/audio?url=...
        if (req.url.startsWith('/api/avatar/audio')) {
          try {
            const parsedUrl = new URL(req.url, 'http://localhost')
            const audioPath = parsedUrl.searchParams.get('url')
            if (!audioPath) {
              res.statusCode = 400
              res.end('Missing audio url parameter')
              return
            }

            // Restrict target host to exact provider
            const targetAudioUrl = audioPath.startsWith('http')
              ? (audioPath.startsWith('https://my-avatar.in') ? audioPath : null)
              : `https://my-avatar.in${audioPath.startsWith('/') ? audioPath : `/${audioPath}`}`

            if (!targetAudioUrl) {
              res.statusCode = 403
              res.end('Restricted: only provider audio assets are allowed')
              return
            }

            const upstreamRes = await fetch(targetAudioUrl, {
              headers: {
                'User-Agent': 'Edoomate-Learning-Platform/1.0',
              },
            })

            const buf = await upstreamRes.arrayBuffer()
            res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'audio/mpeg')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Cache-Control', 'public, max-age=86400')
            res.statusCode = upstreamRes.status
            res.end(Buffer.from(buf))
            return
          } catch (err) {
            res.statusCode = 502
            res.end(err.message)
            return
          }
        }

        // 3. Question/Ask proxy: POST /api/avatar/ask
        if (req.url.startsWith('/api/avatar/ask') && req.method === 'POST') {
          try {
            let bodyStr = ''
            req.on('data', (chunk) => {
              bodyStr += chunk
            })
            req.on('end', async () => {
              try {
                const upstreamRes = await fetch('https://my-avatar.in/api/ask', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Origin': 'https://my-avatar.in',
                    'User-Agent': 'Edoomate-Learning-Platform/1.0',
                  },
                  body: bodyStr,
                })

                const data = await upstreamRes.json().catch(() => null)
                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.statusCode = upstreamRes.status
                res.end(JSON.stringify(data))
              } catch (upstreamErr) {
                res.statusCode = 502
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Failed to proxy question to avatar provider', message: upstreamErr.message }))
              }
            })
            return
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Server error processing question', message: err.message }))
            return
          }
        }

        next()
      })
    },
  }
}

// Custom server proxy middleware for Vimeo API Playback authorization
function vimeoPlaybackProxyPlugin() {
  return {
    name: 'vimeo-playback-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const vimeoMatch = req.url.match(/^\/api\/vimeo\/playback\/(\d+)/i)
        if (vimeoMatch) {
          const vimeoId = vimeoMatch[1]
          const parsedUrl = new URL(req.url, 'http://localhost')
          const queryHash = parsedUrl.searchParams.get('h') || parsedUrl.searchParams.get('hash')
          const vimeoToken = process.env.VIMEO_ACCESS_TOKEN || process.env.VITE_VIMEO_ACCESS_TOKEN || null
          const defaultHash = process.env.VIMEO_HASH_KEY || queryHash || null

          try {
            // 1. If Vimeo Access Token is available, query official Vimeo API securely on server side
            if (vimeoToken) {
              const upstreamRes = await fetch(`https://api.vimeo.com/videos/${vimeoId}`, {
                headers: {
                  'Authorization': `Bearer ${vimeoToken}`,
                  'Accept': 'application/vnd.vimeo.*+json;version=3.4',
                  'User-Agent': 'Edoomate-Learning-Platform/1.0',
                },
              })

              if (upstreamRes.ok) {
                const data = await upstreamRes.json()
                const files = data.files || []
                const progressive =
                  files.find((f) => f.type === 'video/mp4' && (f.quality === '720p' || f.public_name === '720p')) ||
                  files.find((f) => f.type === 'video/mp4' && (f.quality === '1080p' || f.public_name === '1080p')) ||
                  files.find((f) => f.type === 'video/mp4') ||
                  files[0]

                let hash = null
                if (data.link && /\/([a-zA-Z0-9]+)$/.test(data.link)) {
                  hash = data.link.match(/\/([a-zA-Z0-9]+)$/)[1]
                }

                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.statusCode = 200
                res.end(
                  JSON.stringify({
                    success: true,
                    vimeo_id: vimeoId,
                    playback_url: progressive?.link || null,
                    hls_url: files.find((f) => f.quality === 'hls')?.link || null,
                    embed_url: data.player_embed_url || null,
                    vimeo_hash: hash || defaultHash,
                    title: data.name,
                    duration: data.duration,
                  })
                )
                return
              }
            }

            // 2. Query Vimeo Player config with hash parameter
            const configUrl = defaultHash
              ? `https://player.vimeo.com/video/${vimeoId}/config?h=${encodeURIComponent(defaultHash)}`
              : `https://player.vimeo.com/video/${vimeoId}/config`

            const configRes = await fetch(configUrl, {
              headers: {
                'Referer': 'https://edoomate.myieltspartner.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            })

            if (configRes.ok) {
              const cfg = await configRes.json()
              const files = cfg.request?.files?.progressive || []
              const progressive =
                files.find((f) => f.quality === '720p') ||
                files.find((f) => f.quality === '1080p') ||
                files[0]

              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.statusCode = 200
              res.end(
                JSON.stringify({
                  success: true,
                  vimeo_id: vimeoId,
                  playback_url: progressive?.url || null,
                  hls_url: cfg.request?.files?.hls?.default_cdn ? cfg.request?.files?.hls?.cdns?.[cfg.request.files.hls.default_cdn]?.url : null,
                  embed_url: `https://player.vimeo.com/video/${vimeoId}${defaultHash ? `?h=${defaultHash}` : ''}`,
                  vimeo_hash: defaultHash,
                  title: cfg.video?.title,
                  duration: cfg.video?.duration,
                })
              )
              return
            }

            // Return diagnostic failure without exposing secrets
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                success: false,
                vimeo_id: vimeoId,
                error: 'Vimeo Privacy Restriction',
                message: 'This video is unlisted or domain-restricted. A valid VIMEO_HASH_KEY or VIMEO_ACCESS_TOKEN with video_files permission is required on the backend.',
              })
            )
            return
          } catch (err) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                success: false,
                vimeo_id: vimeoId,
                error: 'Proxy Error',
                message: err.message,
              })
            )
            return
          }
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), avatarProxyPlugin(), vimeoPlaybackProxyPlugin()],
  server: {
    allowedHosts: [
      '.trycloudflare.com',
    ],
  },
})
