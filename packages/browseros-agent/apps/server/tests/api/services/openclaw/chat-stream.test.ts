import { describe, expect, it } from 'bun:test'
import { parseOpenAiSseEvent } from '../../../../src/api/services/openclaw/chat-stream'

describe('parseOpenAiSseEvent', () => {
  it('parses a text-delta chunk', () => {
    const chunk = {
      choices: [{ delta: { content: 'hello ' } }],
    }
    const events = parseOpenAiSseEvent(chunk)
    expect(events).toEqual([{ type: 'text-delta', data: { text: 'hello ' } }])
  })

  it('parses a finish_reason as done', () => {
    const chunk = {
      choices: [{ delta: {}, finish_reason: 'stop' }],
    }
    const events = parseOpenAiSseEvent(chunk)
    expect(events).toEqual([{ type: 'done', data: { text: '' } }])
  })

  it('ignores unrelated chunks', () => {
    const chunk = { id: 'abc', object: 'chat.completion.chunk', choices: [] }
    expect(parseOpenAiSseEvent(chunk)).toEqual([])
  })
})
