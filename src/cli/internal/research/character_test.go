package research

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"testing"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

var luffy = pageOf(1, "Monkey D. Luffy", "Luffy is a fictional character. His body stretches.", "Fictional character from One Piece", 1)

func lookup(t *testing.T, handle func(*http.Request) *http.Response, name string, choice int) (*Sources, []Choice, error) {
	t.Helper()
	r, _ := researcher(handle)
	return r.Character(context.Background(), name, choice)
}

func TestCharacterResolvesIdentityWithProvenanceAndPreparesUnderAProfile(t *testing.T) {
	sources, _, err := lookup(t, wikipedia(t, []wikiPage{luffy}, []wikiPage{luffy}), " Luffy ", 0)
	if err != nil {
		t.Fatal(err)
	}
	if sources.Kind != "sources" || sources.Query != "Luffy" || sources.Character.Name != "Monkey D. Luffy" || sources.Character.Work != "One Piece" {
		t.Errorf("sources %+v", sources.Character)
	}
	primary := sources.Documents[0]
	if primary.Text != luffy["extract"] || primary.Origin.Location != "https://en.wikipedia.org/wiki/Monkey_D._Luffy" || primary.Origin.Access != "retrieved" || !strings.Contains(*primary.Origin.Note, "not exhaustive or independently verified canon") {
		t.Errorf("document %+v", primary.Origin)
	}
	if _, err := ParseSources(s.FromGoValue(sources)); err != nil {
		t.Errorf("sources do not satisfy their contract: %v", err)
	}
	prepared, err := sources.Prepare(unit.DefaultProfile())
	if err != nil {
		t.Fatal(err)
	}
	request := prepared.Request
	progression := unit.DefinitionProgression(unit.DefaultProfile().MechanicsDefinition)
	if s.Stringify(s.FromGoValue(request.Progression)) != s.Stringify(s.FromGoValue(progression)) || request.Documents[1].ID != unit.DefaultProfile().Rules.ID || request.Previous != nil {
		t.Errorf("request not prepared under the Profile: %s %s %v", s.Stringify(s.FromGoValue(request.Progression)), request.Documents[1].ID, request.Previous)
	}
	if !strings.HasPrefix(prepared.InputHash, "jcs-sha256:") {
		t.Errorf("hash %s", prepared.InputHash)
	}
}

func TestAmbiguityReturnsChoicesAndAcceptsOnlyACurrentChoice(t *testing.T) {
	castlevania := pageOf(2, "Alucard (Castlevania)", "A fictional character with a sword.", "Fictional character in Castlevania", 2)
	hellsing := pageOf(3, "Alucard (Hellsing)", "A fictional character with regeneration.", "Fictional character from Hellsing", 1)
	disambiguation := pageOf(4, "Alucard", "A fictional character may refer to several things.", "", 1).
		with("pageprops", map[string]any{"wikibase-shortdesc": "Disambiguation", "disambiguation": ""})
	pages := []wikiPage{castlevania, disambiguation, hellsing}
	handle := wikipedia(t, pages, pages)
	_, choices, err := lookup(t, handle, "Alucard", 0)
	if err != nil || len(choices) != 2 || choices[0].ID != 3 || choices[0].Name != "Alucard (Hellsing)" || choices[1].ID != 2 {
		t.Fatalf("choices %+v %v", choices, err)
	}
	selected, _, err := lookup(t, handle, "Alucard", 3)
	if err != nil || selected.Character.Work != "Hellsing" {
		t.Fatalf("selected %v %v", selected, err)
	}
	for _, stale := range []int{4, 99} {
		if _, _, err := lookup(t, handle, "Alucard", stale); err == nil || !strings.Contains(err.Error(), "no longer in the search results") {
			t.Errorf("choice %d: %v", stale, err)
		}
	}
}

