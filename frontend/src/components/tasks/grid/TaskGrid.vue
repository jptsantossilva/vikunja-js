<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'

import TaskGridCell from '@/components/tasks/grid/TaskGridCell.vue'
import AddTask from '@/components/tasks/AddTask.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import Popup from '@/components/misc/Popup.vue'
import type {ITask} from '@/modelTypes/ITask'
import type {IBucket} from '@/modelTypes/IBucket'
import type {
	IProjectViewLayout,
	ProjectViewLayoutColumnField,
} from '@/modelTypes/IProjectView'
import {TASK_GRID_COLUMNS} from '@/helpers/projectViewLayout'
import {buildTaskTree, getParentTaskId, sortTasksByPosition} from '@/helpers/taskTree'
import {
	calculateTaskHierarchyDrop,
	getTaskHierarchyDropMode,
	type TaskHierarchyDropMode,
} from '@/helpers/taskHierarchyDrop'
import TaskBulkService from '@/services/taskBulk'
import TaskHierarchyPositionService from '@/services/taskHierarchyPosition'
import TaskHierarchyPositionModel from '@/models/taskHierarchyPosition'
import {error, success} from '@/message'

interface TaskGridSection extends Pick<IBucket, 'id' | 'title' | 'count'> {
	tasks: ITask[]
}

const props = defineProps<{
	layout: IProjectViewLayout
	tasks: ITask[]
	sections?: TaskGridSection[]
	canWrite: boolean
	canReorder?: boolean
	sortByPosition?: boolean
	viewId: number
	collapsedSections?: Record<number, boolean>
}>()

const emit = defineEmits<{
	'update:layout': [layout: IProjectViewLayout]
	'updated': [task: ITask]
	'toggleSection': [sectionId: number]
	'renameSection': [sectionId: number, title: string]
	'deleteSection': [sectionId: number]
	'taskAddedToSection': [task: ITask, sectionId: number]
	'deleted': [taskIds: number[]]
	'hierarchyMoved': []
}>()

const {t} = useI18n({useScope: 'global'})

const selectedTaskIds = ref(new Set<number>())
const lastSelectedIndex = ref<number | null>(null)
const bulkLoading = ref(false)
const collapsedTasks = ref(new Set<number>())
const draggedTaskId = ref<number | null>(null)
const movingTaskId = ref<number | null>(null)
const dropTarget = ref<{taskId: number | null, mode: TaskHierarchyDropMode} | null>(null)
const invalidDropTargetId = ref<number | null>(null)
const hierarchyPositionService = new TaskHierarchyPositionService()

const columnLabels: Record<ProjectViewLayoutColumnField, string> = {
	done: 'task.attributes.done',
	title: 'task.attributes.name',
	index: 'task.attributes.id',
	project: 'task.attributes.project',
	assignees: 'task.attributes.assignees',
	due_date: 'task.attributes.dueDate',
	priority: 'task.attributes.priority',
	labels: 'task.attributes.labels',
	start_date: 'task.attributes.startDate',
	end_date: 'task.attributes.endDate',
	percent_done: 'task.attributes.percentDone',
	comment_count: 'task.attributes.commentCount',
	done_at: 'task.attributes.doneAt',
	created: 'task.attributes.created',
	updated: 'task.attributes.updated',
	created_by: 'task.attributes.createdBy',
}

const gridTemplateColumns = computed(() => [
	'40px',
	'72px',
	...props.layout.columns.map(column => `${column.width}px`),
].join(' '))

function orderTasks(tasks: ITask[]): ITask[] {
	return props.sortByPosition ? sortTasksByPosition(tasks) : tasks
}

const allVisibleTasks = computed(() => {
	const source = props.sections?.flatMap(section => section.tasks) || props.tasks
	const uniqueTasks = [...new Map(source.map(task => [task.id, task])).values()]
	return orderTasks(uniqueTasks)
})

const hasSelection = computed(() => selectedTaskIds.value.size > 0)
const allSelected = computed(() => allVisibleTasks.value.length > 0 && allVisibleTasks.value.every(task => selectedTaskIds.value.has(task.id)))

