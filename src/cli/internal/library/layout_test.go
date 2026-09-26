package library

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/fixture"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// preparedFor prepares the fixture request for another character identity.
func preparedFor(t *testing.T, name, work string) any {
	t.Helper()
	request, err := fixture.Request()
	if err != nil {
		t.Fatal(err)
	}
	request.Character.Name, request.Character.Work = name, work
	prepared, err := unit.Prepare(s.FromGoValue(unit.ApplyProfile(request, unit.DefaultProfile())))
	if err != nil {
		t.Fatal(err)
	}
	return s.FromGoValue(prepared)
}

func TestSlugsAreReadableAndCannotLeaveTheirFolder(t *testing.T) {
	for input, want := range map[string]string{
		"Tatsuya Shiba":                      "tatsuya-shiba",
		"The Irregular at Magic High School": "the-irregular-at-magic-high-school",
		"Monkey D. Luffy":                    "monkey-d-luffy",
		"司波 達也":                              "司波-達也",
		"Pokémon":                            "pokémon",
		"../../etc/passwd":                   "etc-passwd",
		"..":                                 "unnamed",
		"   ":                                "unnamed",
		`C:\Windows\System32`:                "c-windows-system32",
		"CON":                                "con-folder",
		"Assets":                             "assets-folder",
		"unitlab":                            "unitlab-folder",
	} {
		if got := Slug(input); got != want {
			t.Errorf("Slug(%q) = %q, want %q", input, got, want)
		}
	}
	if got := Slug(strings.Repeat("abc ", 40)); len([]rune(got)) > 48 || strings.HasSuffix(got, "-") {
		t.Errorf("long slug %q", got)
	}
}

// A saved unit is found under its work and character with readable names,
// and its icons and portrait choice live in the same folder.
func TestRecordsAreArrangedBySourceAndCharacter(t *testing.T) {
	library, root := open(t)
	built, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	entry, err := library.Save(s.FromGoValue(built.Result))
	if err != nil {
		t.Fatal(err)
	}
	want := "bloons-td-6/dart-monkey/dart-monkey.result." + entry.ID[:12] + ".json"
	if entry.Path != want {
		t.Fatalf("saved at %s, want %s", entry.Path, want)
	}
	folder := filepath.Join(root, "library", "bloons-td-6", "dart-monkey")
	for _, name := range []string{filepath.Base(want), strings.TrimSuffix(filepath.Base(want), ".json") + ".md", "character.json"} {
		if _, err := os.Stat(filepath.Join(folder, name)); err != nil {
			t.Errorf("%s is missing", name)
		}
	}
	marker, _ := os.ReadFile(filepath.Join(folder, "character.json"))
	if !strings.Contains(string(marker), `"name": "Dart Monkey"`) || !strings.Contains(string(marker), `"work": "Bloons TD 6"`) {
		t.Errorf("marker %s", marker)
	}
	icons, err := library.Icons(s.FromGoValue(built.Result))
	if err != nil || icons.Directory != filepath.Join(folder, "assets") {
		t.Fatalf("icons in %s: %v", icons.Directory, err)
	}
	for _, stage := range built.Values()[:3] {
		saved, err := library.Save(stage)
		if err != nil || !strings.HasPrefix(saved.Path, "bloons-td-6/dart-monkey/dart-monkey.") {
			t.Errorf("stage saved at %s: %v", saved.Path, err)
		}
	}
	state, _ := library.State()
	if len(state.Entries) != 4 {
		t.Errorf("%d entries", len(state.Entries))
	}
}

