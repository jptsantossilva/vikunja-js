// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.

package migration

import (
	"encoding/json"

	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

type projectView20261106090000 struct {
	ID     int64           `xorm:"autoincr not null unique pk"`
	Layout json.RawMessage `xorm:"json null default null"`
}

func (projectView20261106090000) TableName() string {
	return "project_views"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20261106090000",
		Description: "add presentation layout to project views",
		Migrate: func(tx *xorm.Engine) error {
			return tx.Sync(projectView20261106090000{})
		},
		Rollback: func(_ *xorm.Engine) error {
			// Additive nullable columns are intentionally kept on rollback so older
			// binaries can continue to use the database safely.
			return nil
		},
	})
}
