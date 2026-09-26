package research

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	s "github.com/mardwerk/unit-generator/internal/schema"
)

var luffyLookup = visualLookup{name: "Monkey D. Luffy", articleTitle: "Monkey D. Luffy", wikidataID: "Q477948"}

var luffyPage, _ = url.Parse("https://onepiece.fandom.com/wiki/Monkey_D._Luffy")

const cdn = "https://static.wikia.nocookie.net/onepiece/images/a/ab/"

func picture(file, caption, attributes string) string {
	return fmt.Sprintf(`<figure><a href="/wiki/File:%s"><img src="%s%s/revision/latest" width="300" %s></a><figcaption>%s</figcaption></figure>`, file, cdn, file, attributes, caption)
}

func wikimedia(source string) *http.Response {
	return jsonResponse(200, map[string]any{"query": map[string]any{"pages": []any{map[string]any{
		"title": "File:Luffy_Infobox.png",
		"imageinfo": []any{map[string]any{
			"url":            "https://upload.wikimedia.org/wikipedia/en/a/ab/Luffy.png",
			"thumburl":       "https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Luffy.png/480px-Luffy.png",
			"descriptionurl": source,
			"extmetadata": map[string]any{
				"Artist":                   map[string]any{"value": `<a href="https://example.test">Artist Name</a>`},
				"LicenseShortName":         map[string]any{"value": "Fair use"},
				"CommonsMetadataExtension": map[string]any{"value": 1.2},
			},
		}},
	}}}})
}

func wikidata(value string) *http.Response {
	return jsonResponse(200, map[string]any{"entities": map[string]any{"Q477948": map[string]any{"claims": map[string]any{"P6262": []any{
		map[string]any{"mainsnak": map[string]any{"datavalue": map[string]any{"value": value}}},
	}}}}})
}

func parsed(html string) *http.Response {
	return jsonResponse(200, map[string]any{"parse": map[string]any{"text": map[string]any{"*": html}}})
}

func gather(t *testing.T, lookup visualLookup, handle func(*http.Request) *http.Response) (visuals, *transport) {
	t.Helper()
	r, fake := researcher(handle)
	result, err := r.gatherVisuals(context.Background(), lookup)
	if err != nil {
		t.Fatal(err)
	}
	return result, fake
}

func TestGatheringCombinesCitedImagesWithBalancedKinds(t *testing.T) {
	result, fake := gather(t, luffyLookup, func(r *http.Request) *http.Response {
		switch r.URL.Host {
		case "en.wikipedia.org":
			if r.URL.Query().Get("generator") != "images" {
				t.Errorf("query %s", r.URL.RawQuery)
			}
			return wikimedia("https://en.wikipedia.org/wiki/File:Luffy_Infobox.png")
		case "www.wikidata.org":
			return wikidata("onepiece:Monkey_D._Luffy")
		}
		switch r.URL.Query().Get("page") {
		case "Monkey_D._Luffy":
			return parsed(picture("Luffy_Portrait.png", "Luffy portrait", "") +
				`<a href="/wiki/Monkey_D._Luffy/Gallery">Gallery</a><a href="/wiki/Monkey_D._Luffy/Abilities_and_Powers">Abilities</a><a href="/wiki/Zoro/Gallery">Other character</a><a href="https://evil.example/wiki/Monkey_D._Luffy/Gallery">Off-site</a>`)
		case "Monkey_D._Luffy/Abilities_and_Powers":
			html := picture("Luffy_Punch.png", "Luffy stretches his arm to punch a Sea King.", "")
			for n := range 12 {
				html += picture(fmt.Sprintf("Luffy_Gear_%d.png", n), fmt.Sprintf("Luffy in Gear %d.", n), "")
			}
			return parsed(html)
		case "Monkey_D._Luffy/Gallery":
			return parsed(picture("Luffy_Punch.png", "Duplicate gallery caption", "") + picture("Luffy_Stance.png", "Luffy fighting stance", ""))
		}
		t.Errorf("unexpected %s", r.URL)
		return notFound()
	})
	if len(fake.queries) != 5 || len(result.references) != 9 {
		t.Fatalf("queries %d, references %d", len(fake.queries), len(result.references))
	}
	kinds, ids := map[string]bool{}, map[string]bool{}
	caption, attributed := false, false
	for _, image := range result.references {
		kinds[image.Kind], ids[image.ID] = true, true
		caption = caption || strings.Contains(image.Caption, "Sea King")
		attributed = attributed || (image.Attribution != nil && *image.Attribution == "Artist Name. Fair use")
		if !strings.HasPrefix(image.SourceURL, "https://") {
			t.Errorf("source %s", image.SourceURL)
		}
	}
	if len(kinds) != 3 || !kinds["appearance"] || !kinds["form"] || !kinds["pose"] || len(ids) != 9 || !caption || !attributed {
		t.Errorf("kinds %v ids %d caption %v attributed %v", kinds, len(ids), caption, attributed)
	}
	if !strings.Contains(result.notes[0], "not image analysis") || strings.Contains(strings.Join(result.notes, " "), "unavailable") {
		t.Errorf("notes %v", result.notes)
	}
}

