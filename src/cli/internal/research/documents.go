package research

import (
	"context"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// DocumentSpec is one explicit input of a request file: exactly one of
// text, a local file or a URL. SourceURL attributes supplied content without
// retrieving it.
type DocumentSpec struct {
	ID        string  `json:"id"`
	Kind      string  `json:"kind"`
	Text      *string `json:"text,omitempty"`
	File      *string `json:"file,omitempty"`
	URL       *string `json:"url,omitempty"`
	SourceURL *string `json:"sourceUrl,omitempty"`
}

// DocumentSpecSchema is the contract of a DocumentSpec.
var DocumentSpecSchema = s.StrictObject(
	s.F("id", s.String().Min(1)),
	s.F("kind", s.Enum("source", "rules", "decisions")),
	s.F("text", s.Optional(s.String())),
	s.F("file", s.Optional(s.String().Min(1))),
	s.F("url", s.Optional(s.String().URL())),
	s.F("sourceUrl", s.Optional(s.String().URL())),
)

const (
	documentLimit   = 2_000_000
	documentTimeout = 20 * time.Second
)

var (
	htmlStart      = regexp.MustCompile(`(?i)^\s*(?:<!doctype\s+html\b|<html\b)`)
	htmlFile       = regexp.MustCompile(`(?i)\.x?html?$`)
	challengeTitle = regexp.MustCompile(`(?i)access denied|just a moment|attention required|checking your browser|403 forbidden|security check|verify you are human`)
	blockedText    = regexp.MustCompile(`(?i)^(access denied|403 forbidden|verify you are human|just a moment)[.!\s]*$`)
	spaces         = regexp.MustCompile(`[\t\r ]+`)
	lineSpaces     = regexp.MustCompile(` *\n *`)
	blankLines     = regexp.MustCompile(`\n{3,}`)
)

// httpURL accepts HTTP(S) URLs without credentials.
func httpURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.Host == "" {
		return nil, errors.New("Source URLs must use HTTP or HTTPS without embedded credentials.")
	}
	return parsed, nil
}

// LoadDocument resolves one explicit input. Attribution does not imply
// independent verification; relative files resolve against baseDir.
func (r *Researcher) LoadDocument(ctx context.Context, spec DocumentSpec, baseDir string) (unit.Document, error) {
	if strings.TrimSpace(spec.ID) == "" || !contains([]string{"source", "rules", "decisions"}, spec.Kind) {
		return unit.Document{}, errors.New("Each document needs an id and a source, rules, or decisions kind.")
	}
	var inputs []*string
	for _, input := range []*string{spec.Text, spec.File, spec.URL} {
		if input != nil {
			inputs = append(inputs, input)
		}
	}
	if len(inputs) != 1 || strings.TrimSpace(*inputs[0]) == "" {
		return unit.Document{}, errors.New("Document " + spec.ID + " must specify exactly one nonempty text, file, or url.")
	}
	if ctx.Err() != nil {
		return unit.Document{}, errors.New("Document " + spec.ID + ": source retrieval was cancelled.")
	}
	attribution := ""
	if spec.SourceURL != nil {
		parsed, err := httpURL(*spec.SourceURL)
		if err != nil {
			return unit.Document{}, err
		}
		attribution = parsed.String()
	}
	var content string
	var isHTML bool
	var origin unit.Origin
	switch {
	case spec.Text != nil:
		if int64(len(*spec.Text)) > r.documentLimit {
			return unit.Document{}, errTooLarge
		}
		content = *spec.Text
		origin = unit.Origin{Location: spec.ID, Access: "supplied"}
		if attribution != "" {
			note := "User-supplied text attributed to this URL; the URL was not retrieved or independently verified."
			origin.Location, origin.Note = attribution, &note
		}
	case spec.File != nil:
		path, err := filepath.Abs(filepath.Join(baseDir, *spec.File))
		if filepath.IsAbs(*spec.File) {
			path = filepath.Clean(*spec.File)
		}
		if err == nil {
			content, err = readFileBounded(path, r.documentLimit)
		}
		if err != nil {
			detail := "The referenced file could not be read."
			if errors.Is(err, errTooLarge) || errors.Is(err, errNotRegular) {
				detail = err.Error()
			}
			return unit.Document{}, errors.New("Document " + spec.ID + ": " + detail)
		}
		isHTML = htmlFile.MatchString(path)
		origin = unit.Origin{Location: path, Access: "local-file"}
		if attribution != "" {
			note := "User-supplied local file " + path + ", attributed to this URL; the URL was not retrieved or independently verified."
			origin.Location, origin.Note = attribution, &note
		}
	default:
		retrieved, err := r.remoteDocument(ctx, spec, attribution)
		if err != nil {
			return unit.Document{}, err
		}
		content, isHTML, origin = retrieved.content, retrieved.html, retrieved.origin
	}
	if ctx.Err() != nil {
		return unit.Document{}, errors.New("Document " + spec.ID + ": source retrieval was cancelled.")
	}
	text, err := extractText(content, isHTML || htmlStart.MatchString(content))
	if err != nil {
		return unit.Document{}, err
	}
	if text == "" {
		return unit.Document{}, errors.New("Document " + spec.ID + " contains no usable text.")
	}
	return unit.Document{ID: spec.ID, Kind: spec.Kind, Text: text, Origin: origin}, nil
}

