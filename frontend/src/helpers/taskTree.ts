import type {ITask} from '@/modelTypes/ITask'

export interface TaskTreeRow {
	task: ITask
	depth: number
	hasChildren: boolean
	rowNumber: string
}

export function sortTasksByPosition(tasks: ITask[]): ITask[] {
	return tasks
		.map((task, sourceIndex) => ({task, sourceIndex}))
		.sort((a, b) => a.task.position - b.task.position || a.sourceIndex - b.sourceIndex)
		.map(({task}) => task)
}

export function getParentTaskId(task: ITask, taskIds: Set<number>): number | null {
	const relatedParent = task.relatedTasks?.parenttask?.find(parent => taskIds.has(parent.id))
	if (relatedParent) {
		return relatedParent.id
	}

	return task.parentTaskId && taskIds.has(task.parentTaskId)
		? task.parentTaskId
		: null
}

export function hasMultipleVisibleParents(task: ITask, taskIds: Set<number>): boolean {
	return (task.relatedTasks?.parenttask?.filter(parent => taskIds.has(parent.id)).length || 0) > 1
}

export function getTaskDescendantIds(tasks: ITask[], taskId: number): Set<number> {
	const taskIds = new Set(tasks.map(task => task.id))
	const children = new Map<number, number[]>()
	for (const task of tasks) {
		const parentId = getParentTaskId(task, taskIds)
		if (parentId !== null) {
			children.set(parentId, [...(children.get(parentId) || []), task.id])
		}
	}

	const descendants = new Set<number>()
	const visit = (parentId: number) => {
		for (const childId of children.get(parentId) || []) {
			if (descendants.has(childId)) continue
			descendants.add(childId)
			visit(childId)
		}
	}
	visit(taskId)
	return descendants
}

export function buildTaskTree(tasks: ITask[], collapsedTasks: Set<number> = new Set()): TaskTreeRow[] {
	const uniqueTasks = [...new Map(tasks.map(task => [task.id, task])).values()]
	const taskIds = new Set(uniqueTasks.map(task => task.id))
	const children = new Map<number, ITask[]>()
	const roots: ITask[] = []

	for (const task of uniqueTasks) {
		const parentId = getParentTaskId(task, taskIds)
		if (parentId === null) {
			roots.push(task)
			continue
		}
		children.set(parentId, [...(children.get(parentId) || []), task])
	}

	const result: TaskTreeRow[] = []
	const visited = new Set<number>()
	const visit = (task: ITask, depth: number, rowNumber: string) => {
		if (visited.has(task.id)) {
			return
		}
		visited.add(task.id)

		const taskChildren = children.get(task.id) || []
		result.push({task, depth, hasChildren: taskChildren.length > 0, rowNumber})
		if (!collapsedTasks.has(task.id)) {
			taskChildren.forEach((child, index) => visit(child, depth + 1, `${rowNumber}.${index + 1}`))
		}
	}

	roots.forEach((task, index) => visit(task, 0, String(index + 1)))
	return result
}
