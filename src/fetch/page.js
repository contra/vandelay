import through2 from 'through2'
import { finished } from 'stream'
import hardClose from '../hardClose'

const getURL = (stream) =>
  stream.first
    ? getURL(stream.first)
    : typeof stream.url === 'function'
      ? stream.url()
      : stream.url


const closeIt = (i) => {
  if (!i.readable) return
  if (i.abort) return i.abort()
  hardClose(i)
}

// merges a bunch of streams, unordered - and has some special error management
// so one wont fail the whole bunch
export default (startPage, getNext, { concurrent=2, onError }={}) => {
  const actualConcurrency = Math.min(2, concurrent) // limit concurrency to either 1 or 2
  const out = through2({ objectMode: true })
  out.currentPage = startPage
  out.running = []
  out.setMaxListeners(0)
  out.abort = () => {
    hardClose(out)
    out.running.forEach(closeIt)
  }
  out.url = getURL.bind(null, out)
  out.on('unpipe', (src) => done(src))

  const done = (src, err) => {
    const idx = out.running.indexOf(src)
    if (idx === -1) return // already finished
    out.running.splice(idx, 1) // remove it from the run list
    const finished = out.running.length === 0 && !src._gotData

    // let the consumer figure out how they want to handle errors
    const canContinue = !finished && out.readable
    if (err && onError) {
      onError({
        canContinue,
        error: err,
        output: out,
        input: src
      })
    }
    if (!canContinue) return hardClose(out)
    if (src._gotData) schedule() // schedule any additional work
  }

  const schedule = () => {
    if (out._closed) return
    const remainingSlots = actualConcurrency - out.running.length
    if (remainingSlots === 0) return
    const nextPage = out.currentPage
    out.currentPage = nextPage + 1
    run(getNext(nextPage))
  }

  const run = (src) => {
    out.running.push(src)
    if (!out.first) out.first = src
    finished(src, (err) => done(src, err))
    src.once('data', () => {
      src._gotData = true
      schedule()
    }).pause() // since the data handler will put it in a flowing state
    src.pipe(out, { end: false })
  }

  // kick it all off
  schedule()
  return out
}
