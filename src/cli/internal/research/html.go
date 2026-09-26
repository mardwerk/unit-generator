package research

import (
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

var whitespace = regexp.MustCompile(`\s+`)

// clean collapses whitespace like the TypeScript text helpers.
func clean(text string) string { return strings.TrimSpace(whitespace.ReplaceAllString(text, " ")) }

// parseHTML parses a page or fragment. Invalid markup still parses.
func parseHTML(content string) *goquery.Document {
	document, err := goquery.NewDocumentFromReader(strings.NewReader(content))
	if err != nil {
		document, _ = goquery.NewDocumentFromReader(strings.NewReader(""))
	}
	return document
}

// plain is the collapsed text of an HTML fragment.
func plain(value string) string { return clean(parseHTML(value).Text()) }

// articleRoot is the MediaWiki article body, or the whole body.
func articleRoot(document *goquery.Document) *goquery.Selection {
	if article := document.Find(".mw-parser-output").First(); article.Length() > 0 {
		return article
	}
	return document.Find("body")
}

// headingLevel returns 2–6 for h2–h6 elements, else 0.
func headingLevel(node *goquery.Selection) int {
	name := goquery.NodeName(node)
	if len(name) == 2 && name[0] == 'h' && name[1] >= '2' && name[1] <= '6' {
		return int(name[1] - '0')
	}
	return 0
}

type section struct {
	level int
	text  string
}

// pushHeading keeps the heading path of the current position.
func pushHeading(headings []section, level int, text string) []section {
	for len(headings) > 0 && headings[len(headings)-1].level >= level {
		headings = headings[:len(headings)-1]
	}
	return append(headings, section{level, text})
}

func headingTexts(headings []section) []string {
	out := make([]string, len(headings))
	for i, h := range headings {
		out[i] = h.text
	}
	return out
}

func anyHeadingMatches(headings []section, pattern *regexp.Regexp) bool {
	for _, h := range headings {
		if pattern.MatchString(h.text) {
			return true
		}
	}
	return false
}