func TestCaptionsLabelFormsAndActionsWithoutNavigation(t *testing.T) {
	html := strings.Join([]string{
		picture("Luffy_Infobox.png", "Luffy appearance", ""),
		picture("Luffy_Gear_5.png", "Luffy using Gear 5.", ""),
		picture("Pistol.png", "Luffy stretches his arm to punch.", ""),
		picture("Luffy_Super_Grand_Battle_X.png", "Luffy Super Grand Battle X", ""),
		`<div class="navibox">` + picture("Luffy_Navigation.png", "Luffy pose", "") + `</div>`,
		`<nav>` + picture("Luffy_Nav.png", "Luffy pose", "") + `</nav>`,
		picture("Luffy_Logo.png", "Luffy", ""),
		picture("Luffy_Banner.png", "Luffy flag", ""),
		picture("Zoro.png", "Zoro fighting", ""),
		`<img src="https://static.wikia.nocookie.net/onepiece/images/a/Luffy_Tiny.png" width="32">`,
		picture("Luffy_Infobox.png", "Duplicate", ""),
	}, "")
	images := fandomVisuals(html, luffyPage, luffyLookup.name)
	var kinds []string
	for _, image := range images {
		kinds = append(kinds, image.Kind)
	}
	if strings.Join(kinds, ",") != "appearance,form,pose,reference" || images[2].Caption != "Luffy stretches his arm to punch." {
		t.Errorf("kinds %v", kinds)
	}
	if regexp.MustCompile(`Navigation|Luffy_Nav|Logo|Banner|Zoro|Tiny|Duplicate`).MatchString(s.Stringify(s.FromGoValue(images))) {
		t.Error("excluded images kept")
	}
	fullbody := fandomVisuals(picture("Shiba-Miyuki-Fullbody.png", "Anime S3", "")+picture("Shiba_Residence.png", "Shiba Residence", "")+
		picture("Residence_At_Night.png", "Shiba siblings' house", "")+picture("Flying_Magic.gif", "Miyuki using Flying Magic", ""),
		mustURL("https://mahouka-koukou-no-rettousei.fandom.com/wiki/Shiba_Miyuki"), "Miyuki Shiba")
	if len(fullbody) != 2 || fullbody[0].Kind != "appearance" || fullbody[1].Kind != "pose" {
		t.Errorf("fullbody %s", s.Stringify(s.FromGoValue(fullbody)))
	}
}

func mustURL(value string) *url.URL {
	parsed, err := url.Parse(value)
	if err != nil {
		panic(err)
	}
	return parsed
}

