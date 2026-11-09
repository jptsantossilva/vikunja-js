// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package apiv2

import (
	"context"
	"net/http"

	"code.vikunja.io/api/pkg/models"
	"code.vikunja.io/api/pkg/web/handler"

	"github.com/danielgtaylor/huma/v2"
)

func RegisterTaskHierarchyPositionRoutes(api huma.API) {
	Register(api, huma.Operation{
		OperationID: "tasks-hierarchy-position-update",
		Summary:     "Set a task's parent and position",
		Description: "Atomically changes a task's parent relation and position in a list view. A null parent_task_id moves the task to the root.",
		Method:      http.MethodPut,
		Path:        "/tasks/{task}/hierarchy-position",
		Tags:        []string{"tasks"},
	}, tasksHierarchyPositionUpdate)
}

func init() { AddRouteRegistrar(RegisterTaskHierarchyPositionRoutes) }

func tasksHierarchyPositionUpdate(ctx context.Context, in *struct {
	TaskID int64 `path:"task" doc:"The numeric id of the task to move."`
	Body   models.TaskHierarchyPosition
}) (*singleBody[models.TaskHierarchyPosition], error) {
	a, err := authFromCtx(ctx)
	if err != nil {
		return nil, err
	}
	move := &in.Body
	move.TaskID = in.TaskID
	if err := handler.DoUpdate(ctx, move, a); err != nil {
		return nil, translateDomainError(err)
	}
	return &singleBody[models.TaskHierarchyPosition]{Body: move}, nil
}