var errNotRegular = errors.New("Source file must be a regular file.")

func readFileBounded(path string, limit int64) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errNotRegular
	}
	content, err := readBounded(file, limit)
	return string(content), err
}

type retrieved struct {
	content string
	html    bool
	origin  unit.Origin
}

// sourceError is a retrieval failure whose message is already actionable.
type sourceError struct{ message string }

func (e sourceError) Error() string { return e.message }

func (r *Researcher) remoteDocument(ctx context.Context, spec DocumentSpec, attribution string) (retrieved, error) {
	target, err := httpURL(*spec.URL)
	if err != nil {
		return retrieved{}, err
	}
	deadline, stop := context.WithTimeout(ctx, r.documentTimeout)
	defer stop()
	result, fallback, err := r.retrieveArticle(deadline, target)
	if err != nil {
		var known sourceError
		switch {
		case ctx.Err() != nil:
			return retrieved{}, errors.New("Document " + spec.ID + ": source retrieval was cancelled.")
		case deadline.Err() != nil:
			return retrieved{}, errors.New("Document " + spec.ID + ": source retrieval timed out.")
		case errors.As(err, &known):
			return retrieved{}, err
		case errors.Is(err, errTooLarge):
			return retrieved{}, errTooLarge
		}
		return retrieved{}, errors.New("Document " + spec.ID + ": source retrieval failed. Supply saved article text with sourceUrl attribution.")
	}
	notes := []string{"Retrieved at " + r.now().UTC().Format("2006-01-02T15:04:05.000Z") + "."}
	if fallback != "" {
		notes = append(notes, fallback)
	}
	if attribution != "" {
		notes = append(notes, "Caller attribution: "+attribution+".")
	}
	note := strings.Join(notes, " ")
	result.origin = unit.Origin{Location: result.origin.Location, Access: "retrieved", Note: &note}
	return result, nil
}

// retrieveArticle fetches exactly the requested article. A Fandom article
// answering 403 is read through its public MediaWiki API instead.
func (r *Researcher) retrieveArticle(ctx context.Context, target *url.URL) (retrieved, string, error) {
	result, err := r.retrieve(ctx, target, false)
	var status httpStatusError
	if err == nil || !errors.As(err, &status) {
		return result, "", err
	}
	if status.status != 403 || !strings.HasSuffix(target.Hostname(), ".fandom.com") || !strings.HasPrefix(target.EscapedPath(), "/wiki/") {
		return retrieved{}, "", sourceError{"Source retrieval returned HTTP " + itoa(status.status) + ". Supply saved article text with sourceUrl attribution if access is blocked."}
	}
	title, err := url.PathUnescape(strings.TrimPrefix(target.EscapedPath(), "/wiki/"))
	if err != nil {
		return retrieved{}, "", err
	}
	api, _ := target.Parse("/api.php")
	api.RawQuery = url.Values{"action": {"parse"}, "page": {title}, "prop": {"text"}, "format": {"json"}}.Encode()
	response, err := r.retrieve(ctx, api, true)
	if errors.As(err, &status) {
		return retrieved{}, "", sourceError{"Source retrieval returned HTTP " + itoa(status.status) + ". Supply saved article text with sourceUrl attribution if access is blocked."}
	}
	if err != nil {
		return retrieved{}, "", err
	}
	var payload struct {
		Parse *struct {
			Text *struct {
				Content *string `json:"*"`
			} `json:"text"`
		} `json:"parse"`
		Error any `json:"error"`
	}
	if json.Unmarshal([]byte(response.content), &payload) != nil {
		return retrieved{}, "", sourceError{"Source public wiki API returned invalid JSON. Supply saved article text with sourceUrl attribution."}
	}
	if payload.Error != nil || payload.Parse == nil || payload.Parse.Text == nil || payload.Parse.Text.Content == nil {
		return retrieved{}, "", sourceError{"Source public wiki API did not return article HTML. Supply saved article text with sourceUrl attribution."}
	}
	return retrieved{content: *payload.Parse.Text.Content, html: true, origin: unit.Origin{Location: target.String()}},
		"The article page returned HTTP 403. Article HTML was retrieved through the public MediaWiki API at " + response.origin.Location + ".", nil
}

