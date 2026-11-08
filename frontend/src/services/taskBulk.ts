import {AuthenticatedHTTPFactory} from '@/helpers/fetcher'
import {objectToSnakeCase} from '@/helpers/case'
import TaskModel from '@/models/task'
import type {ITask} from '@/modelTypes/ITask'

export default class TaskBulkService {
	private http = AuthenticatedHTTPFactory()

	async update(taskIds: ITask['id'][], fields: string[], values: Partial<ITask>): Promise<ITask[]> {
		const response = await this.http.post('/tasks/bulk', {
			task_ids: taskIds,
			fields,
			values: objectToSnakeCase(values),
		})

		return response.data.map((task: Partial<ITask>) => new TaskModel(task))
	}

	async delete(taskIds: ITask['id'][]): Promise<void> {
		await this.http.delete('/tasks/bulk', {data: {task_ids: taskIds}})
	}
}