func TestUnsafeImageSourcesAreRejected(t *testing.T) {
	html := picture("Luffy_Valid.png", "Luffy portrait", "") +
		`<img src="https://static.wikia.nocookie.net/onepiece/images/a/Luffy_%ZZ.png" width="300">` +
		`<img src="https://static.wikia.nocookie.net.evil.test/Luffy.png" alt="Luffy pose" width="300">` +
		`<img src="http://static.wikia.nocookie.net/Luffy.png" alt="Luffy pose" width="300">` +
		`<img src="https://secret:token@static.wikia.nocookie.net/Luffy.png" alt="Luffy pose" width="300">` +
		`<a href="https://secret:token@onepiece.fandom.com/wiki/File:Luffy.png"><img src="` + cdn + `Luffy_Second.png" width="300" alt="Luffy stance"></a>`
	images := fandomVisuals(html, luffyPage, luffyLookup.name)
	if len(images) != 2 || images[1].SourceURL != luffyPage.String() || regexp.MustCompile(`secret|token|evil`).MatchString(s.Stringify(s.FromGoValue(images))) {
		t.Errorf("images %s", s.Stringify(s.FromGoValue(images)))
	}
	if len(fandomVisuals(html, mustURL("https://onepiece.fandom.com.evil.test/wiki/Luffy"), luffyLookup.name)) != 0 {
		t.Error("an unverified host supplied images")
	}
	result, _ := gather(t, visualLookup{name: luffyLookup.name, articleTitle: luffyLookup.articleTitle}, func(*http.Request) *http.Response {
		return wikimedia("https://enXwikipediaYorg/wiki/File:Luffy.png")
	})
	if len(result.references) != 0 {
		t.Errorf("references %d", len(result.references))
	}
}

func TestMissingSourcesStayNonfatalAndVisible(t *testing.T) {
	missing, _ := gather(t, luffyLookup, func(*http.Request) *http.Response { return textResponse(503, "text/plain", "PRIVATE_REMOTE_ERROR") })
	notes := strings.Join(missing.notes, " ")
	if len(missing.references) != 0 || !strings.Contains(notes, "sources were unavailable") || strings.Contains(notes, "PRIVATE_REMOTE") {
		t.Errorf("notes %s", notes)
	}
	partial, _ := gather(t, luffyLookup, func(r *http.Request) *http.Response {
		switch {
		case r.URL.Host == "en.wikipedia.org":
			return wikimedia("https://en.wikipedia.org/wiki/File:Luffy_Infobox.png")
		case r.URL.Host == "www.wikidata.org":
			return wikidata("onepiece:Monkey_D._Luffy")
		case r.URL.Query().Get("page") == "Monkey_D._Luffy":
			return parsed(picture("Luffy_Portrait.png", "Luffy portrait", "") + `<a href="/wiki/Monkey_D._Luffy/Gallery">Gallery</a>`)
		}
		return textResponse(503, "text/plain", "Unavailable")
	})
	notes = strings.Join(partial.notes, " ")
	if len(partial.references) != 2 || !strings.Contains(notes, "sources were unavailable") || !strings.Contains(notes, "No labeled action-pose") {
		t.Errorf("partial %d %s", len(partial.references), notes)
	}
}

func TestUnverifiedFandomIdentitiesCannotRedirectResearch(t *testing.T) {
	hosts := map[string]bool{}
	for _, identity := range []string{"https://evil.test/path", "bad_host:Character", "vsbattles:Luffy", "onepiece:One_Piece"} {
		result, _ := gather(t, luffyLookup, func(r *http.Request) *http.Response {
			hosts[r.URL.Host] = true
			if r.URL.Host == "en.wikipedia.org" {
				return wikimedia("https://en.wikipedia.org/wiki/File:Luffy_Infobox.png")
			}
			return wikidata(identity)
		})
		if !strings.Contains(strings.Join(result.notes, " "), "no supported character-specific wiki link") {
			t.Errorf("%s: %v", identity, result.notes)
		}
	}
	if len(hosts) != 2 || !hosts["en.wikipedia.org"] || !hosts["www.wikidata.org"] {
		t.Errorf("hosts %v", hosts)
	}
}

