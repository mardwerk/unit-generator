package mechanics

// DefaultDefinition returns the base BTD6-inspired starter Definition. Its
// reference scale is Dart Monkey 0-0-0 with its top-path purchase prices, as
// captured by btd6-atlas 56.3 (Steam build 24829026, revision a380413):
// data/56.3-build-24829026/game-data/Towers/DartMonkey/DartMonkey.json and
// game-data/Upgrades/{Sharp Shots, Razor Sharp Shots, Spike-o-pult,
// Juggernaut, Ultra-Juggernaut}.json. The default Profile's rules document
// adds references for other roles; see docs/BTD6-REFERENCE.md.
func DefaultDefinition() Definition {
	return Definition{
		Version:       "1",
		ID:            "btd6-combat-v1",
		Revision:      "2026-09-20",
		Label:         "BTD6-inspired Gold and Health starter",
		BalanceStatus: "experimental-starter-scale",
		Progression:   DefinitionProgression{PathCount: 3, TiersPerPath: 5, MaxPurchasedPaths: 2, MaxAdvancedPaths: 1, CrosspathTier: 2},
		Rules: Rules{
			Arithmetic:             "highest-tier-set-then-add-then-multiply",
			TieBreak:               "path-order-then-change-order",
			Detection:              "camo-is-target-access-only",
			Obstruction:            "all-deliveries-require-clear-path",
			ProjectileDistribution: "same-primary-target-per-volley",
			TargetCap:              "per-projectile-including-primary-and-splash",
			ManualBoostUnlockTier:  4,
			ManualBoostModifyTier:  5,
			AbilityReadiness:       "ready-on-purchase-cooldown-starts-on-activation-no-reactivation-while-active",
			SlowStacking:           "strongest-only-refresh-duration",
			BurnStacking:           "strongest-only-refresh-duration",
			StunStacking:           "refresh-duration",
			DamageImmunities: DamageImmunities{
				Sharp:     []string{"lead", "frozen"},
				Normal:    []string{},
				Explosive: []string{"black", "zebra"},
				Energy:    []string{"purple"},
			},
			SlowImmune: []string{"blimp", "boss"},
			StunImmune: []string{"blimp", "boss"},
		},
		Profile: DefinitionProfile{
			Currency: "Gold",
			ReferenceScale: &ReferenceScale{
				HealthResource: "Health", StartingHealth: 150, OrdinaryEnemyHealth: 1, BaseCost: 200,
				BaseDamage: 1, BaseIntervalSeconds: 0.95, BaseRange: 32, BasePierce: 2,
				IncrementalUpgradeCosts: [5]float64{140, 200, 320, 1800, 15000},
			},
			MaxBaseCost:                 10000,
			MaxUpgradeCost:              1000000,
			MaxStatValue:                1000000,
			MaxChangesPerTier:           4,
			EarlyTierMaxChanges:         3,
			EarlyTierMaxNewCapabilities: 1,
		},
	}
}
