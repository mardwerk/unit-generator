package unit

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/clipperhouse/uax29/v2/sentences"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

// EvidenceSpan is a quotable source passage with a stable ID.
type EvidenceSpan struct {
	ID         string `json:"id"`
	DocumentID string `json:"documentId"`
	Text       string `json:"text"`
}

// TechniqueContext is the period context of a retrieved technique article.
type TechniqueContext struct {
	DocumentID string `json:"documentId"`
	Quote      string `json:"quote"`
	Technique  string `json:"technique"`
}

var formerWord = regexp.MustCompile(`(?i)\bformer\b`)

// jsLines splits text at JavaScript line terminators, like a multiline regex.
func jsLines(text string) []string {
	return strings.FieldsFunc(text, func(r rune) bool {
		return r == '\n' || r == '\r' || r == 0x2028 || r == 0x2029
	})
}

// firstLine returns the first line starting with prefix and having content after it.
func firstLine(text, prefix string) (string, bool) {
	for _, line := range jsLines(text) {
		if strings.HasPrefix(line, prefix) && len(line) > len(prefix) {
			return line, true
		}
	}
	return "", false
}

// HistoricalTechniqueContext keeps the explicit period of an observed technique link.
func HistoricalTechniqueContext(request *Request, documentID string) *TechniqueContext {
	var document *Document
	for i := range request.Documents {
		if request.Documents[i].ID == documentID {
			document = &request.Documents[i]
			break
		}
	}
	if document == nil || !strings.HasPrefix(document.ID, "character-technique:") {
		return nil
	}
	section, ok := firstLine(document.Text, "Section: ")
	if !ok || !formerWord.MatchString(section) {
		return nil
	}
	technique := "Selected technique"
	if line, ok := firstLine(document.Text, "Link text: "); ok {
		technique = strings.TrimPrefix(line, "Link text: ")
	}
	return &TechniqueContext{DocumentID: documentID, Quote: section, Technique: technique}
}

// u16 is a JavaScript string: UTF-16 code units.
type u16 []uint16

func toU16(text string) u16  { return utf16.Encode([]rune(text)) }
func (t u16) String() string { return string(utf16.Decode(t)) }
func (t u16) trim() u16      { return toU16(s.Trim(t.String())) }
func (t u16) lastSpace(from int) int {
	if from >= len(t) {
		from = len(t) - 1
	}
	for i := from; i >= 0; i-- {
		if t[i] == ' ' {
			return i
		}
	}
	return -1
}

// EvidenceSpans splits source documents into deterministic, quotable passages.
func EvidenceSpans(request *Request) []EvidenceSpan {
	var spans []EvidenceSpan
	for docIndex, document := range request.Documents {
		if document.Kind != "source" {
			continue
		}
		var passages []string
		segments := sentences.FromString(document.Text)
		for segments.Next() {
			segment := segments.Value()
			if n := len(passages); n > 0 && s.UTF16Len(s.Trim(passages[n-1])) < 15 {
				passages[n-1] += segment
			} else {
				passages = append(passages, segment)
			}
		}
		if n := len(passages); n > 1 && s.UTF16Len(s.Trim(passages[n-1])) < 15 {
			tail := passages[n-1]
			passages = passages[:n-1]
			passages[n-2] += tail
		}
		index := 0
		for _, passage := range passages {
			remaining := toU16(passage).trim()
			for len(remaining) > 0 {
				end := len(remaining)
				if end > 450 {
					boundary := remaining.lastSpace(450)
					if boundary >= 15 {
						end = boundary
					} else {
						end = 450
					}
					if s.UTF16Len(s.Trim(remaining[end:].String())) < 15 {
						end = max(15, end-15)
					}
				}
				text := remaining[:end].trim()
				if len(text) > 0 {
					spans = append(spans, EvidenceSpan{
						ID:         "source" + strconv.Itoa(docIndex+1) + ":" + strconv.Itoa(index),
						DocumentID: document.ID,
						Text:       text.String(),
					})
					index++
				}
				remaining = remaining[end:].trim()
			}
		}
	}
	return spans
}

var (
	combatWords   = regexp.MustCompile(`(?i)\b(?:abilit\w*|power\w*|attack\w*|combat|strength|speed|technique\w*|transform\w*|form\w*|damage|control|weapon\w*|punch\w*|beam\w*|stretc\w*|absor\w*|mimic\w*|summon\w*|limit\w*|weak\w*|cannot|unable|immune|immunity)\b`)
	signatureWord = regexp.MustCompile(`(?i)\b(?:signature|primary|characteristic)\b`)
	actionWords   = regexp.MustCompile(`(?i)\b(?:fires?|firing|shoots?|shooting|launch\w*|emits?|emitting|strikes?|striking|throws?|throwing|projectiles?|slashes?|slashing)\b`)
	limitWords    = regexp.MustCompile(`(?i)\b(?:cannot|unable|requires?|only|former|limitations?|weakness\w*)\b`)
)

// AuthorEvidence is a bounded lexical selection of spans for the model.
func AuthorEvidence(request *Request) []EvidenceSpan {
	all := EvidenceSpans(request)
	const limit, maxSpans = 18000, 96
	total := 0
	for _, span := range all {
		total += s.UTF16Len(span.Text)
	}
	if len(all) <= maxSpans && total <= limit {
		return all
	}
	type ranked struct {
		span  EvidenceSpan
		index int
		score int
	}
	first := map[string]bool{}
	seen := map[string]bool{}
	list := make([]ranked, len(all))
	for i, span := range all {
		identity := !first[span.DocumentID]
		first[span.DocumentID] = true
		key := span.DocumentID + "\x00" + span.Text
		repeated := seen[key]
		seen[key] = true
		combat := len(combatWords.FindAllStringIndex(span.Text, -1))
		relevance := 0
		if signatureWord.MatchString(span.Text) {
			relevance += 3
		}
		relevance += min(len(actionWords.FindAllStringIndex(span.Text, -1)), 3)
		if limitWords.MatchString(span.Text) {
			relevance += 4
		}
		score := -1
		if !repeated {
			score = min(combat, 12) + relevance
			if identity {
				score += 100
			}
		}
		list[i] = ranked{span, i, score}
	}
	sort.SliceStable(list, func(a, b int) bool {
		if list[a].score != list[b].score {
			return list[a].score > list[b].score
		}
		return list[a].index < list[b].index
	})
	used, selected := 0, 0
	reserved := map[string]bool{}
	for _, document := range request.Documents {
		if !strings.HasPrefix(document.ID, "character-technique:") {
			continue
		}
		var packet []EvidenceSpan
		size := 0
		for _, span := range all {
			if span.DocumentID == document.ID {
				packet = append(packet, span)
				size += s.UTF16Len(span.Text)
			}
		}
		if len(packet) > 32 || size > 6000 || selected+len(packet) > maxSpans || used+size > limit {
			continue
		}
		for _, span := range packet {
			reserved[span.ID] = true
		}
		used += size
		selected += len(packet)
	}
	var kept []ranked
	for _, item := range list {
		if reserved[item.span.ID] {
			kept = append(kept, item)
			continue
		}
		length := s.UTF16Len(item.span.Text)
		if selected >= maxSpans || used+length > limit {
			continue
		}
		used += length
		selected++
		kept = append(kept, item)
	}
	sort.SliceStable(kept, func(a, b int) bool { return kept[a].index < kept[b].index })
	out := make([]EvidenceSpan, len(kept))
	for i, item := range kept {
		out[i] = item.span
	}
	return out
}
