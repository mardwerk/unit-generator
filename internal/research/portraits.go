package research

import (
	"net/url"
	"regexp"
	"sort"

	"github.com/mardwerk/unit-generator/internal/unit"
)

var (
	fullBody     = regexp.MustCompile(`(?i)\b(full\s*body|whole\s*body|entire\s*body|turnaround|character sheet)\b`)
	portraitWord = regexp.MustCompile(`(?i)\b(portrait|headshot|close\s*up|bust)\b`)
	profileWord  = regexp.MustCompile(`(?i)\b(infobox|profile)\b`)
	animeWord    = regexp.MustCompile(`(?i)\banime\b`)
	separators   = regexp.MustCompile(`[_-]`)
)

func metadata(reference unit.VisualReference) string {
	text := reference.Caption + " " + reference.ID + " " + reference.URL
	if decoded, err := url.PathUnescape(text); err == nil {
		text = decoded
	}
	return separators.ReplaceAllString(text, " ")
}

// IsFullBody reports whether source labels identify a full-body reference.
// Labels describe coverage; no pixels are analyzed.
func IsFullBody(reference unit.VisualReference) bool {
	return fullBody.MatchString(metadata(reference))
}

// SafeReference reports whether both URLs are HTTP(S) without credentials.
func SafeReference(reference unit.VisualReference) bool {
	for _, value := range []string{reference.URL, reference.SourceURL} {
		parsed, err := url.Parse(value)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.Host == "" {
			return false
		}
	}
	return true
}

// RankedPortraits orders safe references for a portrait: portrait-labelled
// art first, full-body and action references last.
func RankedPortraits(references []unit.VisualReference) []unit.VisualReference {
	score := func(reference unit.VisualReference) int {
		text := metadata(reference)
		total := 0
		if reference.Kind == "appearance" {
			total += 15
		}
		if portraitWord.MatchString(text) {
			total += 80
		}
		if profileWord.MatchString(text) {
			total += 35
		}
		if animeWord.MatchString(text) {
			total += 10
		}
		if reference.Kind == "pose" {
			total -= 25
		}
		if reference.Kind == "form" {
			total -= 15
		}
		if reference.Width != nil && reference.Height != nil && *reference.Height > 0 && float64(*reference.Width)/float64(*reference.Height) < 0.65 {
			total -= 40
		}
		return total
	}
	var ranked []unit.VisualReference
	for _, reference := range references {
		if SafeReference(reference) {
			ranked = append(ranked, reference)
		}
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		a, b := IsFullBody(ranked[i]), IsFullBody(ranked[j])
		if a != b {
			return !a
		}
		return score(ranked[i]) > score(ranked[j])
	})
	return ranked
}
