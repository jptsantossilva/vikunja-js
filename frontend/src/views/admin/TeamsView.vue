<template>
	<Card>
		<FormInput
			v-model="search"
			:placeholder="$t('team.title')"
		/>
		<p v-if="query.isPending.value">
			{{ $t('misc.loading') }}
		</p>
		<p v-else-if="query.isError.value">
			{{ $t('error.error') }}
		</p>
		<table
			v-else
			class="table is-fullwidth"
		>
			<tbody>
				<tr
					v-for="team in query.data.value?.items"
					:key="team.id"
				>
					<td>
						<RouterLink :to="{name: 'admin.teams.edit', params: {id: team.id}}">
							{{ team.name }}
						</RouterLink>
					</td>
					<td>{{ team.external_id ? $t('admin.externalTeam') : '' }}</td>
				</tr>
			</tbody>
		</table>
		<PaginationEmit
			:total-pages="query.data.value?.total_pages ?? 0"
			:current-page="page"
			@pageChanged="page = $event"
		/>
	</Card>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {adminTeamDirectory} from '@/client/generated'
import Card from '@/components/misc/Card.vue'
import FormInput from '@/components/input/FormInput.vue'
import PaginationEmit from '@/components/misc/PaginationEmit.vue'

const search = ref('')
const page = ref(1)
watch(search, () => { page.value = 1 })
const query = useQuery(computed(() => ({
	queryKey: ['admin', 'team-directory', search.value, page.value],
	queryFn: async ({signal}: {signal: AbortSignal}) => (await adminTeamDirectory({query: {q: search.value, page: page.value}, signal})).data,
})))
</script>
