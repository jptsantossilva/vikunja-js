import {mount} from '@vue/test-utils'
import {describe, expect, it} from 'vitest'
import ImageLightbox from './ImageLightbox.vue'

describe('ImageLightbox navigation', () => {
	it('navigates with buttons and arrow keys when adjacent images exist', async () => {
		const wrapper = mount(ImageLightbox, {
			props: {blobUrl: 'blob:first', hasNext: true, hasPrevious: false},
			global: {
				stubs: {Modal: {template: '<div><slot /></div>'}, Icon: true},
				directives: {tooltip: {}},
				mocks: {$t: (key: string) => key},
			},
		})
		expect(wrapper.find('[aria-label="misc.previous"]').exists()).toBe(false)
		await wrapper.get('[aria-label="misc.next"]').trigger('click')
		window.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
		expect(wrapper.emitted('next')).toHaveLength(2)
		await wrapper.setProps({blobUrl: 'blob:second', hasNext: false, hasPrevious: true})
		window.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
		expect(wrapper.emitted('previous')).toHaveLength(1)
		expect(wrapper.find('[aria-label="misc.next"]').exists()).toBe(false)
		wrapper.unmount()
	})
})