func TestListEntriesStopBeforeTheNextCharacter(t *testing.T) {
	title := "List of That Time I Got Reincarnated as a Slime characters"
	full := pageOf(10, title, strings.Join([]string{
		"Characters from That Time I Got Reincarnated as a Slime.",
		"== Main characters ==",
		"Rimuru Tempest (リムル・テンペスト, Rimuru Tenpesuto)",
		"Voiced by: Example actor",
		"Rimuru absorbs creatures and acquires their abilities.",
		"Veldora Tempest (ヴェルドラ, Berudora)",
		"Voiced by: Another actor",
		"Veldora has UNRELATED_DRAGON_POWER.",
		"== Other characters ==",
		"UNRELATED_OTHER_POWER",
	}, "\n"), "", 1).with("pageprops", map[string]any{"wikibase-shortdesc": "", "wikibase_item": "Q60035086"})
	articles := wikipedia(t, []wikiPage{full.with("extract", "A list of characters.")}, []wikiPage{full})
	identityQueries := 0
	sources, _, err := lookup(t, func(r *http.Request) *http.Response {
		if r.URL.Host == "www.wikidata.org" {
			identityQueries++
			if r.URL.Query().Get("action") != "wbsearchentities" || r.URL.Query().Get("search") != "Rimuru Tempest" || r.URL.Query().Has("ids") {
				t.Errorf("identity query %s", r.URL.RawQuery)
			}
			return jsonResponse(200, map[string]any{"search": []any{}})
		}
		return articles(r)
	}, "Rimuru Tempest", 0)
	if err != nil {
		t.Fatal(err)
	}
	if identityQueries != 1 {
		t.Errorf("identity queries %d", identityQueries)
	}
	primary := sources.Documents[0]
	if sources.Character.Name != "Rimuru Tempest" || sources.Character.Work != "That Time I Got Reincarnated as a Slime" ||
		!strings.Contains(primary.Text, "absorbs creatures") || regexp.MustCompile(`UNRELATED|Veldora`).MatchString(primary.Text) ||
		!strings.HasSuffix(primary.Origin.Location, "#Main_characters") || !strings.Contains(*primary.Origin.Note, "named entry") {
		t.Errorf("sources %+v %q %s", sources.Character, primary.Text, primary.Origin.Location)
	}
}

func irregular(extract []string) wikiPage {
	return pageOf(11, "The Irregular at Magic High School", strings.Join(extract, "\n"), "Japanese web novel series and its franchise", 1)
}

func TestSharedEntriesResolveReversedNamesAndAliases(t *testing.T) {
	full := irregular([]string{
		"A story about magic.",
		"== Characters ==",
		"=== Main ===",
		"Tatsuya Shiba (司波 達也, Shiba Tatsuya) and Miyuki Shiba (司波 深雪, Shiba Miyuki, Snow Queen)",
		"Tatsuya can decompose and reconstruct matter. Miyuki specializes in freezing magic and freezing consciousness.",
		"=== Supporting ===",
		"Other people have UNRELATED_SUPPORTING_POWER.",
	})
	handle := wikipedia(t, []wikiPage{full.with("extract", "A Japanese web novel.")}, []wikiPage{full})
	sources, _, err := lookup(t, handle, "Shiba Tatsuya", 0)
	if err != nil {
		t.Fatal(err)
	}
	if sources.Character.Name != "Tatsuya Shiba" || sources.Character.Work != "The Irregular at Magic High School" ||
		strings.Contains(sources.Documents[0].Text, "UNRELATED") || !strings.Contains(*sources.Documents[0].Origin.Note, "shared entry may also discuss related characters") ||
		!strings.Contains(sources.Character.Scope, "Only attribute abilities to the requested character") {
		t.Errorf("sources %+v", sources.Character)
	}
	for _, query := range []string{"Miyuki Shiba", "Shiba Miyuki", "Snow Queen", "司波 深雪"} {
		sources, _, err := lookup(t, handle, query, 0)
		if err != nil || sources.Character.Name != "Miyuki Shiba" || !strings.HasSuffix(sources.Documents[0].Origin.Location, "#Main") {
			t.Errorf("%s: %v %v", query, sources, err)
		}
	}
}

