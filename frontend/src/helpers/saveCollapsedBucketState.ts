import type {IBucket} from '@/modelTypes/IBucket'
import type {IProject} from '@/modelTypes/IProject'

const key = 'collapsedBuckets'

export type CollapsedBuckets = {[id: IBucket['id']]: boolean}

function getAllState() {
	const saved = localStorage.getItem(key)
	return saved === null
		? {}
		: JSON.parse(saved)
}

export const saveCollapsedBucketState = (
	projectId: IProject['id'],
	collapsedBuckets: CollapsedBuckets,
	viewId?: number,
) => {
	const state = getAllState()
	const stateKey = typeof viewId === 'undefined' ? projectId : `${projectId}:${viewId}`
	state[stateKey] = collapsedBuckets
	for (const bucketId in state[stateKey]) {
		if (!state[stateKey][bucketId]) {
			delete state[stateKey][bucketId]
		}
	}
	localStorage.setItem(key, JSON.stringify(state))
}

export function getCollapsedBucketState(projectId : IProject['id'], viewId?: number) {
	const state = getAllState()
	const stateKey = typeof viewId === 'undefined' ? projectId : `${projectId}:${viewId}`
	return typeof state[stateKey] !== 'undefined'
		? state[stateKey]
		: {}
}
