import type {IAbstract} from '@/modelTypes/IAbstract'
import type {IProjectView} from '@/modelTypes/IProjectView'

export interface ITaskHierarchyPosition extends IAbstract {
	taskId: number
	projectViewId: IProjectView['id']
	parentTaskId: number | null
	position: number
}
