package research

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

const userAgent = "mardwerk-unit/0.1 (https://github.com/mardwerk/unit-generator)"

// Researcher performs lookups over one HTTP client.
type Researcher struct {
	client *http.Client
	now    func() time.Time
	// Bounds for explicit document inputs.
	documentLimit   int64
	documentTimeout time.Duration
}

// New returns a Researcher. A nil client uses a default one; tests supply a
// client whose transport answers from fixtures.
func New(client *http.Client) *Researcher {
	if client == nil {
		client = &http.Client{}
	}
	return &Researcher{client: client, now: time.Now, documentLimit: documentLimit, documentTimeout: documentTimeout}
}

var errRedirect = errors.New("redirect")

// noRedirects copies the client so that a redirect is an error.
func (r *Researcher) noRedirects() *http.Client {
	client := *r.client
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return errRedirect }
	return &client
}

var errTooLarge = errors.New("Source exceeds the configured byte limit.")

// readBounded reads at most limit bytes.
func readBounded(body io.Reader, limit int64) ([]byte, error) {
	content, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > limit {
		return nil, errTooLarge
	}
	return content, nil
}

// httpStatusError is a non-success status.
type httpStatusError struct{ status int }

func (e httpStatusError) Error() string { return "HTTP " + itoa(e.status) }

// transportError means no response arrived.
type transportError struct{ error }

func isTransport(err error) bool {
	var t transportError
	return errors.As(err, &t)
}

// getJSON fetches a JSON API without following redirects.
func (r *Researcher) getJSON(ctx context.Context, endpoint string, parameters url.Values, limit int64, target any) error {
	address := endpoint + "?" + parameters.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", userAgent)
	response, err := r.noRedirects().Do(request)
	if err != nil {
		return transportError{err}
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return httpStatusError{response.StatusCode}
	}
	content, err := readBounded(response.Body, limit)
	if err != nil {
		return err
	}
	return json.Unmarshal(content, target)
}

// words lowercases, strips diacritics and splits into letter/digit runs of
// at least min characters.
func words(value string, min int) []string {
	var out []string
	var current []rune
	flush := func() {
		if len(current) >= min {
			out = append(out, string(current))
		}
		current = current[:0]
	}
	for _, r := range norm.NFKD.String(strings.ToLower(value)) {
		switch {
		case unicode.Is(unicode.M, r):
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			current = append(current, r)
		default:
			flush()
		}
	}
	flush()
	return out
}

func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

func containsAll(values, required []string) bool {
	for _, r := range required {
		if !contains(values, r) {
			return false
		}
	}
	return true
}

// encodeURIComponent escapes like JavaScript's function of that name.
func encodeURIComponent(value string) string {
	var b strings.Builder
	for _, c := range []byte(value) {
		if 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9' || strings.IndexByte("-_.!~*'()", c) >= 0 {
			b.WriteByte(c)
		} else {
			b.WriteString("%" + strings.ToUpper(hex(c)))
		}
	}
	return b.String()
}

func hex(c byte) string {
	const digits = "0123456789abcdef"
	return string([]byte{digits[c>>4], digits[c&15]})
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	negative := n < 0
	if negative {
		n = -n
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if negative {
		return "-" + string(digits)
	}
	return string(digits)
}

// httpsURL returns value when it is an HTTPS URL on one of hosts, without
// credentials or a port.
func httpsURL(value string, hosts ...string) (*url.URL, bool) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Port() != "" || !contains(hosts, parsed.Hostname()) {
		return nil, false
	}
	return parsed, true
}
