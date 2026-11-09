<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {klona} from 'klona/lite'

import AssigneeList from '@/components/tasks/partials/AssigneeList.vue'
import Labels from '@/components/tasks/partials/Labels.vue'
import PriorityLabel from '@/components/tasks/partials/PriorityLabel.vue'
import User from '@/components/misc/User.vue'
import CommentCount from '@/components/tasks/partials/CommentCount.vue'
import type {TaskResponse} from '@/client/queries/tasks'
import {normalizeTask} from '@/client/queries/tasks'
import {useUpdateTaskMutation} from '@/client/queries/taskMutations'
import type {ProjectViewLayoutColumnField} from '@/types/ProjectViewLayout'
import {useProjects} from '@/composables/useProjects'
import {error} from '@/message'

const props = defineProps<{
	task: TaskResponse
	field: ProjectViewLayoutColumnField
	canWrite: boolean
	depth?: number
	hasChildren?: boolean
	collapsed?: boolean
}>()

const emit = defineEmits<{
	updated: [task: TaskResponse]
	toggle: []
}>()

const projectList = useProjects()
const updateTaskMutation = useUpdateTaskMutation(true)
const saving = ref(false)
const editingTitle = ref(false)
const title = ref('')

const dateFields: Partial<Record<ProjectViewLayoutColumnField, 'due_date' | 'start_date' | 'end_date'>> = {
	due_date: 'due_date',
	start_date: 'start_date',
	end_date: 'end_date',
}

watch(() => props.task.title, value => title.value = value, {immediate: true})

const dateValue = computed(() => {
	const value = props.task[fieldProperty.value]
	if (!value) {
		return ''
	}
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
})

const fieldProperty = computed<'due_date' | 'start_date' | 'end_date'>(() => dateFields[props.field] || 'due_date')

function displayDate(value?: string): string {
	return value ? new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(value)) : '—'
}

async function updateTask(patch: Partial<TaskResponse>) {
	if (!props.canWrite || saving.value) {
		return
	}
	const previous = klona(props.task)
	const optimistic = {...props.task, ...patch} as TaskResponse
	emit('updated', optimistic)
	saving.value = true
	try {
		const updated = await updateTaskMutation.mutateAsync(optimistic)
		emit('updated', normalizeTask(updated))
	} catch (e) {
		emit('updated', previous)
		error(e)
	} finally {
		saving.value = false
	}
}

async function saveTitle() {
	editingTitle.value = false
	const nextTitle = title.value.trim()
	if (nextTitle === '' || nextTitle === props.task.title) {
		title.value = props.task.title
		return
	}
	await updateTask({title: nextTitle})
}

function updateDate(value: string) {
	const nextValue = value === '' ? '' : new Date(`${value}T00:00:00`).toISOString()
	updateTask({[fieldProperty.value]: nextValue})
}
</script>

<template>
	<div
		class="task-grid-cell"
		:class="[`task-grid-cell--${field}`, {'is-saving': saving}]"
		role="gridcell"
	>
		<button
			v-if="field === 'done'"
			type="button"
			class="task-grid-cell__done-toggle"
			:class="{'is-done': task.done}"
			:disabled="!canWrite || saving"
			:aria-label="task.done ? $t('project.list.reopen') : $t('project.list.markDone')"
			@click.stop="updateTask({done: !task.done})"
		>
			<Icon icon="check" />
		</button>

		<template v-else-if="field === 'title'">
			<span
				v-if="depth"
				class="task-grid-cell__indent"
				:style="{'--task-depth': depth}"
			/>
			<button
				v-if="hasChildren"
				type="button"
				class="task-grid-cell__subtask-toggle"
				:class="{'is-collapsed': collapsed}"
				:aria-label="collapsed ? $t('project.list.expandSubtasks') : $t('project.list.collapseSubtasks')"
				@click.stop="emit('toggle')"
			>
				<Icon icon="chevron-down" />
			</button>
			<input
				v-if="editingTitle"
				v-model="title"
				v-focus.always
				class="input task-grid-cell__title-input"
				@blur="saveTitle"
				@keydown.enter.prevent="saveTitle"
				@keydown.esc.prevent="editingTitle = false; title = task.title"
			>
			<button
				v-else
				class="task-grid-cell__title"
				:disabled="!canWrite"
				@click.stop="editingTitle = true"
				@keydown.enter.prevent="editingTitle = true"
			>
				{{ task.title }}
			</button>
			<RouterLink
				class="task-grid-cell__open"
				:to="{name: 'task.detail', params: {id: task.id}}"
				:aria-label="$t('project.list.openTask', {title: task.title})"
			>
				<Icon icon="arrow-up-right-from-square" />
			</RouterLink>
		</template>

		<span v-else-if="field === 'index'">{{ task.identifier || `#${task.index}` }}</span>
		<span v-else-if="field === 'project'">{{ projectList.projects[task.project_id]?.title || '—' }}</span>
		<AssigneeList
			v-else-if="field === 'assignees' && task.assignees.length"
			:assignees="task.assignees"
			:avatar-size="24"
			:inline="true"
		/>
		<Labels
			v-else-if="field === 'labels'"
			:labels="task.labels"
		/>
		<PriorityLabel
			v-else-if="field === 'priority' && !canWrite"
			:priority="task.priority"
			:done="task.done"
			:show-all="true"
		/>
		<select
			v-else-if="field === 'priority'"
			class="select task-grid-cell__select"
			:value="task.priority"
			:disabled="saving"
			@change="updateTask({priority: Number(($event.target as HTMLSelectElement).value)})"
		>
			<option
				v-for="priority in [0, 1, 2, 3, 4, 5]"
				:key="priority"
				:value="priority"
			>
				{{ priority === 0 ? $t('task.priority.unset') : priority }}
			</option>
		</select>
		<input
			v-else-if="['due_date', 'start_date', 'end_date'].includes(field) && canWrite"
			class="input task-grid-cell__date"
			type="date"
			:value="dateValue"
			:disabled="saving"
			@change="updateDate(($event.target as HTMLInputElement).value)"
		>
		<span v-else-if="field === 'due_date'">{{ displayDate(task.due_date) }}</span>
		<span v-else-if="field === 'start_date'">{{ displayDate(task.start_date) }}</span>
		<span v-else-if="field === 'end_date'">{{ displayDate(task.end_date) }}</span>
		<input
			v-else-if="field === 'percent_done' && canWrite"
			class="input task-grid-cell__percent"
			type="number"
			min="0"
			max="100"
			step="10"
			:value="Math.round(task.percent_done * 100)"
			@change="updateTask({percent_done: Number(($event.target as HTMLInputElement).value) / 100})"
		>
		<span v-else-if="field === 'percent_done'">{{ Math.round(task.percent_done * 100) }}%</span>
		<CommentCount
			v-else-if="field === 'comment_count'"
			:task="task"
		/>
		<span v-else-if="field === 'done_at'">{{ displayDate(task.done_at) }}</span>
		<span v-else-if="field === 'created'">{{ displayDate(task.created) }}</span>
		<span v-else-if="field === 'updated'">{{ displayDate(task.updated) }}</span>
		<User
			v-else-if="field === 'created_by' && task.created_by"
			:user="task.created_by"
			:avatar-size="24"
			:show-username="false"
		/>
		<span v-else>—</span>
	</div>
