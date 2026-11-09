import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SwipeCard from '~/components/SwipeCard.vue'
import { resolveSwipe } from '~/utils/swipe'

function mountCard(props: { disabled?: boolean } = {}) {
  return mount(SwipeCard, { props: { itemKey: 'a', ...props }, slots: { default: '<div class="content">photo</div>' } })
}

async function drag(wrapper: ReturnType<typeof mountCard>, dx: number, dy: number) {
  const start = { clientX: 200, clientY: 300, pointerId: 1, pointerType: 'touch', button: 0 }
  await wrapper.trigger('pointerdown', start)
  await wrapper.trigger('pointermove', { ...start, clientX: 200 + dx / 2, clientY: 300 + dy / 2 })
  await wrapper.trigger('pointermove', { ...start, clientX: 200 + dx, clientY: 300 + dy })
  await wrapper.trigger('pointerup', { ...start, clientX: 200 + dx, clientY: 300 + dy })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SwipeCard', () => {
  it.each([
    [150, 10, 'right'],
    [-150, 10, 'left'],
    [10, -150, 'up'],
  ] as const)('a drag of (%i, %i) past the threshold emits swipe %s', async (dx, dy, dir) => {
    const wrapper = mountCard()
    await drag(wrapper, dx, dy)
    expect(wrapper.emitted('swipe')).toEqual([[dir]])
    expect(wrapper.emitted('details')).toBeUndefined()
  })

  it('a drag down opens details instead of leaving', async () => {
    const wrapper = mountCard()
    await drag(wrapper, 0, 150)
    expect(wrapper.emitted('details')).toHaveLength(1)
    expect(wrapper.emitted('swipe')).toBeUndefined()
  })

  it('a short slow drag springs back without emitting', async () => {
    const wrapper = mountCard()
    await drag(wrapper, 50, 0)
    expect(wrapper.emitted('swipe')).toBeUndefined()
    expect(wrapper.emitted('details')).toBeUndefined()
  })

  it('shows the matching hint while dragging', async () => {
    const wrapper = mountCard()
    const start = { clientX: 200, clientY: 300, pointerId: 1, pointerType: 'mouse', button: 0 }
    await wrapper.trigger('pointerdown', start)
    await wrapper.trigger('pointermove', { ...start, clientX: 100 })
    expect(wrapper.find('.stamp').text()).toBe('TRASH')
    await wrapper.trigger('pointermove', { ...start, clientX: 300 })
    expect(wrapper.find('.stamp').text()).toBe('KEEP')
    await wrapper.trigger('pointermove', { ...start, clientY: 200 })
    expect(wrapper.find('.stamp').text()).toBe('FAVOURITE')
  })

  it('ignores drags while disabled', async () => {
    const wrapper = mountCard({ disabled: true })
    await drag(wrapper, 150, 0)
    expect(wrapper.emitted('swipe')).toBeUndefined()
  })

  it('holds after a swipe until the parent decides, and springs back on failure', async () => {
    vi.useFakeTimers()
    const wrapper = mountCard()
    await drag(wrapper, 150, 0)
    expect(wrapper.classes()).toContain('phase-holding')
    // A new drag is ignored while the decision is pending.
    await drag(wrapper, -150, 0)
    expect(wrapper.emitted('swipe')).toEqual([['right']])
    const back = wrapper.vm.springBack()
    await vi.runAllTimersAsync()
    await back
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('phase-idle')
    expect(wrapper.attributes('style')).toContain('translate3d(0px, 0px, 0)')
  })

  it('exit() animates the card off-screen', async () => {
    vi.useFakeTimers()
    const wrapper = mountCard()
    const gone = wrapper.vm.exit('left')
    await vi.runAllTimersAsync()
    await gone
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('phase-exiting')
    expect(wrapper.attributes('style')).toMatch(/translate3d\(-\d+px/)
  })
})

describe('resolveSwipe', () => {
  it('commits past the threshold along the dominant axis', () => {
    expect(resolveSwipe(120, 20, 0, 0, 100)).toBe('right')
    expect(resolveSwipe(-120, 20, 0, 0, 100)).toBe('left')
    expect(resolveSwipe(20, -120, 0, 0, 100)).toBe('up')
    expect(resolveSwipe(20, 120, 0, 0, 100)).toBe('down')
    expect(resolveSwipe(99, 0, 0, 0, 100)).toBeNull()
  })

  it('commits a short fast flick in the same direction', () => {
    expect(resolveSwipe(40, 0, 1.2, 0, 100)).toBe('right')
    expect(resolveSwipe(0, -40, 0, -1, 100)).toBe('up')
  })

  it('ignores flicks that are too short or reversing', () => {
    expect(resolveSwipe(10, 0, 2, 0, 100)).toBeNull()
    expect(resolveSwipe(60, 0, -1, 0, 100)).toBeNull()
  })
})