func (r *Researcher) retrieve(ctx context.Context, target *url.URL, asJSON bool) (retrieved, error) {
	client := *r.client
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	current := target
	for redirects := 0; redirects <= 5; redirects++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, current.String(), nil)
		if err != nil {
			return retrieved{}, err
		}
		accept := "text/html, text/plain;q=0.9"
		if asJSON {
			accept = "application/json"
		}
		request.Header.Set("Accept", accept)
		response, err := client.Do(request)
		if err != nil {
			return retrieved{}, err
		}
		switch response.StatusCode {
		case 301, 302, 303, 307, 308:
			response.Body.Close()
			location := response.Header.Get("Location")
			if location == "" || redirects == 5 {
				return retrieved{}, sourceError{"Source redirected too many times or omitted its destination."}
			}
			next, err := current.Parse(location)
			if err != nil {
				return retrieved{}, err
			}
			if current, err = httpURL(next.String()); err != nil {
				return retrieved{}, sourceError{err.Error()}
			}
			continue
		}
		if response.StatusCode < 200 || response.StatusCode > 299 {
			response.Body.Close()
			return retrieved{}, httpStatusError{response.StatusCode}
		}
		kind := ""
		if header := response.Header.Get("Content-Type"); header != "" {
			kind, _, _ = mime.ParseMediaType(header)
			kind = strings.ToLower(kind)
		}
		allowed := []string{"text/html", "application/xhtml+xml", "text/plain", "text/markdown"}
		if asJSON {
			allowed = []string{"application/json"}
		}
		if kind != "" && !contains(allowed, kind) {
			response.Body.Close()
			return retrieved{}, sourceError{"Source response must contain text or HTML."}
		}
		content, err := readBounded(response.Body, r.documentLimit)
		response.Body.Close()
		if err != nil {
			return retrieved{}, err
		}
		return retrieved{content: string(content), html: strings.Contains(kind, "html"), origin: unit.Origin{Location: current.String()}}, nil
	}
	return retrieved{}, sourceError{"Source redirect limit reached."}
}

const pageNoise = "script, style, noscript, nav, header, footer, aside:not(.portable-infobox), form, iframe, svg, .toc, .mw-editsection, .reference, .reflist, .navbox, .wikia-ad, .advertisement, [role=\"navigation\"]"

// extractText reads the article text of HTML, or trims plain text. Access
// challenges are refused as evidence.
func extractText(content string, isHTML bool) (string, error) {
	if !isHTML {
		return strings.TrimSpace(content), nil
	}
	document := parseHTML(content)
	title := strings.TrimSpace(document.Find("title").Text())
	if challengeTitle.MatchString(title) || document.Find("#challenge-running, #challenge-form, .cf-challenge, #cf-challenge-running").Length() > 0 {
		return "", errors.New("Source is an access challenge, not evidence. Supply saved article text with sourceUrl attribution.")
	}
	document.Find(pageNoise).Remove()
	body := document.Find(".mw-parser-output").First()
	if body.Length() == 0 {
		body = document.Find("main, article, [role=\"main\"]").First()
	}
	if body.Length() == 0 {
		body = document.Find("body")
	}
	body.Find("br").ReplaceWithHtml("\n")
	body.Find("p, div, section, h1, h2, h3, h4, h5, h6, li, tr, blockquote").Each(func(_ int, element *goquery.Selection) {
		element.AppendHtml("\n")
	})
	text := spaces.ReplaceAllString(body.Text(), " ")
	text = lineSpaces.ReplaceAllString(text, "\n")
	text = strings.TrimSpace(blankLines.ReplaceAllString(text, "\n\n"))
	if blockedText.MatchString(text) {
		return "", errors.New("Source is blocked. Supply saved article text with sourceUrl attribution.")
	}
	return text, nil
}
