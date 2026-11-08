// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package models

import (
	"code.vikunja.io/api/pkg/web"
	"xorm.io/xorm"
)

// TaskHierarchyPosition atomically changes a task's parent relation and its
// position in a project view. A nil parent_task_id moves the task to the root.
type TaskHierarchyPosition struct {
	TaskID        int64   `xorm:"-" json:"task_id" param:"task"`
	ProjectViewID int64   `xorm:"-" json:"project_view_id" valid:"required"`
	ParentTaskID  *int64  `xorm:"-" json:"parent_task_id"`
	Position      float64 `xorm:"-" json:"position"`

	web.CRUDable    `xorm:"-" json:"-"`
	web.Permissions `xorm:"-" json:"-"`
}

func (thp *TaskHierarchyPosition) currentParentRelations(s *xorm.Session) ([]*TaskRelation, error) {
	relations := []*TaskRelation{}
	err := s.
		Where("task_id = ? AND relation_kind = ?", thp.TaskID, RelationKindParenttask).
		Find(&relations)
	return relations, err
}

func (thp *TaskHierarchyPosition) validateStructure(s *xorm.Session) (*Task, error) {
	task, err := GetTaskByIDSimple(s, thp.TaskID)
	if err != nil {
		return nil, err
	}

	view, err := GetProjectViewByIDAndProject(s, thp.ProjectViewID, task.ProjectID)
	if err != nil {
		return nil, err
	}
	if view.ViewKind != ProjectViewKindList {
		return nil, ErrInvalidData{Message: "Hierarchical task positioning is only available in list views."}
	}

	parents, err := thp.currentParentRelations(s)
	if err != nil {
		return nil, err
	}
	if len(parents) > 1 {
		return nil, ErrInvalidData{Message: "The task has multiple parent relations and cannot be moved hierarchically."}
	}

	if thp.ParentTaskID == nil {
		return &task, nil
	}
	if *thp.ParentTaskID == thp.TaskID {
		return nil, ErrRelationTasksCannotBeTheSame{TaskID: thp.TaskID, OtherTaskID: *thp.ParentTaskID}
	}

	parent, err := GetTaskByIDSimple(s, *thp.ParentTaskID)
	if err != nil {
		return nil, err
	}
	if parent.ProjectID != task.ProjectID {
		return nil, ErrInvalidData{Message: "Parent and child tasks must belong to the same project."}
	}

	return &task, nil
}

// CanUpdate checks whether the user can move the task and, when applicable,
// can read the new parent task. All permission checks happen before mutation.
func (thp *TaskHierarchyPosition) CanUpdate(s *xorm.Session, a web.Auth) (bool, error) {
	_, err := thp.validateStructure(s)
	if err != nil {
		return false, err
	}

	task := &Task{ID: thp.TaskID}
	canUpdate, err := task.CanUpdate(s, a)
	if err != nil || !canUpdate || thp.ParentTaskID == nil {
		return canUpdate, err
	}

	relation := &TaskRelation{
		TaskID:       thp.TaskID,
		OtherTaskID:  *thp.ParentTaskID,
		RelationKind: RelationKindParenttask,
	}
	return relation.CanCreate(s, a)
}

// Update changes the parent relation and position in the handler's database
// transaction. Descendant relations are deliberately left untouched.
// @Summary Updates a task's hierarchy and position
// @Description Atomically changes a task's parent relation and its position in a list view. A null parent_task_id moves the task to the root.
// @tags task
// @Accept json
// @Produce json
// @Security JWTKeyAuth
// @Param id path int true "Task ID"
// @Param move body models.TaskHierarchyPosition true "The target parent and position."
// @Success 200 {object} models.TaskHierarchyPosition "The updated hierarchy and position."
// @Failure 400 {object} web.HTTPError "Invalid hierarchy or position."
// @Failure 403 {object} web.HTTPError "The user does not have permission to move the task."
// @Router /tasks/{id}/hierarchy-position [post]
func (thp *TaskHierarchyPosition) Update(s *xorm.Session, a web.Auth) error {
	_, err := thp.validateStructure(s)
	if err != nil {
		return err
	}

	parents, err := thp.currentParentRelations(s)
	if err != nil {
		return err
	}

	var currentParentID *int64
	if len(parents) == 1 {
		currentParentID = &parents[0].OtherTaskID
	}
	parentChanged := (currentParentID == nil) != (thp.ParentTaskID == nil)
	if currentParentID != nil && thp.ParentTaskID != nil {
		parentChanged = *currentParentID != *thp.ParentTaskID
	}

	if parentChanged && currentParentID != nil {
		relation := &TaskRelation{
			TaskID:       thp.TaskID,
			OtherTaskID:  *currentParentID,
			RelationKind: RelationKindParenttask,
		}
		if err = relation.Delete(s, a); err != nil {
			return err
		}
	}

	if parentChanged && thp.ParentTaskID != nil {
		relation := &TaskRelation{
			TaskID:       thp.TaskID,
			OtherTaskID:  *thp.ParentTaskID,
			RelationKind: RelationKindParenttask,
		}
		if err = relation.Create(s, a); err != nil {
			return err
		}
	}

	position := &TaskPosition{
		TaskID:        thp.TaskID,
		ProjectViewID: thp.ProjectViewID,
		Position:      thp.Position,
	}
	if err = updateTaskPosition(s, a, position); err != nil {
		return err
	}
	thp.Position = position.Position

	return triggerTaskUpdatedEventForTaskID(s, a, thp.TaskID)
}