function toggleTask(taskId: number) {
	const next = new Set(collapsedTasks.value)
	if (next.has(taskId)) {
		next.delete(taskId)
	} else {
		next.add(taskId)
	}
	collapsedTasks.value = next
}

function updateColumnVisibility(field: ProjectViewLayoutColumnField, visible: boolean) {
	const required = TASK_GRID_COLUMNS[field].required
	if (!visible && required) {
		return
	}
	const columns = props.layout.columns.filter(column => column.field !== field)
	if (visible) {
		columns.push({field, width: TASK_GRID_COLUMNS[field].defaultWidth})
	}
	emit('update:layout', {...props.layout, columns})
}

function moveColumn(field: ProjectViewLayoutColumnField, direction: -1 | 1) {
	const columns = [...props.layout.columns]
	const index = columns.findIndex(column => column.field === field)
	const target = index + direction
	if (TASK_GRID_COLUMNS[field].required || index < 0 || target < 2 || target >= columns.length) return
	const [column] = columns.splice(index, 1)
	columns.splice(target, 0, column)
	emit('update:layout', {...props.layout, columns})
}

function resizeColumn(field: ProjectViewLayoutColumnField, event: PointerEvent) {
	const startX = event.clientX
	const column = props.layout.columns.find(column => column.field === field)
	if (!column) return
	const startWidth = column.width
	const definition = TASK_GRID_COLUMNS[field]

	const move = (moveEvent: PointerEvent) => {
		const width = Math.min(definition.maxWidth, Math.max(definition.minWidth, startWidth + moveEvent.clientX - startX))
		emit('update:layout', {
			...props.layout,
			columns: props.layout.columns.map(item => item.field === field ? {...item, width} : item),
		})
	}
	const stop = () => {
		window.removeEventListener('pointermove', move)
		window.removeEventListener('pointerup', stop)
	}
	window.addEventListener('pointermove', move)
	window.addEventListener('pointerup', stop)
}

function selectTask(task: ITask, event: MouseEvent) {
	if (!props.canWrite) return
	const index = allVisibleTasks.value.findIndex(item => item.id === task.id)
	const next = new Set(selectedTaskIds.value)
	if (event.shiftKey && lastSelectedIndex.value !== null) {
		const from = Math.min(lastSelectedIndex.value, index)
		const to = Math.max(lastSelectedIndex.value, index)
		allVisibleTasks.value.slice(from, to + 1).forEach(item => next.add(item.id))
	} else if (event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest('.task-grid__selection')) {
		if (next.has(task.id)) {
			next.delete(task.id)
		} else {
			next.add(task.id)
		}
	} else {
		return
	}
	selectedTaskIds.value = next
	lastSelectedIndex.value = index
}

function selectAll() {
	selectedTaskIds.value = allSelected.value
		? new Set()
		: new Set(allVisibleTasks.value.map(task => task.id))
}

async function bulkUpdate(fields: string[], values: Partial<ITask>) {
	bulkLoading.value = true
	try {
		const tasks = await new TaskBulkService().update([...selectedTaskIds.value], fields, values)
		tasks.forEach(task => emit('updated', task))
		selectedTaskIds.value = new Set()
	} catch (e) {
		error(e)
	} finally {
		bulkLoading.value = false
	}
}

async function deleteSelected() {
	if (!window.confirm(t('project.list.deleteSelectedConfirm', {count: selectedTaskIds.value.size}))) return
	bulkLoading.value = true
	const taskIds = [...selectedTaskIds.value]
	try {
		await new TaskBulkService().delete(taskIds)
		emit('deleted', taskIds)
		selectedTaskIds.value = new Set()
	} catch (e) {
		error(e)
	} finally {
		bulkLoading.value = false
	}
}

function getDropMode(event: DragEvent): TaskHierarchyDropMode {
	const row = event.currentTarget as HTMLElement
	const ratio = (event.clientY - row.getBoundingClientRect().top) / row.getBoundingClientRect().height
	return getTaskHierarchyDropMode(ratio)
}