// Characters with one name in different works, and names that normalize
// alike in one work, never share a folder.
func TestSimilarNamesNeverShareAFolder(t *testing.T) {
	library, root := open(t)
	cases := []struct{ name, work, folder string }{
		{"Dart Monkey", "Bloons TD 6", "bloons-td-6/dart-monkey"},
		{"Dart Monkey", "Bloons TD 5", "bloons-td-5/dart-monkey"},
		{"Dart-Monkey!", "Bloons TD 6", "bloons-td-6/dart-monkey-"},
		{"DART MONKEY", "Bloons TD 6", "bloons-td-6/dart-monkey-"},
	}
	folders := map[string]string{}
	for _, test := range cases {
		entry, err := library.Save(preparedFor(t, test.name, test.work))
		if err != nil {
			t.Fatal(err)
		}
		folder := filepath.Dir(entry.Path)
		if !strings.HasPrefix(folder, test.folder) {
			t.Errorf("%s (%s) saved in %s", test.name, test.work, folder)
		}
		if other, taken := folders[folder]; taken {
			t.Errorf("%s shares %s with %s", test.name, folder, other)
		}
		folders[folder] = test.name
		loaded, err := library.Load(entry.ID)
		character, _ := loaded.(*s.Object).Get("request")
		if err != nil || !strings.Contains(s.Stringify(character), `"name":"`+test.name+`"`) {
			t.Errorf("load %s: %v", test.name, err)
		}
		marker, _ := os.ReadFile(filepath.Join(root, "library", filepath.FromSlash(folder), "character.json"))
		if !strings.Contains(string(marker), s.Stringify(test.name)) {
			t.Errorf("marker of %s: %s", folder, marker)
		}
	}
	// A folder without a marker is never adopted.
	_ = os.MkdirAll(filepath.Join(root, "library", "unknown-work", "someone"), 0o755)
	entry, err := library.Save(preparedFor(t, "Someone", "Unknown Work"))
	if err != nil || !strings.HasPrefix(entry.Path, "unknown-work/someone-") {
		t.Errorf("adopted a foreign folder: %s %v", entry.Path, err)
	}
}

// Revisions and stages of one character get their own files.
func TestRevisionsAndStagesNeverOverwriteEachOther(t *testing.T) {
	library, root := open(t)
	built, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	first, _ := library.Save(s.FromGoValue(built.Result))
	second := built.Result
	second.ID = "00000000-0000-4000-8000-00000000abcd"
	revised, err := library.Save(s.FromGoValue(second))
	if err != nil || revised.ID == first.ID || revised.Path == first.Path || filepath.Dir(revised.Path) != filepath.Dir(first.Path) {
		t.Fatalf("revision %+v %v", revised, err)
	}
	files, _ := filepath.Glob(filepath.Join(root, "library", "bloons-td-6", "dart-monkey", "dart-monkey.result.*.json"))
	if len(files) != 2 {
		t.Errorf("%d result files", len(files))
	}
	// A record whose short identifier is taken gets its full identifier.
	third := built.Result
	third.ID = "00000000-0000-4000-8000-00000000abce"
	value := s.FromGoValue(third)
	artifact, _ := Inspect(value)
	directory := filepath.Join(root, "library", "bloons-td-6", "dart-monkey")
	_ = os.WriteFile(recordFile(directory, artifact.Character(), "result", artifact.ID(), false), []byte("{}"), 0o600)
	if _, err := library.Save(value); err == nil {
		t.Error("saved over a damaged record with the same identifier")
	}
}

// Hostile names cannot place a file outside the library.
func TestHostileNamesStayInsideTheLibrary(t *testing.T) {
	library, root := open(t)
	for _, test := range []struct{ name, work string }{
		{"../../../escape", "../../outside"},
		{"/etc/passwd", "/"},
		{"..", "."},
		{"a\\..\\..\\b", "C:\\Temp"},
	} {
		entry, err := library.Save(preparedFor(t, test.name, test.work))
		if err != nil {
			t.Fatalf("%q: %v", test.name, err)
		}
		path := filepath.Join(root, "library", filepath.FromSlash(entry.Path))
		if !within(filepath.Join(root, "library"), path) || strings.Contains(entry.Path, "..") {
			t.Errorf("%q saved at %s", test.name, entry.Path)
		}
	}
	outside, _ := filepath.Glob(filepath.Join(root, "*"))
	for _, path := range outside {
		if base := filepath.Base(path); base != "library" && base != "settings.json" {
			t.Errorf("wrote %s outside the library", path)
		}
	}
}

// A linked character folder is never used.
func TestLinkedCharacterFoldersAreRefused(t *testing.T) {
	library, root := open(t)
	external := filepath.Join(root, "outside")
	_ = os.MkdirAll(external, 0o755)
	_ = os.WriteFile(filepath.Join(external, "character.json"), []byte(`{"unitLabCharacter":1,"name":"Dart Monkey","work":"Bloons TD 6"}`), 0o600)
	_ = os.MkdirAll(filepath.Join(root, "library", "bloons-td-6"), 0o755)
	_ = os.Symlink(external, filepath.Join(root, "library", "bloons-td-6", "dart-monkey"))
	entry, err := library.Save(stages(t)[0])
	if err != nil || !strings.HasPrefix(entry.Path, "bloons-td-6/dart-monkey-") {
		t.Errorf("saved at %s: %v", entry.Path, err)
	}
	if files, _ := os.ReadDir(external); len(files) != 1 {
		t.Error("wrote through the link")
	}
}

