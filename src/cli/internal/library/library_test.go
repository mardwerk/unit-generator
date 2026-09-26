package library

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/parity"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// stages returns a prepared request, draft, checked draft and Result of one
// recorded planned-route review.
func stages(t *testing.T) []any {
	t.Helper()
	entries, err := parity.Entries("reviewDraft")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		result, ok := parity.Output(entry)
		checked := parity.Arg(entry, 0).(*s.Object)
		draft, _ := checked.Get("draft")
		candidate, _ := draft.(*s.Object).Get("candidate")
		if _, planned := candidate.(*s.Object).Get("blueprint"); !ok || !planned {
			continue
		}
		prepared, _ := draft.(*s.Object).Get("prepared")
		return []any{prepared, draft, checked, result}
	}
	t.Fatal("no recorded review")
	return nil
}

func open(t *testing.T) (*Library, string) {
	t.Helper()
	root := t.TempDir()
	library, err := Open(filepath.Join(root, "settings.json"), filepath.Join(root, "library"))
	if err != nil {
		t.Fatal(err)
	}
	return library, root
}

func TestLibrarySavesEveryStageOnceAndRestoresIt(t *testing.T) {
	library, root := open(t)
	state, err := library.State()
	if err != nil || len(state.Entries) != 0 || state.Directory != filepath.Join(root, "library") {
		t.Fatalf("state %+v %v", state, err)
	}
	artifacts := stages(t)
	for _, artifact := range artifacts {
		before := s.Stringify(artifact)
		var wait sync.WaitGroup
		entries := make([]Entry, 2)
		for i := range entries {
			wait.Add(1)
			go func() {
				defer wait.Done()
				entries[i], err = library.Save(artifact)
			}()
		}
		wait.Wait()
		if err != nil || entries[0] != entries[1] {
			t.Fatalf("entries %+v %+v %v", entries[0], entries[1], err)
		}
		kind, _ := artifact.(*s.Object).Get("kind")
		if entries[0].Kind != kind || entries[0].Character.Name == "" {
			t.Errorf("entry %+v", entries[0])
		}
		loaded, err := library.Load(entries[0].ID)
		// Saving keeps the content; keys follow the contract order.
		if err != nil || parity.Canonical(loaded) != parity.Canonical(artifact) || s.Stringify(artifact) != before {
			t.Errorf("load changed the %v artifact: %v", kind, err)
		}
	}
	reopened, _ := Open(filepath.Join(root, "settings.json"), filepath.Join(root, "library"))
	first, _ := library.State()
	second, _ := reopened.State()
	if s.Stringify(s.FromGoValue(first)) != s.Stringify(s.FromGoValue(second)) || len(first.Entries) != 4 {
		t.Errorf("reopened %d entries", len(second.Entries))
	}
	files, _ := filepath.Glob(filepath.Join(root, "library", "unitlab-*"))
	json, markdown := 0, 0
	for _, file := range files {
		switch filepath.Ext(file) {
		case ".json":
			json++
		case ".md":
			markdown++
			content, _ := os.ReadFile(file)
			if !strings.HasPrefix(string(content), "# ") {
				t.Errorf("%s is not a render", file)
			}
		}
	}
	if json != 4 || markdown != 3 {
		t.Errorf("%d records, %d renders", json, markdown)
	}
	extra := s.Clone(artifacts[0]).(*s.Object).Set("apiKey", "must-not-save")
	if _, err := library.Save(extra); err == nil {
		t.Error("saved an unknown field")
	}
	tampered := s.Clone(artifacts[0]).(*s.Object)
	request, _ := tampered.Get("request")
	request.(*s.Object).Set("task", "Changed without preparation.")
	if _, err := library.Save(tampered); err == nil || !strings.Contains(err.Error(), "hash") {
		t.Errorf("tampered: %v", err)
	}
	if _, err := library.Save(request); err == nil || !strings.Contains(err.Error(), "completed stage") {
		t.Errorf("request: %v", err)
	}
}

func TestConfigurePersistsAndLeavesTheOldLibrary(t *testing.T) {
	library, root := open(t)
	prepared := stages(t)[0]
	saved, err := library.Save(prepared)
	if err != nil {
		t.Fatal(err)
	}
	alternate := filepath.Join(root, "chosen", "units")
	state, err := library.Configure(alternate)
	if err != nil || state.Directory != alternate || len(state.Entries) != 0 {
		t.Fatalf("configured %+v %v", state, err)
	}
	reopened, _ := Open(filepath.Join(root, "settings.json"), filepath.Join(root, "library"))
	if reopened.Directory() != alternate {
		t.Errorf("reopened at %s", reopened.Directory())
	}
	if _, err := os.Stat(filepath.Join(root, "library", "unitlab-"+saved.ID+".json")); err != nil {
		t.Error("the old library changed")
	}
	_, _ = library.Save(prepared)
	if state, _ := library.Configure(filepath.Join(root, "library")); len(state.Entries) != 1 {
		t.Errorf("entries %d", len(state.Entries))
	}
	if _, err := library.Configure("  "); err == nil || library.Directory() != filepath.Join(root, "library") {
		t.Error("configured a blank folder")
	}
}

