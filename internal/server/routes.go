package server

import (
	"context"
	"errors"

	"github.com/mardwerk/unit-generator/internal/library"
	"github.com/mardwerk/unit-generator/internal/render"
	"github.com/mardwerk/unit-generator/internal/research"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

type post struct {
	// model marks operations that call a model; settings cannot change
	// while one runs.
	model bool
	run   func(ctx context.Context, body *s.Object) (any, error)
}

func (srv *Server) gets() map[string]func() (any, error) {
	return map[string]func() (any, error){
		"health": func() (any, error) {
			state := srv.connection.state()
			return s.NewObject().Set("status", "ok").Set("version", srv.config.Version).
				Set("key", s.FromGoValue(state.Key)).Set("provider", s.FromGoValue(state)), nil
		},
		"provider": func() (any, error) { return srv.connection.state(), nil },
		"example": func() (any, error) {
			if srv.config.Example == nil {
				return nil, fail(404, "NOT_FOUND", "No example request is configured.")
			}
			return srv.config.Example, nil
		},
		"definition": func() (any, error) { return unit.DefaultAuthoringDefinition(), nil },
		"library":    func() (any, error) { return srv.config.Library.State() },
		"profiles":   func() (any, error) { return srv.config.Profiles.List() },
	}
}

func (srv *Server) posts() map[string]post {
	return map[string]post{
		"provider": {run: func(_ context.Context, body *s.Object) (any, error) {
			if srv.busy() {
				return nil, fail(409, "BUSY", "Wait for the current model stage to finish.")
			}
			return srv.connection.configure(body)
		}},
		"research":  {run: srv.research},
		"character": {run: srv.character},
		"prepare":   {run: srv.prepare},
		"draft": {model: true, run: func(ctx context.Context, body *s.Object) (any, error) {
			if err := only(body, "prepared", "maxRepairAttempts"); err != nil {
				return nil, err
			}
			model, err := srv.model()
			if err != nil {
				return nil, err
			}
			prepared, err := unit.ParsePrepared(get(body, "prepared"))
			if err != nil {
				return nil, err
			}
			options := unit.Options{}
			if repairs, ok := get(body, "maxRepairAttempts").(float64); ok {
				n := int(repairs)
				if float64(n) != repairs || n < 0 || n > 2 {
					return nil, errors.New("maxRepairAttempts must be 0, 1 or 2.")
				}
				options.MaxRepairAttempts = &n
			}
			return unit.DraftUnit(ctx, prepared, model, options)
		}},
		"check": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "draft"); err != nil {
				return nil, err
			}
			draft, err := unit.ParseDraft(get(body, "draft"))
			if err != nil {
				return nil, err
			}
			return unit.CheckDraft(draft)
		}},
		"review": {model: true, run: func(ctx context.Context, body *s.Object) (any, error) {
			if err := only(body, "checked"); err != nil {
				return nil, err
			}
			model, err := srv.model()
			if err != nil {
				return nil, err
			}
			checked, err := unit.ParseChecked(get(body, "checked"))
			if err != nil {
				return nil, err
			}
			return unit.ReviewDraft(ctx, checked, model, unit.Options{})
		}},
		"inspect": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "artifact", "editable"); err != nil {
				return nil, err
			}
			editable, _ := get(body, "editable").(bool)
			return inspect(get(body, "artifact"), editable)
		}},
		"render": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "artifact", "details"); err != nil {
				return nil, err
			}
			details, _ := get(body, "details").(bool)
			markdown, err := render.Markdown(get(body, "artifact"), details)
			if err != nil {
				return nil, err
			}
			return s.NewObject().Set("markdown", markdown), nil
		}},
		"view": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "artifact"); err != nil {
				return nil, err
			}
			view, err := render.ReadView(get(body, "artifact"))
			if err != nil {
				return nil, err
			}
			out := s.NewObject().Set("view", s.FromGoValue(view))
			if stats := render.Stats(view.Candidate, view.Prepared.Request.MechanicsDefinition); stats != nil {
				out.Set("stats", s.FromGoValue(stats))
			}
			return out, nil
		}},
		"profiles/apply": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "request", "profile", "profileId"); err != nil {
				return nil, err
			}
			profile, err := srv.profile(body)
			if err != nil {
				return nil, err
			}
			return applyProfile(get(body, "request"), profile)
		}},
		"profiles/save": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "profile"); err != nil {
				return nil, err
			}
			return srv.config.Profiles.Save(get(body, "profile"))
		}},
		"profiles/delete": {run: func(_ context.Context, body *s.Object) (any, error) {
			id, err := text(body, "id")
			if err != nil {
				return nil, err
			}
			return srv.config.Profiles.Delete(id)
		}},
		"library/save": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "artifact"); err != nil {
				return nil, err
			}
			return srv.config.Library.Save(get(body, "artifact"))
		}},
		"library/load": {run: func(_ context.Context, body *s.Object) (any, error) {
			id, err := text(body, "id")
			if err != nil {
				return nil, err
			}
			artifact, err := srv.config.Library.Load(id)
			if err != nil {
				return nil, err
			}
			return s.NewObject().Set("artifact", artifact), nil
		}},
		"library/delete": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "ids"); err != nil {
				return nil, err
			}
			var ids []string
			if err := s.ToGo(get(body, "ids"), &ids); err != nil || ids == nil {
				return nil, errors.New("ids: expected an array of library IDs")
			}
			return srv.config.Library.Delete(ids)
		}},
		"library/configure": {run: func(_ context.Context, body *s.Object) (any, error) {
			if srv.busy() {
				return nil, fail(409, "BUSY", "Wait for model stages before changing the library.")
			}
			directory, err := text(body, "directory")
			if err != nil {
				return nil, err
			}
			return srv.config.Library.Configure(directory)
		}},
		"library/icons": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "artifact"); err != nil {
				return nil, err
			}
			return srv.config.Library.Icons(get(body, "artifact"))
		}},
		"library/portrait/get": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "artifact"); err != nil {
				return nil, err
			}
			portrait, err := srv.config.Library.Portrait(get(body, "artifact"))
			return portraitResponse(portrait, err)
		}},
		"library/portrait": {run: func(_ context.Context, body *s.Object) (any, error) {
			if err := only(body, "artifact", "referenceId"); err != nil {
				return nil, err
			}
			id, err := text(body, "referenceId")
			if err != nil {
				return nil, err
			}
			portrait, err := srv.config.Library.SetPortrait(get(body, "artifact"), id)
			return portraitResponse(portrait, err)
		}},
		"library/icon/generate": {model: true, run: srv.generateIcon},
	}
}

