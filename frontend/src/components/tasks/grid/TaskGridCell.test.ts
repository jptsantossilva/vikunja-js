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
const updateTask = vi.hoisted(() => vi.fn())
vi.mock('@/client/queries/taskMutations', () => ({useUpdateTaskMutation: () => ({mutateAsync: updateTask})}))

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

describe('TaskGridCell dates', () => {
	function mountDateCell(dueDate: string | undefined, canWrite = true) {
		const pinia = createPinia()
		setActivePinia(pinia)
		return mount(TaskGridCell, {
			props: {task: {...parentTask, due_date: dueDate}, field: 'due_date', canWrite},
			global: {
				plugins: [pinia, i18n, [VueQueryPlugin, {queryClient: new QueryClient()}]],
				stubs: {Icon: true, Datepicker: {name: 'Datepicker', props: ['modelValue'], template: '<button @click="$emit(\'update:modelValue\', new Date(\'2026-12-01T12:00:00Z\'))"><slot name="trigger" /></button>'}},
			},
		})
	}

	it.each([undefined, '', '0001-01-01T00:00:00Z'])('offers a date picker for an unset date (%s)', async value => {
		updateTask.mockResolvedValue({...parentTask, due_date: '2026-12-01T12:00:00Z'})
		const wrapper = mountDateCell(value)
		expect(wrapper.find('input[type="date"]').exists()).toBe(false)
		await wrapper.get('button').trigger('click')
		expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({due_date: '2026-12-01T12:00:00.000Z'})
	})

	it('opens the same picker with an existing date and saves the new selection', async () => {
		updateTask.mockResolvedValue({...parentTask, due_date: '2026-12-01T12:00:00Z'})
		const wrapper = mountDateCell('2026-11-17T12:00:00Z')
		expect(wrapper.getComponent({name: 'Datepicker'}).props('modelValue')).toEqual(new Date('2026-11-17T12:00:00Z'))
		await wrapper.get('button').trigger('click')
		expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({due_date: '2026-12-01T12:00:00.000Z'})
	})

	it('shows an empty value to read-only users', () => {
		expect(mountDateCell('0001-01-01T00:00:00Z', false).text()).toBe('—')
	})
})

describe('TaskGridCell assignees', () => {
	it('opens the editor for a task and reflects assignment changes', async () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const wrapper = mount(TaskGridCell, {
			props: {task: {...parentTask, project_id: 3}, field: 'assignees', canWrite: true},
			global: {
				plugins: [pinia, i18n, [VueQueryPlugin, {queryClient: new QueryClient()}]],
				stubs: {
					Icon: true,
					Popup: {template: '<div><slot name="trigger" :toggle="() => true" :is-open="true"/><slot name="content" :is-open="true"/></div>'},
					EditAssignees: {name: 'EditAssignees', props: ['modelValue', 'projectId', 'taskId'], template: '<input />'},
				},
			},
		})
		await wrapper.get('.task-grid-cell__assignees').trigger('click')
		const editor = wrapper.getComponent({name: 'EditAssignees'})
		expect(editor.props()).toMatchObject({taskId: 1, projectId: 3, modelValue: []})
		editor.vm.$emit('update:modelValue', [{id: 2, username: 'joao'}])
		expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({assignees: [{id: 2, username: 'joao'}]})
	})

	it('does not show an assignment control without write access', () => {
		const pinia = createPinia()
		setActivePinia(pinia)
		const wrapper = mount(TaskGridCell, {
			props: {task: parentTask, field: 'assignees', canWrite: false},
			global: {plugins: [pinia, i18n, [VueQueryPlugin, {queryClient: new QueryClient()}]], stubs: {Icon: true}},
		})
		expect(wrapper.find('.task-grid-cell__assignees').exists()).toBe(false)
	})
})
