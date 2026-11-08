import AbstractModel from '@/models/abstractModel'
import type {ITaskHierarchyPosition} from '@/modelTypes/ITaskHierarchyPosition'

export default class TaskHierarchyPositionModel extends AbstractModel<ITaskHierarchyPosition> implements ITaskHierarchyPosition {
	taskId = 0
	projectViewId = 0
	parentTaskId: number | null = null
	position = 0

	constructor(data: Partial<ITaskHierarchyPosition>) {
		super()
		this.assignData(data)
	}
}
