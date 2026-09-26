package provider

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"io"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	_ "image/jpeg"

	_ "golang.org/x/image/webp"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// DefaultImageModel is the application's default image model.
const DefaultImageModel = "meta/muse-image"

const (
	imageResponseLimit  = 12 * 1024 * 1024
	catalogueLimit      = 1024 * 1024
	imageLimit          = 8 * 1024 * 1024
	pixelLimit          = 16 * 1024 * 1024
	defaultImageTimeout = 120 * time.Second
)

var (
	imageModelID = regexp.MustCompile(`^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$`)
	base64Text   = regexp.MustCompile(`^[A-Za-z0-9+/]*={0,2}$`)
	providerTag  = regexp.MustCompile(`^[a-zA-Z0-9._/-]+$`)
)

// ImageOptions configure OpenRouter image generation.
type ImageOptions struct {
	APIKey string
	// Model defaults to DefaultImageModel.
	Model string
	// Timeout for the whole generation; default 120 s.
	Timeout time.Duration
	// BaseURL and Client exist for tests.
	BaseURL string
	Client  *http.Client
}

// Images generates one explicitly requested square image per call, after a
// capability preflight, without retries or fallback.
type Images struct {
	key, model, baseURL string
	timeout             time.Duration
	client              *http.Client
}

// Image is one generated picture, normalized to PNG.
type Image struct {
	PNG   []byte
	Usage *unit.Usage
}

// NewImages validates the model identifier.
func NewImages(o ImageOptions) (*Images, error) {
	c := &Images{key: strings.TrimSpace(o.APIKey), model: o.Model, baseURL: o.BaseURL, timeout: o.Timeout}
	if c.model == "" {
		c.model = DefaultImageModel
	}
	if c.baseURL == "" {
		c.baseURL = OpenRouterURL
	}
	if c.timeout == 0 {
		c.timeout = defaultImageTimeout
	}
	client := http.Client{}
	if o.Client != nil {
		client = *o.Client
	}
	// A redirect is an error, never a new destination.
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("redirect") }
	c.client = &client
	if !imageModelID.MatchString(c.model) || len(c.model) > 200 || (c.key != "" && strings.Contains(c.model, c.key)) {
		return nil, imageFailure(unit.CodeRequestRejected, "Image model must be a provider/model identifier.", nil)
	}
	return c, nil
}

// Model is the selected image model.
func (c *Images) Model() string { return c.model }

// Ready reports whether a key is configured.
func (c *Images) Ready() bool { return c.key != "" }

func imageFailure(code, message string, usage *unit.Usage) *unit.ModelError {
	return failed(&unit.Failure{Code: code, Message: message, Provider: "OpenRouter"}, usage)
}

// Generate requests one square image for prompt.
func (c *Images) Generate(ctx context.Context, prompt string) (Image, error) {
	if ctx.Err() != nil {
		return Image{}, imageFailure(unit.CodeCancelled, "Image generation was cancelled.", nil)
	}
	if c.key == "" {
		return Image{}, imageFailure(unit.CodeAuthentication, "Image generation needs an OpenRouter API key in Settings.", nil)
	}
	if strings.TrimSpace(prompt) == "" || s.UTF16Len(prompt) > 32_000 {
		return Image{}, imageFailure(unit.CodeRequestRejected, "Image prompt must contain between 1 and 32000 characters.", nil)
	}
	deadline, stop := context.WithTimeout(ctx, c.timeout)
	defer stop()
	var usage *unit.Usage
	image, err := c.generate(deadline, prompt, &usage)
	if err == nil {
		return image, nil
	}
	var known *unit.ModelError
	if errors.As(err, &known) {
		return Image{}, err
	}
	switch {
	case ctx.Err() != nil:
		return Image{}, imageFailure(unit.CodeCancelled, "Image generation was cancelled.", usage)
	case deadline.Err() != nil:
		return Image{}, imageFailure(unit.CodeLocalTimeout, "Image generation exceeded the 120 second deadline.", usage)
	}
	return Image{}, imageFailure(unit.CodeNetworkError, "OpenRouter image request failed. Check the connection before trying again.", usage)
}

