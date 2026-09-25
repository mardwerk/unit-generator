package unit

import "github.com/mardwerk/unit-generator/internal/mechanics"

func boolPtr(v bool) *bool        { return &v }
func intPtr(v int) *int           { return &v }
func strPtr(v string) *string     { return &v }
func floatPtr(v float64) *float64 { return &v }

// DefaultAuthoringDefinition is the bundled Definition used for new units:
// the base scale with attack extensions, a two-tier early budget and the
// BTD6-inspired design policy.
func DefaultAuthoringDefinition() mechanics.Definition {
	d := mechanics.DefaultDefinition()
	d.Revision = defaultAuthoringRevision
	extensions := []string{"distinct-volley", "volley-follow-up"}
	d.Rules.AttackExtensions = &extensions
	d.Profile.EarlyTierThrough = intPtr(2)
	d.Profile.DesignPolicy = &mechanics.DesignPolicy{
		Version:                     "1",
		DistinctPathSpecializations: false,
		DistinctFirstUpgrades:       true,
		DistinctCapstones:           true,
		PreserveEarlyAttackIdentity: boolPtr(true),
		MaxManualAbilityPaths:       1,
		ManualAbilityPath:           mechanics.NullableString{Present: true, Value: "path2"},
		Tier5Uniqueness:             "one-per-player-unit-type-and-path",
	}
	return d
}

// DefaultRules is the bundled rules document.
func DefaultRules() Document {
	return Document{
		ID:     defaultRulesID,
		Kind:   "rules",
		Text:   defaultRulesText,
		Origin: Origin{Location: defaultRulesLocation, Access: "supplied", Note: strPtr(defaultRulesNote)},
	}
}

// DefaultProfile is the single bundled, read-only Profile.
func DefaultProfile() Profile {
	return Profile{
		SchemaVersion:       "1",
		Kind:                "profile",
		ID:                  "default",
		Name:                defaultProfileName,
		Task:                StarterTask,
		Rules:               DefaultRules(),
		MechanicsDefinition: DefaultAuthoringDefinition(),
	}
}
