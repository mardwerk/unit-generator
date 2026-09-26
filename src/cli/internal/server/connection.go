package server

import (
	"errors"
	"strings"
	"sync"

	"github.com/mardwerk/unit-generator/src/cli/internal/provider"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// KeyState says whether a key is set and where it came from. It never
// holds the key; the hint is a masked fragment of a long key.
type KeyState struct {
	Configured bool    `json:"configured"`
	Source     string  `json:"source"` // env, env-file, settings or none
	Hint       *string `json:"hint"`
}

// ImageState is the image model and whether it can run.
type ImageState struct {
	Model string `json:"model"`
	Ready bool   `json:"ready"`
}

// ProviderState is the server's model connection as the client sees it.
type ProviderState struct {
	Provider string     `json:"provider"`
	Model    string     `json:"model"`
	Ready    bool       `json:"ready"`
	Images   ImageState `json:"images"`
	Key      KeyState   `json:"key"`
	Message  string     `json:"message"`
}

// connection is the server's one model connection. The key stays in this
// process and is never part of an artifact.
type connection struct {
	mu                          sync.Mutex
	env                         provider.Environment
	key, keySource              string
	provider, model, imageModel string
	active                      unit.Model
}

var settingsSchema = s.StrictObject(
	s.F("provider", s.Enum("openrouter", "codex")),
	s.F("apiKey", s.Optional(s.String().Trim().Min(1).Max(4096))),
	s.F("model", s.Optional(s.String().Trim().Min(1).Max(200))),
	s.F("imageModel", s.Optional(s.String().Trim().Min(1).Max(200))),
)

func newConnection(env provider.Environment, providerName, model string) (*connection, error) {
	c := &connection{env: env, provider: "openrouter"}
	c.key, c.keySource = env.Get("OPENROUTER_API_KEY")
	c.imageModel = env.Value("OPENROUTER_IMAGE_MODEL")
	if c.imageModel == "" {
		c.imageModel = provider.DefaultImageModel
	}
	settings := s.NewObject().Set("provider", providerName)
	if model != "" {
		settings.Set("model", model)
	}
	if _, err := c.configure(settings); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *connection) state() ProviderState {
	c.mu.Lock()
	defer c.mu.Unlock()
	ready := c.provider == "codex" || c.key != ""
	state := ProviderState{
		Provider: c.provider,
		Model:    c.model,
		Ready:    ready,
		Images:   ImageState{Model: c.imageModel, Ready: c.key != ""},
		Key:      KeyState{Configured: c.key != "", Source: c.keySource, Hint: provider.KeyHint(c.key)},
	}
	switch {
	case c.provider == "codex":
		state.Message = "Uses your existing local Codex configuration and login."
	case ready:
		state.Message = "Using " + c.model + ". The API key stays on this local server."
	default:
		state.Message = "Add an OpenRouter API key to use free models, or select Local Codex."
	}
	return state
}

// configure validates new settings completely before applying any of them.
func (c *connection) configure(value any) (ProviderState, error) {
	var settings struct {
		Provider   string  `json:"provider"`
		APIKey     *string `json:"apiKey"`
		Model      *string `json:"model"`
		ImageModel *string `json:"imageModel"`
	}
	if err := s.ParseInto(settingsSchema, value, &settings); err != nil {
		return ProviderState{}, err
	}
	c.mu.Lock()
	key := c.key
	if settings.APIKey != nil {
		key = *settings.APIKey
	}
	model := ""
	if settings.Model != nil {
		model = *settings.Model
	} else if settings.Provider == "openrouter" {
		model = c.env.Value("OPENROUTER_MODEL")
		if model == "" {
			model = provider.FreeModel
		}
	}
	imageModel := c.imageModel
	if settings.ImageModel != nil {
		imageModel = *settings.ImageModel
	}
	c.mu.Unlock()
	if key != "" && strings.Contains(model, key) {
		return ProviderState{}, errors.New("The model name must not contain an API key.")
	}
	// Validate the image model without contacting the provider.
	if _, err := provider.NewImages(provider.ImageOptions{APIKey: key, Model: imageModel}); err != nil {
		return ProviderState{}, err
	}
	var client unit.Model
	var err error
	if settings.Provider == "openrouter" {
		client, err = provider.NewOpenRouter(provider.OpenRouterOptions{APIKey: key, Model: model, Reasoning: c.env.Value("OPENROUTER_REASONING")})
	} else {
		client, err = provider.NewCodex(provider.CodexOptions{Model: model})
	}
	if err != nil {
		return ProviderState{}, err
	}
	c.mu.Lock()
	c.key = key
	if settings.APIKey != nil {
		c.keySource = "settings"
	}
	if c.key == "" {
		c.keySource = provider.SourceNone
	}
	c.provider, c.model, c.imageModel, c.active = settings.Provider, model, imageModel, client
	c.mu.Unlock()
	return c.state(), nil
}

func (c *connection) client() unit.Model {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.active
}

func (c *connection) images() (*provider.Images, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return provider.NewImages(provider.ImageOptions{APIKey: c.key, Model: c.imageModel})
}
