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
	"fmt"

	"code.vikunja.io/api/pkg/db"
	"xorm.io/builder"
	"xorm.io/xorm"
)

func (InviteLinkTeam) TableName() string { return "teams" }

type AdminTeamDirectoryEntry struct {
	ID         int64  `json:"id" xorm:"id" doc:"Team ID."`
	Name       string `json:"name" xorm:"name" doc:"Team name."`
	ExternalID string `json:"external_id" xorm:"external_id" doc:"External identity provider ID, if managed externally."`
}

func (AdminTeamDirectoryEntry) TableName() string { return "teams" }

func ListTeamDirectoryAsAdmin(s *xorm.Session, search string, page, perPage int) ([]AdminTeamDirectoryEntry, int64, error) {
	limit, start := getLimitFromPageIndex(page, perPage)
	teams := []AdminTeamDirectoryEntry{}
	query := s.Limit(limit, start)
	if search != "" {
		query = query.Where(db.ILIKE("name", search))
	}
	total, err := query.OrderBy("id ASC").FindAndCount(&teams)
	return teams, total, err
}

func ListTeamsAsAdmin(s *xorm.Session, search string, page, perPage int) ([]InviteLinkTeam, int64, error) {
	limit, start := getLimitFromPageIndex(page, perPage)
	teams := []InviteLinkTeam{}
	cond := builder.Or(builder.IsNull{"external_id"}, builder.Eq{"external_id": ""})
	query := s.Limit(limit, start)
	if search != "" {
		cond = cond.And(db.ILIKE("name", search))
		order, args := db.SearchRelevanceOrder(search, "name")
		query = query.OrderBy(order, args...)
	}
	total, err := query.Where(cond).OrderBy("id ASC").FindAndCount(&teams)
	if err != nil {
		return nil, 0, fmt.Errorf("list invite teams: %w", err)
	}
	return teams, total, nil
}
