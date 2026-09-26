package unit

import (
	"testing"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func TestBundledProfilesAreVersion2(t *testing.T) {
	for _, profile := range []Profile{DefaultProfile(), ExampleStackingProfile()} {
		parsed, err := ValidateProfile(s.FromGoValue(profile))
		if err != nil {
			t.Fatalf("%s: %v", profile.ID, err)
		}
		if parsed.SchemaVersion != "2" || !parsed.MechanicsDefinition.IsV2() {
			t.Errorf("%s is not version 2", profile.ID)
		}
		if s.Stringify(s.FromGoValue(parsed)) != s.Stringify(s.FromGoValue(profile)) {
			t.Errorf("%s changes when parsed", profile.ID)
		}
	}
}
