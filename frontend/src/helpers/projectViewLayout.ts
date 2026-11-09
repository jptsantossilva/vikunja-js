import type {
	NormalizedProjectViewLayout,
	ProjectViewLayout,
	ProjectViewLayoutColumn,
	ProjectViewLayoutColumnField,
} from '@/types/ProjectViewLayout'

export interface TaskGridColumnDefinition {
	field: ProjectViewLayoutColumnField
	minWidth: number
	maxWidth: number
	defaultWidth: number
	required?: boolean
	editable?: boolean
	mobile?: boolean
}

export const TASK_GRID_COLUMNS: Record<ProjectViewLayoutColumnField, TaskGridColumnDefinition> = {
	done: {field: 'done', minWidth: 44, maxWidth: 64, defaultWidth: 48, required: true, editable: true, mobile: true},
	title: {field: 'title', minWidth: 240, maxWidth: 900, defaultWidth: 520, required: true, editable: true, mobile: true},
	index: {field: 'index', minWidth: 72, maxWidth: 140, defaultWidth: 84},
	project: {field: 'project', minWidth: 120, maxWidth: 320, defaultWidth: 180},
	assignees: {field: 'assignees', minWidth: 120, maxWidth: 320, defaultWidth: 150, editable: true, mobile: true},
	due_date: {field: 'due_date', minWidth: 120, maxWidth: 240, defaultWidth: 140, editable: true, mobile: true},
	priority: {field: 'priority', minWidth: 110, maxWidth: 220, defaultWidth: 130, editable: true},
	labels: {field: 'labels', minWidth: 140, maxWidth: 420, defaultWidth: 220, editable: true},
	start_date: {field: 'start_date', minWidth: 120, maxWidth: 240, defaultWidth: 140, editable: true},
	end_date: {field: 'end_date', minWidth: 120, maxWidth: 240, defaultWidth: 140, editable: true},
	percent_done: {field: 'percent_done', minWidth: 110, maxWidth: 180, defaultWidth: 130, editable: true},
	comment_count: {field: 'comment_count', minWidth: 90, maxWidth: 160, defaultWidth: 110},
	done_at: {field: 'done_at', minWidth: 120, maxWidth: 240, defaultWidth: 150},
	created: {field: 'created', minWidth: 120, maxWidth: 240, defaultWidth: 150},
	updated: {field: 'updated', minWidth: 120, maxWidth: 240, defaultWidth: 150},
	created_by: {field: 'created_by', minWidth: 120, maxWidth: 260, defaultWidth: 160},
}

export const DEFAULT_TASK_GRID_COLUMNS: ProjectViewLayoutColumnField[] = [
	'done',
	'title',
	'assignees',
	'due_date',
]

export function createDefaultProjectViewLayout(mode: NormalizedProjectViewLayout['mode'] = 'grid'): NormalizedProjectViewLayout {
	return {
		version: 1,
		mode,
		columns: DEFAULT_TASK_GRID_COLUMNS.map(field => ({
			field,
			width: TASK_GRID_COLUMNS[field].defaultWidth,
		})),
		group: mode === 'grid'
			? {field: 'section', order: 'asc', show_empty: false}
			: undefined,
	}
}

export function normalizeProjectViewLayout(layout?: ProjectViewLayout | null): NormalizedProjectViewLayout | undefined {
	if (!layout) {
		return undefined
	}

	const seen = new Set<ProjectViewLayoutColumnField>()
	const columns = (layout.columns ?? []).reduce<ProjectViewLayoutColumn[]>((result, column) => {
		const field = column.field as ProjectViewLayoutColumnField | undefined
		if (!field || !(field in TASK_GRID_COLUMNS) || seen.has(field)) {
			return result
		}
		const definition = TASK_GRID_COLUMNS[field]
		seen.add(field)
		result.push({
			field,
			width: Math.min(
				definition.maxWidth,
				Math.max(definition.minWidth, column.width ?? definition.defaultWidth),
			),
		})
		return result
	}, [])

	for (const field of ['done', 'title'] as const) {
		if (!seen.has(field)) {
			columns.unshift({field, width: TASK_GRID_COLUMNS[field].defaultWidth})
		}
	}

	const groupFields = new Set(['section', 'project', 'assignee', 'due_date', 'priority', 'label', 'done'])
	const group = layout.group?.field && groupFields.has(layout.group.field)
		? {
			field: layout.group.field as NonNullable<NormalizedProjectViewLayout['group']>['field'],
			order: layout.group.order === 'desc' ? 'desc' as const : 'asc' as const,
			show_empty: layout.group.show_empty ?? false,
		}
		: undefined

	return {
		version: 1,
		mode: layout.mode === 'grid' ? 'grid' : 'compact',
		columns,
		group,
	}
}
