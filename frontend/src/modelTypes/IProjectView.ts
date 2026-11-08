import type {IAbstract} from './IAbstract'
import type {IProject} from '@/modelTypes/IProject'
import type {IFilters} from '@/modelTypes/ISavedFilter'

export const PROJECT_VIEW_KINDS = {
	LIST: 'list',
	GANTT: 'gantt',
	TABLE: 'table',
	KANBAN: 'kanban',
} as const
export type ProjectViewKind = typeof PROJECT_VIEW_KINDS[keyof typeof PROJECT_VIEW_KINDS]

export const DEFAULT_PROJECT_VIEW_SETTINGS = {
	FIRST: 'first',
	...PROJECT_VIEW_KINDS,
} as const
export type DefaultProjectViewKind = typeof DEFAULT_PROJECT_VIEW_SETTINGS[keyof typeof DEFAULT_PROJECT_VIEW_SETTINGS]

export const PROJECT_VIEW_BUCKET_CONFIGURATION_MODES = ['none', 'manual', 'filter']
export type ProjectViewBucketConfigurationMode = typeof PROJECT_VIEW_BUCKET_CONFIGURATION_MODES[number]

export interface IProjectViewBucketConfiguration {
	title: string
	filter: IFilters
}

export type ProjectViewLayoutMode = 'compact' | 'grid'
export type ProjectViewLayoutColumnField =
	'done' | 'title' | 'index' | 'project' | 'assignees' | 'due_date' |
	'priority' | 'labels' | 'start_date' | 'end_date' | 'percent_done' |
	'comment_count' | 'done_at' | 'created' | 'updated' | 'created_by'
export type ProjectViewLayoutGroupField =
	'section' | 'project' | 'assignee' | 'due_date' | 'priority' | 'label' | 'done'

export interface IProjectViewLayoutColumn {
	field: ProjectViewLayoutColumnField
	width: number
}

export interface IProjectViewLayoutGroup {
	field: ProjectViewLayoutGroupField
	order: 'asc' | 'desc'
	showEmpty: boolean
}

export interface IProjectViewLayout {
	version: 1
	mode: ProjectViewLayoutMode
	columns: IProjectViewLayoutColumn[]
	group?: IProjectViewLayoutGroup
}

export interface IProjectView extends IAbstract {
	id: number
	title: string
	projectId: IProject['id']
	viewKind: ProjectViewKind

	filter: IFilters
	position: number

	bucketConfigurationMode: ProjectViewBucketConfigurationMode
	bucketConfiguration: IProjectViewBucketConfiguration[]
	defaultBucketId: number
	doneBucketId: number
	layout?: IProjectViewLayout

	created: Date
	updated: Date
}