func (c *Images) generate(ctx context.Context, prompt string, usage **unit.Usage) (Image, error) {
	payload, err := c.send(ctx, prompt, usage)
	if err != nil {
		return Image{}, err
	}
	return decodeImage(payload, *usage)
}

// send runs the preflight for the selected model, then the generation.
func (c *Images) send(ctx context.Context, prompt string, usage **unit.Usage) (map[string]any, error) {
	if c.model == DefaultImageModel {
		catalogue, err := c.request(ctx, c.baseURL+"/models/"+c.model+"/endpoints", nil, usage)
		if err != nil {
			return nil, err
		}
		model, _ := catalogue["data"].(map[string]any)
		architecture, _ := model["architecture"].(map[string]any)
		modalities, _ := architecture["output_modalities"].([]any)
		endpoints, _ := model["endpoints"].([]any)
		meta := slices.ContainsFunc(endpoints, func(entry any) bool {
			endpoint, _ := entry.(map[string]any)
			return endpoint["tag"] == "meta"
		})
		if !slices.Contains(modalities, any("image")) || !meta {
			return nil, imageFailure(unit.CodeModelUnavailable, "Muse has no advertised Meta image endpoint.", nil)
		}
		// Muse is served only by the images API, not chat completions.
		return c.request(ctx, c.baseURL+"/images", s.NewObject().
			Set("model", c.model).
			Set("prompt", prompt+"\nReturn exactly one square image.").
			Set("n", 1.0).
			Set("provider", s.NewObject().Set("only", []any{"meta"}).Set("allow_fallbacks", false)), usage)
	}
	catalogue, err := c.request(ctx, c.baseURL+"/images/models/"+c.model+"/endpoints", nil, usage)
	if err != nil {
		return nil, err
	}
	endpoints, _ := catalogue["endpoints"].([]any)
	var chosen map[string]any
	for _, entry := range endpoints {
		endpoint, _ := entry.(map[string]any)
		tag, _ := endpoint["provider_tag"].(string)
		parameters, _ := endpoint["supported_parameters"].(map[string]any)
		count, _ := parameters["n"].(map[string]any)
		low, _ := count["min"].(float64)
		high, _ := count["max"].(float64)
		_, hasLow := count["min"].(float64)
		_, hasHigh := count["max"].(float64)
		if providerTag.MatchString(tag) && supports(parameters, "quality", "low") && supports(parameters, "aspect_ratio", "1:1") &&
			count["type"] == "range" && hasLow && hasHigh && low <= 1 && high >= 1 {
			chosen = endpoint
			break
		}
	}
	if chosen == nil {
		return nil, imageFailure(unit.CodeModelUnavailable, "The selected image model has no endpoint supporting one square image at low quality.", nil)
	}
	body := s.NewObject().
		Set("model", c.model).
		Set("prompt", prompt).
		Set("n", 1.0).
		Set("aspect_ratio", "1:1").
		Set("quality", "low").
		Set("output_format", "png")
	if parameters, _ := chosen["supported_parameters"].(map[string]any); supports(parameters, "background", "transparent") {
		body.Set("background", "transparent")
	}
	body.Set("provider", s.NewObject().Set("only", []any{chosen["provider_tag"]}).Set("allow_fallbacks", false))
	return c.request(ctx, c.baseURL+"/images", body, usage)
}

func supports(parameters map[string]any, key, value string) bool {
	descriptor, _ := parameters[key].(map[string]any)
	values, _ := descriptor["values"].([]any)
	return descriptor["type"] == "enum" && slices.Contains(values, any(value))
}

