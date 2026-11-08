import AbstractService from '@/services/abstractService'
import type {ITaskHierarchyPosition} from '@/modelTypes/ITaskHierarchyPosition'
import TaskHierarchyPositionModel from '@/models/taskHierarchyPosition'

export default class TaskHierarchyPositionService extends AbstractService<ITaskHierarchyPosition> {
	constructor() {
		super({
			update: '/tasks/{taskId}/hierarchy-position',
		})
	}

	modelFactory(data: Partial<ITaskHierarchyPosition>) {
		return new TaskHierarchyPositionModel(data)
	}
}