func TestDeleteTouchesOnlyIntactManagedDocuments(t *testing.T) {
	library, root := open(t)
	directory := filepath.Join(root, "library")
	saved, _ := library.Save(stages(t)[0])
	ordinary := filepath.Join(directory, "notes.json")
	_ = os.WriteFile(ordinary, []byte(`{"important":"keep"}`), 0o600)
	unknownID := strings.Repeat("0", 64)
	_ = os.WriteFile(filepath.Join(directory, "unitlab-"+unknownID+".json"), []byte(`{"unrelated":true}`), 0o600)
	external := filepath.Join(root, "external.json")
	_ = os.WriteFile(external, []byte("external content"), 0o600)
	linkedID := strings.Repeat("1", 64)
	_ = os.Symlink(external, filepath.Join(directory, "unitlab-"+linkedID+".json"))
	if state, _ := library.State(); len(state.Entries) != 1 || state.Entries[0].ID != saved.ID {
		t.Fatalf("state %+v", state)
	}
	for _, ids := range [][]string{{saved.ID, unknownID}, {linkedID}, {"../../notes.json"}} {
		if _, err := library.Delete(ids); err == nil {
			t.Errorf("deleted %v", ids)
		}
	}
	if _, err := library.Load("../external"); err == nil {
		t.Error("loaded outside the library")
	}
	if state, err := library.Delete([]string{saved.ID, saved.ID}); err != nil || len(state.Entries) != 0 {
		t.Errorf("delete %v", err)
	}
	for path, want := range map[string]string{ordinary: `{"important":"keep"}`, external: "external content"} {
		if content, _ := os.ReadFile(path); string(content) != want {
			t.Errorf("%s changed", path)
		}
	}
}

func TestTamperedDocumentsAreNeitherLoadedNorReplaced(t *testing.T) {
	library, root := open(t)
	prepared := stages(t)[0]
	entry, _ := library.Save(prepared)
	path := filepath.Join(root, "library", "unitlab-"+entry.ID+".json")
	content, _ := os.ReadFile(path)
	tampered := strings.Replace(string(content), `"id": "`+entry.ID+`"`, `"id": "`+strings.Repeat("2", 64)+`"`, 1)
	_ = os.WriteFile(path, []byte(tampered), 0o600)
	if state, _ := library.State(); len(state.Entries) != 0 {
		t.Error("listed a tampered document")
	}
	if _, err := library.Load(entry.ID); err == nil {
		t.Error("loaded a tampered document")
	}
	if _, err := library.Save(prepared); err == nil {
		t.Error("replaced a tampered document")
	}
	if _, err := library.Delete([]string{entry.ID}); err == nil {
		t.Error("deleted a tampered document")
	}
	if now, _ := os.ReadFile(path); string(now) != tampered {
		t.Error("the tampered file changed")
	}
}

var onePixel, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7VQAAAAASUVORK5CYII=")

func TestIconPathsAreContainedStableAndBounded(t *testing.T) {
	library, root := open(t)
	artifacts := stages(t)
	if icons, err := library.Icons(artifacts[0]); err != nil || len(icons.Icons) != 0 {
		t.Fatalf("prepared icons %+v %v", icons, err)
	}
	first, err := library.Icons(artifacts[1])
	if err != nil {
		t.Fatal(err)
	}
	if first.Icons[0].Key != "unit-portrait" || first.Icons[0].Kind != "portrait" || !strings.Contains(first.Icons[0].ImagePrompt, "character portrait") || !strings.Contains(first.Icons[1].CodexPrompt, first.Icons[1].Path) {
		t.Errorf("first icon %+v", first.Icons[0])
	}
	for _, icon := range first.Icons {
		if filepath.Dir(icon.Path) != first.Directory || !strings.HasSuffix(icon.Path, ".png") || icon.DataURL != "" || icon.Note != "" {
			t.Errorf("icon %+v", icon)
		}
	}
	for _, later := range artifacts[2:] {
		if again, _ := library.Icons(later); s.Stringify(s.FromGoValue(again.Icons[0].Path)) != s.Stringify(s.FromGoValue(first.Icons[0].Path)) {
			t.Error("icon paths changed across stages")
		}
	}
	_ = os.WriteFile(first.Icons[0].Path, onePixel, 0o600)
	_ = os.WriteFile(first.Icons[1].Path, []byte("not an image"), 0o600)
	external := filepath.Join(root, "private.png")
	_ = os.WriteFile(external, onePixel, 0o600)
	_ = os.Symlink(external, first.Icons[2].Path)
	_ = os.WriteFile(first.Icons[3].Path, make([]byte, 8*1024*1024+1), 0o600)
	loaded, _ := library.Icons(artifacts[1])
	if loaded.Icons[0].DataURL != "data:image/png;base64,"+base64.StdEncoding.EncodeToString(onePixel) ||
		!strings.Contains(loaded.Icons[1].Note, "PNG") || !strings.Contains(loaded.Icons[2].Note, "regular local PNG") || !strings.Contains(loaded.Icons[3].Note, "8 MB") {
		t.Errorf("notes %q %q %q", loaded.Icons[1].Note, loaded.Icons[2].Note, loaded.Icons[3].Note)
	}
	large := make([]byte, 2*1024*1024)
	copy(large, onePixel)
	for _, icon := range first.Icons[4:] {
		_ = os.WriteFile(icon.Path, large, 0o600)
	}
	bounded, _ := library.Icons(artifacts[1])
	total, limited := 0, false
	for _, icon := range bounded.Icons {
		total += len(icon.DataURL)
		limited = limited || strings.Contains(icon.Note, "combined 16 MB")
	}
	if !limited || total > 16*1024*1024 {
		t.Errorf("total %d limited %v", total, limited)
	}
	entry, _ := library.Save(artifacts[1])
	_, _ = library.Delete([]string{entry.ID})
	if content, _ := os.ReadFile(first.Icons[0].Path); !bytes.Equal(content, onePixel) {
		t.Error("deleting a record removed its icons")
	}
}