function startHierarchyDrag(task: ITask, event: DragEvent) {
	if (!props.canReorder || movingTaskId.value !== null) {
		event.preventDefault()
		return
	}
	draggedTaskId.value = task.id
	event.dataTransfer?.setData('text/plain', String(task.id))
	if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function updateDropTarget(taskId: number | null, mode: TaskHierarchyDropMode, event: DragEvent) {
	if (draggedTaskId.value === null) return
	const result = calculateTaskHierarchyDrop(allVisibleTasks.value, draggedTaskId.value, taskId, mode)
	if (!result) {
		dropTarget.value = null
		invalidDropTargetId.value = taskId
		return
	}
	event.preventDefault()
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
	dropTarget.value = {taskId, mode}
	invalidDropTargetId.value = null
}

function dragOverTask(task: ITask, event: DragEvent) {
	updateDropTarget(task.id, getDropMode(event), event)
}

function clearHierarchyDrag() {
	draggedTaskId.value = null
	dropTarget.value = null
	invalidDropTargetId.value = null
}

function emitOptimisticHierarchyUpdate(task: ITask, parentTaskId: number | null, position: number) {
	const parentTask = parentTaskId === null
		? null
		: allVisibleTasks.value.find(candidate => candidate.id === parentTaskId) || null
	emit('updated', {
		...task,
		position,
		relatedTasks: {
			...task.relatedTasks,
			parenttask: parentTask ? [parentTask] : [],
		},
	})
}

async function dropTask(taskId: number | null, mode: TaskHierarchyDropMode, event: DragEvent) {
	event.preventDefault()
	const movingId = draggedTaskId.value
	if (movingId === null) return
	const result = calculateTaskHierarchyDrop(allVisibleTasks.value, movingId, taskId, mode)
	if (!result) {
		clearHierarchyDrag()
		return
	}

	const taskIds = new Set(allVisibleTasks.value.map(task => task.id))
	const movingTask = allVisibleTasks.value.find(task => task.id === movingId)
	const previous = movingTask
		? {parentTaskId: getParentTaskId(movingTask, taskIds), position: movingTask.position}
		: null
	movingTaskId.value = movingId
	try {
		const updatedMove = await hierarchyPositionService.update(new TaskHierarchyPositionModel({
			taskId: movingId,
			projectViewId: props.viewId,
			parentTaskId: result.parentTaskId,
			position: result.position,
		}))
		if (movingTask) {
			emitOptimisticHierarchyUpdate(movingTask, result.parentTaskId, updatedMove.position)
		}
		const nextCollapsed = new Set(collapsedTasks.value)
		nextCollapsed.delete(movingId)
		if (result.parentTaskId !== null) nextCollapsed.delete(result.parentTaskId)
		collapsedTasks.value = nextCollapsed
		emit('hierarchyMoved')
		if (previous) {
			success({message: t('project.list.taskMoved')}, [{
				title: t('task.undo'),
				callback: async () => {
					try {
						const revertedMove = await hierarchyPositionService.update(new TaskHierarchyPositionModel({
							taskId: movingId,
							projectViewId: props.viewId,
							parentTaskId: previous.parentTaskId,
							position: previous.position,
						}))
						if (movingTask) {
							emitOptimisticHierarchyUpdate(movingTask, previous.parentTaskId, revertedMove.position)
						}
						emit('hierarchyMoved')
					} catch (e) {
						error(e)
					}
				},
			}])
		}
	} catch (e) {
		error(e)
	} finally {
		movingTaskId.value = null
		clearHierarchyDrag()
	}
}

function dropClass(taskId: number) {
	if (dropTarget.value?.taskId !== taskId) return undefined
	return `is-drop-${dropTarget.value.mode}`
}

function dropLabel(task: ITask): string {
	if (dropTarget.value?.taskId !== task.id) return ''
	if (dropTarget.value.mode === 'before') return t('project.list.insertBefore', {title: task.title})
	if (dropTarget.value.mode === 'after') return t('project.list.insertAfter', {title: task.title})
	return t('project.list.makeSubtaskOf', {title: task.title})
}
</script>

<template>
	<div
		class="task-grid"
		:style="{
			'--task-grid-columns': gridTemplateColumns,
			'--task-grid-selection-width': '40px',
			'--task-grid-row-number-width': '72px',
		}"
		role="treegrid"
		:aria-multiselectable="canWrite"
	>
		<div class="task-grid__controls d-print-none">
			<XButton
				variant="secondary"
				icon="check-double"
				@click="selectAll"
			>
				{{ allSelected ? $t('project.list.clearSelection') : $t('project.list.selectLoaded', {count: allVisibleTasks.length}) }}
			</XButton>
			<Popup>
				<template #trigger="{toggle}">
					<XButton
						variant="secondary"
						icon="plus"
						@click.prevent.stop="toggle()"
					>
						{{ $t('project.table.columns') }}
					</XButton>
				</template>
				<template #content>
					<div class="task-grid__column-picker">
						<div
							v-for="definition in TASK_GRID_COLUMNS"
							:key="definition.field"
							class="task-grid__column-option"
						>
							<FancyCheckbox
								:model-value="layout.columns.some(column => column.field === definition.field)"
								:disabled="definition.required"
								@update:modelValue="updateColumnVisibility(definition.field, $event)"
							>
								{{ $t(columnLabels[definition.field]) }}
							</FancyCheckbox>
							<template v-if="layout.columns.some(column => column.field === definition.field)">
								<button
									class="task-grid__column-move"
									:aria-label="$t('project.list.moveColumnLeft')"
									@click="moveColumn(definition.field, -1)"
								>
									<Icon icon="arrow-left" />
								</button>
								<button
									class="task-grid__column-move"
									:aria-label="$t('project.list.moveColumnRight')"
									@click="moveColumn(definition.field, 1)"
								>
									<Icon icon="angle-right" />
								</button>
							</template>
						</div>
					</div>
				</template>
			</Popup>
		</div>

		<div
			v-if="hasSelection"
			class="task-grid__bulk-toolbar d-print-none"
		>
			<strong>{{ $t('project.list.selectedCount', {count: selectedTaskIds.size}) }}</strong>
			<XButton
				:loading="bulkLoading"
				@click="bulkUpdate(['done'], {done: true})"
			>
				{{ $t('project.list.markDone') }}
			</XButton>
			<XButton
				variant="secondary"
				:loading="bulkLoading"
				@click="bulkUpdate(['done'], {done: false})"
			>
				{{ $t('project.list.reopen') }}
			</XButton>
			<select
				class="select task-grid__bulk-select"
				:disabled="bulkLoading"
				:value="''"
				@change="bulkUpdate(['priority'], {priority: Number(($event.target as HTMLSelectElement).value) as ITask['priority']})"
			>
				<option
					value=""
					disabled
				>
					{{ $t('project.list.setPriority') }}
				</option>
				<option
					v-for="priority in [0, 1, 2, 3, 4, 5]"
					:key="priority"
					:value="priority"
				>
					{{ priority === 0 ? $t('task.priority.unset') : priority }}
				</option>
			</select>
			<label class="task-grid__bulk-date">
				<span>{{ $t('project.list.setDueDate') }}</span>
				<input
					class="input"
					type="date"
					:disabled="bulkLoading"
					@change="bulkUpdate(['due_date'], {dueDate: new Date(`${($event.target as HTMLInputElement).value}T00:00:00`)})"
				>
			</label>
			<XButton
				variant="secondary"
				:loading="bulkLoading"
				@click="bulkUpdate(['due_date'], {dueDate: null})"
			>
				{{ $t('project.list.clearDueDate') }}
			</XButton>
			<XButton
				variant="secondary"
				class="has-text-danger"
				:loading="bulkLoading"
				@click="deleteSelected"
			>
				{{ $t('misc.delete') }}
			</XButton>
		</div>

		<div
			class="task-grid__header"
			role="row"
		>
			<div
				class="task-grid__selection task-grid__selection--header"
				role="columnheader"
			>
				<input
					type="checkbox"
					:checked="allSelected"
					:aria-label="$t('project.list.selectAllLoaded')"
					@change="selectAll"
				>
			</div>
			<div
				class="task-grid__row-number task-grid__row-number--header"
				role="columnheader"
			>
				#
			</div>
			<div
				v-for="column in layout.columns"
				:key="column.field"
				class="task-grid__heading"
				:class="[`task-grid__heading--${column.field}`]"
				role="columnheader"
			>
				<span :class="{'is-sr-only': column.field === 'done'}">
					{{ $t(columnLabels[column.field]) }}
				</span>
				<button
					class="task-grid__resize"
					:aria-label="$t('project.list.resizeColumn', {column: $t(columnLabels[column.field])})"
					@pointerdown.prevent="resizeColumn(column.field, $event)"
				/>
			</div>
		</div>

		<template
			v-for="section in sections || [{id: 0, title: '', count: tasks.length, tasks}]"
			:key="section.id"
		>
			<div
				v-if="sections"
				class="task-grid__section"
				role="row"
				:aria-expanded="!collapsedSections?.[section.id]"
			>
				<button
					class="task-grid__section-toggle"
					:aria-label="collapsedSections?.[section.id] ? $t('project.list.expandSection') : $t('project.list.collapseSection')"
					@click="emit('toggleSection', section.id)"
				>
					<Icon :icon="collapsedSections?.[section.id] ? 'angle-right' : 'chevron-down'" />
				</button>
				<input
					class="task-grid__section-title"
					:value="section.title"
					:readonly="!canWrite"
					@change="emit('renameSection', section.id, ($event.target as HTMLInputElement).value)"
				>
				<span>{{ section.count }}</span>
				<button
					v-if="canWrite && sections.length > 1"
					class="task-grid__section-delete"
					:aria-label="$t('project.list.deleteSection')"
					@click="emit('deleteSection', section.id)"
				>
					<Icon icon="trash-alt" />
				</button>
			</div>
			<template v-if="!collapsedSections?.[section.id]">
				<div
					v-for="row in buildTaskTree(orderTasks(section.tasks), collapsedTasks)"
					:key="`${section.id}-${row.task.id}`"
					class="task-grid__row"
					:class="[
						dropClass(row.task.id),
						{
							'is-selected': selectedTaskIds.has(row.task.id),
							'is-dragging': draggedTaskId === row.task.id,
							'is-moving': movingTaskId === row.task.id,
							'is-drop-invalid': invalidDropTargetId === row.task.id,
						},
					]"
					role="row"
					:aria-level="row.depth + 1"
					:aria-expanded="row.hasChildren ? !collapsedTasks.has(row.task.id) : undefined"
					:aria-selected="selectedTaskIds.has(row.task.id)"
					@click="selectTask(row.task, $event)"
					@dragover="dragOverTask(row.task, $event)"
					@drop="dropTask(row.task.id, getDropMode($event), $event)"
				>
					<span
						v-if="dropTarget?.taskId === row.task.id"
						class="task-grid__drop-label"
						:class="`is-${dropTarget.mode}`"
					>
						{{ dropLabel(row.task) }}
					</span>
					<div
						class="task-grid__selection"
						role="gridcell"
					>
						<input
							type="checkbox"
							:checked="selectedTaskIds.has(row.task.id)"
							:disabled="!canWrite"
							:aria-label="$t('project.list.selectTask', {title: row.task.title})"
						>
					</div>
					<div
						v-tooltip="$t('project.list.rowReference', {row: row.rowNumber, task: row.task.identifier || `#${row.task.index}`})"
						class="task-grid__row-number"
						role="gridcell"
					>
						<button
							v-if="canReorder"
							class="task-grid__drag-handle d-print-none"
							:draggable="movingTaskId === null"
							:aria-label="$t('project.list.dragTask', {title: row.task.title})"
							@dragstart.stop="startHierarchyDrag(row.task, $event)"
							@dragend="clearHierarchyDrag"
							@click.stop
						>
							<Icon icon="grip-lines" />
						</button>
						<span>{{ row.rowNumber }}</span>
					</div>
					<TaskGridCell
						v-for="column in layout.columns"
						:key="column.field"
						:task="row.task"
						:field="column.field"
						:can-write="canWrite"
						:depth="column.field === 'title' ? row.depth : 0"
						:has-children="column.field === 'title' && row.hasChildren"
						:collapsed="collapsedTasks.has(row.task.id)"
						@updated="emit('updated', $event)"
						@toggle="toggleTask(row.task.id)"
					/>
				</div>
				<AddTask
					v-if="sections && canWrite"
					class="task-grid__add-task d-print-none"
					:default-position="0"
					@taskAdded="emit('taskAddedToSection', $event, section.id)"
				/>
			</template>
		</template>
		<div
			v-if="canReorder && draggedTaskId !== null"
			class="task-grid__root-drop d-print-none"
			:class="{'is-active': dropTarget?.mode === 'root'}"
			@dragover="updateDropTarget(null, 'root', $event)"
			@drop="dropTask(null, 'root', $event)"
		>
			{{ $t('project.list.moveTaskToRoot') }}
		</div>
	</div>