func portraitResponse(portrait *unit.VisualReference, err error) (any, error) {
	if err != nil {
		return nil, err
	}
	out := s.NewObject()
	if portrait != nil {
		out.Set("portrait", s.FromGoValue(portrait))
	}
	return out, nil
}

func get(body *s.Object, key string) any {
	value, _ := body.Get(key)
	return value
}

// only rejects fields an operation does not define.
func only(body *s.Object, allowed ...string) error {
	for _, key := range body.Keys() {
		known := false
		for _, name := range allowed {
			known = known || key == name
		}
		if !known {
			return errors.New(key + ": unrecognized field")
		}
	}
	return nil
}

func text(body *s.Object, key string) (string, error) {
	if err := only(body, key); err != nil {
		return "", err
	}
	value, ok := get(body, key).(string)
	if !ok {
		return "", errors.New(key + ": expected a string")
	}
	return value, nil
}

func (srv *Server) model() (unit.Model, error) {
	if srv.config.TestModel != nil {
		return srv.config.TestModel, nil
	}
	state := srv.connection.state()
	if !state.Ready {
		return nil, fail(400, "PROVIDER_REQUIRED", state.Message)
	}
	return srv.connection.client(), nil
}

// profile is the Profile a request names: a full Profile, a saved ID, or
// the bundled default.
func (srv *Server) profile(body *s.Object) (unit.Profile, error) {
	if value, ok := body.Get("profile"); ok {
		return unit.ValidateProfile(value)
	}
	if id, ok := get(body, "profileId").(string); ok {
		return srv.config.Profiles.Get(id)
	}
	return unit.DefaultProfile(), nil
}

func (srv *Server) lookup(ctx context.Context, body *s.Object, allowed ...string) (*research.Sources, any, error) {
	if err := only(body, append([]string{"name", "choice"}, allowed...)...); err != nil {
		return nil, nil, err
	}
	name, ok := get(body, "name").(string)
	if !ok {
		return nil, nil, errors.New("name: expected a string")
	}
	choice := 0
	if value, present := body.Get("choice"); present {
		number, ok := value.(float64)
		if !ok || number != float64(int(number)) || number < 1 {
			return nil, nil, errors.New("choice: expected a positive page ID")
		}
		choice = int(number)
	}
	sources, choices, err := srv.config.Research.Character(ctx, name, choice)
	if err != nil {
		return nil, nil, err
	}
	if sources == nil {
		return nil, s.NewObject().Set("kind", "choices").Set("choices", s.FromGoValue(choices)), nil
	}
	return sources, nil, nil
}