func TestLookupRejectsRealPeopleSeriesNamesAndPassingMentions(t *testing.T) {
	actor := pageOf(20, "Actor", "An actor plays a fictional character.", "American actor", 1)
	series := pageOf(21, "A Series", "== Production ==\nRimuru Tempest (a guest) was mentioned in an interview.\nSome more production discussion.", "Japanese manga series", 1)
	for _, c := range []struct {
		name  string
		pages []wikiPage
	}{{"Actor", []wikiPage{actor}}, {"One Piece", []wikiPage{luffy}}, {"Rimuru Tempest", []wikiPage{series}}, {"Luffy", nil}} {
		if _, _, err := lookup(t, wikipedia(t, c.pages, c.pages), c.name, 0); err == nil || !strings.Contains(err.Error(), "No matching") {
			t.Errorf("%s: %v", c.name, err)
		}
	}
}

func TestLookupFailuresAreActionableWithoutRemotePayloads(t *testing.T) {
	for _, c := range []struct {
		handle func(*http.Request) *http.Response
		want   string
	}{
		{func(*http.Request) *http.Response { return textResponse(429, "text/plain", "REMOTE_PRIVATE_PAYLOAD") }, "HTTP 429"},
		{func(*http.Request) *http.Response { return textResponse(200, "text/plain", "REMOTE_PRIVATE_PAYLOAD") }, "unreadable reference"},
		{wikipedia(t, []wikiPage{luffy}, []wikiPage{luffy.with("extract", " ")}), "no usable text"},
		{func(*http.Request) *http.Response { return nil }, "lookup is unavailable"},
	} {
		_, _, err := lookup(t, c.handle, "Luffy", 0)
		if err == nil || !strings.Contains(err.Error(), c.want) || strings.Contains(err.Error(), "REMOTE_PRIVATE") {
			t.Errorf("want %q, got %v", c.want, err)
		}
	}
}

func TestLookupCancellationStopsRetrieval(t *testing.T) {
	r, fake := researcher(func(*http.Request) *http.Response { t.Error("fetched after cancellation"); return nil })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := r.Character(ctx, "Luffy", 0); !errors.Is(err, ErrLookupCancelled) || len(fake.queries) != 0 {
		t.Errorf("err %v, queries %d", err, len(fake.queries))
	}
	ctx, cancel = context.WithCancel(context.Background())
	r, fake = researcher(func(*http.Request) *http.Response {
		cancel()
		return jsonResponse(200, map[string]any{"query": map[string]any{"pages": []any{luffy}}})
	})
	if _, _, err := r.Character(ctx, "Luffy", 0); !errors.Is(err, ErrLookupCancelled) || len(fake.queries) != 1 {
		t.Errorf("err %v, queries %d", err, len(fake.queries))
	}
}

func TestUnsupportedNamesAreRejectedBeforeFetching(t *testing.T) {
	r, fake := researcher(func(*http.Request) *http.Response { return nil })
	for _, name := range []string{"", "   ", "!!!", strings.Repeat("x", 121)} {
		if _, _, err := r.Character(context.Background(), name, 0); err == nil {
			t.Errorf("%q accepted", name)
		}
	}
	if _, _, err := r.Character(context.Background(), "Luffy", -1); err == nil {
		t.Error("negative choice accepted")
	}
	if len(fake.queries) != 0 {
		t.Errorf("fetched %d times", len(fake.queries))
	}
}

func TestSourcesCarryGatheredImages(t *testing.T) {
	identified := luffy.with("pageprops", map[string]any{"wikibase-shortdesc": "Fictional character from One Piece", "wikibase_item": "Q477948"})
	articles := wikipedia(t, []wikiPage{identified}, []wikiPage{identified})
	identity := 0
	sources, _, err := lookup(t, func(r *http.Request) *http.Response {
		if r.URL.Host == "www.wikidata.org" {
			identity++
			if r.URL.Query().Get("ids") != "Q477948" {
				t.Errorf("identity %s", r.URL.RawQuery)
			}
			return jsonResponse(200, map[string]any{"entities": map[string]any{"Q477948": map[string]any{"claims": map[string]any{}}}})
		}
		if r.URL.Query().Get("generator") == "images" {
			return jsonResponse(200, map[string]any{"query": map[string]any{"pages": []any{map[string]any{
				"title": "File:Luffy_Infobox.png",
				"imageinfo": []any{map[string]any{
					"url":            "https://upload.wikimedia.org/wikipedia/en/a/ab/Luffy.png",
					"descriptionurl": "https://en.wikipedia.org/wiki/File:Luffy_Infobox.png",
					"extmetadata":    map[string]any{"Artist": map[string]any{"value": "<b>Eiichiro</b> Oda"}, "CommonsMetadataExtension": map[string]any{"value": 1.2}},
				}},
			}}}})
		}
		return articles(r)
	}, "Luffy", 0)
	if err != nil {
		t.Fatal(err)
	}
	references := *sources.Documents[0].VisualReferences
	if identity != 1 || len(references) != 1 || references[0].Kind != "appearance" || *references[0].Attribution != "Eiichiro Oda" {
		t.Fatalf("references %s", s.Stringify(s.FromGoValue(references)))
	}
	if !strings.Contains(strings.Join(*sources.Documents[0].VisualNotes, " "), "not image analysis") {
		t.Error("notes do not state the labelling limits")
	}
}