func TestVisualCancellationEndsTheLookup(t *testing.T) {
	r, fake := researcher(func(*http.Request) *http.Response { return nil })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := r.gatherVisuals(ctx, luffyLookup); err != ErrLookupCancelled || len(fake.queries) != 0 {
		t.Errorf("err %v queries %d", err, len(fake.queries))
	}
	ctx, cancel = context.WithCancel(context.Background())
	r, _ = researcher(func(request *http.Request) *http.Response {
		cancel()
		<-request.Context().Done()
		return nil
	})
	if _, err := r.gatherVisuals(ctx, luffyLookup); err != ErrLookupCancelled {
		t.Errorf("err %v", err)
	}
}

var rimuru = visualLookup{name: "Rimuru Tempest", articleTitle: "List of That Time I Got Reincarnated as a Slime characters", work: "That Time I Got Reincarnated as a Slime"}

func rimuruIdentity(changes map[string]any) map[string]any {
	identity := map[string]any{"id": "Q104817112", "label": "Rimuru Tempest", "description": "fictional character from That Time I Got Reincarnated as a Slime"}
	for k, v := range changes {
		identity[k] = v
	}
	return identity
}

func TestSharedArticleFindsASeparateIdentity(t *testing.T) {
	result, fake := gather(t, rimuru, func(r *http.Request) *http.Response {
		query := r.URL.Query()
		switch {
		case r.URL.Host == "en.wikipedia.org":
			return jsonResponse(200, map[string]any{"query": map[string]any{"pages": []any{}}})
		case query.Get("action") == "wbsearchentities":
			return jsonResponse(200, map[string]any{"search": []any{rimuruIdentity(nil)}})
		case r.URL.Host == "www.wikidata.org":
			if query.Get("ids") != "Q104817112" {
				t.Errorf("ids %s", query.Get("ids"))
			}
			return jsonResponse(200, map[string]any{"entities": map[string]any{"Q104817112": map[string]any{"claims": map[string]any{"P6262": []any{
				map[string]any{"mainsnak": map[string]any{"datavalue": map[string]any{"value": "isekai:Ten-sura"}}},
				map[string]any{"mainsnak": map[string]any{"datavalue": map[string]any{"value": "tensura:Rimuru_Tempest"}}},
			}}}}})
		}
		if r.URL.Host != "tensura.fandom.com" || query.Get("page") != "Rimuru_Tempest" {
			t.Errorf("unexpected %s", r.URL)
		}
		return parsed(picture("Rimuru_Tempest.png", "Rimuru Tempest portrait", ""))
	})
	if len(fake.queries) != 4 || len(result.references) != 1 || result.references[0].SourceURL != "https://tensura.fandom.com/wiki/File:Rimuru_Tempest.png" ||
		!strings.Contains(*result.references[0].Attribution, "tensura.fandom.com") || !strings.Contains(strings.Join(result.notes, " "), "Wikipedia reference contains no usable images") {
		t.Errorf("result %s (%d queries)", s.Stringify(s.FromGoValue(result.references)), len(fake.queries))
	}
	for _, search := range [][]any{
		{},
		{rimuruIdentity(map[string]any{"description": "Japanese light novel series That Time I Got Reincarnated as a Slime"})},
		{rimuruIdentity(map[string]any{"description": "fictional character from Another Slime Series"})},
		{rimuruIdentity(map[string]any{"label": "Veldora Tempest"})},
		{rimuruIdentity(map[string]any{"label": "Rimuru Tempest companions"})},
		{rimuruIdentity(nil), rimuruIdentity(map[string]any{"id": "Q123"})},
	} {
		result, _ := gather(t, rimuru, func(r *http.Request) *http.Response {
			if r.URL.Host == "en.wikipedia.org" {
				return jsonResponse(200, map[string]any{"query": map[string]any{"pages": []any{}}})
			}
			return jsonResponse(200, map[string]any{"search": search})
		})
		if len(result.references) != 0 || !regexp.MustCompile(`No unique character identity.*Inputs and rules`).MatchString(strings.Join(result.notes, " ")) {
			t.Errorf("search %v: %v", search, result.notes)
		}
	}
}

