package provider

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

var onePixel, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==")

var imageUsage = map[string]any{"prompt_tokens": 12, "completion_tokens": 20, "total_tokens": 32, "cost": 0.005}

func endpoint(parameters map[string]any) map[string]any {
	if parameters == nil {
		parameters = map[string]any{
			"quality":      map[string]any{"type": "enum", "values": []any{"low", "high"}},
			"aspect_ratio": map[string]any{"type": "enum", "values": []any{"1:1"}},
			"background":   map[string]any{"type": "enum", "values": []any{"transparent"}},
			"n":            map[string]any{"type": "range", "min": 1, "max": 10},
		}
	}
	return map[string]any{"provider_tag": "openai", "supported_parameters": parameters}
}

func imageData(entries ...map[string]any) map[string]any {
	data := []any{}
	for _, entry := range entries {
		data = append(data, entry)
	}
	return map[string]any{"data": data, "usage": imageUsage}
}

func pngEntry(raw []byte) map[string]any {
	return map[string]any{"b64_json": base64.StdEncoding.EncodeToString(raw), "media_type": "image/png"}
}

type call struct {
	path, method string
	body         map[string]any
}

// imageServer answers the preflight with catalogue and the generation with
// payload and status.
func imageServer(t *testing.T, model string, catalogue, payload any, status int) (*Images, *[]call) {
	t.Helper()
	var mu sync.Mutex
	calls := &[]call{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		*calls = append(*calls, call{r.URL.Path, r.Method, body})
		if len(*calls) == 1 {
			writeJSON(w, 200, catalogue)
			return
		}
		writeJSON(w, status, payload)
	}))
	t.Cleanup(server.Close)
	c, err := NewImages(ImageOptions{APIKey: "secret", Model: model, BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	return c, calls
}

func imageError(t *testing.T, err error, code string, cost float64) *unit.ModelError {
	t.Helper()
	var failure *unit.ModelError
	if !errors.As(err, &failure) || failure.Failure == nil || failure.Failure.Code != code {
		t.Fatalf("expected %s, got %v", code, err)
	}
	if cost >= 0 && (failure.Usage == nil || *failure.Usage.CostUSD != cost) {
		t.Errorf("usage %s", s.Stringify(s.FromGoValue(failure.Usage)))
	}
	if strings.Contains(failure.Message, "secret") || strings.Contains(failure.Message, "private provider message") {
		t.Errorf("leaks: %s", failure.Message)
	}
	return failure
}

func samePixels(t *testing.T, a, b []byte) {
	t.Helper()
	first, _, err1 := image.Decode(bytes.NewReader(a))
	second, _, err2 := image.Decode(bytes.NewReader(b))
	if err1 != nil || err2 != nil || first.Bounds() != second.Bounds() {
		t.Fatalf("decode %v %v", err1, err2)
	}
	for y := first.Bounds().Min.Y; y < first.Bounds().Max.Y; y++ {
		for x := first.Bounds().Min.X; x < first.Bounds().Max.X; x++ {
			if color.NRGBAModel.Convert(first.At(x, y)) != color.NRGBAModel.Convert(second.At(x, y)) {
				t.Fatalf("pixel %d,%d differs", x, y)
			}
		}
	}
}

func TestImagesPreflightAndRequestOneSquarePNG(t *testing.T) {
	c, calls := imageServer(t, "openai/gpt-image-1-mini", map[string]any{"endpoints": []any{endpoint(nil)}}, imageData(pngEntry(onePixel)), 200)
	result, err := c.Generate(context.Background(), "A square portrait")
	if err != nil {
		t.Fatal(err)
	}
	samePixels(t, result.PNG, onePixel)
	if *result.Usage.TotalTokens != 32 || *result.Usage.CostUSD != 0.005 || c.Model() != "openai/gpt-image-1-mini" {
		t.Errorf("usage %s", s.Stringify(s.FromGoValue(result.Usage)))
	}
	if len(*calls) != 2 || (*calls)[0].path != "/images/models/openai/gpt-image-1-mini/endpoints" || (*calls)[1].path != "/images" {
		t.Fatalf("calls %v", *calls)
	}
	body, _ := json.Marshal((*calls)[1].body)
	if string(body) != `{"aspect_ratio":"1:1","background":"transparent","model":"openai/gpt-image-1-mini","n":1,"output_format":"png","prompt":"A square portrait","provider":{"allow_fallbacks":false,"only":["openai"]},"quality":"low"}` {
		t.Errorf("body %s", body)
	}
}

func TestImagesStopBeforeThePaidRequestWithoutLowQuality(t *testing.T) {
	parameters := endpoint(nil)["supported_parameters"].(map[string]any)
	parameters["quality"] = map[string]any{"type": "enum", "values": []any{"high"}}
	c, calls := imageServer(t, "openai/gpt-image-1-mini", map[string]any{"endpoints": []any{endpoint(parameters)}}, imageData(pngEntry(onePixel)), 200)
	_, err := c.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeModelUnavailable, -1)
	if len(*calls) != 1 {
		t.Errorf("calls %d", len(*calls))
	}
	delete(parameters, "background")
	parameters["quality"] = map[string]any{"type": "enum", "values": []any{"low"}}
	c, calls = imageServer(t, "openai/gpt-image-1-mini", map[string]any{"endpoints": []any{endpoint(parameters)}}, imageData(pngEntry(onePixel)), 200)
	if _, err := c.Generate(context.Background(), "Portrait"); err != nil {
		t.Fatal(err)
	}
	if _, ok := (*calls)[1].body["background"]; ok {
		t.Error("transparency requested from an endpoint without it")
	}
}