// Records and assets saved before the layout stay readable; Migrate moves
// them only on request and keeps what it cannot place.
func TestLegacyRecordsStayReadableAndMigrateOnRequest(t *testing.T) {
	library, root := open(t)
	directory := filepath.Join(root, "library")
	_ = os.MkdirAll(directory, 0o755)
	built, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	value := s.FromGoValue(built.Result)
	artifact, _ := Inspect(value)
	id := artifact.ID()
	savedAt := "2026-09-01T10:00:00.000Z"
	record := s.Indent(s.NewObject().Set("unitLabLibrary", 1.0).Set("id", id).Set("savedAt", savedAt).Set("artifact", artifact.Value)) + "\n"
	legacy := filepath.Join(directory, "unitlab-"+id+".json")
	_ = os.WriteFile(legacy, []byte(record), 0o600)
	_ = os.WriteFile(filepath.Join(directory, "unitlab-"+id+".md"), []byte("# Dart Monkey\n"), 0o600)
	assets := legacyAssets(directory, artifact.Character())
	_ = os.MkdirAll(assets, 0o755)
	portrait := "icon-" + hash("unit-portrait") + ".png"
	var picture bytes.Buffer
	_ = png.Encode(&picture, image.NewGray(image.Rect(0, 0, 2, 2)))
	_ = os.WriteFile(filepath.Join(assets, portrait), picture.Bytes(), 0o600)
	unknown := filepath.Join(directory, "assets", "unit-"+strings.Repeat("9", 64))
	_ = os.MkdirAll(unknown, 0o755)
	_ = os.WriteFile(filepath.Join(unknown, "keep.png"), onePixel, 0o600)
	_ = os.WriteFile(filepath.Join(directory, "notes.txt"), []byte("mine"), 0o600)

	state, _ := library.State()
	if len(state.Entries) != 1 || state.Entries[0].Path != "unitlab-"+id+".json" || state.Entries[0].Portrait == nil {
		t.Fatalf("legacy listing %+v", state.Entries)
	}
	if loaded, err := library.Load(id); err != nil || s.Canonical(loaded) != s.Canonical(value) {
		t.Errorf("legacy load: %v", err)
	}
	if again, err := library.Save(value); err != nil || again.Path != "unitlab-"+id+".json" {
		t.Errorf("saving a legacy artifact again: %+v %v", again, err)
	}
	icons, err := library.Icons(value)
	if err != nil || icons.Icons[0].DataURL != "data:image/png;base64,"+base64.StdEncoding.EncodeToString(picture.Bytes()) || !strings.HasPrefix(icons.Icons[0].Path, filepath.Join(directory, "bloons-td-6", "dart-monkey", "assets")) {
		t.Fatalf("legacy icon %+v %v", icons.Icons[0], err)
	}

	migration, err := library.Migrate()
	if err != nil {
		t.Fatal(err)
	}
	moved := "bloons-td-6/dart-monkey/dart-monkey.result." + id[:12] + ".json"
	if len(migration.Records) != 1 || migration.Records[0] != moved || len(migration.Assets) != 1 {
		t.Fatalf("migration %+v", migration)
	}
	if len(migration.State.Entries) != 1 || migration.State.Entries[0].SavedAt != savedAt || migration.State.Entries[0].Path != moved {
		t.Errorf("migrated entries %+v", migration.State.Entries)
	}
	for _, gone := range []string{legacy, strings.TrimSuffix(legacy, ".json") + ".md", assets} {
		if _, err := os.Stat(gone); !os.IsNotExist(err) {
			t.Errorf("%s remains", gone)
		}
	}
	if content, _ := os.ReadFile(filepath.Join(directory, "bloons-td-6", "dart-monkey", "assets", portrait)); !bytes.Equal(content, picture.Bytes()) {
		t.Error("the icon did not move")
	}
	for _, kept := range []string{filepath.Join(unknown, "keep.png"), filepath.Join(directory, "notes.txt")} {
		if _, err := os.Stat(kept); err != nil {
			t.Errorf("%s was touched", kept)
		}
	}
	if again, err := library.Migrate(); err != nil || len(again.Records) != 0 || len(again.State.Entries) != 1 {
		t.Errorf("second migration %+v %v", again, err)
	}
}