func TestIconsRejectLinkedAssetFolders(t *testing.T) {
	library, root := open(t)
	external := filepath.Join(root, "outside")
	_ = os.Mkdir(external, 0o755)
	_ = os.MkdirAll(filepath.Join(root, "library"), 0o755)
	_ = os.Symlink(external, filepath.Join(root, "library", "assets"))
	if _, err := library.Icons(stages(t)[1]); err == nil || !strings.Contains(err.Error(), "real directories") {
		t.Errorf("err %v", err)
	}
	if entries, _ := os.ReadDir(external); len(entries) != 0 {
		t.Error("wrote through the link")
	}
}

func TestSaveIconKeepsReceipts(t *testing.T) {
	library, _ := open(t)
	draft := stages(t)[1]
	cost := 0.004
	icons, err := library.SaveIcon(draft, "basic-attack", onePixel, Receipt{Model: "meta/muse-image", Usage: &unit.Usage{CostUSD: &cost}})
	if err != nil {
		t.Fatal(err)
	}
	if icons.Icons[1].DataURL == "" {
		t.Error("the saved icon is not shown")
	}
	receipts, _ := filepath.Glob(filepath.Join(icons.Directory, "image-*.json"))
	if len(receipts) != 1 {
		t.Errorf("receipts %d", len(receipts))
	}
	if _, err := library.SaveIcon(draft, "../escape", onePixel, Receipt{}); err == nil {
		t.Error("saved an icon without a destination")
	}
	if _, err := library.SaveIcon(draft, "basic-attack", []byte("not a png"), Receipt{}); err == nil {
		t.Error("saved a non-PNG")
	}
}

func TestProfilesAreValidatedAndNeverReplaceBundledOnes(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "profiles")
	profiles, _ := OpenProfiles(directory)
	state, err := profiles.List()
	if err != nil || len(state.Profiles) != 1 || !state.Profiles[0].BuiltIn {
		t.Fatalf("state %+v %v", state, err)
	}
	copy := unit.DefaultProfile()
	copy.ID, copy.Name, copy.Rules.ID = "quick-copy", "Quick copy", "profile:quick-copy"
	saved, err := profiles.Save(s.FromGoValue(copy))
	if err != nil || len(saved.Profiles) != 2 || saved.Profiles[1].Profile.ID != "quick-copy" || saved.Profiles[1].BuiltIn {
		t.Fatalf("saved %v", err)
	}
	if content, _ := os.ReadFile(filepath.Join(directory, "quick-copy.json")); !strings.Contains(string(content), `"id": "quick-copy"`) {
		t.Error("profile file")
	}
	if got, err := profiles.Get("quick-copy"); err != nil || got.Name != "Quick copy" {
		t.Errorf("get %v", err)
	}
	if _, err := profiles.Save(s.FromGoValue(unit.DefaultProfile())); err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Errorf("bundled: %v", err)
	}
	other := copy
	other.ID = "other-id"
	if _, err := profiles.Save(s.FromGoValue(other)); err == nil || !strings.Contains(err.Error(), "profile:other-id") {
		t.Errorf("other: %v", err)
	}
	invalid := s.FromGoValue(copy).(*s.Object)
	invalid.Delete("mechanicsDefinition")
	if _, err := profiles.Save(invalid); err == nil {
		t.Error("saved without a Definition")
	}
	if _, err := profiles.Delete(unit.DefaultProfile().ID); err == nil || !strings.Contains(err.Error(), "cannot be deleted") {
		t.Errorf("delete bundled: %v", err)
	}
	_ = os.WriteFile(filepath.Join(directory, "broken.json"), []byte("{"), 0o600)
	_ = os.Symlink(filepath.Join(directory, "quick-copy.json"), filepath.Join(directory, "linked.json"))
	if state, _ := profiles.List(); len(state.Profiles) != 2 {
		t.Errorf("listed %d", len(state.Profiles))
	}
	if state, err := profiles.Delete("quick-copy"); err != nil || len(state.Profiles) != 1 {
		t.Errorf("delete %v", err)
	}
	if _, err := profiles.Delete("quick-copy"); err == nil {
		t.Error("deleted twice")
	}
}