func TestImagesKeepChargesAndNeverRetry(t *testing.T) {
	for _, status := range []int{200, 402} {
		c, calls := imageServer(t, "openai/gpt-image-1-mini", map[string]any{"endpoints": []any{endpoint(nil)}}, map[string]any{"error": map[string]any{"code": 402, "message": "secret private provider message"}, "usage": imageUsage}, status)
		_, err := c.Generate(context.Background(), "Portrait")
		imageError(t, err, unit.CodeInsufficientCredits, 0.005)
		if len(*calls) != 2 {
			t.Errorf("calls %d", len(*calls))
		}
	}
}

func TestImagesRejectInvalidOutputsAndKeepUsage(t *testing.T) {
	for _, entries := range [][]map[string]any{
		{{"url": "https://example.com/image.png"}},
		{{"b64_json": base64.StdEncoding.EncodeToString([]byte("<svg/>")), "media_type": "image/svg+xml"}},
		{{"b64_json": "%%%="}},
		{{"b64_json": "aGVsbG8="}},
		{{"b64_json": "aGVsbG8=", "media_type": "image/png"}},
		{pngEntry(onePixel), pngEntry(onePixel)},
		{},
	} {
		c, _ := imageServer(t, "openai/gpt-image-1-mini", map[string]any{"endpoints": []any{endpoint(nil)}}, imageData(entries...), 200)
		_, err := c.Generate(context.Background(), "Portrait")
		imageError(t, err, unit.CodeOutputInvalid, 0.005)
	}
}

func TestImagesBoundSizesAndPixels(t *testing.T) {
	large := make([]byte, 8*1024*1024+1)
	copy(large, onePixel)
	c, _ := imageServer(t, "openai/gpt-image-1-mini", map[string]any{"endpoints": []any{endpoint(nil)}}, imageData(map[string]any{"b64_json": base64.StdEncoding.EncodeToString(large)}), 200)
	_, err := c.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeOutputLimit, 0.005)

	var huge bytes.Buffer
	_ = png.Encode(&huge, image.NewGray(image.Rect(0, 0, 4097, 4096)))
	c, _ = imageServer(t, DefaultImageModel, museCatalogue(), imageData(pngEntry(huge.Bytes())), 200)
	_, err = c.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeOutputInvalid, 0.005)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "13631488")
		w.WriteHeader(200)
	}))
	defer server.Close()
	oversized, _ := NewImages(ImageOptions{APIKey: "secret", BaseURL: server.URL})
	_, err = oversized.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeOutputLimit, -1)
}

func TestImagesNeedKeyAndStopWhenCancelled(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++ }))
	defer server.Close()
	missing, _ := NewImages(ImageOptions{BaseURL: server.URL})
	_, err := missing.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeAuthentication, -1)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	keyed, _ := NewImages(ImageOptions{APIKey: "secret", BaseURL: server.URL})
	_, err = keyed.Generate(ctx, "Portrait")
	imageError(t, err, unit.CodeCancelled, -1)
	if calls != 0 {
		t.Errorf("contacted OpenRouter %d times", calls)
	}

	stalled := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer stalled.Close()
	slow, _ := NewImages(ImageOptions{APIKey: "secret", BaseURL: stalled.URL, Timeout: 50 * time.Millisecond})
	_, err = slow.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeLocalTimeout, -1)
	ctx, cancel = context.WithCancel(context.Background())
	time.AfterFunc(20*time.Millisecond, cancel)
	pending, _ := NewImages(ImageOptions{APIKey: "secret", BaseURL: stalled.URL})
	_, err = pending.Generate(ctx, "Portrait")
	imageError(t, err, unit.CodeCancelled, -1)

	stalled.Close()
	broken, _ := NewImages(ImageOptions{APIKey: "secret", BaseURL: stalled.URL})
	_, err = broken.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeNetworkError, -1)
}

