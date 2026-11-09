
const key = 'collapsedBuckets'

export type CollapsedBuckets = {[id: number]: boolean}

function getAllState() {
	const saved = localStorage.getItem(key)
	return saved === null
		? {}
		: JSON.parse(saved)
}

export const saveCollapsedBucketState = (
	projectId: number,
	collapsedBuckets: CollapsedBuckets,
	viewId?: number,
) => {
	const state = getAllState()
	const stateKey = viewId === undefined ? String(projectId) : `${projectId}:${viewId}`
	state[stateKey] = collapsedBuckets
	for (const bucketId of Object.keys(state[stateKey] ?? {})) {
		if (!state[stateKey][bucketId]) {
			delete state[stateKey][bucketId]
		}
	}
	localStorage.setItem(key, JSON.stringify(state))
}

export function getCollapsedBucketState(projectId: number, viewId?: number) {
	const state = getAllState()
	const stateKey = viewId === undefined ? String(projectId) : `${projectId}:${viewId}`
	return typeof state[stateKey] !== 'undefined'
		? state[stateKey]
		: {}
}