</template>

<style scoped lang="scss">
.task-grid {
	overflow: auto;
	position: relative;
}

.task-grid__controls,
.task-grid__bulk-toolbar {
	display: flex;
	align-items: center;
	gap: .5rem;
	padding: .75rem;
	border-block-end: 1px solid var(--grey-200);

	:deep(.button) {
		min-block-size: 32px;
		background: transparent;
		box-shadow: none;
		color: var(--grey-700);
		font-size: .8rem;
		font-weight: 400;
		text-transform: none;

		&:hover,
		&:focus-visible {
			background: var(--grey-100);
			box-shadow: none;
			color: var(--text);
		}
	}
}

.task-grid__bulk-select {
	block-size: 36px;
}

.task-grid__bulk-date {
	display: flex;
	align-items: center;
	gap: .375rem;
	white-space: nowrap;

	.input {
		block-size: 36px;
	}
}

.task-grid__bulk-toolbar {
	position: sticky;
	inset-block-start: 0;
	z-index: 6;
	background: var(--white);
	box-shadow: var(--shadow-sm);

	strong,
	label,
	select {
		font-weight: 400;
	}

	:deep(.button.is-primary) {
		background: var(--primary);
		color: #ffffff;
	}
}

.task-grid__column-picker {
	display: flex;
	flex-direction: column;
	gap: .5rem;
	min-inline-size: 220px;
	padding: 1rem;
	background: var(--white);
}

