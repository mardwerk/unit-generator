package research

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

const wikidataAPI = "https://www.wikidata.org/w/api.php"

type visualLookup struct {
	name, articleTitle, work, wikidataID string
}

// visuals are the images, notes and extra source documents gathered for a
// character.
type visuals struct {
	references []unit.VisualReference
	notes      []string
	documents  []unit.Document
}

type gathered struct {
	images     []unit.VisualReference
	documents  []unit.Document
	incomplete bool
	notes      []string
}

var (
	parenthetical  = regexp.MustCompile(`\([^)]*\)`)
	imageExtension = regexp.MustCompile(`(?i)\.[a-z]+$`)
	unwantedImage  = regexp.MustCompile(`(?i)cosplay|voice actor|statue`)
	formCaption    = regexp.MustCompile(`(?i)\b(gear|form|transformation)\b`)
	poseCaption    = regexp.MustCompile(`(?i)\b(using|punch(?:es|ing)?|kick(?:s|ing)?|attack(?:s|ing)?|fighting|pose|stance)\b`)
	lookCaption    = regexp.MustCompile(`(?i)\b(portrait|appearance|infobox|full ?body)\b`)
	wikidataItem   = regexp.MustCompile(`^Q[1-9][0-9]*$`)
	fandomClaim    = regexp.MustCompile(`^([a-z0-9-]+):([^/\s][^?#]*)$`)
	logoImage      = regexp.MustCompile(`(?i)logo|icon|symbol|jolly.roger|flag|cosplay`)
	placeImage     = regexp.MustCompile(`(?i)\b(?:house|residence|building|map)\b`)
	abilityPage    = regexp.MustCompile(`(?i)^Abilities_(?:and_Powers|&_gear)$`)
	galleryPage    = regexp.MustCompile(`(?i)^/Gallery$`)
	fandomSite     = regexp.MustCompile(`^([a-z0-9-]+)\.fandom\.com$`)
	combatHeading  = regexp.MustCompile(`(?i)\b(abilities|powers|skills|techniques|combat)\b`)
)

var imageHosts = []string{"upload.wikimedia.org", "thumb.wikimedia.org", "static.wikia.nocookie.net"}

func namesCharacter(caption, name string) bool {
	tokens := words(caption, 3)
	for _, token := range words(parenthetical.ReplaceAllString(name, ""), 3) {
		if contains(tokens, token) {
			return true
		}
	}
	return false
}

func sameName(value, name string) bool {
	normalized := func(text string) string {
		tokens := words(parenthetical.ReplaceAllString(text, ""), 1)
		sort.Strings(tokens)
		return strings.Join(tokens, " ")
	}
	expected := normalized(name)
	return expected != "" && normalized(value) == expected
}

func imageKind(caption string) string {
	switch {
	case formCaption.MatchString(caption):
		return "form"
	case poseCaption.MatchString(caption):
		return "pose"
	case lookCaption.MatchString(caption):
		return "appearance"
	}
	return "reference"
}

// dimensions keeps a width and height only as a valid pair.
func dimensions(reference *unit.VisualReference, width, height float64) {
	valid := func(v float64) bool { return v == float64(int(v)) && v > 0 && v <= 100_000 }
	if valid(width) && valid(height) {
		w, h := int(width), int(height)
		reference.Width, reference.Height = &w, &h
	}
}

