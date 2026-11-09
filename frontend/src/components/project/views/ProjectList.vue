<template>
	<ProjectWrapper
		class="project-list"
		:is-loading-project="isLoadingProject"
		:project-id="projectId"
		:view-id
	>
		<template #header>
			<div class="filter-container">
				<XButton
					v-if="isGrid && layoutDraft.dirty.value && canAdmin"
					:loading="saveViewMutation.isPending.value"
					@click="saveGridLayout"
				>
					{{ $t('project.list.saveView') }}
				</XButton>
				<XButton
					v-if="isGrid && layoutDraft.dirty.value"
					variant="secondary"
					@click="layoutDraft.reset"
				>
					{{ $t('project.list.resetView') }}
				</XButton>
				<SortPopup
					v-model="sortByParam"
				/>
				<FilterPopup
					v-if="!isSavedFilterProject(project)"
					v-model="params"
					:view-id="viewId"
					:project-id="projectId"
					@update:modelValue="loadTasks()"
				/>
			</div>
		</template>

		<template #default>
			<div
				class="loader-container list-view"
				:class="{'is-loading': showLoading, 'is-max-width-desktop': !isGrid, 'is-grid': isGrid}"
			>
				<Card
					:padding="false"
					:has-content="false"
					class="has-overflow"
				>
					<AddTask
						v-if="!project?.is_archived && canWrite"
						ref="addTaskRef"
						class="list-view__add-task d-print-none"
						@tasksAdded="updateTaskList"
					/>

					<Nothing v-if="ctaVisible && tasks.length === 0 && !loading">
						{{ $t('project.list.empty') }}
						<ButtonLink
							v-if="(project?.id ?? 0) > 0 && canWrite"
							@click="focusNewTaskInput()"
						>
							{{ $t('project.list.newTaskCta') }}
						</ButtonLink>
					</Nothing>

					<TaskGrid
						v-if="isGrid && tasks.length > 0"
						:layout="layoutDraft.layout.value"
						:tasks
						:sections="gridSections"
						:can-write="canWrite"
						:can-reorder="canWrite && isPositionSorting && !gridSections"
						:sort-by-position="isPositionSorting"
						:view-id
						:collapsed-sections="collapsedSections"
						@update:layout="layoutDraft.update"
						@updated="refreshGrid"
						@deleted="refreshGrid"
						@hierarchyMoved="refreshGrid"
						@toggleSection="toggleSection"
						@renameSection="renameSection"
						@deleteSection="deleteSection"
						@tasksAddedToSection="moveNewTasksToSection"
					/>

					<draggable
						v-else-if="tasks && tasks.length > 0"
						v-model="tasks"
						:group="{name: 'tasks', put: false}"
						:disabled="!canDragTasks || !isPositionSorting"
						item-key="id"
						tag="ul"
						:component-data="{
							class: {
								tasks: true,
								'dragging-disabled': !canDragTasks || !isPositionSorting
							},
							type: 'transition-group'
						}"
						:animation="100"
						:handle="dragHandle"
						:delay-on-touch-only="!isTouchDevice"
						:delay="isTouchDevice ? 0 : 1000"
						ghost-class="task-ghost"
						@start="handleDragStart"
						@end="saveTaskPosition"
					>
						<template #item="{element: t, index}">
							<SingleTaskInProject
								:ref="(el) => setTaskRef(el as InstanceType<typeof SingleTaskInProject> | null, index)"
								:show-list-color="false"
								:can-mark-as-done="canWrite || isPseudoProject"
								:the-task="t"
								:all-tasks="allTasks"
								@taskUpdated="updateTasks"
							>
								<span
									v-if="canDragTasks && isPositionSorting"
									class="icon handle"
								>
									<Icon icon="grip-lines" />
								</span>
							</SingleTaskInProject>
						</template>
					</draggable>

					<Pagination
						:total-pages="totalPages"
						:current-page="currentPage"
					/>
				</Card>
			</div>
		</template>
	</ProjectWrapper>
</template>


<script setup lang="ts">
import {useMoveTaskMutation, useUpdateTaskPositionMutation} from '@/client/queries/taskMutations'
import {useDeleteBucketMutation, useUpdateBucketMutation} from '@/client/queries/kanbanMutations'
import {bucketsQuery} from '@/client/queries/kanban'
import {useUpdateProjectViewMutation} from '@/client/queries/projectViews'
import {useQuery} from '@tanstack/vue-query'
import {ref, computed, nextTick, onMounted, onBeforeUnmount, watch, toRef} from 'vue'
import {draggableFor} from '@/components/base/Draggable'

