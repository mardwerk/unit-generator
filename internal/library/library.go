package library

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mardwerk/unit-generator/internal/render"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

const maxFileBytes = 32_000_000

var (
	managedName = regexp.MustCompile(`^unitlab-([a-f0-9]{64})\.json$`)
	libraryID   = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// Library is one local folder of saved artifacts. Operations are serialized.
type Library struct {
	mu           sync.Mutex
	directory    string
	settingsFile string
}

// Portrait is the small picture shown in a library listing.
type Portrait struct {
	URL       string `json:"url"`
	Caption   string `json:"caption"`
	SourceURL string `json:"sourceUrl,omitempty"`
}

// Entry is one saved artifact in the listing.
type Entry struct {
	ID         string         `json:"id"`
	SavedAt    string         `json:"savedAt"`
	Kind       string         `json:"kind"`
	Character  unit.Character `json:"character"`
	ArtifactID string         `json:"artifactId"`
	Portrait   *Portrait      `json:"portrait,omitempty"`
}

// State is the library folder and its entries, newest first.
type State struct {
	Directory string  `json:"directory"`
	Entries   []Entry `json:"entries"`
}

// Open uses the folder recorded in settingsFile, or defaultDirectory.
func Open(settingsFile, defaultDirectory string) (*Library, error) {
	settings, err := filepath.Abs(settingsFile)
	if err != nil {
		return nil, err
	}
	directory, err := filepath.Abs(defaultDirectory)
	if err != nil {
		return nil, err
	}
	raw, err := readManaged(settings)
	switch {
	case errors.Is(err, os.ErrNotExist):
	case err != nil:
		return nil, errors.New("Cannot read the library settings: " + err.Error())
	default:
		var recorded struct {
			Version   int    `json:"unitLabSettings"`
			Directory string `json:"directory"`
		}
		if s.ToGo(raw, &recorded) != nil || recorded.Version != 1 || recorded.Directory == "" {
			return nil, errors.New("Cannot read the library settings: expected unitLabSettings 1 and a directory.")
		}
		if directory, err = filepath.Abs(recorded.Directory); err != nil {
			return nil, err
		}
	}
	return &Library{directory: directory, settingsFile: settings}, nil
}

// OpenAt uses directory regardless of recorded settings; Configure still
// records a new folder in settingsFile.
func OpenAt(directory, settingsFile string) (*Library, error) {
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return nil, err
	}
	settings, err := filepath.Abs(settingsFile)
	if err != nil {
		return nil, err
	}
	return &Library{directory: absolute, settingsFile: settings}, nil
}

// Directory is the current library folder.
func (l *Library) Directory() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.directory
}

// readManaged reads a regular JSON file, never through a symbolic link.
func readManaged(path string) (any, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > maxFileBytes {
		return nil, errors.New("Library documents must be regular JSON files under 32 MB.")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return s.Decode(content)
}

func (l *Library) filename(id, extension string) string {
	return filepath.Join(l.directory, "unitlab-"+id+extension)
}

type record struct {
	id, savedAt string
	artifact    Artifact
}

func (l *Library) read(id string) (record, error) {
	if !libraryID.MatchString(id) {
		return record{}, errors.New("Unknown library document.")
	}
	raw, err := readManaged(l.filename(id, ".json"))
	if err != nil {
		return record{}, err
	}
	object, ok := raw.(*s.Object)
	version, _ := object.Get("unitLabLibrary")
	savedID, _ := object.Get("id")
	savedAt, _ := object.Get("savedAt")
	value, hasArtifact := object.Get("artifact")
	at, _ := savedAt.(string)
	if !ok || version != 1.0 || savedID != id || !hasArtifact || object.Len() != 4 || !isTimestamp(at) {
		return record{}, errors.New("Library document is not a UnitLab record.")
	}
	artifact, err := Inspect(value)
	if err != nil {
		return record{}, err
	}
	if artifact.ID() != id {
		return record{}, errors.New("Library document content does not match its saved identifier.")
	}
	return record{id: id, savedAt: at, artifact: artifact}, nil
}

func isTimestamp(value string) bool {
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}

func (l *Library) entry(r record) Entry {
	return Entry{ID: r.id, SavedAt: r.savedAt, Kind: r.artifact.Kind, Character: r.artifact.Character(), ArtifactID: r.artifact.artifactID(r.id)}
}

func (l *Library) list() (State, error) {
	state := State{Directory: l.directory, Entries: []Entry{}}
	files, err := os.ReadDir(l.directory)
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return State{}, err
	}
	for _, file := range files {
		match := managedName.FindStringSubmatch(file.Name())
		if match == nil {
			continue
		}
		// Unrelated, damaged and linked files are never listed or deletable.
		r, err := l.read(match[1])
		if err != nil {
			continue
		}
		entry := l.entry(r)
		entry.Portrait = listingPortrait(l.directory, r.artifact)
		state.Entries = append(state.Entries, entry)
	}
	sort.SliceStable(state.Entries, func(i, j int) bool {
		a, b := state.Entries[i], state.Entries[j]
		if a.SavedAt != b.SavedAt {
			return a.SavedAt > b.SavedAt
		}
		return a.ID < b.ID
	})
	return state, nil
}