// research returns reusable Sources, or choices for an ambiguous name.
func (srv *Server) research(ctx context.Context, body *s.Object) (any, error) {
	sources, choices, err := srv.lookup(ctx, body)
	if err != nil || choices != nil {
		return choices, err
	}
	return sources, nil
}

// character researches and prepares under a Profile in one call.
func (srv *Server) character(ctx context.Context, body *s.Object) (any, error) {
	profile, err := srv.profile(body)
	if err != nil {
		return nil, err
	}
	sources, choices, err := srv.lookup(ctx, body, "profile", "profileId")
	if err != nil || choices != nil {
		return choices, err
	}
	return sources.Prepare(profile)
}

// prepare accepts an edited request, or Sources with a Profile.
func (srv *Server) prepare(ctx context.Context, body *s.Object) (any, error) {
	if body.Has("sources") {
		if err := only(body, "sources", "profile", "profileId"); err != nil {
			return nil, err
		}
		sources, err := research.ParseSources(get(body, "sources"))
		if err != nil {
			return nil, err
		}
		profile, err := srv.profile(body)
		if err != nil {
			return nil, err
		}
		return sources.Prepare(profile)
	}
	if err := only(body, "request", "profile", "profileId"); err != nil {
		return nil, err
	}
	request, err := requestInput(get(body, "request"))
	if err != nil {
		return nil, err
	}
	if request.Has("previousResultFile") {
		return nil, errors.New("Import the previous Result instead of using previousResultFile.")
	}
	documents, _ := request.Get("documents")
	resolved := make([]any, 0)
	for _, document := range documents.([]any) {
		object := document.(*s.Object)
		if object.Has("origin") {
			resolved = append(resolved, object)
			continue
		}
		var spec research.DocumentSpec
		if err := s.ToGo(object, &spec); err != nil {
			return nil, err
		}
		if spec.File != nil {
			return nil, errors.New("Upload or paste the text for " + spec.ID + ". The web app cannot read a filesystem reference.")
		}
		loaded, err := srv.config.Research.LoadDocument(ctx, spec, ".")
		if err != nil {
			return nil, err
		}
		resolved = append(resolved, s.FromGoValue(loaded))
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	request.Set("documents", resolved)
	// A request without its own rules is generated under the named Profile.
	if !request.Has("mechanicsDefinition") && (body.Has("profile") || body.Has("profileId")) {
		profile, err := srv.profile(body)
		if err != nil {
			return nil, err
		}
		applied, err := applyProfile(request, profile)
		if err != nil {
			return nil, err
		}
		return unit.Prepare(applied)
	}
	return unit.Prepare(request)
}

var requestFields = unit.RequestSchema.Omit("documents").Extend(s.F("previousResultFile", s.Optional(s.String().Min(1))))

// requestInput validates a request whose documents may still be explicit
// inputs (text or URL) instead of resolved documents.
func requestInput(value any) (*s.Object, error) {
	object, ok := research.WithRequestDefaults(value).(*s.Object)
	if !ok {
		return nil, errors.New("request: expected an object")
	}
	documents, ok := get(object, "documents").([]any)
	if !ok || len(documents) == 0 {
		return nil, errors.New("documents: expected at least one document")
	}
	rest := s.Clone(object).(*s.Object)
	rest.Delete("documents")
	parsed, issues := s.Parse(requestFields, rest)
	if len(issues) > 0 {
		return nil, &s.Error{Issues: issues}
	}
	out := parsed.(*s.Object)
	var checked []any
	for i, document := range documents {
		value, issues := s.Parse(unit.ResolvedDocumentSchema, document)
		if len(issues) > 0 {
			value, issues = s.Parse(research.DocumentSpecSchema, document)
		}
		if len(issues) > 0 {
			for j := range issues {
				issues[j].Path = append([]any{"documents", i}, issues[j].Path...)
			}
			return nil, &s.Error{Issues: issues}
		}
		checked = append(checked, value)
	}
	out.Set("documents", checked)
	return out, nil
}

// inspect identifies an opened file: a stored artifact kind, or a request.
// Editable requests may be incomplete; preparing validates them.
func inspect(value any, editable bool) (any, error) {
	if object, ok := value.(*s.Object); ok && object.Has("kind") {
		artifact, err := library.Inspect(value)
		if err != nil {
			return nil, err
		}
		return s.NewObject().Set("kind", artifact.Kind).Set("artifact", artifact.Value), nil
	}
	if editable {
		object, ok := research.WithRequestDefaults(value).(*s.Object)
		if !ok {
			return nil, errors.New("Expected a request object.")
		}
		if _, ok := get(object, "documents").([]any); !ok {
			return nil, errors.New("documents: expected an array")
		}
		if _, ok := get(object, "character").(*s.Object); !ok {
			return nil, errors.New("character: expected an object")
		}
		return s.NewObject().Set("kind", "request").Set("artifact", object), nil
	}
	request, err := requestInput(value)
	if err != nil {
		return nil, err
	}
	return s.NewObject().Set("kind", "request").Set("artifact", request), nil
}

// applyProfile sets an editable request's task, progression, Definition and
// rules document from a Profile, keeping everything else as it is.
func applyProfile(value any, profile unit.Profile) (any, error) {
	object, ok := value.(*s.Object)
	if !ok {
		return nil, errors.New("request: expected an object")
	}
	out := s.Clone(object).(*s.Object)
	progression := unit.DefinitionProgression(profile.MechanicsDefinition)
	out.Set("task", profile.Task).
		Set("progression", s.FromGoValue(progression)).
		Set("mechanicsDefinition", s.FromGoValue(profile.MechanicsDefinition))
	documents, _ := out.Get("documents")
	kept := []any{}
	list, _ := documents.([]any)
	for _, document := range list {
		id, _ := get(asObject(document), "id").(string)
		if !unit.IsProfileDocument(id) {
			kept = append(kept, document)
		}
	}
	out.Set("documents", append(kept, s.FromGoValue(profile.Rules)))
	return out, nil
}

func asObject(value any) *s.Object {
	object, _ := value.(*s.Object)
	if object == nil {
		return s.NewObject()
	}
	return object
}

func (srv *Server) generateIcon(ctx context.Context, body *s.Object) (any, error) {
	if err := only(body, "artifact", "iconKey", "model", "confirmed", "destination"); err != nil {
		return nil, err
	}
	key, _ := get(body, "iconKey").(string)
	requested, _ := get(body, "model").(string)
	destination, _ := get(body, "destination").(string)
	if confirmed, _ := get(body, "confirmed").(bool); !confirmed || key == "" || requested == "" || destination == "" || len(destination) > 4096 {
		return nil, errors.New("Confirm the icon, its model and its destination before generating.")
	}
	artifact, err := library.Inspect(get(body, "artifact"))
	if err != nil {
		return nil, err
	}
	candidate, ok := artifact.Candidate()
	var subject *render.IconSubject
	if ok {
		for _, entry := range render.IconSubjects(candidate) {
			if entry.Key == key {
				subject = &entry
				break
			}
		}
	}
	if subject == nil {
		return nil, fail(400, "INVALID_ICON", "Choose an icon belonging to this Unit.")
	}
	var images ImageGenerator = srv.config.TestImages
	if images == nil {
		if !srv.connection.state().Images.Ready {
			return nil, fail(400, "PROVIDER_REQUIRED", "Image generation requires a valid OpenRouter API key in Settings.")
		}
		client, err := srv.connection.images()
		if err != nil {
			return nil, err
		}
		images = client
	}
	if images.Model() != requested {
		return nil, fail(409, "IMAGE_MODEL_CHANGED", "The image model changed. Open the confirmation again.")
	}
	// Validate the destination before a potentially billable request.
	icons, err := srv.config.Library.Icons(artifact.Value)
	if err != nil {
		return nil, err
	}
	current := ""
	for _, icon := range icons.Icons {
		if icon.Key == key {
			current = icon.Path
		}
	}
	if current != destination {
		return nil, fail(409, "ICON_DESTINATION_CHANGED", "The icon destination changed. Reload the icon and confirm its new destination.")
	}
	srv.mu.Lock()
	if srv.iconsBusy[destination] {
		srv.mu.Unlock()
		return nil, fail(409, "BUSY", "This icon is already generating.")
	}
	srv.iconsBusy[destination] = true
	srv.mu.Unlock()
	defer func() {
		srv.mu.Lock()
		delete(srv.iconsBusy, destination)
		srv.mu.Unlock()
	}()
	image, err := images.Generate(ctx, render.ImagePrompt(candidate, *subject, 1024))
	if err != nil {
		return nil, err
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	saved, err := srv.config.Library.SaveIcon(artifact.Value, key, image.PNG, library.Receipt{Model: images.Model(), Usage: image.Usage})
	if err != nil {
		message := "The image was generated but could not be saved. Check the library folder before generating another image."
		return nil, &unit.ModelError{Message: message, Usage: image.Usage, Failure: &unit.Failure{Code: unit.CodeFailed, Message: message}}
	}
	out := s.NewObject().Set("icons", s.FromGoValue(saved)).Set("model", images.Model())
	if image.Usage != nil {
		out.Set("usage", s.FromGoValue(image.Usage))
	}
	return out, nil
}
