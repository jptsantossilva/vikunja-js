import {shallowMount, flushPromises} from '@vue/test-utils'
import {describe, expect, it, vi, beforeEach} from 'vitest'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'
import {nextTick} from 'vue'
import {createRouter, createMemoryHistory} from 'vue-router'
import {createPinia} from 'pinia'
import draggable from 'zhyswan-vuedraggable'

import type {Task as ITask} from '@/client/generated'

const sdk = vi.hoisted(() => ({
	tasksPositionUpdate: vi.fn(),
	projectViewTasksList: vi.fn(),
	projectTasksList: vi.fn(),
}))
const {tasksPositionUpdate: updatePosition} = sdk

vi.mock('@/client/generated', () => sdk)
vi.mock('@/stores/auth', () => ({useAuthStore: () => ({settings: {timezone: 'UTC'}})}))
vi.mock('@/message', () => ({error: vi.fn()}))
vi.mock('@/composables/useTaskDragToProject', () => ({
	useTaskDragToProject: () => ({
		handleTaskDropToProject: async () => ({moved: false, targetProjectId: null}),
	}),
}))

vi.mock('@/stores/base', () => ({
	useBaseStore: () => ({setHasTasks: vi.fn()}),
}))

vi.mock('@/composables/useCurrentProject', () => ({
	useCurrentProject: () => ({
		currentProject: {value: {id: 1, max_permission: 2}},
		isPending: {value: false},
	}),
}))

vi.mock('vue-i18n', async importOriginal => ({
	...await importOriginal<typeof import('vue-i18n')>(),
	useI18n: () => ({t: (key: string) => key}),
}))

import ProjectList from './ProjectList.vue'
import TaskGrid from '@/components/tasks/grid/TaskGrid.vue'

function makeTask(id: number, position: number): ITask {
	return {id, title: `Task ${id}`, position} as ITask
}

async function mountList(query = '') {
	const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: {render: () => null}}]})
	await router.push(`/${query}`)
	const wrapper = shallowMount(ProjectList, {
		props: {
			isLoadingProject: false,
			projectId: 1,
			viewId: 10,
		},
		global: {
			plugins: [
				router,
				createPinia(),
				[VueQueryPlugin, {queryClient: new QueryClient({defaultOptions: {queries: {retry: false}}})}],
			],
			mocks: {$t: (key: string) => key},
			stubs: {
				ProjectWrapper: {template: '<div><slot name="default"/></div>'},
			},
		},
	})

	await flushPromises()

	return wrapper
}

function dragEndEvent(taskId: string, newIndex: number) {
	const item = document.createElement('li')
	item.dataset.taskId = taskId
	const list = document.createElement('ul')
	return {item, to: list, from: list, newIndex}
}

describe('ProjectList', () => {
	beforeEach(() => {
		localStorage.clear()
		sdk.projectViewTasksList.mockClear()
		sdk.projectTasksList.mockResolvedValue({data: {items: [], page: 1, total_pages: 1}})
		updatePosition.mockReset()
		updatePosition.mockResolvedValue({data: {position: 200}})
		// Asymmetric positions: the midpoint between the neighbours must differ from the dragged task's own position.
		sdk.projectViewTasksList.mockResolvedValue({
			data: {
				items: [makeTask(1, 100), makeTask(2, 250), makeTask(3, 300)],
				page: 1,
				total_pages: 1,
			},
		})
	})

	it('requests filtered grid rows without expanding unfiltered subtasks', async () => {
		localStorage.setItem('project-view-layout-draft:anonymous:1:10', JSON.stringify({mode: 'grid'}))
		await mountList('?filter=done%20%3D%20false')

		expect(sdk.projectViewTasksList).toHaveBeenLastCalledWith(expect.objectContaining({
			query: expect.objectContaining({
				filter: 'done = false',
				expand: ['comment_count', 'is_unread'],
			}),
		}))
	})

	it('shows a matching child under its completed ancestors across result pages', async () => {
		localStorage.setItem('project-view-layout-draft:anonymous:1:10', JSON.stringify({mode: 'grid'}))
		const root = {id: 1, title: 'Root', done: true}
		const parent = {id: 2, title: 'Parent', done: true, related_tasks: {parenttask: [{id: 1}]}}
		const child = {id: 3, title: 'Child', done: false, related_tasks: {parenttask: [{id: 2}]}}
		const other = {id: 4, title: 'Other', done: false}
		const completed = {id: 5, title: 'Completed', done: true, related_tasks: {parenttask: [{id: 2}]}}
		sdk.projectViewTasksList.mockImplementation(async ({query}) => ({data: {
			items: query.page === 1 ? [other] : [child], page: query.page, total_pages: 2,
		}}))
		sdk.projectTasksList.mockResolvedValue({data: {items: [root, parent, child, other, completed], total_pages: 1}})
		const wrapper = await mountList('?filter=done%20%3D%20false')
		await flushPromises()
		expect(wrapper.findComponent(TaskGrid).props('tasks').map(task => task.id)).toEqual([1, 2, 3, 4])
		expect(sdk.projectTasksList).toHaveBeenCalledWith(expect.objectContaining({
			query: expect.objectContaining({sort_by: ['id'], order_by: ['asc']}),
		}))
	})

	it('saves the position of the dropped task', async () => {
		const wrapper = await mountList()

		// The DOM index sortable reports can point past the last task
		wrapper.findComponent(draggable).vm.$emit('end', dragEndEvent('2', 42))
		await flushPromises()

		expect(updatePosition).toHaveBeenCalledWith(expect.objectContaining({
			path: {task: 2},
			body: {position: 200, project_view_id: 10},
		}))
	})

	it('saves the position of a task reordered between two others', async () => {
		const wrapper = await mountList()
		const list = wrapper.findComponent(draggable)

		list.vm.$emit('update:modelValue', [makeTask(1, 100), makeTask(3, 300), makeTask(2, 250)])
		await nextTick()
		list.vm.$emit('end', dragEndEvent('3', 1))
		await flushPromises()

		expect(updatePosition).toHaveBeenCalledWith(expect.objectContaining({
			path: {task: 3},
			body: {position: 175, project_view_id: 10},
		}))
	})

	it('does nothing when the dropped task is gone', async () => {
		const wrapper = await mountList()

		wrapper.findComponent(draggable).vm.$emit('end', dragEndEvent('404', 0))
		await flushPromises()

		expect(updatePosition).not.toHaveBeenCalled()
	})
})