.task-grid__column-option {
	display: grid;
	grid-template-columns: 1fr auto auto;
	align-items: center;
	gap: .25rem;
}

.task-grid__column-move,
.task-grid__section-toggle,
.task-grid__section-delete {
	border: 0;
	background: transparent;
	color: var(--grey-500);
	cursor: pointer;
}

.task-grid__header,
.task-grid__row {
	display: grid;
	grid-template-columns: var(--task-grid-columns);
	min-inline-size: max-content;
}

.task-grid__header {
	position: sticky;
	inset-block-start: 0;
	z-index: 5;
	background: var(--grey-50);
	border-block-end: 1px solid var(--grey-200);
}

.task-grid__heading {
	position: relative;
	padding: .625rem .5rem;
	font-size: .8rem;
	font-weight: 600;
	text-transform: uppercase;
	color: var(--grey-600);
	border-inline-end: 1px solid var(--grey-200);
}

.task-grid__heading--done,
.task-grid__heading--title,
.task-grid__selection,
.task-grid__row-number {
	position: sticky;
	z-index: 4;
	background: inherit;
}

.task-grid__selection {
	inset-inline-start: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.task-grid__row-number {
	inset-inline-start: 40px;
	display: flex;
	align-items: center;
	gap: .25rem;
	padding: 0 .375rem;
	color: var(--grey-500);
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.task-grid__row-number--header {
	justify-content: center;
	font-size: .8rem;
	font-weight: 600;
}

.task-grid__drag-handle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 1.5rem;
	block-size: 2rem;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--grey-400);
	cursor: grab;
	opacity: 0;
	transition: opacity $transition;

	&:active {
		cursor: grabbing;
	}
}

