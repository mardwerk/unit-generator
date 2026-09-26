package render

import (
	"fmt"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// RevisionNotes compare a revision with the unit it revised: changed
// mechanics apart from changed names, so a wording fix never hides a
// mechanics change.
type RevisionNotes struct {
	Mechanics []string `json:"mechanics"`
	Wording   []string `json:"wording"`
	// ChangedBuilds lists the legal builds whose resolved attack or ability
	// differs from the previous unit.
	ChangedBuilds []string `json:"changedBuilds"`
}

// Revision compares a revised unit with its previous version; nil when the
// artifact is no revision or either unit lacks valid typed mechanics.
func Revision(view View) *RevisionNotes {
	request := view.Prepared.Request
	if request.Previous == nil || request.Previous.Draft.Blueprint == nil {
		return nil
	}
	current := newSheet(view.Candidate.Blueprint, request.MechanicsDefinition)
	if current == nil {
		return nil
	}
	previous := &sheet{blueprint: request.Previous.Draft.Blueprint, definition: current.definition, vocabulary: current.vocabulary, currency: current.currency}
	return current.revisionNotes(previous)
}

func (sh *sheet) revisionNotes(previous *sheet) *RevisionNotes {
	notes := &RevisionNotes{Mechanics: []string{}, Wording: []string{}, ChangedBuilds: []string{}}
	name := func(code, before, after string) {
		if before != after {
			notes.Wording = append(notes.Wording, fmt.Sprintf("%s renamed from %s to %s.", code, before, after))
		}
	}
	oldBase, newBase := previous.blueprint.BaseAttack, sh.blueprint.BaseAttack
	name("0-0-0", oldBase.Name, newBase.Name)
	if oldBase.Cost != newBase.Cost {
		notes.Mechanics = append(notes.Mechanics, fmt.Sprintf("0-0-0 placement price %s to %s.", previous.money(oldBase.Cost), sh.money(newBase.Cost)))
	}
	if changes := sh.attackChanges(previous.resolve(m.Selection{}).BaseAttack, sh.resolve(m.Selection{}).BaseAttack); len(changes) > 0 {
		notes.Mechanics = append(notes.Mechanics, "0-0-0 attack: "+strings.Join(changes, ", ")+".")
	}
	for index := range m.PathKeys {
		oldPath, newPath := previous.blueprint.Paths.At(index), sh.blueprint.Paths.At(index)
		name(pathPositions[index]+" path", oldPath.Name, newPath.Name)
		for tier := 1; tier <= len(m.TierKeys); tier++ {
			code := unit.BuildCode(index, tier)
			oldTier, newTier := oldPath.Tiers.At(tier), newPath.Tiers.At(tier)
			name(code, oldTier.Name, newTier.Name)
			if oldTier.Cost != newTier.Cost {
				notes.Mechanics = append(notes.Mechanics, fmt.Sprintf("%s price %s to %s.", code, previous.money(oldTier.Cost), sh.money(newTier.Cost)))
			}
			if sameChanges(oldTier.Changes, newTier.Changes) {
				continue
			}
			var before, after m.Selection
			before[index], after[index] = tier-1, tier
			was := previous.purchaseEffects(oldTier.Changes, previous.resolve(before), previous.resolve(after))
			now := sh.purchaseEffects(newTier.Changes, sh.resolve(before), sh.resolve(after))
			notes.Mechanics = append(notes.Mechanics, fmt.Sprintf("%s now: %s Before: %s", code, strings.Join(now, " "), strings.Join(was, " ")))
		}
	}
	for _, selection := range m.AllLegalBuilds(sh.definition) {
		if s.Stringify(buildValue(previous.resolve(selection))) != s.Stringify(buildValue(sh.resolve(selection))) {
			notes.ChangedBuilds = append(notes.ChangedBuilds, unit.SelectionCode(selection))
		}
	}
	oldProposals, newProposals := proposalNames(previous.blueprint.Proposals), proposalNames(sh.blueprint.Proposals)
	for _, proposal := range newProposals {
		if !contains(oldProposals, proposal) {
			notes.Mechanics = append(notes.Mechanics, "New unsupported mechanic: "+proposal+".")
		}
	}
	for _, proposal := range oldProposals {
		if !contains(newProposals, proposal) {
			notes.Mechanics = append(notes.Mechanics, "No longer listed as unsupported: "+proposal+".")
		}
	}
	return notes
}

func sameChanges(a, b []m.Change) bool {
	return s.Stringify(s.FromGoValue(a)) == s.Stringify(s.FromGoValue(b))
}

// buildValue is a build's behavior without names or prices.
func buildValue(build m.Build) any {
	attack := build.BaseAttack.Clone()
	attack.Name, attack.Cost = "", 0
	if attack.FollowUp != nil {
		attack.FollowUp.Name = ""
	}
	abilities := []any{}
	for _, ability := range build.Abilities {
		boosted := ability.BoostedAttack.Clone()
		boosted.Name, boosted.Cost = "", 0
		if boosted.FollowUp != nil {
			boosted.FollowUp.Name = ""
		}
		abilities = append(abilities, []any{ability.Path, ability.DurationSeconds, ability.CooldownSeconds, s.FromGoValue(boosted)})
	}
	return []any{s.FromGoValue(attack), abilities}
}

func proposalNames(proposals []m.Proposal) []string {
	out := []string{}
	for _, proposal := range proposals {
		out = append(out, proposal.Name)
	}
	return out
}
