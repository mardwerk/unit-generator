package research

import (
	"net/url"
	"regexp"
	"sort"
	"strings"

	"github.com/PuerkitoBio/goquery"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// techniqueLink is a combat technique linked from a character's own page.
type techniqueLink struct {
	url       *url.URL
	parent    string
	character string
	title     string
	linkText  string
	context   string
	headings  []string
	family    string
}

const techniqueNoise = "script,style,iframe,noscript,nav,aside,table,figure,.thumb,.gallery,.portable-infobox,.navbox,.navibox,.navigation,.toc,#toc,.mw-editsection,.mw-references-wrap,.references,.reference,.printfooter,.catlinks"

var (
	attackFamilies = []struct {
		name    string
		pattern *regexp.Regexp
	}{
		{"cutting", regexp.MustCompile(`(?i)\b(blade|slash|sword|kunai|shuriken|arrow)\b`)},
		{"fire", regexp.MustCompile(`(?i)\b(fire|flame|fireball|burning)\b`)},
		{"impact", regexp.MustCompile(`(?i)\b(punch|kick|strike|fist)\b`)},
		{"energy", regexp.MustCompile(`(?i)\b(beam|lightning|thunder|bolt)\b`)},
		{"freezing", regexp.MustCompile(`(?i)\b(ice|frost|freezing)\b`)},
	}
	combatSection    = regexp.MustCompile(`(?i)\b(abilities|powers|skills|techniques|combat|arts|magic)\b`)
	excludedSection  = regexp.MustCompile(`(?i)\b(subordinates?|analy[sz]ed|equipment|references|navigation|trivia|gallery)\b`)
	fandomHost       = regexp.MustCompile(`^[a-z0-9-]+\.fandom\.com$`)
	descriptionPart  = regexp.MustCompile(`(?i)\b(abilities|powers|usage|effects|description)\b`)
	unrelatedSection = regexp.MustCompile(`(?i)\b(users|trivia|references|navigation|related|gallery)\b`)
)

func family(title string) string {
	for _, f := range attackFamilies {
		if f.pattern.MatchString(title) {
			return f.name
		}
	}
	return ""
}

// linkedTechniques lists technique links observed in the combat sections of
// an identity-checked character page.
func linkedTechniques(content string, page *url.URL, character string) []techniqueLink {
	document := parseHTML(content)
	document.Find(techniqueNoise).Remove()
	root := articleRoot(document)
	var headings []section
	var links []techniqueLink
	root.Find("h2,h3,h4,h5,h6,a[href]").Each(func(_ int, node *goquery.Selection) {
		if level := headingLevel(node); level > 0 {
			headings = pushHeading(headings, level, clean(node.Text()))
			return
		}
		if !anyHeadingMatches(headings, combatSection) || anyHeadingMatches(headings, excludedSection) {
			return
		}
		context := clean(node.Closest("li,p").Text())
		linkText := clean(node.Text())
		if context == "" || s.UTF16Len(context) > 800 || linkText == "" || s.UTF16Len(linkText) > 80 {
			return
		}
		href, _ := node.Attr("href")
		target, err := page.Parse(href)
		if err != nil || target.Scheme != "https" || target.Hostname() != page.Hostname() || !fandomHost.MatchString(target.Hostname()) ||
			target.User != nil || target.Port() != "" || target.RawQuery != "" || !strings.HasPrefix(target.EscapedPath(), "/wiki/") {
			return
		}
		title, err := url.PathUnescape(strings.TrimPrefix(target.EscapedPath(), "/wiki/"))
		if err != nil {
			return
		}
		title = strings.ReplaceAll(title, "_", " ")
		if title == "" || strings.ContainsAny(title, ":/") || strings.EqualFold(title, character) {
			return
		}
		behavior := family(title)
		if behavior == "" {
			return
		}
		target.Fragment, target.RawFragment = "", ""
		for _, existing := range links {
			if existing.url.String() == target.String() {
				return
			}
		}
		links = append(links, techniqueLink{target, page.String(), character, title, linkText, context, headingTexts(headings), behavior})
	})
	return links
}

// selectTechniques prefers two distinct attack families without following
// further links.
func selectTechniques(links []techniqueLink) []techniqueLink {
	priority := map[string]int{"cutting": 0, "fire": 1, "impact": 2, "energy": 3, "freezing": 4}
	complexity := func(title string) int {
		n := 0
		for _, f := range attackFamilies {
			if f.pattern.MatchString(title) {
				n++
			}
		}
		return n
	}
	sorted := append([]techniqueLink{}, links...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if priority[sorted[i].family] != priority[sorted[j].family] {
			return priority[sorted[i].family] < priority[sorted[j].family]
		}
		return complexity(sorted[i].title) < complexity(sorted[j].title)
	})
	var selected []techniqueLink
	for _, link := range sorted {
		duplicate := false
		for _, entry := range selected {
			if entry.url.String() == link.url.String() || entry.family == link.family {
				duplicate = true
			}
		}
		if duplicate {
			continue
		}
		selected = append(selected, link)
		if len(selected) == 2 {
			break
		}
	}
	return selected
}

// techniqueSource extracts a technique page's introduction and description
// prose, keeping the parent page's ownership and period context.
func techniqueSource(content string, link techniqueLink) *unit.Document {
	document := parseHTML(content)
	document.Find(techniqueNoise).Remove()
	root := articleRoot(document)
	var headings []section
	var passages []string
	length := 0
	root.Find("h2,h3,h4,h5,h6,p").Each(func(_ int, node *goquery.Selection) {
		text := clean(node.Text())
		if level := headingLevel(node); level > 0 {
			headings = pushHeading(headings, level, text)
			return
		}
		if len(headings) > 0 && (!anyHeadingMatches(headings, descriptionPart) || anyHeadingMatches(headings, unrelatedSection)) {
			return
		}
		size := s.UTF16Len(text)
		if size < 30 || contains(passages, text) || length+size > 4000 {
			return
		}
		passages = append(passages, text)
		length += size
	})
	if len(passages) == 0 {
		return nil
	}
	section := strings.Join(link.headings, " > ")
	quoted := make([]string, len(passages))
	for i, text := range passages {
		quoted[i] = link.title + ": " + text
	}
	note := "Retrieved through the public MediaWiki parse API from an observed combat-section link on " + link.parent + ". Parent section: " + section + ". Introduction and ability-description prose only, capped at 4000 characters; navigation and user lists omitted. Fan-maintained secondary source, not independently verified canon. Ownership and story-period limits remain those of the parent article."
	return &unit.Document{
		ID:   "character-technique:" + link.url.Hostname() + ":" + encodeURIComponent(link.title),
		Kind: "source",
		Text: "Observed link on " + link.character + "'s article: " + link.parent + "\nSection: " + section + "\nLink text: " + link.linkText + "\nParent passage: " + link.context +
			"\n\nOwnership and period limit: the parent lists this technique in the section above. Former, evolved or absorbed entries do not establish current availability. The shared technique description below does not transfer other users' powers to this character.\n\n" +
			strings.Join(quoted, "\n\n"),
		Origin: unit.Origin{Location: link.url.String(), Access: "retrieved", Note: &note},
	}
}
