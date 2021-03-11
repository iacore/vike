import { spawn } from 'child_process'
import { ChildProcessWithoutNullStreams } from 'child_process'
import { dirname as pathDirname } from 'path'
import assert = require('assert')
import { partRegExp, sleep } from './utils'
import fetch from 'node-fetch'
import './test.d'

// @ts-ignore
global._page = global.page
// @ts-ignore
global._fetch = fetch
// @ts-ignore
global._sleep = sleep
// @ts-ignore
global._partRegExp = partRegExp

jest.setTimeout(60 * 1000)

beforeAll(async () => {
  await startServer()
  await _page.goto('http://localhost:3000')
})

afterAll(async () => {
  await stopServer()
})

let runningServer: null | {
  proc: ChildProcessWithoutNullStreams
  cwd: string
  cmd: string
  isRunning: boolean
} = null
function startServer() {
  let resolve: () => void
  let reject: (err: string) => void
  const promise = new Promise<void>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  const { testPath } = expect.getState()
  const cwd = pathDirname(testPath)
  const cmd = cwd.includes('boilerplate') ? 'npm run dev' : 'npm run start'
  const proc = runCommand(cmd, cwd)

  assert(runningServer === null)
  runningServer = { proc, cwd, cmd, isRunning: false }

  const prefix = `[Server Start][${cwd}][${cmd}]`

  let hasError = false
  proc.stdout.on('data', async (data) => {
    data = data.toString()
    if (data.startsWith('Server running at') && !hasError) {
      if (hasError) {
        reject(`${prefix} An error occurred while starting the server.`)
      } else {
        runningServer.isRunning = true
        await sleep(1000)
        resolve()
      }
    }
  })
  proc.stderr.on('data', (data) => {
    data = data.toString()
    if (data.includes('EADDRINUSE')) {
      forceLog(data)
      process.exit(1)
    }
    hasError = true
    process.stderr.write(data)
  })
  proc.on('exit', (code) => {
    assert(runningServer.isRunning === true)
    runningServer = null
    reject(`${prefix} Server stopped prematurely, exit code: ${code}`)
  })

  return promise
}
function stopServer() {
  if (!runningServer) return

  const { cwd, cmd, proc } = runningServer

  const prefix = `[Server Stop][${cwd}][${cmd}]`

  let resolve: () => void
  let reject: (err: string) => void
  const promise = new Promise<void>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  proc.on('close', (code) => {
    if (code === 0 || code === null) {
      resolve()
    } else {
      reject(`${prefix} Server terminated with non-0 error code ${code}`)
    }
  })
  process.kill(-proc.pid, 'SIGINT')

  return promise
}

function runCommand(cmd: string, cwd: string) {
  const [command, ...args] = cmd.split(' ')
  return spawn(command, args, { cwd, detached: true })
}

function forceLog(str: string) {
  process.stderr.write(str)
}
