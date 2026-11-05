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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), avatarProxyPlugin()],
  server: {
    allowedHosts: [
      '.trycloudflare.com',
    ],
  },
})
