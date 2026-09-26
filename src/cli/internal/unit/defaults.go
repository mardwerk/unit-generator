package unit

import "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"

func boolPtr(v bool) *bool        { return &v }
func intPtr(v int) *int           { return &v }
func strPtr(v string) *string     { return &v }
func floatPtr(v float64) *float64 { return &v }

// DefaultAuthoringDefinition is the bundled Definition used for new units:
// the base scale with attack extensions, a two-tier early budget, five
// changes per later purchase, the
// BTD6-inspired design policy and a version 2 vocabulary. The vocabulary
// names the base scale's slow, burn, stun, damage types, targeting and Camo
// detection, so it behaves exactly as the version 1 starter. Its scale and
// the rules document's references come from btd6-atlas capture 56.3.
func DefaultAuthoringDefinition() mechanics.Definition {
	d := mechanics.DefaultDefinition()
	d.Label = "BTD6-inspired Gold and Health starter, btd6-atlas 56.3 scale"
	extensions := []string{"distinct-volley", "volley-follow-up"}
	d.Rules.AttackExtensions = &extensions
	d.Profile.EarlyTierThrough = intPtr(2)
	// Real upgrades such as Crossbow Master change five properties.
	d.Profile.MaxChangesPerTier = 5
	d.Profile.DesignPolicy = &mechanics.DesignPolicy{
		Version:                     "1",
		DistinctPathSpecializations: false,
		DistinctFirstUpgrades:       true,
		DistinctCapstones:           true,
		PreserveEarlyAttackIdentity: boolPtr(true),
		RequireTier3BehaviorChange:  boolPtr(true),
		MaxManualAbilityPaths:       1,
		ManualAbilityPath:           mechanics.NullableString{Present: true, Value: "path2"},
		Tier5Uniqueness:             "one-per-player-unit-type-and-path",
	}
	d = mechanics.UpgradeDefinition(d)
	d.Revision = defaultAuthoringRevision
	describeVocabulary(d.Vocabulary)
	return d
}

// describeVocabulary gives the upgraded starter vocabulary readable names.
func describeVocabulary(v *mechanics.Vocabulary) {
	for i := range v.EnemyProperties {
		term := &v.EnemyProperties[i]
		term.Name, term.Description = defaultEnemyProperties[term.ID][0], defaultEnemyProperties[term.ID][1]
	}
	for i := range v.DamageTypes {
		v.DamageTypes[i].Name = defaultDamageTypes[v.DamageTypes[i].ID]
	}
	for i := range v.Targeting {
		term := &v.Targeting[i]
		term.Name, term.Description = defaultTargeting[term.ID][0], defaultTargeting[term.ID][1]
	}
	v.Detection[0].Name, v.Detection[0].Description = "Camo", "Hidden enemies; only an attack that detects Camo can target them."
	for i := range v.StatusEffects {
		effect := &v.StatusEffects[i]
		text := defaultStatusEffects[effect.ID]
		effect.Name, effect.Description, effect.Aliases = text.name, text.description, text.aliases
	}
}

var defaultEnemyProperties = map[string][2]string{
	"lead":   {"Lead", "Armored; sharp damage cannot harm it."},
	"frozen": {"Frozen", "Encased in ice; sharp damage cannot harm it."},
	"purple": {"Purple", "Resists energy damage."},
	"black":  {"Black", "Resists explosive damage."},
	"zebra":  {"Zebra", "Resists explosive damage."},
	"blimp":  {"Blimp", "Large armored carrier; ignores slow and stun."},
	"boss":   {"Boss", "Boss enemy; ignores slow and stun."},
}

var defaultDamageTypes = map[string]string{"sharp": "Sharp", "normal": "Normal", "explosive": "Explosive", "energy": "Energy"}

var defaultTargeting = map[string][2]string{
	"first":  {"First", "The enemy furthest along the track."},
	"last":   {"Last", "The enemy least far along the track."},
	"close":  {"Close", "The nearest enemy."},
	"strong": {"Strong", "The toughest enemy."},
}

var defaultStatusEffects = map[string]struct {
	name, description string
	aliases           []string
}{
	"slow": {"Slow", "Reduces movement speed by the magnitude in percent. The strongest slow applies; a new one refreshes the duration.", []string{"chill", "snare"}},
	"burn": {"Burn", "Deals the magnitude as damage each second. The strongest burn applies; a new one refreshes the duration.", []string{"fire", "ignite"}},
	"stun": {"Stun", "Stops the enemy from moving. A new stun refreshes the duration.", []string{"freeze", "paralyze"}},
}

// ExampleStackingProfile is a read-only example of Profile-defined status
// effects: the default Profile plus poison and bleed, which stack up to a
// limit and a combined cap.
func ExampleStackingProfile() Profile {
	profile := DefaultProfile()
	profile.ID = "stacking-example"
	profile.Name = "Stacking effects (example)"
	d := &profile.MechanicsDefinition
	d.Revision = defaultAuthoringRevision + "-stacking"
	d.Label = "BTD6-inspired starter with stacking poison and bleed"
	perSecond := func(min, max float64) *mechanics.Magnitude {
		return &mechanics.Magnitude{Unit: "damage/s", Min: min, Max: max}
	}
	d.Vocabulary.StatusEffects = append(d.Vocabulary.StatusEffects,
		mechanics.StatusEffect{
			ID: "poison", Name: "Poison", Aliases: []string{"venom", "toxin"}, Kind: mechanics.KindDamageOverTime,
			Description: "Deals the magnitude as damage each second per stack. Every hit adds an independent stack with its own duration.",
			Magnitude:   perSecond(0.5, 5), MaxSeconds: 8,
			Stacking: mechanics.Stacking{MaxStacks: 5, Refresh: mechanics.RefreshIndependent, MaxMagnitude: floatPtr(10)},
			Immune:   []string{"lead"},
		},
		mechanics.StatusEffect{
			ID: "bleed", Name: "Bleed", Aliases: []string{"bleeding", "laceration"}, Kind: mechanics.KindDamageOverTime,
			Description: "Deals the magnitude as damage each second per stack. Every hit adds a stack and resets the duration of all stacks.",
			Magnitude:   perSecond(0.5, 3), MaxSeconds: 6,
			Stacking: mechanics.Stacking{MaxStacks: 10, Refresh: mechanics.RefreshReset, MaxMagnitude: floatPtr(15)},
			Immune:   []string{"blimp", "boss"},
		},
	)
	return profile
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

// DefaultProfile is the default bundled, read-only Profile.
func DefaultProfile() Profile {
	return Profile{
		SchemaVersion:       "2",
		Kind:                "profile",
		ID:                  "default",
		Name:                defaultProfileName,
		Task:                StarterTask,
		Rules:               DefaultRules(),
		MechanicsDefinition: DefaultAuthoringDefinition(),
	}
}