func museCatalogue() map[string]any {
	return map[string]any{"data": map[string]any{"architecture": map[string]any{"output_modalities": []any{"image"}}, "endpoints": []any{map[string]any{"tag": "meta"}}}}
}

func TestMuseUsesTheImagesAPIWithMetaPinned(t *testing.T) {
	c, calls := imageServer(t, DefaultImageModel, museCatalogue(), imageData(pngEntry(onePixel)), 200)
	result, err := c.Generate(context.Background(), "Portrait")
	if err != nil {
		t.Fatal(err)
	}
	samePixels(t, result.PNG, onePixel)
	if (*calls)[0].path != "/models/meta/muse-image/endpoints" || (*calls)[1].path != "/images" {
		t.Errorf("calls %v", *calls)
	}
	body, _ := json.Marshal((*calls)[1].body)
	if string(body) != `{"model":"meta/muse-image","n":1,"prompt":"Portrait\nReturn exactly one square image.","provider":{"allow_fallbacks":false,"only":["meta"]}}` {
		t.Errorf("body %s", body)
	}
	for _, catalogue := range []map[string]any{
		{},
		{"data": map[string]any{"architecture": map[string]any{"output_modalities": []any{"image"}}, "endpoints": []any{}}},
		{"data": map[string]any{"architecture": map[string]any{"output_modalities": []any{"text"}}, "endpoints": []any{map[string]any{"tag": "meta"}}}},
	} {
		c, calls := imageServer(t, DefaultImageModel, catalogue, imageData(pngEntry(onePixel)), 200)
		_, err := c.Generate(context.Background(), "Portrait")
		imageError(t, err, unit.CodeModelUnavailable, -1)
		if len(*calls) != 1 {
			t.Errorf("calls %d", len(*calls))
		}
	}
}

func TestMuseConvertsJPEGAndRejectsMismatchedTypes(t *testing.T) {
	picture := image.NewRGBA(image.Rect(0, 0, 2, 2))
	for i := range picture.Pix {
		picture.Pix[i] = 0xcc
	}
	var encoded bytes.Buffer
	_ = jpeg.Encode(&encoded, picture, nil)
	entry := func(mime string) map[string]any {
		return map[string]any{"b64_json": base64.StdEncoding.EncodeToString(encoded.Bytes()), "media_type": mime}
	}
	c, _ := imageServer(t, DefaultImageModel, museCatalogue(), imageData(entry("image/jpeg")), 200)
	result, err := c.Generate(context.Background(), "Portrait")
	if err != nil {
		t.Fatal(err)
	}
	decoded, format, err := image.Decode(bytes.NewReader(result.PNG))
	if err != nil || format != "png" {
		t.Fatalf("format %s %v", format, err)
	}
	if _, alpha := decoded.(*image.NRGBA); alpha {
		t.Error("an opaque JPEG gained an alpha channel")
	}
	samePixels(t, result.PNG, encoded.Bytes())
	c, _ = imageServer(t, DefaultImageModel, museCatalogue(), imageData(entry("image/png")), 200)
	_, err = c.Generate(context.Background(), "Portrait")
	imageError(t, err, unit.CodeOutputInvalid, 0.005)
}

func TestMuseEndpointRejectionKeepsTheModel(t *testing.T) {
	c, calls := imageServer(t, DefaultImageModel, museCatalogue(), map[string]any{"error": map[string]any{"code": 404, "message": "secret private provider message"}, "usage": imageUsage}, 404)
	_, err := c.Generate(context.Background(), "Attack effect")
	failure := imageError(t, err, unit.CodeModelUnavailable, 0.005)
	if !strings.Contains(failure.Message, "catalogue listing does not guarantee access") || !strings.Contains(failure.Message, "Muse remains selected; no fallback was attempted") || failure.Failure.ProviderCode != 404 || failure.Failure.HTTPStatus != 404 {
		t.Errorf("failure %s", s.Stringify(s.FromGoValue(failure.Failure)))
	}
	if c.Model() != DefaultImageModel || len(*calls) != 2 {
		t.Errorf("calls %d", len(*calls))
	}
	c, calls = imageServer(t, DefaultImageModel, museCatalogue(), map[string]any{"choices": []any{map[string]any{"message": map[string]any{"images": []any{}}}}, "usage": imageUsage}, 200)
	_, err = c.Generate(context.Background(), "Attack")
	imageError(t, err, unit.CodeOutputInvalid, 0.005)
	if len(*calls) != 2 {
		t.Errorf("calls %d", len(*calls))
	}
}