// gatherVisuals is optional, bounded research: missing pictures never
// invalidate a usable text source, but cancellation always ends the lookup.
func (r *Researcher) gatherVisuals(ctx context.Context, lookup visualLookup) (visuals, error) {
	if ctx.Err() != nil {
		return visuals{}, ErrLookupCancelled
	}
	deadline, stop := context.WithTimeout(ctx, 15*time.Second)
	defer stop()
	results := make([]gathered, 2)
	failures := make([]error, 2)
	var wait sync.WaitGroup
	wait.Add(2)
	go func() {
		defer wait.Done()
		images, err := r.wikipediaImages(deadline, lookup)
		notes := []string{}
		if len(images) == 0 {
			notes = append(notes, "The Wikipedia reference contains no usable images named for this character.")
		}
		results[0], failures[0] = gathered{images: images, notes: notes}, err
	}()
	go func() {
		defer wait.Done()
		results[1], failures[1] = r.fandomImages(deadline, lookup)
	}()
	wait.Wait()
	if ctx.Err() != nil {
		return visuals{}, ErrLookupCancelled
	}
	var out visuals
	seen := map[string]bool{}
	var images []unit.VisualReference
	for i, result := range results {
		if failures[i] != nil {
			continue
		}
		out.documents = append(out.documents, result.documents...)
		for _, image := range result.images {
			if !seen[image.ID] {
				seen[image.ID] = true
				images = append(images, image)
			}
		}
	}
	kinds := []string{"appearance", "form", "pose", "reference"}
	groups := make([][]unit.VisualReference, len(kinds))
	var full *unit.VisualReference
	for i := range images {
		if IsFullBody(images[i]) {
			full = &images[i]
			break
		}
	}
	out.references = []unit.VisualReference{}
	if full != nil {
		out.references = append(out.references, *full)
	}
	for k, kind := range kinds {
		for _, image := range images {
			if image.Kind == kind && (full == nil || image.ID != full.ID) {
				groups[k] = append(groups[k], image)
			}
		}
	}
	// Reserve room for every available kind before adding more of one kind.
	for len(out.references) < 9 {
		added := false
		for k := range groups {
			if len(groups[k]) > 0 && len(out.references) < 9 {
				out.references = append(out.references, groups[k][0])
				groups[k] = groups[k][1:]
				added = true
			}
		}
		if !added {
			break
		}
	}
	out.notes = []string{"Source images for visual reference. Pose and form labels come from captions and filenames, not image analysis."}
	if full == nil {
		out.notes = append(out.notes, "No full-body reference identified by source captions or filenames was retrieved. Add a full-body source image if needed.")
	}
	hasPose := false
	for _, image := range out.references {
		hasPose = hasPose || image.Kind == "pose"
	}
	switch {
	case len(out.references) == 0:
		out.notes = append(out.notes, "No usable character images were retrieved from the available sources.")
	case !hasPose:
		out.notes = append(out.notes, "No labeled action-pose reference was retrieved.")
	}
	for i, result := range results {
		if failures[i] == nil {
			out.notes = append(out.notes, result.notes...)
		}
		if failures[i] != nil || result.incomplete {
			label := "Wikipedia image"
			if i == 1 {
				label = "Character-wiki image"
			}
			out.notes = append(out.notes, label+" sources were unavailable. Retry character lookup or add a source in Inputs and rules.")
		}
	}
	if deadline.Err() != nil {
		out.notes = append(out.notes, "Visual reference lookup reached its time limit. Retry character lookup.")
	}
	return out, nil
}

type imageInfo struct {
	URL            *string `json:"url"`
	ThumbURL       *string `json:"thumburl"`
	DescriptionURL *string `json:"descriptionurl"`
	Width          any     `json:"width"`
	Height         any     `json:"height"`
	ExtMetadata    *struct {
		Artist           *struct{ Value *string } `json:"Artist"`
		LicenseShortName *struct{ Value *string } `json:"LicenseShortName"`
	} `json:"extmetadata"`
}