func TestSharedEntryFindsAFandomIdentityWithImagesAndText(t *testing.T) {
	full := irregular([]string{
		"== Characters ==",
		"=== Main ===",
		"Tatsuya Shiba (司波 達也, Shiba Tatsuya) and Miyuki Shiba (司波 深雪, Shiba Miyuki, Snow Queen)",
		"Miyuki specializes in freezing magic and freezing consciousness. Tatsuya decomposes matter.",
		"=== Supporting ===",
		"UNRELATED_SUPPORTING_POWER",
	})
	articles := wikipedia(t, []wikiPage{full.with("extract", "A Japanese web novel.")}, []wikiPage{full})
	sources, _, err := lookup(t, func(r *http.Request) *http.Response {
		query := r.URL.Query()
		switch {
		case query.Get("action") == "wbsearchentities":
			if query.Get("search") != "Miyuki Shiba" {
				t.Errorf("search %s", query.Get("search"))
			}
			return jsonResponse(200, map[string]any{"search": []any{map[string]any{"id": "Q20448698", "label": "Miyuki Shiba", "description": "fictional character from The Irregular at Magic High School"}}})
		case r.URL.Host == "www.wikidata.org":
			return jsonResponse(200, map[string]any{"entities": map[string]any{"Q20448698": map[string]any{"claims": map[string]any{"P6262": []any{
				map[string]any{"mainsnak": map[string]any{"datavalue": map[string]any{"value": "mahouka-koukou-no-rettousei:Shiba_Miyuki"}}},
			}}}}})
		case strings.HasSuffix(r.URL.Host, ".fandom.com"):
			if query.Get("page") != "Shiba_Miyuki" {
				t.Errorf("page %s", query.Get("page"))
			}
			return jsonResponse(200, map[string]any{"parse": map[string]any{"text": map[string]any{"*": `<p>Miyuki is an ice magician.</p><h2>Abilities</h2><p>Miyuki freezes nearby targets with ice magic.</p><figure><img src="https://static.wikia.nocookie.net/mahouka/images/a/ab/Shiba-Miyuki-Fullbody.png" width="268"><figcaption>Miyuki portrait</figcaption></figure>`}}})
		}
		return articles(r)
	}, "Snow Queen", 0)
	if err != nil {
		t.Fatal(err)
	}
	primary := sources.Documents[0]
	references := *primary.VisualReferences
	if sources.Character.Name != "Miyuki Shiba" || len(references) != 1 || references[0].Kind != "appearance" || !strings.Contains(references[0].SourceURL, "Shiba_Miyuki") {
		t.Fatalf("references %s", s.Stringify(s.FromGoValue(references)))
	}
	var enriched *unit.Document
	for i := range sources.Documents {
		if strings.HasPrefix(sources.Documents[i].ID, "character-wiki:") {
			enriched = &sources.Documents[i]
		}
	}
	if enriched == nil || !strings.Contains(enriched.Text, "freezes nearby targets") || enriched.Origin.Location != "https://mahouka-koukou-no-rettousei.fandom.com/wiki/Shiba_Miyuki" || !strings.Contains(*enriched.Origin.Note, "secondary source") {
		t.Fatalf("enriched %+v", enriched)
	}
}