import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import ButtonLink from '@/components/misc/ButtonLink.vue'
import AddTask from '@/components/tasks/AddTask.vue'
import SingleTaskInProject from '@/components/tasks/partials/SingleTaskInProject.vue'
import FilterPopup from '@/components/project/partials/FilterPopup.vue'
import Nothing from '@/components/misc/Nothing.vue'
import Pagination from '@/components/misc/Pagination.vue'
import SortPopup from '@/components/project/partials/SortPopup.vue'
import TaskGrid from '@/components/tasks/grid/TaskGrid.vue'
import XButton from '@/components/input/Button.vue'

import {useTaskList} from '@/composables/useTaskList'
import {useTaskDragToProject} from '@/composables/useTaskDragToProject'
import {useCurrentProject} from '@/composables/useCurrentProject'
import {tasksForListPresentation} from '@/composables/useTaskListFiltering'
import {PERMISSIONS as Permissions} from '@/constants/permissions'
import {eventToShortcutString} from '@/helpers/shortcut'
import {calculateItemPosition} from '@/helpers/calculateItemPosition'
import type {TaskResponse} from '@/client/queries/tasks'
import {isSavedFilterProject} from '@/client/queries/projects'
import type {ProjectView, ProjectViewWritable, Task} from '@/client/generated'
import type {ProjectViewLayout} from '@/types/ProjectViewLayout'
import {useProjectViewLayoutDraft} from '@/composables/useProjectViewLayoutDraft'
import {getCollapsedBucketState, saveCollapsedBucketState, type CollapsedBuckets} from '@/helpers/saveCollapsedBucketState'

import {useBaseStore} from '@/stores/base'
import {useTaskDragState} from '@/composables/useTaskDragState'
import {useDelayedLoading} from '@/composables/useDelayedLoading'


const props = defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()

const draggable = draggableFor<TaskResponse>()

const projectId = toRef(props, 'projectId')

defineOptions({name: 'List'})

const ctaVisible = ref(false)

const drag = ref(false)

const {
	tasks: allTasks,
	loading,
	totalPages,
	currentPage,
	loadTasks,
	params,
	sortByParam,
} = useTaskList(
	() => projectId.value,
	() => props.viewId,
	{position: 'asc'},
	() => projectId.value === -1
		? ['comment_count', 'is_unread']
		: ['subtasks', 'comment_count', 'is_unread'],
)
const showLoading = useDelayedLoading(loading)

const positionMutation = useUpdateTaskPositionMutation()

const dragTasks = ref<TaskResponse[] | null>(null)
const isPositionSorting = computed(() => 'position' in sortByParam.value)

const baseStore = useBaseStore()
const {setDraggedTask} = useTaskDragState()
const {handleTaskDropToProject} = useTaskDragToProject()
const {currentProject: project} = useCurrentProject()
const currentView = computed(() => project.value?.views?.find(view => view.id === props.viewId))
const serverLayout = computed(() => (currentView.value as (ProjectView & {layout?: ProjectViewLayout}) | undefined)?.layout)
const layoutDraft = useProjectViewLayoutDraft(
	projectId,
	() => props.viewId,
	serverLayout,
	() => currentView.value?.updated,
)
const isGrid = computed(() => layoutDraft.layout.value.mode === 'grid')

const tasks = computed({
	get: () => dragTasks.value ?? tasksForListPresentation(allTasks.value, isGrid.value),
	set: value => { dragTasks.value = value },
})
watch([projectId, () => props.viewId], () => { dragTasks.value = null })

const canWrite = computed(() => {
	return typeof project.value?.max_permission === 'number' &&
		project.value.max_permission > Permissions.READ &&
		project.value.id > 0
})
const canAdmin = computed(() => (project.value?.max_permission ?? Permissions.READ) >= Permissions.ADMIN)

const bucketQuery = useQuery(computed(() => ({
	...bucketsQuery(projectId.value, props.viewId),
	enabled: isGrid.value && currentView.value?.bucket_configuration_mode === 'manual',
})))