.task-grid__row:hover .task-grid__drag-handle,
.task-grid__drag-handle:focus-visible,
.task-grid__row.is-dragging .task-grid__drag-handle {
	opacity: 1;
}

.task-grid__heading--done {
	border-inline-end: 0;
	inset-inline-start: 112px;
}

.task-grid__heading--title {
	inset-inline-start: 160px;
}

.task-grid__resize {
	position: absolute;
	inset-block: 0;
	inset-inline-end: -3px;
	inline-size: 6px;
	border: 0;
	background: transparent;
	cursor: col-resize;
}

.task-grid__section {
	display: flex;
	align-items: center;
	gap: .5rem;
	inline-size: 100%;
	min-inline-size: max-content;
	padding: .75rem 1rem;
	border-block-end: 1px solid var(--grey-200);
	background: var(--grey-50);
	text-align: start;
}

.task-grid__section-title {
	flex: 1;
	min-inline-size: 12rem;
	border: 0;
	background: transparent;
	font-weight: 600;

	&:focus {
		outline: 2px solid var(--primary);
	}
}

.task-grid__section-delete {
	margin-inline-start: auto;
	color: var(--danger);
}

.task-grid__row {
	position: relative;
	border-block-end: 1px solid var(--grey-100);
	background: var(--white);

	&:hover {
		background: var(--grey-50);
	}

	&.is-selected {
		background: hsl(var(--primary-hsl) / .1);
	}

	&.is-dragging,
	&.is-moving {
		opacity: .45;
	}

	&.is-drop-before::before,
	&.is-drop-after::after {
		content: '';
		position: absolute;
		z-index: 7;
		inset-inline: 0;
		block-size: 3px;
		background: var(--primary);
	}

	&.is-drop-before::before {
		inset-block-start: -2px;
	}

	&.is-drop-after::after {
		inset-block-end: -2px;
	}

	&.is-drop-inside {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
		background: hsl(var(--primary-hsl) / .08);
	}

	&.is-drop-invalid {
		cursor: not-allowed;
		background: hsl(var(--danger-hsl) / .06);
	}
}