func (r *Researcher) wikipediaImages(ctx context.Context, lookup visualLookup) ([]unit.VisualReference, error) {
	var payload struct {
		Query *struct {
			Pages []struct {
				Title     *string     `json:"title"`
				ImageInfo []imageInfo `json:"imageinfo"`
			} `json:"pages"`
		} `json:"query"`
	}
	if err := r.getJSON(ctx, wikipediaAPI, url.Values{
		"format": {"json"}, "action": {"query"}, "formatversion": {"2"}, "titles": {lookup.articleTitle},
		"generator": {"images"}, "gimlimit": {"50"}, "prop": {"imageinfo"},
		"iiprop": {"url|extmetadata|size"}, "iiurlwidth": {"480"},
	}, 3_000_000, &payload); err != nil {
		return nil, err
	}
	var images []unit.VisualReference
	if payload.Query == nil {
		return images, nil
	}
	for _, page := range payload.Query.Pages {
		if page.Title == nil {
			return nil, errors.New("unreadable image list")
		}
		for _, info := range page.ImageInfo {
			if info.URL == nil || info.DescriptionURL == nil {
				return nil, errors.New("unreadable image list")
			}
		}
	}
	for _, page := range payload.Query.Pages {
		if len(page.ImageInfo) == 0 {
			continue
		}
		info := page.ImageInfo[0]
		caption := strings.ReplaceAll(imageExtension.ReplaceAllString(strings.TrimPrefix(*page.Title, "File:"), ""), "_", " ")
		if !namesCharacter(caption, lookup.name) || unwantedImage.MatchString(caption) {
			continue
		}
		address := *info.URL
		if info.ThumbURL != nil {
			address = *info.ThumbURL
		}
		image, ok := httpsURL(address, imageHosts...)
		source, sourceOK := httpsURL(*info.DescriptionURL, "en.wikipedia.org", "commons.wikimedia.org")
		if !ok || !sourceOK {
			continue
		}
		var credits []string
		if metadata := info.ExtMetadata; metadata != nil {
			for _, field := range []*struct{ Value *string }{metadata.Artist, metadata.LicenseShortName} {
				if field != nil && field.Value != nil && *field.Value != "" {
					credits = append(credits, plain(*field.Value))
				}
			}
		}
		var attribution *string
		if joined := strings.Join(credits, ". "); joined != "" {
			attribution = &joined
		}
		reference := unit.VisualReference{
			ID: "wikipedia:" + *page.Title, URL: image.String(), SourceURL: source.String(),
			Caption: caption, Kind: imageKind(caption), Attribution: attribution,
		}
		width, _ := info.Width.(float64)
		height, _ := info.Height.(float64)
		dimensions(&reference, width, height)
		images = append(images, reference)
	}
	return images, nil
}

