import type {TaskResponse} from '@/client/queries/tasks'

/**
 * Determines if a task should be displayed in the List view.
 *
 * Subtasks are hidden only when their parent task is also in the current view
 * (they are rendered nested under it instead). Cross-project subtasks and
 * subtasks whose parent is not part of the result set stay visible.
 *
 * @param task - The task to check
 * @param allTasksInView - All tasks currently visible in the view
 * @returns true if the task should be shown, false if it should be hidden
 */
export function shouldShowTaskInListView(
	task: TaskResponse,
	allTasksInView: TaskResponse[],
): boolean {
	// If task has no parent, always show it
	const parentTasksCount = task.related_tasks.parenttask?.length ?? 0
	if (parentTasksCount === 0) {
		return true
	}

	// Task has parent(s) - only hide if parent is in the same view
	const parentTasks = task.related_tasks.parenttask ?? []
	const parentIds = parentTasks.map(p => p.id)
	const hasParentInView = allTasksInView.some(t => parentIds.includes(t.id))

	// Show task if parent is NOT in the current view (cross-project subtask)
	return !hasParentInView
}

/**
 * The compact list renders subtasks from the parent's relation data, so its
 * top-level collection must omit children whose parent is already present.
 * The grid builds a tree from the complete flat collection instead and must
 * keep those children available.
 */
export function tasksForListPresentation(
	tasks: TaskResponse[],
	isGrid: boolean,
): TaskResponse[] {
	return isGrid
		? tasks
		: tasks.filter(task => shouldShowTaskInListView(task, tasks))
}

/** Keep matching tasks and their ancestors from the same project. */
export function tasksWithMatchingAncestors(tasks: TaskResponse[], matches: TaskResponse[]): TaskResponse[] {
	const byId = new Map(tasks.map(task => [task.id, task]))
	// The filtered response carries view-specific positions and other current data.
	for (const task of matches) byId.set(task.id, task)
	const included = new Set<number>()
	const include = (task: TaskResponse) => {
		if (included.has(task.id)) return
		included.add(task.id)
		for (const parent of task.related_tasks.parenttask ?? []) {
			const fullParent = byId.get(parent.id)
			if (fullParent) include(fullParent)
		}
	}
	for (const task of matches) include(task)
	return [...byId.values()].filter(task => included.has(task.id))
}
