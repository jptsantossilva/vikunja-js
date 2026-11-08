// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.

package models

import (
	"testing"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/user"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createParentRelation(t *testing.T, s interface {
	Insert(...interface{}) (int64, error)
}, childID, parentID int64) {
	t.Helper()
	_, err := s.Insert(
		&TaskRelation{TaskID: childID, OtherTaskID: parentID, RelationKind: RelationKindParenttask, CreatedByID: 1},
		&TaskRelation{TaskID: parentID, OtherTaskID: childID, RelationKind: RelationKindSubtask, CreatedByID: 1},
	)
	require.NoError(t, err)
}

func TestTaskHierarchyPosition(t *testing.T) {
	t.Run("moves a task under a parent and updates its position", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		move := &TaskHierarchyPosition{TaskID: 2, ProjectViewID: 1, ParentTaskID: pointer(int64(3)), Position: 12345}
		can, err := move.CanUpdate(s, &user.User{ID: 1})
		require.NoError(t, err)
		assert.True(t, can)
		require.NoError(t, move.Update(s, &user.User{ID: 1}))
		require.NoError(t, s.Commit())

		db.AssertExists(t, "task_relations", map[string]interface{}{
			"task_id": 2, "other_task_id": 3, "relation_kind": RelationKindParenttask,
		}, false)
		db.AssertExists(t, "task_positions", map[string]interface{}{
			"task_id": 2, "project_view_id": 1, "position": 12345,
		}, false)
	})

	t.Run("reparents a branch without changing descendants", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		createParentRelation(t, s, 4, 2)

		move := &TaskHierarchyPosition{TaskID: 2, ProjectViewID: 1, ParentTaskID: pointer(int64(3)), Position: 200}
		require.NoError(t, move.Update(s, &user.User{ID: 1}))
		require.NoError(t, s.Commit())

		db.AssertExists(t, "task_relations", map[string]interface{}{
			"task_id": 2, "other_task_id": 3, "relation_kind": RelationKindParenttask,
		}, false)
		db.AssertExists(t, "task_relations", map[string]interface{}{
			"task_id": 4, "other_task_id": 2, "relation_kind": RelationKindParenttask,
		}, false)
	})

	t.Run("moves a task to the root", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		createParentRelation(t, s, 2, 3)

		move := &TaskHierarchyPosition{TaskID: 2, ProjectViewID: 1, ParentTaskID: nil, Position: 300}
		require.NoError(t, move.Update(s, &user.User{ID: 1}))
		require.NoError(t, s.Commit())

		db.AssertMissing(t, "task_relations", map[string]interface{}{
			"task_id": 2, "other_task_id": 3, "relation_kind": RelationKindParenttask,
		})
	})

	t.Run("rejects cycles and rolls back the old parent deletion", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		createParentRelation(t, s, 4, 3)
		createParentRelation(t, s, 2, 4)
		require.NoError(t, s.Commit())
		require.NoError(t, s.Close())

		s = db.NewSession()
		move := &TaskHierarchyPosition{TaskID: 4, ProjectViewID: 1, ParentTaskID: pointer(int64(2)), Position: 400}
		err := move.Update(s, &user.User{ID: 1})
		require.Error(t, err)
		assert.True(t, IsErrTaskRelationCycle(err))
		require.NoError(t, s.Rollback())
		require.NoError(t, s.Close())

		db.AssertExists(t, "task_relations", map[string]interface{}{
			"task_id": 4, "other_task_id": 3, "relation_kind": RelationKindParenttask,
		}, false)
		db.AssertMissing(t, "task_relations", map[string]interface{}{
			"task_id": 4, "other_task_id": 2, "relation_kind": RelationKindParenttask,
		})
	})

	t.Run("rejects ambiguous multiple parents", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()
		createParentRelation(t, s, 2, 3)
		createParentRelation(t, s, 2, 4)

		move := &TaskHierarchyPosition{TaskID: 2, ProjectViewID: 1, ParentTaskID: nil, Position: 500}
		_, err := move.CanUpdate(s, &user.User{ID: 1})
		require.Error(t, err)
		assert.True(t, IsErrInvalidData(err))
	})

	t.Run("requires write permission", func(t *testing.T) {
		db.LoadAndAssertFixtures(t)
		s := db.NewSession()
		defer s.Close()

		move := &TaskHierarchyPosition{TaskID: 2, ProjectViewID: 1, ParentTaskID: nil, Position: 600}
		can, err := move.CanUpdate(s, &user.User{ID: 2})
		require.NoError(t, err)
		assert.False(t, can)
	})
}

func pointer[T any](value T) *T {
	return &value
}