// characterIdentity finds a unique Wikidata item for the character. A shared
// article identifies the cast, so a list entry searches separately.
func (r *Researcher) characterIdentity(ctx context.Context, lookup visualLookup) (string, error) {
	if lookup.wikidataID != "" {
		if wikidataItem.MatchString(lookup.wikidataID) {
			return lookup.wikidataID, nil
		}
		return "", nil
	}
	if lookup.work == "" || lookup.work == "Source series unspecified" {
		return "", nil
	}
	var data struct {
		Search *[]struct {
			ID          *string  `json:"id"`
			Label       string   `json:"label"`
			Description string   `json:"description"`
			Aliases     []string `json:"aliases"`
		} `json:"search"`
	}
	if err := r.getJSON(ctx, wikidataAPI, url.Values{
		"format": {"json"}, "action": {"wbsearchentities"}, "search": {lookup.name}, "language": {"en"},
		"uselang": {"en"}, "type": {"item"}, "limit": {"6"},
	}, 3_000_000, &data); err != nil {
		return "", err
	}
	if data.Search == nil {
		return "", errors.New("unreadable identity search")
	}
	work := words(lookup.work, 3)
	var matches []string
	for _, entry := range *data.Search {
		if entry.ID == nil {
			return "", errors.New("unreadable identity search")
		}
		named := false
		for _, name := range append([]string{entry.Label}, entry.Aliases...) {
			named = named || sameName(name, lookup.name)
		}
		if wikidataItem.MatchString(*entry.ID) && named && characterKind.MatchString(entry.Description) && len(work) > 0 && containsAll(words(entry.Description, 3), work) {
			matches = append(matches, *entry.ID)
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	return "", nil
}

// fandomPage follows the item's Fandom article ID (P6262) to a character
// page with the same name, never to general wikis.
func (r *Researcher) fandomPage(ctx context.Context, id, name string) (*url.URL, error) {
	if !wikidataItem.MatchString(id) {
		return nil, nil
	}
	var data struct {
		Entities map[string]struct {
			Claims *struct {
				P6262 []struct {
					Mainsnak struct {
						Datavalue *struct {
							Value string `json:"value"`
						} `json:"datavalue"`
					} `json:"mainsnak"`
				} `json:"P6262"`
			} `json:"claims"`
		} `json:"entities"`
	}
	if err := r.getJSON(ctx, wikidataAPI, url.Values{"format": {"json"}, "action": {"wbgetentities"}, "ids": {id}, "props": {"claims"}}, 3_000_000, &data); err != nil {
		return nil, err
	}
	if data.Entities == nil {
		return nil, errors.New("unreadable identity")
	}
	entity := data.Entities[id]
	if entity.Claims == nil {
		return nil, nil
	}
	for _, claim := range entity.Claims.P6262 {
		if claim.Mainsnak.Datavalue == nil {
			continue
		}
		match := fandomClaim.FindStringSubmatch(claim.Mainsnak.Datavalue.Value)
		if match == nil || !sameName(match[2], name) || contains([]string{"hero", "villains", "cosplay", "vsbattles", "powerlisting"}, match[1]) {
			continue
		}
		return url.Parse("https://" + match[1] + ".fandom.com/wiki/" + encodeURIComponent(strings.ReplaceAll(match[2], " ", "_")))
	}
	return nil, nil
}

// fandomTitle is the decoded article title of a Fandom page URL.
func fandomTitle(page *url.URL) (string, bool) {
	title, err := url.PathUnescape(strings.TrimPrefix(page.EscapedPath(), "/wiki/"))
	return title, err == nil && strings.HasPrefix(page.EscapedPath(), "/wiki/")
}

func (r *Researcher) fandomHTML(ctx context.Context, page *url.URL) (string, error) {
	title, ok := fandomTitle(page)
	if !ok {
		return "", errors.New("not an article")
	}
	var payload struct {
		Parse *struct {
			Text *struct {
				Content *string `json:"*"`
			} `json:"text"`
		} `json:"parse"`
	}
	endpoint := page.Scheme + "://" + page.Host + "/api.php"
	if err := r.getJSON(ctx, endpoint, url.Values{"format": {"json"}, "action": {"parse"}, "page": {title}, "prop": {"text"}}, 3_000_000, &payload); err != nil {
		return "", err
	}
	if payload.Parse == nil || payload.Parse.Text == nil || payload.Parse.Text.Content == nil {
		return "", errors.New("unreadable article")
	}
	return *payload.Parse.Text.Content, nil
}

func verifiedFandom(page *url.URL) bool {
	_, ok := httpsURL(page.String(), page.Hostname())
	return fandomSite.MatchString(page.Hostname()) && ok
}

// fandomVisuals reads captions and image links. No pixel analysis or
// generated art is implied.
func fandomVisuals(content string, page *url.URL, name string) []unit.VisualReference {
	if !verifiedFandom(page) {
		return nil
	}
	document := parseHTML(content)
	var images []unit.VisualReference
	seen := map[string]bool{}
	document.Find("img").Each(func(_ int, node *goquery.Selection) {
		if node.Closest(".navbox, .navibox, .navigation, nav, .wds-global-navigation, .portable-infobox .pi-data").Length() > 0 {
			return
		}
		source, ok := node.Attr("data-src")
		if !ok {
			source, _ = node.Attr("src")
		}
		image, ok := httpsURL(source, imageHosts...)
		if !ok {
			return
		}
		path, _, _ := strings.Cut(image.EscapedPath(), "/revision/")
		parts := strings.Split(path, "/")
		file, err := url.PathUnescape(parts[len(parts)-1])
		if err != nil {
			return
		}
		caption := plain(node.Closest("figure, .thumb, .gallerybox").Find("figcaption, .thumbcaption, .gallerytext").First().Text())
		if caption == "" {
			alt, ok := node.Attr("alt")
			if !ok {
				alt = file
			}
			caption = strings.ReplaceAll(imageExtension.ReplaceAllString(alt, ""), "_", " ")
		}
		labels := file + " " + caption
		if !namesCharacter(labels, name) || logoImage.MatchString(labels) || placeImage.MatchString(strings.ReplaceAll(file, "_", " ")+" "+caption) {
			return
		}
		width := attrNumber(node, "width")
		if width > 0 && width < 100 {
			return
		}
		if seen[file] {
			return
		}
		seen[file] = true
		sourceURL := page.String()
		if href, ok := node.Closest("a").Attr("href"); ok {
			if linked, err := page.Parse(href); err == nil {
				if verified, ok := httpsURL(linked.String(), page.Hostname()); ok {
					sourceURL = verified.String()
				}
			}
		} else if verified, ok := httpsURL(page.String(), page.Hostname()); ok {
			sourceURL = verified.String()
		}
		if caption == "" {
			caption = file
		}
		attribution := "Source: " + page.Hostname() + ". Credits and reuse terms are on the linked source page."
		reference := unit.VisualReference{
			ID: "fandom:" + page.Hostname() + ":" + file, URL: image.String(), SourceURL: sourceURL,
			Caption: caption, Kind: imageKind(strings.ReplaceAll(file, "_", " ") + " " + caption), Attribution: &attribution,
		}
		dimensions(&reference, width, attrNumber(node, "height"))
		images = append(images, reference)
	})
	return images
}

// attrNumber is Number(attribute): NaN when missing or not numeric.
func attrNumber(node *goquery.Selection, name string) float64 {
	value, ok := node.Attr(name)
	if !ok {
		return -1
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	n, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return -1
	}
	return n
}

const sourceNoise = "script, style, iframe, noscript, nav, aside, table, figure, .thumb, .gallery, .gallerybox, .portable-infobox, .navbox, .navibox, .navigation, .wds-global-navigation, .toc, #toc, .mw-editsection, .mw-references-wrap, .references, sup.reference, .reference, .printfooter, .catlinks"

// fandomSource reuses identity-bound article HTML already fetched for
// visuals: the introduction and ability sections, capped.
func fandomSource(content string, page *url.URL, name string, now time.Time) *unit.Document {
	if !verifiedFandom(page) {
		return nil
	}
	title, ok := fandomTitle(page)
	if !ok {
		return nil
	}
	parts := strings.Split(title, "/")
	character := parts[0]
	suffix, hasSuffix := "", len(parts) > 1
	if hasSuffix {
		suffix = parts[1]
	}
	if character == "" || !sameName(character, name) || len(parts) > 2 || (hasSuffix && !abilityPage.MatchString(suffix)) {
		return nil
	}
	document := parseHTML(content)
	document.Find(sourceNoise).Remove()
	root := articleRoot(document)
	type passage struct {
		text     string
		priority int
		headings []string
	}
	var headings []section
	var passages []passage
	root.Find("h2,h3,h4,h5,h6,p,li").Each(func(_ int, node *goquery.Selection) {
		text := clean(node.Text())
		if text == "" {
			return
		}
		if level := headingLevel(node); level > 0 {
			headings = pushHeading(headings, level, text)
			return
		}
		if goquery.NodeName(node) == "li" && node.Find("p,li").Length() > 0 {
			return
		}
		if s.UTF16Len(text) < 15 {
			return
		}
		combat := (hasSuffix && abilityPage.MatchString(suffix)) || anyHeadingMatches(headings, combatHeading)
		// Profile pages keep the introduction and combat sections, not long
		// plot biographies.
		if !combat && len(headings) > 0 {
			return
		}
		priority := 1
		if combat {
			priority = 0
		}
		passages = append(passages, passage{text, priority, headingTexts(headings)})
	})
	sort.SliceStable(passages, func(i, j int) bool { return passages[i].priority < passages[j].priority })
	var selected []string
	seen := map[string]bool{}
	length, truncated := 0, false
	for _, p := range passages {
		if seen[p.text] {
			continue
		}
		seen[p.text] = true
		text := strings.Join(append(append([]string{}, p.headings...), p.text), "\n")
		if length+s.UTF16Len(text)+2 > 12_000 {
			truncated = true
			continue
		}
		selected = append(selected, text)
		length += s.UTF16Len(text) + 2
	}
	if len(selected) == 0 {
		return nil
	}
	note := "Retrieved through the public MediaWiki parse API while gathering character references at " + now.UTC().Format("2006-01-02T15:04:05.000Z") + ". Identity matched through Wikidata and the character page name. Extracted article introduction and available ability sections; navigation, images and reference lists omitted."
	if truncated {
		note += " Text was capped at 12000 characters; this is not exhaustive."
	}
	note += " This fan-maintained secondary source may combine story periods and adaptations; it is not independently verified canon."
	return &unit.Document{
		ID: "character-wiki:" + page.Hostname() + ":" + title, Kind: "source", Text: strings.Join(selected, "\n\n"),
		Origin: unit.Origin{Location: page.String(), Access: "retrieved", Note: &note},
	}
}

func (r *Researcher) fandomImages(ctx context.Context, lookup visualLookup) (gathered, error) {
	id, err := r.characterIdentity(ctx, lookup)
	if err != nil {
		return gathered{}, err
	}
	if id == "" {
		return gathered{notes: []string{"No unique character identity matching the name and source work was found for character-wiki image lookup. Add a character source in Inputs and rules."}}, nil
	}
	page, err := r.fandomPage(ctx, id, lookup.name)
	if err != nil {
		return gathered{}, err
	}
	if page == nil {
		return gathered{notes: []string{"The character identity has no supported character-specific wiki link. Add a character source in Inputs and rules."}}, nil
	}
	content, err := r.fandomHTML(ctx, page)
	if err != nil {
		return gathered{}, err
	}
	images := fandomVisuals(content, page, lookup.name)
	source := fandomSource(content, page, lookup.name, r.now())
	// Follow only links present on this character page: its gallery and
	// ability subpages. Other characters and guessed paths are not targets.
	var related []*url.URL
	seen := map[string]bool{}
	parseHTML(content).Find("a[href]").Each(func(_ int, node *goquery.Selection) {
		href, _ := node.Attr("href")
		target, err := page.Parse(href)
		if err != nil || target.RawQuery != "" {
			return
		}
		if _, ok := httpsURL(target.String(), page.Hostname()); !ok {
			return
		}
		base := page.EscapedPath()
		if !strings.HasPrefix(target.EscapedPath(), base+"/") {
			return
		}
		suffix := strings.TrimPrefix(target.EscapedPath(), base)
		decoded, err := url.PathUnescape(strings.TrimPrefix(suffix, "/"))
		if err != nil || !(galleryPage.MatchString(suffix) || abilityPage.MatchString(decoded)) {
			return
		}
		target.Fragment, target.RawFragment = "", ""
		if !seen[target.String()] {
			seen[target.String()] = true
			related = append(related, target)
		}
	})
	isAbility := func(target *url.URL) bool {
		decoded, _ := url.PathUnescape(strings.TrimPrefix(target.EscapedPath(), page.EscapedPath()+"/"))
		return abilityPage.MatchString(decoded)
	}
	sort.SliceStable(related, func(i, j int) bool { return isAbility(related[i]) && !isAbility(related[j]) })
	if len(related) > 2 {
		related = related[:2]
	}
	type subpage struct {
		images     []unit.VisualReference
		documents  []unit.Document
		techniques []techniqueLink
		err        error
	}
	subpages := make([]subpage, len(related))
	var wait sync.WaitGroup
	for i, target := range related {
		wait.Add(1)
		go func() {
			defer wait.Done()
			html, err := r.fandomHTML(ctx, target)
			if err != nil {
				subpages[i].err = err
				return
			}
			subpages[i].images = fandomVisuals(html, target, lookup.name)
			if document := fandomSource(html, target, lookup.name, r.now()); document != nil {
				subpages[i].documents = []unit.Document{*document}
				subpages[i].techniques = linkedTechniques(html, target, lookup.name)
			}
		}()
	}
	wait.Wait()
	var candidates []techniqueLink
	for _, sub := range subpages {
		candidates = append(candidates, sub.techniques...)
	}
	if source != nil {
		candidates = append(candidates, linkedTechniques(content, page, lookup.name)...)
	}
	links := selectTechniques(candidates)
	techniques := make([]*unit.Document, len(links))
	missing := make([]bool, len(links))
	for i, link := range links {
		wait.Add(1)
		go func() {
			defer wait.Done()
			html, err := r.fandomHTML(ctx, link.url)
			if err == nil {
				techniques[i] = techniqueSource(html, link)
			}
			missing[i] = techniques[i] == nil
		}()
	}
	wait.Wait()
	out := gathered{images: images}
	for _, document := range techniques {
		if document != nil {
			out.documents = append(out.documents, *document)
		}
	}
	if source != nil {
		out.documents = append(out.documents, *source)
	}
	for _, sub := range subpages {
		out.images = append(out.images, sub.images...)
		out.documents = append(out.documents, sub.documents...)
		out.incomplete = out.incomplete || sub.err != nil
	}
	for _, gap := range missing {
		if gap {
			out.notes = []string{"Some linked technique descriptions were unavailable. Existing character sources and references were retained."}
		}
	}
	return out, nil
}