</template>

<style scoped lang="scss">
.task-grid-cell {
	display: flex;
	align-items: center;
	gap: .375rem;
	min-inline-size: 0;
	min-block-size: 42px;
	padding: .375rem .5rem;
	border-inline-end: 1px solid var(--grey-100);
	overflow: hidden;

	&.is-saving {
		opacity: .65;
	}
}

.task-grid-cell--done {
	justify-content: center;
	position: sticky;
	inset-inline-start: calc(var(--task-grid-selection-width, 0) + var(--task-grid-row-number-width, 0));
	z-index: 2;
	border-inline-end: 0;
	background: inherit;
}

.task-grid-cell--title {
	position: sticky;
	inset-inline-start: calc(var(--task-grid-selection-width, 0) + var(--task-grid-row-number-width, 0) + 48px);
	z-index: 2;
	background: inherit;
}

.task-grid-cell__done-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 1.125rem;
	block-size: 1.125rem;
	padding: 0;
	border: 1px solid var(--grey-400);
	border-radius: 50%;
	background: transparent;
	color: var(--success);
	cursor: pointer;
	transition: border-color $transition, background-color $transition, color $transition;

	svg {
		inline-size: .65rem;
		opacity: 0;
	}

	&:hover,
	&:focus-visible {
		border-color: var(--success);

		svg {
			opacity: 1;
		}
	}

	&.is-done {
		border-color: var(--success);
		background: var(--success);
		color: var(--white);

		svg {
			opacity: 1;
		}
	}
}

.task-grid-cell__indent {
	flex: 0 0 calc(var(--task-depth) * 1.25rem);
}

.task-grid-cell__subtask-toggle {
	display: inline-flex;
	flex: 0 0 1.25rem;
	align-items: center;
	justify-content: center;
	inline-size: 1.25rem;
	block-size: 1.75rem;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--grey-500);
	cursor: pointer;
	transition: transform 150ms ease;

	&.is-collapsed {
		transform: rotate(-90deg);
	}
}

.task-grid-cell__title {
	flex: 1;
	min-inline-size: 0;
	padding: .25rem .375rem;
	border: 1px solid transparent;
	border-radius: $radius;
	background: transparent;
	color: inherit;
	text-align: start;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	cursor: text;
	transition: border-color $transition, background-color $transition;
}

.task-grid-cell--title:hover .task-grid-cell__title:not(:disabled),
.task-grid-cell__title:focus-visible {
	border-color: var(--grey-300);
	background: var(--white);
	outline: none;
}

.task-grid-cell__open {
	opacity: 0;
	color: var(--grey-500);
}

.task-grid-cell--title:hover .task-grid-cell__open,
.task-grid-cell__open:focus-visible {
	opacity: 1;
}

.task-grid-cell__title-input,
.task-grid-cell__date,
.task-grid-cell__percent,
.task-grid-cell__select {
	block-size: 32px;
	min-inline-size: 0;
}
</style>
