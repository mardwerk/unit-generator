package research

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

const wikipediaAPI = "https://en.wikipedia.org/w/api.php"

// Lookup errors. Messages are actionable and never quote remote payloads.
var (
	ErrLookupCancelled = errors.New("Character lookup was cancelled.")
	errLookupTimeout   = errors.New("Character lookup timed out. Try again.")
	errLookupDown      = errors.New("Character lookup is unavailable. Try again or supply a source in Inputs and rules.")
	errLookupUnread    = errors.New("Character lookup returned an unreadable reference. Try again or supply a source in Inputs and rules.")
)

type page struct {
	PageID    int            `json:"pageid"`
	Title     string         `json:"title"`
	Index     *float64       `json:"index"`
	Extract   string         `json:"extract"`
	PageProps map[string]any `json:"pageprops"`
}

func (p page) order() float64 {
	if p.Index == nil {
		return 99
	}
	return *p.Index
}

func (p page) description() string {
	if value, ok := p.PageProps["wikibase-shortdesc"].(string); ok && value != "" {
		return value
	}
	first, _, _ := strings.Cut(p.Extract, "\n")
	return s.SliceUTF16(first, 0, 220)
}

var (
	workInDescription = regexp.MustCompile(`(?i)\b(?:from|in|of) (?:the )?(.+?)(?: franchise)?$`)
	workInTitle       = regexp.MustCompile(`\(([^)]+)\)$`)
	characterKind     = regexp.MustCompile(`(?i)\b(?:fictional character|protagonist|antagonist)\b`)
	characterList     = regexp.MustCompile(`(?i)^List of .+ characters$`)
	seriesKind        = regexp.MustCompile(`(?i)\b(?:novel|manga|anime|television|media)\b.*\b(?:series|franchise)\b`)
	listTitle         = regexp.MustCompile(`(?i)^List of (.+) characters$`)
	charactersWord    = regexp.MustCompile(`(?i)\bcharacters\b`)
	sectionHeading    = regexp.MustCompile(`^(={2,6})\s*(.*?)\s*(={2,6})$`)
	anyHeading        = regexp.MustCompile(`^={2,6}\s`)
	sharedEntry       = regexp.MustCompile(`(?i)\)\s+(?:and|&)\s+`)
	namedEntry        = regexp.MustCompile(`^([^()]{1,120}?)\s+\(([^)]*)`)
	aliasSeparator    = regexp.MustCompile(`[,;、]`)
	entryWithCredit   = regexp.MustCompile(`^.{1,200}?\s+\(.+\)`)
	voiceCredit       = regexp.MustCompile(`^Voiced by:`)
)

func (p page) work() string {
	if match := workInDescription.FindStringSubmatch(p.description()); match != nil && match[1] != "" {
		return match[1]
	}
	if match := workInTitle.FindStringSubmatch(p.Title); match != nil {
		return match[1]
	}
	return "Source series unspecified"
}

type reference struct {
	page    page
	name    string
	section string
}

type heading struct {
	level int
	name  string
}

// characterEntry accepts a named entry inside a characters section, never a
// passing mention.
func characterEntry(p page, query []string) (reference, bool) {
	lines := strings.Split(p.Extract, "\n")
	var headings []heading
	for index, line := range lines {
		match := sectionHeading.FindStringSubmatch(line)
		if match != nil && match[1] != match[3] {
			match = nil
		}
		if match != nil {
			for len(headings) > 0 && headings[len(headings)-1].level >= len(match[1]) {
				headings = headings[:len(headings)-1]
			}
			headings = append(headings, heading{len(match[1]), match[2]})
		}
		inCharacters := charactersWord.MatchString(p.Title)
		for _, h := range headings {
			inCharacters = inCharacters || charactersWord.MatchString(h.name)
		}
		if !inCharacters {
			continue
		}
		// Text extracts can put several named characters in one entry. Match
		// each declared name and its parenthetical aliases, not arbitrary prose.
		type named struct {
			name    string
			aliases []string
		}
		var names []named
		if match != nil {
			names = []named{{name: match[2]}}
		} else {
			for _, part := range sharedEntry.Split(line, -1) {
				if m := namedEntry.FindStringSubmatch(part); m != nil {
					names = append(names, named{strings.TrimSpace(m[1]), aliasSeparator.Split(m[2], -1)})
				}
			}
		}
		name := ""
		for _, entry := range names {
			for _, alias := range append([]string{entry.name}, entry.aliases...) {
				tokens := words(alias, 1)
				if containsAll(tokens, query) && len(tokens) <= len(query)+2 {
					name = entry.name
					break
				}
			}
			if name != "" {
				break
			}
		}
		if name == "" {
			continue
		}
		end := index + 1
		for end < len(lines) {
			if anyHeading.MatchString(lines[end]) {
				break
			}
			// Voice credits separate the next named entry from prose that
			// happens to contain parentheses.
			if entryWithCredit.MatchString(lines[end]) && end+1 < len(lines) && voiceCredit.MatchString(lines[end+1]) {
				break
			}
			end++
		}
		extract := strings.TrimSpace(strings.Join(lines[index:end], "\n"))
		if s.UTF16Len(extract) <= s.UTF16Len(line)+20 {
			continue
		}
		section := "Characters"
		if len(headings) > 0 {
			section = headings[len(headings)-1].name
		}
		entry := p
		entry.Extract = extract
		return reference{page: entry, name: name, section: section}, true
	}
	return reference{}, false
}