func TestFullBodyReferenceSurvivesTheCap(t *testing.T) {
	run := func(withFullBody bool) visuals {
		result, _ := gather(t, luffyLookup, func(r *http.Request) *http.Response {
			switch r.URL.Host {
			case "en.wikipedia.org":
				return wikimedia("https://en.wikipedia.org/wiki/File:Luffy_Infobox.png")
			case "www.wikidata.org":
				return wikidata("onepiece:Monkey_D._Luffy")
			}
			html := ""
			for i := range 15 {
				html += picture(fmt.Sprintf("Luffy_Portrait_%d.png", i), "Luffy portrait", "")
			}
			if withFullBody {
				html += picture("Luffy_Fullbody.png", "Anime reference", "")
			}
			return parsed(html)
		})
		return result
	}
	with := run(true)
	found := false
	for _, image := range with.references {
		found = found || strings.Contains(image.ID, "Fullbody")
	}
	if len(with.references) != 9 || !found || strings.Contains(strings.Join(with.notes, " "), "No full-body") {
		t.Errorf("with %d %v", len(with.references), with.notes)
	}
	if !strings.Contains(strings.Join(run(false).notes, " "), "No full-body reference identified by source captions or filenames") {
		t.Error("missing full-body note")
	}
}

func TestDimensionsAreKeptOnlyAsAValidPair(t *testing.T) {
	images := fandomVisuals(picture("Luffy_Anime_Infobox.png", "Anime image", `height="900"`)+picture("Luffy_Another.png", "Another image", `height="invalid"`), luffyPage, luffyLookup.name)
	if images[0].Width == nil || *images[0].Width != 300 || *images[0].Height != 900 || images[1].Width != nil || images[1].Height != nil {
		t.Errorf("images %s", s.Stringify(s.FromGoValue(images)))
	}
}

func TestReusedArticleTextPrioritizesAbilities(t *testing.T) {
	html := `<div class="mw-parser-output">
    <p>Luffy is a pirate with an elastic body.</p>
    <div class="portable-infobox"><p>INFOBOX EXCLUDED CONTENT</p></div>
    <nav><p>NAVIGATION EXCLUDED CONTENT</p></nav>
    <h2>Background</h2><p>BIOGRAPHY EXCLUDED CONTENT</p>
    <h2>Abilities</h2><h3>Elastic attacks</h3>
    <p>Luffy stretches his arms to punch distant opponents.<sup class="reference">CITATION EXCLUDED</sup></p>
    <figure><p>IMAGE CAPTION EXCLUDED</p></figure>
    <h2>References</h2><ol class="references"><li>REFERENCE EXCLUDED CONTENT</li></ol>
    <script>UNTRUSTED SCRIPT</script></div>`
	document := fandomSource(html, luffyPage, luffyLookup.name, time.Now())
	if document == nil || !strings.HasPrefix(document.Text, "Abilities") || !strings.Contains(document.Text, "stretches his arms to punch") || !strings.Contains(document.Text, "pirate with an elastic body") ||
		regexp.MustCompile(`EXCLUDED|SCRIPT`).MatchString(document.Text) || document.Origin.Location != luffyPage.String() || !strings.Contains(*document.Origin.Note, "fan-maintained secondary source") {
		t.Fatalf("document %+v", document)
	}
	for _, c := range []struct {
		page *url.URL
		name string
	}{{mustURL(luffyPage.String() + "/Gallery"), luffyLookup.name}, {luffyPage, "Other Character"}, {mustURL("https://evil.test/wiki/Monkey_D._Luffy"), luffyLookup.name}} {
		if fandomSource(html, c.page, c.name, time.Now()) != nil {
			t.Errorf("%s %s accepted", c.page, c.name)
		}
	}
	long := `<div class="mw-parser-output"><h2>Elastic body</h2>`
	for i := range 100 {
		long += fmt.Sprintf("<p>Attack %d: Luffy extends a rubber punch. %s</p>", i, strings.Repeat("Repeated source detail. ", 20))
	}
	capped := fandomSource(long+"</div>", mustURL(luffyPage.String()+"/Abilities_and_Powers"), luffyLookup.name, time.Now())
	if capped == nil || s.UTF16Len(capped.Text) > 12000 || !strings.Contains(capped.Text, "Attack 0") || !strings.Contains(*capped.Origin.Note, "capped at 12000") {
		t.Errorf("capped %v", capped != nil)
	}
}