.task-grid__drop-label {
	position: absolute;
	z-index: 8;
	inset-inline-start: 7rem;
	padding: .125rem .5rem;
	border-radius: $radius;
	background: var(--primary);
	color: var(--white);
	font-size: .75rem;
	pointer-events: none;

	&.is-before {
		inset-block-start: 0;
		transform: translateY(-50%);
	}

	&.is-after {
		inset-block-end: 0;
		transform: translateY(50%);
	}

	&.is-inside {
		inset-block-start: 50%;
		transform: translateY(-50%);
	}
}

.task-grid__root-drop {
	padding: .625rem 1rem;
	border: 2px dashed transparent;
	color: var(--grey-500);
	text-align: center;

	&.is-active {
		border-color: var(--primary);
		background: hsl(var(--primary-hsl) / .08);
		color: var(--primary);
	}
}

.task-grid__add-task {
	padding: .25rem 1rem .5rem 5.5rem;
	border-block-end: 1px solid var(--grey-100);
}

@media (max-width: $tablet) {
	.task-grid__header,
	.task-grid__row {
		grid-template-columns: 40px 72px 48px minmax(240px, 1fr) 120px 120px;
		min-inline-size: 672px;
	}

	.task-grid__heading,
	.task-grid-cell {
		display: none;
	}

	.task-grid__heading--done,
	.task-grid__heading--title,
	.task-grid__heading--assignees,
	.task-grid__heading--due_date,
	.task-grid-cell--done,
	.task-grid-cell--title,
	.task-grid-cell--assignees,
	.task-grid-cell--due_date {
		display: flex;
	}
}

@media (hover: none) {
	.task-grid__drag-handle {
		opacity: 1;
	}
}
</style>
