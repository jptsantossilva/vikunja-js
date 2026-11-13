import {createPinia, setActivePinia} from 'pinia'
import {mount} from '@vue/test-utils'
import {describe, expect, it, vi} from 'vitest'
import {createMemoryHistory, createRouter} from 'vue-router'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'
import {createI18n} from 'vue-i18n'

import type {TaskResponse} from '@/client/queries/tasks'
import TaskGridCell from './TaskGridCell.vue'

vi.mock('@/message', () => ({error: vi.fn()}))
vi.mock('@/i18n', () => ({i18n: {global: {t: (key: string) => key}}}))

const i18n = createI18n({
	legacy: false,
	locale: 'en',
	messages: {
		en: {project: {list: {
			collapseSubtasks: 'Collapse subtasks',
			expandSubtasks: 'Expand subtasks',
			markDone: 'Mark done',
			reopen: 'Reopen',
		}}},
	},
})

const parentTask = {
	id: 1,
	title: 'Parent task',
	done: false,
	assignees: [],
	labels: [],
	related_tasks: {},
} as unknown as TaskResponse

describe('TaskGridCell subtask toggle', () => {
	const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})

	it('keeps the toggle available while the task is collapsed', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{path: '/', component: {template: '<div />'}}],
		})
		await router.push('/')
		await router.isReady()
		const wrapper = mount(TaskGridCell, {
			props: {
				task: parentTask,
				field: 'title',
				canWrite: true,
				hasChildren: true,
				collapsed: false,
			},
			global: {
				plugins: [pinia, i18n, router, [VueQueryPlugin, {queryClient}]],
				directives: {focus: {}},
				stubs: {
					Icon: true,
					RouterLink: true,
				},
			},
		})

		const toggle = wrapper.get('.task-grid-cell__subtask-toggle')
		expect(toggle.attributes('aria-label')).toBe('Collapse subtasks')

		await toggle.trigger('click')
		expect(wrapper.emitted('toggle')).toHaveLength(1)

		await wrapper.setProps({collapsed: true})
		expect(wrapper.get('.task-grid-cell__subtask-toggle').attributes('aria-label')).toBe('Expand subtasks')
		expect(wrapper.get('.task-grid-cell__subtask-toggle').classes()).toContain('is-collapsed')

		await wrapper.get('.task-grid-cell__subtask-toggle').trigger('click')
		expect(wrapper.emitted('toggle')).toHaveLength(2)
	})

	it('uses a distinct completion button instead of a selection checkbox', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{path: '/', component: {template: '<div />'}}],
		})
		await router.push('/')
		await router.isReady()
		const wrapper = mount(TaskGridCell, {
			props: {
				task: parentTask,
				field: 'title',
				canWrite: true,
			},
			global: {
				plugins: [pinia, i18n, router, [VueQueryPlugin, {queryClient}]],
				directives: {focus: {}},
				stubs: {Icon: true, RouterLink: true},
			},
		})

		expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
		expect(wrapper.get('.task-grid-cell__done-toggle').attributes('aria-label')).toBe('Mark done')
	})

	it('starts title editing with a single click', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{path: '/', component: {template: '<div />'}}],
		})
		await router.push('/')
		await router.isReady()
		const wrapper = mount(TaskGridCell, {
			props: {
				task: parentTask,
				field: 'title',
				canWrite: true,
			},
			global: {
				plugins: [pinia, i18n, router, [VueQueryPlugin, {queryClient}]],
				directives: {focus: {}},
				stubs: {Icon: true, RouterLink: true},
			},
		})

		await wrapper.get('.task-grid-cell__title').trigger('click')
		expect(wrapper.get('.task-grid-cell__title-input').element).toBeInstanceOf(HTMLInputElement)
	})
})
