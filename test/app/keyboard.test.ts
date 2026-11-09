import { describe, expect, it } from 'vitest'
import { isTypingTarget, keyToAction } from '~/utils/keyboard'

function key(k: string, mods: { ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean } = {}) {
  return { key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods }
}

describe('keyToAction', () => {
  it.each([
    ['ArrowLeft', 'trash'],
    ['d', 'trash'],
    ['D', 'trash'],
    ['ArrowRight', 'keep'],
    ['k', 'keep'],
    ['K', 'keep'],
    ['ArrowUp', 'favourite'],
    ['f', 'favourite'],
    ['ArrowDown', 'details'],
    ['i', 'details'],
    ['s', 'skip'],
    ['S', 'skip'],
    ['u', 'undo'],
    ['?', 'help'],
    ['Escape', 'close'],
  ])('%s → %s', (k, action) => {
    expect(keyToAction(key(k))).toBe(action)
  })

  it('maps Ctrl+Z and Cmd+Z to undo', () => {
    expect(keyToAction(key('z', { ctrlKey: true }))).toBe('undo')
    expect(keyToAction(key('z', { metaKey: true }))).toBe('undo')
    expect(keyToAction(key('Z', { metaKey: true }))).toBe('undo')
  })

  it('leaves other shortcuts and keys alone', () => {
    expect(keyToAction(key('d', { metaKey: true }))).toBeNull() // bookmark
    expect(keyToAction(key('k', { ctrlKey: true }))).toBeNull()
    expect(keyToAction(key('f', { altKey: true }))).toBeNull()
    expect(keyToAction(key('z'))).toBeNull()
    expect(keyToAction(key('Enter'))).toBeNull()
    expect(keyToAction(key(' '))).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it('detects inputs, textareas, selects and editable content', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('select'))).toBe(true)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.appendChild(editable)
    expect(isTypingTarget(editable)).toBe(true)
    editable.remove()
  })

  it('does not treat buttons or the page as typing', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