// request sends one call and classifies provider failures. A POST body's
// reported usage is kept even when the call failed.
func (c *Images) request(ctx context.Context, url string, body *s.Object, usage **unit.Usage) (map[string]any, error) {
	method, limit := http.MethodGet, int64(catalogueLimit)
	var reader io.Reader
	if body != nil {
		method, limit = http.MethodPost, imageResponseLimit
		reader = strings.NewReader(s.Stringify(body))
	}
	request, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+c.key)
	request.Header.Set("Content-Type", "application/json")
	response, err := c.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	tooLarge := imageFailure(unit.CodeOutputLimit, "OpenRouter image response exceeded the size limit.", nil)
	if response.ContentLength > limit {
		return nil, tooLarge
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > limit {
		return nil, tooLarge
	}
	if len(raw) == 0 {
		return nil, imageFailure(unit.CodeOutputInvalid, "OpenRouter returned an empty image response.", nil)
	}
	var decoded any
	if json.Unmarshal(raw, &decoded) != nil {
		return nil, imageFailure(unit.CodeOutputInvalid, "OpenRouter returned invalid image response JSON.", nil)
	}
	payload, _ := decoded.(map[string]any)
	if body != nil {
		*usage = envelopeUsage(payload["usage"])
	}
	if response.StatusCode < 200 || response.StatusCode > 299 || payload["error"] != nil {
		envelope, _ := payload["error"].(map[string]any)
		code := providerCode(envelope["code"])
		f := OpenRouterFailure(response.StatusCode, code, RetryAfter(response.Header.Get("Retry-After"), time.Now()), "")
		f.Message = strings.ReplaceAll(strings.ReplaceAll(f.Message, "structured-output support", "image support"), "structured output", "image generation")
		if c.model == DefaultImageModel && f.Code == unit.CodeModelUnavailable {
			reported := response.StatusCode
			if code != nil {
				reported = *code
			}
			f.Message = "OpenRouter has no available Meta endpoint for Muse image generation (" + itoa(reported) + "). The catalogue listing does not guarantee access for this request. Check OpenRouter account and provider restrictions, or retry later. Muse remains selected; no fallback was attempted."
		}
		return nil, failed(f, *usage)
	}
	return payload, nil
}

var imageFormats = map[string]string{"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp"}

// decodeImage accepts one inline PNG, JPEG or WebP and re-encodes its
// pixels as PNG, keeping existing alpha without creating transparency.
func decodeImage(payload map[string]any, usage *unit.Usage) (Image, error) {
	invalid := imageFailure(unit.CodeOutputInvalid, "OpenRouter did not return one inline PNG, JPEG or WebP image.", usage)
	data, _ := payload["data"].([]any)
	if len(data) != 1 {
		return Image{}, invalid
	}
	entry, _ := data[0].(map[string]any)
	encoded, _ := entry["b64_json"].(string)
	mediaType, hasType := entry["media_type"]
	declared, _ := mediaType.(string)
	if encoded == "" || (hasType && !slices.Contains([]string{"image/png", "image/jpeg", "image/webp"}, declared)) ||
		len(encoded)%4 != 0 || !base64Text.MatchString(encoded) {
		return Image{}, invalid
	}
	tooLarge := imageFailure(unit.CodeOutputLimit, "Generated PNG exceeded the image size limit.", usage)
	if len(encoded) > (imageLimit+2)/3*4 {
		return Image{}, tooLarge
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || base64.StdEncoding.EncodeToString(raw) != encoded {
		return Image{}, imageFailure(unit.CodeOutputInvalid, "OpenRouter returned invalid base64 image data.", usage)
	}
	if len(raw) > imageLimit {
		return Image{}, tooLarge
	}
	unsupported := imageFailure(unit.CodeOutputInvalid, "OpenRouter returned invalid or unsupported raster image data.", usage)
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || imageFormats[format] == "" || (hasType && declared != imageFormats[format]) ||
		config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > pixelLimit {
		return Image{}, unsupported
	}
	pixels, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return Image{}, unsupported
	}
	var out bytes.Buffer
	if png.Encode(&out, pixels) != nil {
		return Image{}, unsupported
	}
	if out.Len() > imageLimit {
		return Image{}, tooLarge
	}
	return Image{PNG: out.Bytes(), Usage: usage}, nil
}

func itoa(n int) string { return s.FormatNumber(float64(n)) }
