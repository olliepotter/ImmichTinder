import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

const Counter = defineComponent({
  setup() {
    const count = ref(0)
    return () => h('button', { onClick: () => count.value++ }, `count: ${count.value}`)
  },
})

describe('component test setup', () => {
  it('renders and updates a component in a DOM environment', async () => {
    const wrapper = mount(Counter)
    expect(wrapper.text()).toBe('count: 0')
    await wrapper.trigger('click')
    expect(wrapper.text()).toBe('count: 1')
    expect(typeof window).toBe('object')
  })
})
