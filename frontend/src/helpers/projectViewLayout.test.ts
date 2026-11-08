import {describe, expect, it} from 'vitest'

import {
	createDefaultProjectViewLayout,
	normalizeProjectViewLayout,
	TASK_GRID_COLUMNS,
} from './projectViewLayout'

describe('project view layout', () => {
	it('creates a grid layout with immutable columns', () => {
		const layout = createDefaultProjectViewLayout('grid')

		expect(layout.mode).toBe('grid')
		expect(layout.columns.map(column => column.field)).toEqual([
			'done',
			'title',
			'assignees',
			'due_date',
		])
		expect(layout.group?.field).toBe('section')
	})

	it('ignores unknown and duplicate columns when reading', () => {
		const layout = normalizeProjectViewLayout({
			version: 1,
			mode: 'grid',
			columns: [
				{field: 'title', width: 520},
				{field: 'title', width: 600},
				{field: 'unknown', width: 100},
			] as never,
		})

		expect(layout?.columns.map(column => column.field)).toEqual(['done', 'title'])
	})

	it('clamps widths to the column registry', () => {
		const layout = normalizeProjectViewLayout({
			version: 1,
			mode: 'grid',
			columns: [
				{field: 'done', width: 1},
				{field: 'title', width: 5000},
			],
		})

		expect(layout?.columns[0].width).toBe(TASK_GRID_COLUMNS.done.minWidth)
		expect(layout?.columns[1].width).toBe(TASK_GRID_COLUMNS.title.maxWidth)
	})
})
