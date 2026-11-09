import {computed, ref, toValue, watch, type MaybeRefOrGetter} from 'vue'

import type {
	NormalizedProjectViewLayout,
	ProjectViewLayout,
	ProjectViewLayoutColumnField,
} from '@/types/ProjectViewLayout'
import {
	createDefaultProjectViewLayout,
	normalizeProjectViewLayout,
	TASK_GRID_COLUMNS,
} from '@/helpers/projectViewLayout'
import {useAuthStore} from '@/stores/auth'

function cloneLayout(layout: NormalizedProjectViewLayout): NormalizedProjectViewLayout {
	return JSON.parse(JSON.stringify(layout))
}

function dateKey(value?: Date | string): string {
	if (!value) return ''
	const date = value instanceof Date ? value : new Date(value)
	return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function useProjectViewLayoutDraft(
	projectId: MaybeRefOrGetter<number>,
	viewId: MaybeRefOrGetter<number>,
	serverLayout: MaybeRefOrGetter<ProjectViewLayout | undefined>,
	serverUpdated: MaybeRefOrGetter<Date | string | undefined>,
) {
	const authStore = useAuthStore()
	const layout = ref<NormalizedProjectViewLayout>(createDefaultProjectViewLayout('compact'))
	const baseLayout = ref<NormalizedProjectViewLayout>(createDefaultProjectViewLayout('compact'))
	const baseUpdated = ref('')
	const initializedKey = ref('')

	const storageKey = computed(() => [
		'project-view-layout-draft',
		authStore.info?.id || 'anonymous',
		toValue(projectId),
		toValue(viewId),
	].join(':'))

	function layoutFromUrl(): NormalizedProjectViewLayout | undefined {
		if (typeof window === 'undefined') return undefined
		const query = new URLSearchParams(window.location.search)
		const mode = query.get('list_mode')
		const columnFields = query.get('columns')?.split(',')
		if (mode !== 'compact' && mode !== 'grid' && !columnFields) return undefined

		const candidate = createDefaultProjectViewLayout(mode === 'grid' ? 'grid' : 'compact')
		if (columnFields) {
			candidate.columns = columnFields
				.filter((field): field is ProjectViewLayoutColumnField => field in TASK_GRID_COLUMNS)
				.map(field => ({field, width: TASK_GRID_COLUMNS[field].defaultWidth}))
		}
		const group = query.get('group_by')
		if (group && ['section', 'project', 'assignee', 'due_date', 'priority', 'label', 'done'].includes(group)) {
			candidate.group = {
				field: group as NonNullable<NormalizedProjectViewLayout['group']>['field'],
				order: query.get('group_order') === 'desc' ? 'desc' : 'asc',
				show_empty: query.get('show_empty_groups') === 'true',
			}
		}
		return normalizeProjectViewLayout(candidate)
	}

	function initialize() {
		const shared = normalizeProjectViewLayout(toValue(serverLayout)) || createDefaultProjectViewLayout('compact')
		baseLayout.value = cloneLayout(shared)
		baseUpdated.value = dateKey(toValue(serverUpdated))

		let draft: NormalizedProjectViewLayout | undefined
		try {
			const raw = localStorage.getItem(storageKey.value)
			draft = raw ? normalizeProjectViewLayout(JSON.parse(raw)) : undefined
		} catch {
			localStorage.removeItem(storageKey.value)
		}

		layout.value = cloneLayout(layoutFromUrl() || draft || shared)
		initializedKey.value = storageKey.value
	}

	const dirty = computed(() => JSON.stringify(layout.value) !== JSON.stringify(baseLayout.value))
	const serverConflict = computed(() => dirty.value
		&& baseUpdated.value !== dateKey(toValue(serverUpdated)))

	watch(
		[storageKey, () => toValue(serverLayout), () => toValue(serverUpdated)],
		() => {
			if (initializedKey.value !== storageKey.value || !dirty.value) initialize()
		},
		{immediate: true, deep: true},
	)

	function update(nextLayout: NormalizedProjectViewLayout) {
		layout.value = cloneLayout(normalizeProjectViewLayout(nextLayout) || createDefaultProjectViewLayout('compact'))
		localStorage.setItem(storageKey.value, JSON.stringify(layout.value))
	}

	function reset() {
		localStorage.removeItem(storageKey.value)
		layout.value = cloneLayout(baseLayout.value)
	}

	function markSaved(savedLayout: NormalizedProjectViewLayout, updated?: Date | string) {
		localStorage.removeItem(storageKey.value)
		baseLayout.value = cloneLayout(savedLayout)
		layout.value = cloneLayout(savedLayout)
		baseUpdated.value = dateKey(updated)
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href)
			for (const key of ['list_mode', 'columns', 'group_by', 'group_order', 'show_empty_groups']) {
				url.searchParams.delete(key)
			}
			window.history.replaceState(window.history.state, '', url)
		}
	}

	return {
		layout,
		dirty,
		serverConflict,
		update,
		reset,
		markSaved,
	}
}