// pages queries the Wikipedia API.
func (r *Researcher) pages(ctx context.Context, parameters url.Values) ([]page, error) {
	if ctx.Err() != nil {
		return nil, ErrLookupCancelled
	}
	parameters.Set("action", "query")
	parameters.Set("format", "json")
	parameters.Set("formatversion", "2")
	deadline, stop := context.WithTimeout(ctx, 25*time.Second)
	defer stop()
	var payload struct {
		Query *struct {
			Pages []page `json:"pages"`
		} `json:"query"`
	}
	err := r.getJSON(deadline, wikipediaAPI, parameters, 2_000_000, &payload)
	var status httpStatusError
	switch {
	case ctx.Err() != nil:
		return nil, ErrLookupCancelled
	case errors.As(err, &status):
		return nil, errors.New("Character lookup returned HTTP " + itoa(status.status) + ". Try again or supply a source in Inputs and rules.")
	case deadline.Err() != nil:
		return nil, errLookupTimeout
	case err != nil && isTransport(err):
		return nil, errLookupDown
	case err != nil:
		return nil, errLookupUnread
	}
	if payload.Query == nil {
		return nil, nil
	}
	for _, p := range payload.Query.Pages {
		if p.PageID <= 0 || p.Title == "" {
			return nil, errLookupUnread
		}
	}
	return payload.Query.Pages, nil
}

