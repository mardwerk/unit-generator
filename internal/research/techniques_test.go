package research

import (
	"regexp"
	"strings"
	"testing"
)

var techniquePage = mustURL("https://tensura.fandom.com/wiki/Rimuru_Tempest/Abilities_%26_gear")

const techniqueHTML = `<div class="mw-parser-output"><nav><a href="/wiki/Nav_Blade">Nav</a></nav>
<h2>Skills</h2><h3>Former</h3><h4>Extra skills</h4>
<ul><li><a href="/wiki/Black_Flame_Thunder">Black Flame Thunder</a> is a compound variant.</li><li><a href="/wiki/Black_Flame">Black Flame</a> (Absorbed into Black Flame-Thunder)</li>
<li><a href="/wiki/Other_Flame">Other Flame</a></li><li><a href="/wiki/Black_Lightning">Black Lightning</a></li></ul>
<h4>Common skills</h4><ul><li><a href="/wiki/Water_Blade">Water Blade</a> (Evolved into Water Manipulation)</li>
<li><a href="https://evil.test/wiki/Evil_Blade">Evil Blade</a></li><li><a href="/wiki/File:Blade">File</a></li>
<li><a href="/wiki/Bad%2FBlade">Subpage</a></li><li><a href="/wiki/Bad_Blade?x=1">Query</a></li></ul>
<h2>Analyzed and Subordinates Skills</h2><p><a href="/wiki/Other_Punch">Other Punch</a></p>
<h2>Equipment</h2><p><a href="/wiki/Sword">Sword</a></p></div>`

func titles(links []techniqueLink) string {
	var out []string
	for _, link := range links {
		out = append(out, link.title)
	}
	return strings.Join(out, ", ")
}

func TestObservedCombatLinksKeepOwnershipContext(t *testing.T) {
	links := linkedTechniques(techniqueHTML, techniquePage, "Rimuru Tempest")
	if got := titles(links); got != "Black Flame Thunder, Black Flame, Other Flame, Black Lightning, Water Blade" {
		t.Errorf("links %s", got)
	}
	selected := selectTechniques(append(links, links...))
	if got := titles(selected); got != "Water Blade, Black Flame" {
		t.Fatalf("selected %s", got)
	}
	water := selected[0]
	if strings.Join(water.headings, " > ") != "Skills > Former > Common skills" || water.linkText != "Water Blade" || water.context != "Water Blade (Evolved into Water Manipulation)" || water.parent != techniquePage.String() {
		t.Errorf("water %+v", water)
	}
}

func TestTechniqueDescriptionsKeepBehaviorAndOmitOtherUsers(t *testing.T) {
	link := selectTechniques(linkedTechniques(techniqueHTML, techniquePage, "Rimuru Tempest"))[0]
	quote := "The user adds rotation to magicule-infused water and sprays it at high-velocity. The thin water blade has a severing effect and deals only physical damage."
	source := techniqueSource(`<div class="mw-parser-output"><h2>Abilities</h2><p>`+quote+`</p><h2>Known Users</h2><p>Someone else also has an unrelated supreme power.</p><h2>Trivia</h2><p>Unrelated trivia should not enter the extraction.</p><nav><p>Navigation fake attack description should never appear.</p></nav></div>`, link)
	if source == nil || !strings.Contains(source.Text, quote) || !strings.Contains(source.Text, "Skills > Former > Common skills") ||
		!strings.Contains(source.Text, "Former, evolved or absorbed entries do not establish current availability") ||
		!strings.Contains(source.Text, "Parent passage: Water Blade (Evolved into Water Manipulation)") ||
		regexp.MustCompile(`supreme power|Unrelated trivia|Navigation fake`).MatchString(source.Text) ||
		source.Origin.Location != link.url.String() || !strings.Contains(*source.Origin.Note, "not independently verified canon") {
		t.Fatalf("source %+v", source)
	}
	if techniqueSource(`<nav><p>Only navigation is available on this missing page.</p></nav>`, link) != nil {
		t.Error("navigation became a source")
	}
	bounded := techniqueSource(`<h2>Abilities</h2><p>Creates super-heated flames to attack the target.</p><p>`+strings.Repeat("x", 5000)+`</p><p>See <a href="/wiki/Extra_Blade">another technique</a> for an unrelated variant.</p>`, linkedTechniques(techniqueHTML, techniquePage, "Rimuru Tempest")[0])
	if bounded == nil || len(bounded.Text) >= 5500 || strings.Contains(bounded.Text, strings.Repeat("x", 100)) {
		t.Errorf("bounded %v", bounded != nil)
	}
}
