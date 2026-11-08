// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package models

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProjectViewLayoutValidateAndNormalize(t *testing.T) {
	t.Run("valid layout clamps column widths", func(t *testing.T) {
		layout := &ProjectViewLayout{
			Version: 1,
			Mode:    "grid",
			Columns: []*ProjectViewLayoutColumn{
				{Field: "done", Width: 1},
				{Field: "title", Width: 5000},
			},
			Group: &ProjectViewLayoutGroup{Field: "section"},
		}

		err := layout.validateAndNormalize()
		require.NoError(t, err)
		assert.Equal(t, 44, layout.Columns[0].Width)
		assert.Equal(t, 900, layout.Columns[1].Width)
		assert.Equal(t, "asc", layout.Group.Order)
	})

	t.Run("requires immutable columns", func(t *testing.T) {
		layout := &ProjectViewLayout{
			Version: 1,
			Mode:    "grid",
			Columns: []*ProjectViewLayoutColumn{{Field: "title", Width: 520}},
		}

		err := layout.validateAndNormalize()
		require.Error(t, err)
	})

	t.Run("rejects unknown and duplicate columns", func(t *testing.T) {
		for _, columns := range [][]*ProjectViewLayoutColumn{
			{{Field: "done", Width: 48}, {Field: "title", Width: 520}, {Field: "unknown", Width: 100}},
			{{Field: "done", Width: 48}, {Field: "title", Width: 520}, {Field: "title", Width: 600}},
		} {
			layout := &ProjectViewLayout{Version: 1, Mode: "grid", Columns: columns}
			require.Error(t, layout.validateAndNormalize())
		}
	})

	t.Run("rejects invalid version mode and group", func(t *testing.T) {
		baseColumns := []*ProjectViewLayoutColumn{{Field: "done", Width: 48}, {Field: "title", Width: 520}}
		layouts := []*ProjectViewLayout{
			{Version: 2, Mode: "grid", Columns: baseColumns},
			{Version: 1, Mode: "board", Columns: baseColumns},
			{Version: 1, Mode: "grid", Columns: baseColumns, Group: &ProjectViewLayoutGroup{Field: "invalid"}},
			{Version: 1, Mode: "grid", Columns: baseColumns, Group: &ProjectViewLayoutGroup{Field: "done", Order: "sideways"}},
		}

		for _, layout := range layouts {
			require.Error(t, layout.validateAndNormalize())
		}
	})
}
