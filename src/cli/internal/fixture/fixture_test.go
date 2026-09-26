package fixture

import "testing"

func TestBuild(t *testing.T) {
	stages, err := Build()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range stages.Result.Findings {
		if f.Outcome == "fail" {
			t.Errorf("%s %s: %s", f.Rule, f.Subject, f.Message)
		}
	}
}
