import {describe, expect, it} from 'vitest'

import type {TaskResponse} from '@/client/queries/tasks'
import {calculateTaskHierarchyDrop, getTaskHierarchyDropMode} from './taskHierarchyDrop'

function task(id: number, position: number, parentId = 0): TaskResponse {
	return {
		id,
		position,
		title: `Task ${id}`,
		related_tasks: parentId > 0
			? {parenttask: [{id: parentId} as TaskResponse]}
			: {},
	} as TaskResponse
}

const tasks = [
	task(1, 100),
	task(2, 200, 1),
	task(3, 300, 2),
	task(4, 400),
]

describe('calculateTaskHierarchyDrop', () => {
	it('maps the row quarters to explicit drop modes', () => {
		expect(getTaskHierarchyDropMode(0.1)).toBe('before')
		expect(getTaskHierarchyDropMode(0.5)).toBe('inside')
		expect(getTaskHierarchyDropMode(0.9)).toBe('after')
	})
	it('moves a complete branch inside another task', () => {
		expect(calculateTaskHierarchyDrop(tasks, 1, 4, 'inside')).toEqual({
			parentTaskId: 4,
			position: 0,
		})
	})

	it('moves a subtask to the root after the existing roots', () => {
		expect(calculateTaskHierarchyDrop(tasks, 2, null, 'root')).toEqual({
			parentTaskId: null,
			position: 65936,
		})
	})

	it('places a task before a sibling', () => {
		expect(calculateTaskHierarchyDrop(tasks, 1, 4, 'before')).toEqual({
			parentTaskId: null,
			position: 200,
		})
	})

	it('rejects dropping a task inside its own descendant', () => {
		expect(calculateTaskHierarchyDrop(tasks, 1, 3, 'inside')).toBeNull()
	})
})