const gridSections = computed(() => {
	if (layoutDraft.layout.value.group?.field !== 'section' || currentView.value?.bucket_configuration_mode !== 'manual') {
		return undefined
	}
	return (bucketQuery.data.value ?? [])
		.filter(bucket => bucket.id !== undefined)
		.map(bucket => ({
			id: bucket.id!,
			title: bucket.title ?? '',
			count: bucket.count ?? tasks.value.filter(task => task.bucket_id === bucket.id).length,
			tasks: tasks.value.filter(task => task.bucket_id === bucket.id),
		}))
})

const collapsedSections = ref<CollapsedBuckets>({})
watch(
	[projectId, () => props.viewId],
	([nextProjectId, nextViewId]) => {
		collapsedSections.value = getCollapsedBucketState(nextProjectId, nextViewId)
	},
	{immediate: true},
)

const saveViewMutation = useUpdateProjectViewMutation()
const moveTaskMutation = useMoveTaskMutation()
const updateBucketMutation = useUpdateBucketMutation()
const deleteBucketMutation = useDeleteBucketMutation()

async function saveGridLayout() {
	if (!currentView.value?.id || !canAdmin.value || layoutDraft.serverConflict.value) return
	const layout = layoutDraft.layout.value
	const updated = await saveViewMutation.mutateAsync({
		projectId: projectId.value,
		viewId: currentView.value.id,
		view: {layout} as ProjectViewWritable,
	})
	layoutDraft.markSaved(layout, updated.updated)
}

function toggleSection(sectionId: number) {
	collapsedSections.value = {
		...collapsedSections.value,
		[sectionId]: !collapsedSections.value[sectionId],
	}
	saveCollapsedBucketState(projectId.value, collapsedSections.value, props.viewId)
}

async function renameSection(sectionId: number, title: string) {
	const bucket = (bucketQuery.data.value ?? []).find(item => item.id === sectionId)
	if (!bucket) return
	await updateBucketMutation.mutateAsync({
		project: projectId.value,
		view: props.viewId,
		bucket: {
			id: sectionId,
			title,
			limit: bucket.limit ?? 0,
			position: bucket.position ?? 0,
		},
	})
}

async function deleteSection(sectionId: number) {
	await deleteBucketMutation.mutateAsync({project: projectId.value, view: props.viewId, bucket: sectionId})
	await refreshGrid()
}

async function moveNewTasksToSection(newTasks: Task[], sectionId: number) {
	for (const task of newTasks) {
		if (task.id === undefined) continue
		await moveTaskMutation.mutateAsync({
			project: projectId.value,
			view: props.viewId,
			bucket: sectionId,
			task,
		})
	}
	await refreshGrid()
}

async function refreshGrid() {
	await Promise.all([loadTasks(), bucketQuery.refetch()])
}

const isPseudoProject = computed(() => isSavedFilterProject(project.value) || project.value?.id === -1)

onMounted(async () => {
	await nextTick()
	ctaVisible.value = true
})

const canDragTasks = computed(() => canWrite.value || isSavedFilterProject(project.value))

const isTouchDevice = ref(false)
if (typeof window !== 'undefined') {
	isTouchDevice.value = !window.matchMedia('(hover: hover) and (pointer: fine)').matches
}
const dragHandle = computed(() => isTouchDevice.value ? '.handle' : undefined)

const addTaskRef = ref<typeof AddTask | null>(null)

function focusNewTaskInput() {
	addTaskRef.value?.focusTaskInput()
}

function updateTaskList() {
	baseStore.setHasTasks(true)
	if (isGrid.value) void refreshGrid()
}

function updateTasks() {
	if (projectId.value < 0) void loadTasks()
}

function handleDragStart(e: { item: HTMLElement }) {
	drag.value = true
	dragTasks.value = [...tasks.value]
	const taskId = parseInt(e.item.dataset.taskId ?? '', 10)
	const task = tasks.value.find(t => t.id === taskId)

	if (task) {
		setDraggedTask(task)
	}
}

