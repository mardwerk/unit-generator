package library

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

var profileFile = regexp.MustCompile(`^([a-z0-9][a-z0-9-]{0,62})\.json$`)

// Profiles is the folder of saved Profiles (by default data/profiles),
// separate from generated runs. The bundled Profile is read-only.
type Profiles struct {
	mu        sync.Mutex
	directory string
}

// ProfileEntry is one Profile and whether it is bundled.
type ProfileEntry struct {
	Profile unit.Profile `json:"profile"`
	BuiltIn bool         `json:"builtIn"`
	// Progression is the path and tier layout the Profile's Definition allows.
	Progression unit.Progression `json:"progression"`
}

func entry(profile unit.Profile, builtIn bool) ProfileEntry {
	return ProfileEntry{Profile: profile, BuiltIn: builtIn, Progression: unit.DefinitionProgression(profile.MechanicsDefinition)}
}

// ProfilesState is the folder and every available Profile.
type ProfilesState struct {
	Directory string         `json:"directory"`
	Profiles  []ProfileEntry `json:"profiles"`
}

// Bundled are the read-only Profiles shipped with the Tool.
func Bundled() []unit.Profile { return []unit.Profile{unit.DefaultProfile()} }

func bundledID(id string) bool {
	for _, profile := range Bundled() {
		if profile.ID == id {
			return true
		}
	}
	return false
}

// OpenProfiles uses directory for saved Profiles; it need not exist yet.
func OpenProfiles(directory string) (*Profiles, error) {
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return nil, err
	}
	return &Profiles{directory: absolute}, nil
}

func (p *Profiles) file(id string) (string, error) {
	if !profileFile.MatchString(id + ".json") {
		return "", errors.New("Unknown Profile.")
	}
	return filepath.Join(p.directory, id+".json"), nil
}

func (p *Profiles) list() (ProfilesState, error) {
	state := ProfilesState{Directory: p.directory}
	for _, profile := range Bundled() {
		state.Profiles = append(state.Profiles, entry(profile, true))
	}
	files, err := os.ReadDir(p.directory)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return ProfilesState{}, err
	}
	var names []string
	for _, file := range files {
		names = append(names, file.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		match := profileFile.FindStringSubmatch(name)
		if match == nil || bundledID(match[1]) {
			continue
		}
		// Unrelated, damaged and linked files are not Profiles.
		raw, err := readManaged(filepath.Join(p.directory, name))
		if err != nil {
			continue
		}
		profile, err := unit.ParseProfile(raw)
		if err != nil || profile.ID != match[1] {
			continue
		}
		state.Profiles = append(state.Profiles, entry(profile, false))
	}
	return state, nil
}

// List returns the bundled and saved Profiles.
func (p *Profiles) List() (ProfilesState, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.list()
}

// Get returns one Profile by ID.
func (p *Profiles) Get(id string) (unit.Profile, error) {
	state, err := p.List()
	if err != nil {
		return unit.Profile{}, err
	}
	for _, entry := range state.Profiles {
		if entry.Profile.ID == id {
			return entry.Profile, nil
		}
	}
	return unit.Profile{}, errors.New("Unknown Profile " + s.Stringify(id) + ". List Profiles with `mardwerk-unit profiles`.")
}

// Save validates a Profile as preparing a request under it would, then
// stores it as <id>.json.
func (p *Profiles) Save(value any) (ProfilesState, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	profile, err := unit.ValidateProfile(value)
	if err != nil {
		return ProfilesState{}, err
	}
	if bundledID(profile.ID) {
		return ProfilesState{}, errors.New("Bundled Profiles are read-only. Save a copy under a new ID.")
	}
	if profile.Rules.ID != "profile:"+profile.ID {
		return ProfilesState{}, errors.New("A saved Profile's rules document must have the ID profile:" + profile.ID + ".")
	}
	path, err := p.file(profile.ID)
	if err != nil {
		return ProfilesState{}, err
	}
	if err := os.MkdirAll(p.directory, 0o755); err != nil {
		return ProfilesState{}, err
	}
	temporary := filepath.Join(p.directory, ".profile-"+unit.NewUUID()+".tmp")
	if err := os.WriteFile(temporary, []byte(s.Indent(profile)+"\n"), 0o600); err != nil {
		return ProfilesState{}, err
	}
	if err := os.Rename(temporary, path); err != nil {
		os.Remove(temporary)
		return ProfilesState{}, err
	}
	return p.list()
}

// Delete removes a saved Profile.
func (p *Profiles) Delete(id string) (ProfilesState, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if bundledID(id) {
		return ProfilesState{}, errors.New("Bundled Profiles cannot be deleted.")
	}
	path, err := p.file(strings.TrimSpace(id))
	if err != nil {
		return ProfilesState{}, err
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return ProfilesState{}, errors.New("Unknown Profile.")
	}
	if err := os.Remove(path); err != nil {
		return ProfilesState{}, err
	}
	return p.list()
}
