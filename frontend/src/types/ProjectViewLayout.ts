export type ProjectViewLayoutColumnField =
	| 'done'
	| 'title'
	| 'index'
	| 'project'
	| 'assignees'
	| 'due_date'
	| 'priority'
	| 'labels'
	| 'start_date'
	| 'end_date'
	| 'percent_done'
	| 'comment_count'
	| 'done_at'
	| 'created'
	| 'updated'
	| 'created_by'

export interface ProjectViewLayoutColumn {
	field: ProjectViewLayoutColumnField
	width: number
}

export interface ProjectViewLayoutGroup {
	field: 'section' | 'project' | 'assignee' | 'due_date' | 'priority' | 'label' | 'done'
	order: 'asc' | 'desc'
	show_empty: boolean
}

export type ProjectViewLayout = GeneratedProjectViewLayout

export interface NormalizedProjectViewLayout {
	version: 1
	mode: 'compact' | 'grid'
	columns: ProjectViewLayoutColumn[]
	group?: ProjectViewLayoutGroup
}
import type {ProjectViewLayout as GeneratedProjectViewLayout} from '@/client/generated'
