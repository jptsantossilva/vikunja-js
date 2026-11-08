import type {ITask} from '@/modelTypes/ITask'
import {calculateItemPosition} from '@/helpers/calculateItemPosition'
import {getParentTaskId, getTaskDescendantIds, hasMultipleVisibleParents} from '@/helpers/taskTree'

export type TaskHierarchyDropMode = 'before' | 'inside' | 'after' | 'root'

export interface TaskHierarchyDropResult {
	parentTaskId: number | null
	position: number
}

export function getTaskHierarchyDropMode(offsetRatio: number): Exclude<TaskHierarchyDropMode, 'root'> {
	if (offsetRatio < 0.25) return 'before'
	if (offsetRatio > 0.75) return 'after'
	return 'inside'
}

export function calculateTaskHierarchyDrop(
	tasks: ITask[],
	draggedTaskId: number,
	targetTaskId: number | null,
	mode: TaskHierarchyDropMode,
): TaskHierarchyDropResult | null {
	const uniqueTasks = [...new Map(tasks.map(task => [task.id, task])).values()]
	const taskIds = new Set(uniqueTasks.map(task => task.id))
	const draggedTask = uniqueTasks.find(task => task.id === draggedTaskId)
	if (!draggedTask) return null
	if (hasMultipleVisibleParents(draggedTask, taskIds)) return null

	const descendants = getTaskDescendantIds(uniqueTasks, draggedTaskId)
	if (targetTaskId !== null && (targetTaskId === draggedTaskId || descendants.has(targetTaskId))) {
		return null
	}

	const targetTask = targetTaskId === null
		? null
		: uniqueTasks.find(task => task.id === targetTaskId) || null
	if (mode !== 'root' && !targetTask) return null
	if (targetTask && hasMultipleVisibleParents(targetTask, taskIds)) return null

	let parentTaskId: number | null
	if (mode === 'root') {
		parentTaskId = null
	} else if (mode === 'inside') {
		parentTaskId = targetTask!.id
	} else {
		parentTaskId = getParentTaskId(targetTask!, taskIds)
	}

	const excludedIds = new Set([draggedTaskId, ...descendants])
	const siblings = uniqueTasks.filter(task => (
		!excludedIds.has(task.id) && getParentTaskId(task, taskIds) === parentTaskId
	))

	if (mode === 'root' || mode === 'inside') {
		const lastSibling = siblings[siblings.length - 1]
		return {
			parentTaskId,
			position: calculateItemPosition(lastSibling?.position ?? null, null),
		}
	}

	const targetIndex = siblings.findIndex(task => task.id === targetTaskId)
	if (targetIndex < 0) return null
	const before = mode === 'before' ? siblings[targetIndex - 1] : siblings[targetIndex]
	const after = mode === 'before' ? siblings[targetIndex] : siblings[targetIndex + 1]

	return {
		parentTaskId,
		position: calculateItemPosition(before?.position ?? null, after?.position ?? null),
	}
}