func TestEncodedAbilityLinksStayIdentityBound(t *testing.T) {
	var targets []string
	result, _ := gather(t, luffyLookup, func(r *http.Request) *http.Response {
		switch r.URL.Host {
		case "en.wikipedia.org":
			return wikimedia("https://en.wikipedia.org/wiki/File:Luffy_Infobox.png")
		case "www.wikidata.org":
			return wikidata("onepiece:Monkey_D._Luffy")
		}
		title := r.URL.Query().Get("page")
		targets = append(targets, title)
		switch title {
		case "Monkey_D._Luffy":
			return parsed(`<p>Luffy has an elastic rubber body.</p><a href="/wiki/Monkey_D._Luffy/Abilities_%26_gear">Abilities</a><a href="/wiki/Monkey_D._Luffy/Gallery">Gallery</a><a href="/wiki/Other_Character/Abilities_%26_gear">Other</a><a href="https://evil.test/wiki/Monkey_D._Luffy/Abilities_%26_gear">Offsite</a><a href="/wiki/Monkey_D._Luffy/Unobserved_power">Other page</a>`)
		case "Monkey_D._Luffy/Abilities_&_gear":
			return parsed(`<h2>Rubber body</h2><p>Luffy stretches his arms to punch distant targets.</p>`)
		}
		return parsed("")
	})
	if len(targets) != 3 || targets[0] != "Monkey_D._Luffy" {
		t.Errorf("targets %v", targets)
	}
	found := false
	for _, document := range result.documents {
		if strings.HasSuffix(document.Origin.Location, "/Abilities_%26_gear") && strings.Contains(document.Text, "punch distant targets") {
			found = true
		}
		if strings.HasSuffix(document.Origin.Location, "/Gallery") {
			t.Error("a gallery became a source")
		}
	}
	if !found {
		t.Errorf("documents %s", s.Stringify(s.FromGoValue(result.documents)))
	}
}

func TestTechniqueEnrichmentStaysBounded(t *testing.T) {
	var targets []string
	result, _ := gather(t, luffyLookup, func(r *http.Request) *http.Response {
		switch r.URL.Host {
		case "en.wikipedia.org":
			return wikimedia("https://en.wikipedia.org/wiki/File:Luffy_Infobox.png")
		case "www.wikidata.org":
			return wikidata("onepiece:Monkey_D._Luffy")
		}
		title := r.URL.Query().Get("page")
		targets = append(targets, title)
		switch title {
		case "Monkey_D._Luffy":
			return parsed(picture("Luffy_Portrait.png", "Luffy portrait", "") + `<p>Luffy is the captain of a pirate crew.</p><a href="/wiki/Monkey_D._Luffy/Abilities_and_Powers">Abilities</a>`)
		case "Monkey_D._Luffy/Abilities_and_Powers":
			return parsed(`<h2>Skills</h2><h3>Former</h3><ul><li><a href="/wiki/Water_Blade">Water Blade</a> was formerly used.</li><li><a href="/wiki/Black_Flame">Black Flame</a> was formerly used.</li><li><a href="/wiki/Other_Punch">Other Punch</a> is a third link.</li></ul>`)
		case "Water_Blade":
			return parsed(`<h2>Abilities</h2><p>The user launches a cutting water blade at enemies.</p><a href="/wiki/Another_Blade">Do not follow</a>`)
		}
		return textResponse(404, "text/plain", "missing")
	})
	if len(targets) != 4 || targets[0] != "Monkey_D._Luffy" || targets[1] != "Monkey_D._Luffy/Abilities_and_Powers" {
		t.Errorf("targets %v", targets)
	}
	if len(result.references) == 0 || len(result.documents) != 3 || !strings.Contains(result.documents[0].Text, "cutting water blade") || !strings.Contains(result.documents[0].Text, "Former") ||
		!strings.Contains(strings.Join(result.notes, " "), "linked technique descriptions were unavailable") {
		t.Errorf("documents %d %v", len(result.documents), result.notes)
	}
}