async function saveTaskPosition(e: { originalEvent?: MouseEvent, to: HTMLElement, from: HTMLElement, item: HTMLElement, newIndex: number }) {
	drag.value = false
	try {

		// Check if dropped on a sidebar project
		const {moved} = await handleTaskDropToProject(e, (task) => {
			tasks.value = tasks.value.filter(t => t.id !== task.id)
		})

		if (moved) {
			return
		}

		// If dropped outside this list
		if (e.to !== e.from) {
			return
		}

		// e.newIndex is a DOM index: it counts elements still leaving the transition group, so it can
		// point past the last task. The list is already reordered here, so resolve the task by its id.
		const movedTaskId = parseInt(e.item.dataset.taskId ?? '', 10)
		const newIndex = tasks.value.findIndex(t => t.id === movedTaskId)

		if (newIndex === -1) {
			return
		}

		const taskBefore = tasks.value[newIndex - 1] ?? null
		const taskAfter = tasks.value[newIndex + 1] ?? null

		const position = calculateItemPosition(
			taskBefore !== null ? taskBefore.position : null,
			taskAfter !== null ? taskAfter.position : null,
		)

		await positionMutation.mutateAsync({
			position,
			project_view_id: props.viewId,
			taskId: movedTaskId,
		})
	} catch { /* Mutation reports the error. */ } finally {
		dragTasks.value = null
	}
}

const taskRefs = ref<(InstanceType<typeof SingleTaskInProject> | null)[]>([])
const focusedIndex = ref(-1)

function setTaskRef(el: InstanceType<typeof SingleTaskInProject> | null, index: number) {
	if (el === null) {
		delete taskRefs.value[index]
	} else {
		taskRefs.value[index] = el
	}
}

function focusTask(index: number) {
	if (index < 0 || index >= tasks.value.length) {
		return
	}

	const taskRef = taskRefs.value[index]

	focusedIndex.value = index
	taskRef?.focus()
}

function handleListNavigation(e: KeyboardEvent) {
	if (e.target instanceof HTMLElement && (e.target.closest('input, textarea, select, [contenteditable="true"]'))) {
		return
	}

	const shortcut = eventToShortcutString(e)
	if (shortcut === 'KeyJ') {
		e.preventDefault()
		focusTask(Math.min(focusedIndex.value + 1, tasks.value.length - 1))
		return
	}

	if (shortcut === 'KeyK') {
		e.preventDefault()
		if (focusedIndex.value === -1) {
			focusTask(tasks.value.length - 1)
			return
		}

		if (focusedIndex.value === 0) {
			addTaskRef.value?.focusTaskInput()
			focusedIndex.value = -1
			return
		}

		focusTask(Math.max(focusedIndex.value - 1, 0))
		return
	}

	if (shortcut === 'Enter') {
		// Links and buttons activate natively on Enter; leave them alone
		if (e.target instanceof HTMLElement && e.target.closest('a, button, [role="button"]')) {
			return
		}

		// Only act when a row was focused via J/K roving navigation
		if (focusedIndex.value < 0) {
			return
		}

		e.preventDefault()
		taskRefs.value[focusedIndex.value]?.click(e)
	}
}

onMounted(() => {
	document.addEventListener('keydown', handleListNavigation)
})

onBeforeUnmount(() => {
	document.removeEventListener('keydown', handleListNavigation)
})
</script>

<style lang="scss" scoped>
.filter-container {
	display: flex;
	align-items: center;
	gap: .5rem;

	:deep(.popup) {
		max-inline-size: 300px;
	}
}

.tasks {
	padding: .5rem;
}

.task-ghost {
	border-radius: $radius;
	background: var(--grey-100);
	border: 2px dashed var(--grey-300);

	* {
		opacity: 0;
	}
}

.list-view__add-task {
	padding: 1rem 1rem 0;
}

.link-share-view .card {
	border: none;
	box-shadow: none;
}

:deep(.single-task .handle) {
	cursor: grab;
	margin-inline-end: .25rem;
	color: var(--grey-400);
}

@media (hover: hover) and (pointer: fine) {
	:deep(.single-task .handle) {
		display: none;
	}
}

:deep(.tasks:not(.dragging-disabled) .single-task) {
	cursor: grab;
	-webkit-touch-callout: none;
	user-select: none;
	touch-action: manipulation;

	&:active {
		cursor: grabbing;
	}
}

.list-view {
	padding-block-end: 1rem;

	:deep(.card) {
		margin-block-end: 0;
	}
}

.list-view.is-grid {
	inline-size: 100%;
	max-inline-size: none;
	padding-inline: 1rem;
}
</style>
