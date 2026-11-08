import {describe, expect, it} from 'vitest'

import type {ITask} from '@/modelTypes/ITask'
import {buildTaskTree, sortTasksByPosition} from './taskTree'

function task(id: number, title: string, parentId = 0, position = 0): ITask {
	return {
		id,
		title,
		position,
		parentTaskId: 0,
		relatedTasks: parentId > 0
			? {parenttask: [{id: parentId} as ITask]}
			: {},
	} as ITask
}

describe('buildTaskTree', () => {
	it('orders expanded subtasks by their manual positions', () => {
		const tasks = [
			task(1, 'Parent', 0, 50),
			task(2, 'Third by id', 1, 300),
			task(3, 'First by position', 1, 100),
			task(4, 'Second by position', 1, 200),
		]

		const rows = buildTaskTree(sortTasksByPosition(tasks))

		expect(rows.map(row => row.task.id)).toEqual([1, 3, 4, 2])
		expect(rows.map(row => row.rowNumber)).toEqual(['1', '1.1', '1.2', '1.3'])
	})

	it('nests subtasks using Vikunja parenttask relations', () => {
		const rows = buildTaskTree([
			task(1, 'Parent'),
			task(2, 'Child', 1),
			task(3, 'Grandchild', 2),
			task(4, 'Sibling root'),
		])

		expect(rows.map(row => [row.task.title, row.depth, row.hasChildren])).toEqual([
			['Parent', 0, true],
			['Child', 1, true],
			['Grandchild', 2, false],
			['Sibling root', 0, false],
		])
	})

	it('assigns stable hierarchical row numbers', () => {
		const tasks = [
			task(1, 'Parent'),
			task(2, 'Child', 1),
			task(3, 'Grandchild', 2),
			task(4, 'Second root'),
		]

		expect(buildTaskTree(tasks).map(row => row.rowNumber)).toEqual(['1', '1.1', '1.1.1', '2'])
		expect(buildTaskTree(tasks, new Set([1])).map(row => row.rowNumber)).toEqual(['1', '2'])
	})

	it('hides descendants of collapsed tasks', () => {
		const rows = buildTaskTree([
			task(1, 'Parent'),
			task(2, 'Child', 1),
		], new Set([1]))

		expect(rows.map(row => row.task.title)).toEqual(['Parent'])
		expect(rows[0].hasChildren).toBe(true)
	})

	it('keeps a subtask at root level when its parent is not in the view', () => {
		const rows = buildTaskTree([task(2, 'Cross-project child', 1)])

		expect(rows).toHaveLength(1)
		expect(rows[0].depth).toBe(0)
	})

	it('supports the legacy parentTaskId field as a fallback', () => {
		const parent = task(1, 'Parent')
		const child = task(2, 'Child')
		child.parentTaskId = 1

		const rows = buildTaskTree([parent, child])

		expect(rows.map(row => [row.task.title, row.depth])).toEqual([
			['Parent', 0],
			['Child', 1],
		])
	})
})
