import {computed, ref, toValue} from 'vue'
import {mount} from '@vue/test-utils'
import {describe, expect, it, vi} from 'vitest'

vi.mock('vue-i18n', async importOriginal => ({
	...await importOriginal<typeof import('vue-i18n')>(),
	useI18n: () => ({t: (key: string) => key}),
}))
vi.mock('@/i18n', () => ({i18n: {global: {t: (key: string) => key}}}))
vi.mock('@/stores/auth', () => ({useAuthStore: () => ({info: {id: 1}})}))
vi.mock('@/message', () => ({success: vi.fn()}))
vi.mock('@/client/queries/taskMutations', () => ({
	useAddTaskAssigneeMutation: () => ({mutateAsync: vi.fn()}),
	useRemoveTaskAssigneeMutation: () => ({mutateAsync: vi.fn()}),
}))
vi.mock('@/composables/useUserSearch', () => ({
	useProjectUserSearch: (_project: unknown, search: {value: string}, enabled: {value: boolean}) => ({
		users: computed(() => enabled.value
			? [{id: 1, username: 'joao'}, {id: 2, username: 'ana'}].filter(user => user.username.includes(search.value))
			: []),
		isFetching: ref(false),
	}),
}))

import EditAssignees from './EditAssignees.vue'

describe('inline assignee editor', () => {
	it('loads available users immediately and filters them on search', async () => {
		const wrapper = mount(EditAssignees, {
			props: {modelValue: [], taskId: 1, projectId: 2, inline: true},
			global: {
				mocks: {$t: (key: string) => key},
				stubs: {Multiselect: {name: 'Multiselect', props: ['searchResults'], template: '<div />'}},
			},
		})
		const select = wrapper.getComponent({name: 'Multiselect'})
		expect(toValue(select.props('searchResults')).map((user: {username: string}) => user.username)).toEqual(['joao', 'ana'])
		select.vm.$emit('search', 'ana')
		await wrapper.vm.$nextTick()
		expect(select.props('searchResults').map((user: {username: string}) => user.username)).toEqual(['ana'])
	})
})