// State lists the library.
func (l *Library) State() (State, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.list()
}

// Save stores an artifact once, with the Markdown render of a unit next to
// it. Saving the same artifact again returns the existing entry.
func (l *Library) Save(value any) (Entry, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	artifact, err := Inspect(value)
	if err != nil {
		return Entry{}, err
	}
	id := artifact.ID()
	if existing, err := l.read(id); err == nil {
		return l.entry(existing), nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return Entry{}, err
	}
	r := record{id: id, savedAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), artifact: artifact}
	content := s.Indent(s.NewObject().Set("unitLabLibrary", 1.0).Set("id", id).Set("savedAt", r.savedAt).Set("artifact", artifact.Value)) + "\n"
	if len(content) > maxFileBytes {
		return Entry{}, errors.New("Library artifact exceeds 32 MB.")
	}
	if err := os.MkdirAll(l.directory, 0o755); err != nil {
		return Entry{}, err
	}
	if _, ok := artifact.Candidate(); ok {
		if markdown, err := render.Markdown(artifact.Value, false); err == nil {
			// The render is a convenience copy; the JSON record is authoritative.
			_ = publish(l.filename(id, ".md"), []byte(markdown))
		}
	}
	if err := publish(l.filename(id, ".json"), []byte(content)); err != nil {
		if errors.Is(err, os.ErrExist) {
			if existing, err := l.read(id); err == nil {
				return l.entry(existing), nil
			}
		}
		return Entry{}, err
	}
	return l.entry(r), nil
}

// publish writes a complete file under its final name without replacing an
// existing one.
func publish(path string, content []byte) error {
	temporary := filepath.Join(filepath.Dir(path), ".unitlab-"+unit.NewUUID()+".tmp")
	file, err := os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	defer os.Remove(temporary)
	if _, err := file.Write(content); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Link(temporary, path)
}

// Load returns a saved artifact.
func (l *Library) Load(id string) (any, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	r, err := l.read(id)
	if err != nil {
		return nil, err
	}
	return r.artifact.Value, nil
}

// Delete removes saved artifacts after validating every one of them.
func (l *Library) Delete(ids []string) (State, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(ids) > 10_000 {
		return State{}, errors.New("Delete at most 10000 documents at once.")
	}
	seen := map[string]bool{}
	var selected []string
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			selected = append(selected, id)
		}
	}
	for _, id := range selected {
		if _, err := l.read(id); err != nil {
			return State{}, err
		}
	}
	for _, id := range selected {
		if err := os.Remove(l.filename(id, ".json")); err != nil {
			return State{}, err
		}
		_ = os.Remove(l.filename(id, ".md"))
	}
	return l.list()
}

// Configure moves the library to another folder for this and later runs.
// Existing files stay where they are.
func (l *Library) Configure(directory string) (State, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	supplied := strings.TrimSpace(directory)
	if supplied == "" || len(supplied) > 4096 {
		return State{}, errors.New("Enter a library folder of at most 4096 characters.")
	}
	absolute, err := filepath.Abs(supplied)
	if err != nil {
		return State{}, err
	}
	if err := os.MkdirAll(absolute, 0o755); err != nil {
		return State{}, err
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return State{}, err
	}
	if err := os.MkdirAll(filepath.Dir(l.settingsFile), 0o755); err != nil {
		return State{}, err
	}
	temporary := l.settingsFile + "." + unit.NewUUID() + ".tmp"
	content := s.Indent(s.NewObject().Set("unitLabSettings", 1.0).Set("directory", canonical)) + "\n"
	if err := os.WriteFile(temporary, []byte(content), 0o600); err != nil {
		return State{}, err
	}
	if err := os.Rename(temporary, l.settingsFile); err != nil {
		os.Remove(temporary)
		return State{}, err
	}
	l.directory = canonical
	return l.list()
}
