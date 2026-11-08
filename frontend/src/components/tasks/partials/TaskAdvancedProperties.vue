<script setup lang="ts">
import type {ITask} from '@/modelTypes/ITask'
import type {IReminderPeriodRelativeTo} from '@/types/IReminderPeriodRelativeTo'

import Datepicker from '@/components/input/Datepicker.vue'
import Reminders from '@/components/tasks/partials/Reminders.vue'
import RepeatAfter from '@/components/tasks/partials/RepeatAfter.vue'
import ColorPicker from '@/components/input/ColorPicker.vue'
import CreatedUpdated from '@/components/tasks/partials/CreatedUpdated.vue'

defineProps<{
	task: ITask
	canWrite: boolean
	collapsed: boolean
	color: string
	defaultRelativeTo: IReminderPeriodRelativeTo | null
}>()

const emit = defineEmits<{
	'patch': [patch: Partial<ITask>]
	'update:color': [color: string]
	'update:collapsed': [collapsed: boolean]
}>()

function updateRepeat(task: ITask | undefined) {
	if (task) {
		emit('patch', task)
	}
}
</script>

<template>
	<aside
		class="task-advanced"
		:class="{'is-collapsed': collapsed}"
	>
		<button
			class="task-advanced__toggle"
			:aria-expanded="!collapsed"
			:aria-label="collapsed ? $t('task.detail.showAdvanced') : $t('task.detail.hideAdvanced')"
			@click="emit('update:collapsed', !collapsed)"
		>
			<Icon :icon="collapsed ? 'angle-right' : 'chevron-down'" />
			<span>{{ $t('task.detail.advanced') }}</span>
		</button>

		<div
			v-if="!collapsed"
			class="task-advanced__content"
		>
			<label class="task-advanced__field">
				<span>{{ $t('task.attributes.startDate') }}</span>
				<Datepicker
					:model-value="task.startDate"
					:choose-date-label="$t('task.detail.chooseStartDate')"
					:disabled="!canWrite"
					@update:modelValue="emit('patch', {startDate: $event})"
				/>
			</label>
			<label class="task-advanced__field">
				<span>{{ $t('task.attributes.endDate') }}</span>
				<Datepicker
					:model-value="task.endDate"
					:choose-date-label="$t('task.detail.chooseEndDate')"
					:disabled="!canWrite"
					@update:modelValue="emit('patch', {endDate: $event})"
				/>
			</label>
			<div class="task-advanced__field">
				<span>{{ $t('task.attributes.reminders') }}</span>
				<Reminders
					:model-value="task.reminders"
					:default-relative-to="defaultRelativeTo"
					:disabled="!canWrite"
					@update:modelValue="emit('patch', {reminders: $event})"
				/>
			</div>
			<div class="task-advanced__field task-advanced__field--repeat">
				<span>{{ $t('task.attributes.repeat') }}</span>
				<RepeatAfter
					:model-value="task"
					:disabled="!canWrite"
					@update:modelValue="updateRepeat"
				/>
			</div>
			<div
				class="task-advanced__field"
				:class="{'is-read-only': !canWrite}"
			>
				<span>{{ $t('task.attributes.color') }}</span>
				<ColorPicker
					:model-value="color"
					menu-position="bottom"
					@update:modelValue="emit('update:color', $event)"
				/>
			</div>
			<CreatedUpdated :task="task" />
		</div>
	</aside>
</template>

<style scoped lang="scss">
.task-advanced {
	margin-block-end: 1rem;
	border-block-end: 1px solid var(--grey-200);
}

.task-advanced__toggle {
	display: flex;
	align-items: center;
	gap: .5rem;
	inline-size: auto;
	min-block-size: 36px;
	padding: .375rem .5rem;
	border: 0;
	background: transparent;
	color: var(--grey-600);
	font-size: .8rem;
	font-weight: 400;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		color: var(--text);
	}
}

.task-advanced__content {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
	align-items: start;
	gap: 1rem 2rem;
	padding: .75rem .5rem 1.25rem;
}

.task-advanced__field {
	display: flex;
	flex-direction: column;
	gap: .375rem;
	color: var(--grey-500);
	font-size: .8rem;
	font-weight: 400;

	&.is-read-only {
		pointer-events: none;
		opacity: .7;
	}
}

.task-advanced__field--repeat {
	grid-column: span 2;
}

@media (max-width: $desktop) {
	.task-advanced__content {
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
	}
}

@media (max-width: $mobile) {
	.task-advanced__content {
		grid-template-columns: 1fr;
	}

	.task-advanced__field--repeat {
		grid-column: auto;
	}
}
</style>
