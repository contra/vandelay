import got from 'got-resume-next'
import through2 from 'through2'
import collect from 'get-stream'
import { pipeline } from 'readable-stream'
import template from 'url-template'
import { pickBy } from 'lodash'
import httpError from './httpError'
import userAgent from './userAgent'
import hardClose from '../hardClose'
import mergeURL from '../mergeURL'

const sizeLimit = 512000 // 512kb
const oneDay = 86400000
const fiveMinutes = 300000

const retryWorthy = [
  420, 444, 408, 429, 449, 499
]
const shouldRetry = (_, original) => {
  if (original?.code === 'ENOTFOUND') return false // no point retrying on domains that dont exist

  const res = original?.response
  if (!res) return false // non-http error?

  // their server having issues, give it another go
  if (res.statusCode >= 500) return true

  // they don't like the rate we are sending at
  if (retryWorthy.includes(res.statusCode)) return true

  // they don't like what we're sending, no point retrying
  if (res.statusCode >= 400) return false

  return true
}

export default (url, { attempts = 10, headers = {}, query, timeout, connectTimeout, accessToken, debug, context } = {}) => {
  const decoded = unescape(url)
  let fullURL = context && decoded.includes('{')
    ? template.parse(decoded).expand(context)
    : url

  const out = through2()
  let isCollectingError = false

  const actualHeaders = pickBy({
    'User-Agent': userAgent,
    ...headers
  }, (v, k) => !!k && !!v)
  if (accessToken) actualHeaders.Authorization = `Bearer ${accessToken}`
  if (query) fullURL = mergeURL(fullURL, query)
  const options = {
    log: debug,
    attempts,
    shouldRetry,
    got: {
      followRedirect: true,
      timeout: {
        request: timeout || oneDay,
        connect: connectTimeout || fiveMinutes,
        socket: oneDay
      },
      headers: actualHeaders
    }
  }

  if (debug) debug('Fetching', fullURL)
  let req

  // got throws errors on invalid headers or other invalid args, so handle them instead of throwing
  try {
    req = got(fullURL, options)
      // handle errors
      .once('error', async (err) => {
        isCollectingError = true
        const orig = err.original || err
        if (debug) debug('Got error while fetching', orig)
        if (orig?.response) {
          orig.response.text = orig.response.rawBody
            ? orig.response.rawBody.toString('utf8') // for whatever reason, got buffered the response
            : await collect(orig.response, { maxBuffer: sizeLimit }) // nothing buffered - keep reading
        }
        out.emit('error', httpError(orig, orig?.response))
        out.abort()
      })
      .once('response', () => {
        if (isCollectingError) return
        if (debug) debug('Got a first response, starting stream')
        pipeline(req, out, (err) => {
          if (err) out.emit('error', err)
        })
      })
  } catch (err) {
    process.nextTick(() => {
      out.emit('error', err)
    })
    return out
  }

  out.abort = () => {
    if (debug) debug('Abort called')
    hardClose(out)
    req.cancel()
  }
  out.req = req
  out.url = fullURL
  return out
}