// Character resolves a name into Sources, or into choices when the name is
// ambiguous. A choice selects one of the previous choices by page ID.
func (r *Researcher) Character(ctx context.Context, name string, choice int) (*Sources, []Choice, error) {
	query := strings.TrimSpace(name)
	if query == "" || s.UTF16Len(query) > 120 {
		return nil, nil, errors.New("Enter a character name of at most 120 characters.")
	}
	queryWords := words(query, 1)
	if len(queryWords) == 0 {
		return nil, nil, errors.New("Enter a character name.")
	}
	if choice < 0 {
		return nil, nil, errors.New("A character choice must be a positive page ID.")
	}
	candidates, err := r.pages(ctx, url.Values{
		"generator": {"search"}, "gsrsearch": {query}, "gsrnamespace": {"0"}, "gsrlimit": {"6"},
		"prop": {"extracts|pageprops"}, "exintro": {"1"}, "explaintext": {"1"},
	})
	if err != nil {
		return nil, nil, err
	}
	var matches []page
	for _, p := range candidates {
		_, disambiguation := p.PageProps["disambiguation"]
		if characterKind.MatchString(p.description()) && containsAll(words(p.Title, 1), queryWords) && !disambiguation {
			matches = append(matches, p)
		}
	}
	sort.SliceStable(matches, func(i, j int) bool { return matches[i].order() < matches[j].order() })
	var references []reference
	for _, p := range matches {
		references = append(references, reference{page: p, name: p.Title})
	}
	if len(references) == 0 {
		var collections []page
		for _, p := range candidates {
			if characterList.MatchString(p.Title) || seriesKind.MatchString(p.description()) {
				collections = append(collections, p)
			}
		}
		sort.SliceStable(collections, func(i, j int) bool { return collections[i].order() < collections[j].order() })
		if len(collections) > 3 {
			collections = collections[:3]
		}
		for _, collection := range collections {
			full, err := r.pages(ctx, url.Values{
				"pageids": {itoa(collection.PageID)}, "prop": {"extracts|pageprops"},
				"explaintext": {"1"}, "exsectionformat": {"wiki"},
			})
			if err != nil {
				return nil, nil, err
			}
			if len(full) == 0 || full[0].PageID != collection.PageID {
				continue
			}
			if entry, ok := characterEntry(full[0], queryWords); ok {
				references = append(references, entry)
			}
		}
	}
	if len(references) == 0 {
		return nil, nil, errors.New("No matching character reference was found. Try the full character name or supply source text in Inputs and rules.")
	}
	var selected *reference
	if choice > 0 {
		for i := range references {
			if references[i].page.PageID == choice {
				selected = &references[i]
				break
			}
		}
		if selected == nil {
			return nil, nil, errors.New("That character is no longer in the search results. Search the name again.")
		}
	} else {
		var exact []int
		for i, ref := range references {
			if strings.Join(words(ref.name, 1), " ") == strings.Join(queryWords, " ") {
				exact = append(exact, i)
			}
		}
		switch {
		case len(exact) == 1:
			selected = &references[exact[0]]
		case len(references) == 1:
			selected = &references[0]
		}
	}
	if selected == nil {
		choices := make([]Choice, len(references))
		for i, ref := range references {
			description := ref.page.description()
			if ref.section != "" {
				description = ref.page.Title + ", " + ref.section
			}
			choices[i] = Choice{ID: ref.page.PageID, Name: ref.name, Description: description}
		}
		return nil, choices, nil
	}
	full := selected.page
	if selected.section == "" {
		pages, err := r.pages(ctx, url.Values{"pageids": {itoa(selected.page.PageID)}, "prop": {"extracts|pageprops"}, "explaintext": {"1"}})
		if err != nil {
			return nil, nil, err
		}
		found := false
		for _, p := range pages {
			if p.PageID == selected.page.PageID {
				full, found = p, true
				break
			}
		}
		if !found {
			full = page{}
		}
	}
	if strings.TrimSpace(full.Extract) == "" {
		return nil, nil, errors.New("The selected reference has no usable text. Supply a source in Inputs and rules.")
	}
	if ctx.Err() != nil {
		return nil, nil, ErrLookupCancelled
	}
	sourceURL := "https://en.wikipedia.org/wiki/" + encodeURIComponent(strings.ReplaceAll(full.Title, " ", "_"))
	work := full.work()
	lookup := visualLookup{name: selected.name, articleTitle: full.Title}
	if selected.section != "" {
		sourceURL += "#" + encodeURIComponent(strings.ReplaceAll(selected.section, " ", "_"))
		work = listTitle.ReplaceAllString(full.Title, "$1")
	} else if id, ok := full.PageProps["wikibase_item"].(string); ok {
		lookup.wikidataID = id
	}
	lookup.work = work
	visuals, err := r.gatherVisuals(ctx, lookup)
	if err != nil {
		return nil, nil, err
	}
	retrievedAt := r.now().UTC().Format("2006-01-02T15:04:05.000Z")
	note := "Retrieved through the public MediaWiki API at " + retrievedAt + "."
	if selected.section != "" {
		note += " Selected the named entry in the " + selected.section + " section; a shared entry may also discuss related characters."
	}
	note += " This secondary reference is not exhaustive or independently verified canon."
	references_ := visuals.references
	notes := visuals.notes
	primary := unit.Document{
		ID:               "character-reference",
		Kind:             "source",
		Text:             full.Extract,
		VisualReferences: &references_,
		VisualNotes:      &notes,
		Origin:           unit.Origin{Location: sourceURL, Access: "retrieved", Note: &note},
	}
	return &Sources{
		SchemaVersion: "1",
		Kind:          "sources",
		Query:         query,
		RetrievedAt:   retrievedAt,
		Character: unit.Character{
			Name:  selected.name,
			Work:  work,
			Scope: "Adapt the supplied public character reference. Keep source-period limits and unsupported abilities explicit. Only attribute abilities to the requested character; other characters mentioned in shared entries remain context.",
		},
		Documents: append([]unit.Document{primary}, visuals.documents...),
	}, nil, nil
}
