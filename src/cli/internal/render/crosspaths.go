package render

import (
	"fmt"
	"sort"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// Crosspath rows resolve every legal two-path build of a unit, so no
// sentence stands in for a partial build: each row names the build, its
// total price, what each purchased path adds to the other and the attack
// (and active window) that results.

// Contribution is what one path's purchases change in a build, compared
// with the same build without that path.
type Contribution struct {
	From    string   `json:"from"`
	Changes []string `json:"changes"`
}

// BuildRow is one resolved two-path build.
type BuildRow struct {
	Code          string         `json:"code"`
	Cost          float64        `json:"cost"`
	Contributions []Contribution `json:"contributions"`
	Attack        string         `json:"attack"`
	Active        string         `json:"active,omitempty"`
}

// Crosspaths are the early builds (two paths, neither beyond the crosspath
// tier) and the advanced builds (one path beyond it). Under the default
// Definition there are 12 and 36.
type Crosspaths struct {
	Early    []BuildRow `json:"early"`
	Advanced []BuildRow `json:"advanced"`
}

// ResolveCrosspaths resolves every legal two-path build of a valid
// blueprint; nil for a candidate without valid typed mechanics.
func ResolveCrosspaths(candidate unit.Candidate, definition *m.Definition) *Crosspaths {
	sh := newSheet(candidate.Blueprint, definition)
	if sh == nil {
		return nil
	}
	return sh.crosspaths()
}

// pathTier is one purchased path of a build.
type pathTier struct{ index, tier int }

func purchased(selection m.Selection) []pathTier {
	var out []pathTier
	for index, tier := range selection {
		if tier > 0 {
			out = append(out, pathTier{index, tier})
		}
	}
	return out
}

func (sh *sheet) crosspaths() *Crosspaths {
	out := &Crosspaths{Early: []BuildRow{}, Advanced: []BuildRow{}}
	type entry struct {
		selection m.Selection
		main      pathTier
		side      pathTier
		advanced  bool
	}
	var builds []entry
	limit := sh.definition.Progression.CrosspathTier
	for _, selection := range m.AllLegalBuilds(sh.definition) {
		paths := purchased(selection)
		if len(paths) != 2 {
			continue
		}
		main, side := paths[0], paths[1]
		advanced := main.tier > limit || side.tier > limit
		if side.tier > limit {
			main, side = side, main
		}
		builds = append(builds, entry{selection, main, side, advanced})
	}
	// Order by main path, its tier, then the side path and its tier: 1-1-0,
	// 1-2-0, 1-0-1 … and 3-1-0, 3-2-0, 3-0-1 ….
	sort.SliceStable(builds, func(i, j int) bool {
		a, b := builds[i], builds[j]
		keys := [][2]int{{a.main.index, b.main.index}, {a.main.tier, b.main.tier}, {a.side.index, b.side.index}, {a.side.tier, b.side.tier}}
		for _, key := range keys {
			if key[0] != key[1] {
				return key[0] < key[1]
			}
		}
		return false
	})
	for _, build := range builds {
		row := sh.row(build.selection, build.advanced)
		if build.advanced {
			out.Advanced = append(out.Advanced, row)
		} else {
			out.Early = append(out.Early, row)
		}
	}
	return out
}

// row resolves one build. An advanced row shows what the side purchases
// add to the main path; an early row shows what each path adds to the other.
func (sh *sheet) row(selection m.Selection, advanced bool) BuildRow {
	build := sh.resolve(selection)
	row := BuildRow{Code: unit.SelectionCode(selection), Cost: build.CumulativeCost, Attack: sh.attackSummary(build.BaseAttack)}
	for _, ability := range build.Abilities {
		row.Active = ability.Name + " for " + decimal(ability.DurationSeconds) + " s every " + decimal(ability.CooldownSeconds) + " s: " + sh.attackSummary(ability.BoostedAttack)
	}
	limit := sh.definition.Progression.CrosspathTier
	for _, path := range purchased(selection) {
		if advanced && path.tier > limit {
			continue
		}
		without := selection
		without[path.index] = 0
		changes := sh.buildChanges(sh.resolve(without), build)
		if len(changes) == 0 {
			changes = []string{"no change"}
		}
		row.Contributions = append(row.Contributions, Contribution{From: codeRange(path), Changes: changes})
	}
	return row
}

// codeRange names a path's purchases up to a tier: x-1-x or x-1-x and x-2-x.
func codeRange(path pathTier) string {
	var codes []string
	for tier := 1; tier <= path.tier; tier++ {
		codes = append(codes, unit.BuildCode(path.index, tier))
	}
	return joinAnd(codes)
}

// attackSummary is a compact line of a resolved attack's numbers.
func (sh *sheet) attackSummary(attack m.Attack) string {
	st := attack.Stats
	parts := []string{fmt.Sprintf("%s %s every %s s, %s %s damage, pierce %s, range %s",
		decimal(st.Projectiles), plural(st.Projectiles, shot(attack), shot(attack)+"s"), decimal(st.IntervalSeconds),
		decimal(st.Damage), sh.damageTypeName(attack.DamageType), decimal(st.Pierce), decimal(st.Range))}
	if st.SplashRadius > 0 {
		parts = append(parts, "splash "+decimal(st.SplashRadius))
	}
	if attack.Distribution == "distinct-targets" {
		parts = append(parts, "distinct targets")
	}
	for _, status := range attack.AppliedStatuses() {
		parts = append(parts, sh.status(status))
	}
	var detected []string
	for _, trait := range attack.DetectionTraits() {
		detected = append(detected, sh.detectionName(trait))
	}
	if len(detected) > 0 {
		parts = append(parts, "detects "+joinAnd(detected))
	}
	if f := attack.FollowUp; f != nil {
		parts = append(parts, fmt.Sprintf("%s up to %s × %s", f.Name, decimal(f.Count), decimal(st.Damage*f.DamageMultiplier)))
	}
	return strings.Join(parts, "; ")
}

// attackChanges lists what differs between two resolved attacks.
func (sh *sheet) attackChanges(before, after m.Attack) []string {
	var out []string
	number := func(label, unitText string, a, b float64) {
		if a != b {
			out = append(out, fmt.Sprintf("%s %s%s → %s%s", label, decimal(a), unitText, decimal(b), unitText))
		}
	}
	number("damage", "", before.Stats.Damage, after.Stats.Damage)
	number("interval", " s", before.Stats.IntervalSeconds, after.Stats.IntervalSeconds)
	number("range", "", before.Stats.Range, after.Stats.Range)
	number("pierce", "", before.Stats.Pierce, after.Stats.Pierce)
	number(plural(2, shot(after), shot(after)+"s"), "", before.Stats.Projectiles, after.Stats.Projectiles)
	number("splash", "", before.Stats.SplashRadius, after.Stats.SplashRadius)
	if before.DamageType != after.DamageType {
		out = append(out, sh.damageTypeName(after.DamageType)+" damage instead of "+sh.damageTypeName(before.DamageType))
	}
	if before.Delivery != after.Delivery {
		out = append(out, after.Delivery+" delivery instead of "+before.Delivery)
	}
	if before.Targeting != after.Targeting {
		out = append(out, sh.targetingName(after.Targeting)+" targeting instead of "+sh.targetingName(before.Targeting))
	}
	if before.Distribution != after.Distribution {
		if after.Distribution == "distinct-targets" {
			out = append(out, "shots spread over distinct targets")
		} else {
			out = append(out, "shots aim at the selected target")
		}
	}
	for _, trait := range after.DetectionTraits() {
		if !before.DetectsTrait(trait) {
			out = append(out, "detects "+sh.detectionName(trait))
		}
	}
	for _, trait := range before.DetectionTraits() {
		if !after.DetectsTrait(trait) {
			out = append(out, "no longer detects "+sh.detectionName(trait))
		}
	}
	seen := map[string]bool{}
	for _, status := range append(before.AppliedStatuses(), after.AppliedStatuses()...) {
		if seen[status.Effect] {
			continue
		}
		seen[status.Effect] = true
		was, had := before.Status(status.Effect)
		now, has := after.Status(status.Effect)
		switch {
		case !had:
			out = append(out, "adds "+sh.status(now))
		case !has:
			out = append(out, "loses "+sh.effect(status.Effect).Name)
		case was.Strength() != now.Strength() || was.Seconds != now.Seconds:
			out = append(out, sh.status(was)+" → "+sh.status(now))
		}
	}
	switch {
	case before.FollowUp == nil && after.FollowUp != nil:
		out = append(out, "adds "+after.FollowUp.Name)
	case before.FollowUp != nil && after.FollowUp == nil:
		out = append(out, "loses "+before.FollowUp.Name)
	case before.FollowUp != nil && *before.FollowUp != *after.FollowUp:
		out = append(out, after.FollowUp.Name+" changes")
	}
	return out
}

// buildChanges lists what a path's purchases add: to the attack, and to an
// owned boost's window when that changes too.
func (sh *sheet) buildChanges(before, after m.Build) []string {
	changes := sh.attackChanges(before.BaseAttack, after.BaseAttack)
	for _, ability := range after.Abilities {
		var old *m.ResolvedAbility
		for i := range before.Abilities {
			if before.Abilities[i].Path == ability.Path {
				old = &before.Abilities[i]
			}
		}
		if old == nil {
			changes = append(changes, "adds "+ability.Name)
			continue
		}
		if active := sh.attackChanges(old.BoostedAttack, ability.BoostedAttack); len(active) > 0 {
			changes = append(changes, "during "+ability.Name+": "+strings.Join(active, ", "))
		}
	}
	return changes
}
