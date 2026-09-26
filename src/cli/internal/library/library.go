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

	"github.com/mardwerk/unit-generator/src/cli/internal/render"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
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

// Entry is one saved artifact in the listing. Path is the record file,
// relative to the library folder with forward slashes: work/character/file,
// or unitlab-<id>.json for a record saved before that layout.
type Entry struct {
	ID         string         `json:"id"`
	SavedAt    string         `json:"savedAt"`
	Kind       string         `json:"kind"`
	Character  unit.Character `json:"character"`
	ArtifactID string         `json:"artifactId"`
	Path       string         `json:"path"`
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

type record struct {
	id, savedAt, path string
	artifact          Artifact
}

// readRecord reads and verifies the record file at path. id, when given,
// must match.
func readRecord(path, id string) (record, error) {
	raw, err := readManaged(path)
	if err != nil {
		return record{}, err
	}
	object, ok := raw.(*s.Object)
	version, _ := object.Get("unitLabLibrary")
	savedID, _ := object.Get("id")
	savedAt, _ := object.Get("savedAt")
	value, hasArtifact := object.Get("artifact")
	at, _ := savedAt.(string)
	savedText, _ := savedID.(string)
	if !ok || version != 1.0 || !libraryID.MatchString(savedText) || (id != "" && savedText != id) || !hasArtifact || object.Len() != 4 || !isTimestamp(at) {
		return record{}, errors.New("Library document is not a UnitLab record.")
	}
	artifact, err := Inspect(value)
	if err != nil {
		return record{}, err
	}
	if artifact.ID() != savedText {
		return record{}, errors.New("Library document content does not match its saved identifier.")
	}
	if match := recordName.FindStringSubmatch(filepath.Base(path)); match != nil && (!strings.HasPrefix(savedText, match[2]) || match[1] != artifact.Kind) {
		return record{}, errors.New("Library document name does not match its content.")
	}
	return record{id: savedText, savedAt: at, path: path, artifact: artifact}, nil
}

// locate finds the record file of an ID: in the source and character layout
// or, for older records, at the library root.
func locate(root, id string) (string, error) {
	if !libraryID.MatchString(id) {
		return "", errors.New("Unknown library document.")
	}
	legacy := legacyPath(root, id)
	if _, err := os.Lstat(legacy); err == nil {
		return legacy, nil
	}
	damaged := ""
	for _, path := range recordPaths(root) {
		if match := recordName.FindStringSubmatch(filepath.Base(path)); match != nil && strings.HasPrefix(id, match[2]) {
			r, err := readRecord(path, "")
			if err == nil && r.id == id {
				return path, nil
			}
			if err != nil {
				damaged = path
			}
		}
	}
	if damaged != "" {
		// A damaged record under this identifier is reported, never replaced.
		return damaged, nil
	}
	return "", os.ErrNotExist
}

func (l *Library) read(id string) (record, error) {
	root, err := l.root(false)
	if err != nil {
		return record{}, err
	}
	path, err := locate(root, id)
	if err != nil {
		return record{}, err
	}
	return readRecord(path, id)
}

func isTimestamp(value string) bool {
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}

func (l *Library) entry(root string, r record) Entry {
	path, err := filepath.Rel(root, r.path)
	if err != nil {
		path = filepath.Base(r.path)
	}
	return Entry{ID: r.id, SavedAt: r.savedAt, Kind: r.artifact.Kind, Character: r.artifact.Character(), ArtifactID: r.artifact.artifactID(r.id), Path: filepath.ToSlash(path)}
}

func (l *Library) list() (State, error) {
	state := State{Directory: l.directory, Entries: []Entry{}}
	root, err := l.root(false)
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return State{}, err
	}
	files, err := os.ReadDir(root)
	if err != nil {
		return State{}, err
	}
	var paths []string
	for _, file := range files {
		if managedName.MatchString(file.Name()) {
			paths = append(paths, filepath.Join(root, file.Name()))
		}
	}
	seen := map[string]bool{}
	for _, path := range append(paths, recordPaths(root)...) {
		// Unrelated, damaged and linked files are never listed or deletable.
		r, err := readRecord(path, "")
		if err != nil || seen[r.id] {
			continue
		}
		if match := managedName.FindStringSubmatch(filepath.Base(path)); match != nil && match[1] != r.id {
			continue
		}
		seen[r.id] = true
		entry := l.entry(root, r)
		entry.Portrait = listingPortrait(root, r.artifact)
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

// Save stores an artifact once in its character's folder, with the Markdown
// render of a unit next to it. Saving the same artifact again returns the
// existing entry, wherever it is stored.
func (l *Library) Save(value any) (Entry, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	artifact, err := Inspect(value)
	if err != nil {
		return Entry{}, err
	}
	id := artifact.ID()
	root, err := l.root(true)
	if err != nil {
		return Entry{}, err
	}
	if path, err := locate(root, id); err == nil {
		existing, err := readRecord(path, id)
		if err != nil {
			return Entry{}, err
		}
		return l.entry(root, existing), nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return Entry{}, err
	}
	savedAt := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	return l.store(root, artifact, savedAt)
}

// store writes a new record for an artifact in its character folder.
func (l *Library) store(root string, artifact Artifact, savedAt string) (Entry, error) {
	id := artifact.ID()
	content := s.Indent(s.NewObject().Set("unitLabLibrary", 1.0).Set("id", id).Set("savedAt", savedAt).Set("artifact", artifact.Value)) + "\n"
	if len(content) > maxFileBytes {
		return Entry{}, errors.New("Library artifact exceeds 32 MB.")
	}
	character := artifact.Character()
	directory, err := characterDirectory(root, character, true)
	if err != nil {
		return Entry{}, err
	}
	path := recordFile(directory, character, artifact.Kind, id, false)
	if _, err := os.Lstat(path); err == nil {
		// Another record shares the short identifier: use the full one.
		path = recordFile(directory, character, artifact.Kind, id, true)
	}
	if _, ok := artifact.Candidate(); ok {
		if markdown, err := render.Markdown(artifact.Value, false); err == nil {
			// The render is a convenience copy; the JSON record is authoritative.
			_ = publish(strings.TrimSuffix(path, ".json")+".md", []byte(markdown))
		}
	}
	if err := publish(path, []byte(content)); err != nil {
		if errors.Is(err, os.ErrExist) {
			if existing, err := readRecord(path, id); err == nil {
				return l.entry(root, existing), nil
			}
		}
		return Entry{}, err
	}
	return l.entry(root, record{id: id, savedAt: savedAt, path: path, artifact: artifact}), nil
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
	var records []record
	for _, id := range selected {
		r, err := l.read(id)
		if err != nil {
			return State{}, err
		}
		records = append(records, r)
	}
	// The character folder, its marker and its icons stay.
	for _, r := range records {
		if err := os.Remove(r.path); err != nil {
			return State{}, err
		}
		_ = os.Remove(strings.TrimSuffix(r.path, ".json") + ".md")
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
