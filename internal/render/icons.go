package render

import (
	"strconv"
	"strings"

	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// IconSubject is one picture a unit can have: its portrait, basic attack,
// each upgrade, and each ability no upgrade owns.
type IconSubject struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Kind        string `json:"kind"` // portrait, attack, upgrade or ability
}

// IconSubjects is the one catalogue of icon keys, labels and descriptions
// for the interface and storage.
func IconSubjects(candidate unit.Candidate) []IconSubject {
	assigned := map[string]bool{}
	for _, path := range candidate.Paths {
		for _, tier := range path.Tiers {
			for _, id := range tier.AbilityIDs {
				assigned[id] = true
			}
		}
	}
	subjects := []IconSubject{
		{Key: "unit-portrait", Label: candidate.Character.Name, Description: candidate.Role, Kind: "portrait"},
		{Key: "basic-attack", Label: candidate.BasicAttack.Name, Description: candidate.BasicAttack.Behavior, Kind: "attack"},
	}
	for _, path := range candidate.Paths {
		for _, tier := range path.Tiers {
			tierText := strconv.Itoa(tier.Tier)
			subjects = append(subjects, IconSubject{
				Key:         "tier:" + path.ID + ":" + tierText,
				Label:       tier.Name,
				Description: path.Name + ": " + path.Theme + ". Tier " + tierText + ": " + tier.Benefit,
				Kind:        "upgrade",
			})
		}
	}
	for _, ability := range candidate.Abilities {
		if !assigned[ability.ID] {
			subjects = append(subjects, IconSubject{Key: "ability:" + ability.ID, Label: ability.Name, Description: ability.Description, Kind: "ability"})
		}
	}
	return subjects
}

// ImagePrompt asks any image generator for one square PNG of a subject.
func ImagePrompt(candidate unit.Candidate, subject IconSubject, pixels int) string {
	character := candidate.Character
	size := strconv.Itoa(pixels)
	var parts []string
	if subject.Kind == "portrait" {
		parts = append(parts, "Create one character portrait of "+character.Name+" from "+character.Work+" for a Tower Defense Unit.")
	} else {
		role := "an ability of"
		switch subject.Kind {
		case "attack":
			role = "the basic attack of"
		case "upgrade":
			role = "an upgrade of"
		}
		parts = append(parts, "Create one square game UI icon for "+subject.Label+", "+role+" "+character.Name+" from "+character.Work+".")
	}
	parts = append(parts, "Character scope: "+character.Scope, "Unit role: "+candidate.Role)
	if subject.Kind == "portrait" {
		parts = append(parts, "Character design direction: "+subject.Description)
	} else {
		parts = append(parts, "Represent this specific effect: "+subject.Description)
		switch subject.Kind {
		case "attack":
			parts = append(parts, "Show the signature attack in action: its projectile, weapon, striking limb or impact effect. Include only the minimum body or silhouette needed to explain the attack.")
		case "upgrade":
			parts = append(parts, "Show the changed mechanic of this upgrade as a distinctive projectile, weapon detail, effect or transformation feature. Give it a visual identity distinct from the basic attack and neighboring upgrades, grounded in its stated benefit.")
		default:
			parts = append(parts, "Show the specific ability through its defining projectile, object or effect. Include a character fragment only when it is needed to explain the mechanic.")
		}
		parts = append(parts, "Keep the attack or effect as the focal subject. Do not use a generic character portrait or whole-character pose as the icon. Use character-specific visual motifs only where they help identify this mechanic.")
	}
	if subject.Kind == "portrait" {
		parts = append(parts, "Show the character, with a recognizable face, outfit and silhouette consistent with the supplied scope and design direction. For an original character, create an original appearance from that brief. Use crisp anime-inspired cel shading and a centered pose that reads clearly as a small portrait on a dark interface. No text, lettering, numbers, wordmark, watermark, border or UI chrome. Deliver one "+size+" by "+size+" PNG with a transparent background.")
	} else {
		parts = append(parts, "Use a clear anime-inspired silhouette, crisp cel shading, a restrained palette and strong contrast against a dark UI. Make the ability identifiable at 48 pixels. Keep the focal subject centered with space around it. No text, lettering, numbers, wordmark, border, watermark or UI chrome. Deliver one "+size+" by "+size+" PNG with a transparent background.")
	}
	return strings.Join(parts, "\n\n")
}

// CodexIconPrompt also tells a local Codex session where to save the PNG.
func CodexIconPrompt(candidate unit.Candidate, subject IconSubject, destination string) string {
	return ImagePrompt(candidate, subject, 512) + "\n\nSave the finished PNG directly to " + s.Stringify(destination) + ". Create the parent folder if needed. The filename is already chosen; do not ask for a name or destination. Do not modify application code."
}
