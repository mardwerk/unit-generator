package library

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// Migration reports what Migrate moved and what it left in place.
type Migration struct {
	Records []string `json:"records"`
	Assets  []string `json:"assets"`
	Kept    []string `json:"kept"`
	State   State    `json:"state"`
}

// Migrate moves records saved before the source and character layout from
// the library root into their character folders, keeping each record's
// identity and saved time, and moves their asset folders' files beside
// them. A legacy file is removed only after its copy reads back intact; a
// file whose destination already exists, or whose character is unknown,
// stays where it is and is reported as kept. Nothing else is touched.
func (l *Library) Migrate() (Migration, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := Migration{Records: []string{}, Assets: []string{}, Kept: []string{}}
	root, err := l.root(false)
	if errors.Is(err, os.ErrNotExist) {
		out.State = State{Directory: l.directory, Entries: []Entry{}}
		return out, nil
	}
	if err != nil {
		return Migration{}, err
	}
	files, err := os.ReadDir(root)
	if err != nil {
		return Migration{}, err
	}
	// Asset folders are keyed by a hash of the exact name, work and scope.
	characters := map[string]Artifact{}
	for _, file := range files {
		match := managedName.FindStringSubmatch(file.Name())
		if match == nil {
			continue
		}
		legacy := filepath.Join(root, file.Name())
		r, err := readRecord(legacy, match[1])
		if err != nil {
			out.Kept = append(out.Kept, file.Name())
			continue
		}
		characters[filepath.Base(legacyAssets(root, r.artifact.Character()))] = r.artifact
		entry, err := l.moveRecord(root, r)
		if err != nil {
			out.Kept = append(out.Kept, file.Name())
			continue
		}
		out.Records = append(out.Records, entry.Path)
	}
	for _, path := range recordPaths(root) {
		if r, err := readRecord(path, ""); err == nil {
			characters[filepath.Base(legacyAssets(root, r.artifact.Character()))] = r.artifact
		}
	}
	assets := filepath.Join(root, assetsDir)
	if realDirectory(assets, false) == nil {
		folders, _ := os.ReadDir(assets)
		for _, folder := range folders {
			artifact, known := characters[folder.Name()]
			source := filepath.Join(assets, folder.Name())
			if !known || realDirectory(source, false) != nil {
				out.Kept = append(out.Kept, filepath.ToSlash(filepath.Join(assetsDir, folder.Name())))
				continue
			}
			moved, kept := moveAssets(root, source, artifact)
			out.Assets = append(out.Assets, moved...)
			out.Kept = append(out.Kept, kept...)
			_ = os.Remove(source)
		}
	}
	state, err := l.list()
	if err != nil {
		return Migration{}, err
	}
	out.State = state
	return out, nil
}

// moveRecord stores a legacy record in its character folder with its saved
// time, then removes the legacy record and its render.
func (l *Library) moveRecord(root string, r record) (Entry, error) {
	var entry Entry
	for _, path := range recordPaths(root) {
		if existing, err := readRecord(path, ""); err == nil && existing.id == r.id {
			// The same content is already in its character folder.
			entry = l.entry(root, existing)
		}
	}
	if entry.Path == "" {
		stored, err := l.store(root, r.artifact, r.savedAt)
		if err != nil {
			return Entry{}, err
		}
		entry = stored
	}
	copied, err := readRecord(filepath.Join(root, filepath.FromSlash(entry.Path)), r.id)
	if err != nil || s.Stringify(copied.artifact.Value) != s.Stringify(r.artifact.Value) {
		return Entry{}, errors.New("The migrated copy did not read back intact.")
	}
	if err := os.Remove(r.path); err != nil {
		return Entry{}, err
	}
	_ = os.Remove(strings.TrimSuffix(r.path, ".json") + ".md")
	return entry, nil
}

// moveAssets moves a legacy asset folder's regular files into the
// character's asset folder without replacing any file there.
func moveAssets(root, source string, artifact Artifact) (moved, kept []string) {
	destination, err := assetDirectory(root, artifact, true)
	files, _ := os.ReadDir(source)
	for _, file := range files {
		from := filepath.Join(source, file.Name())
		relative, _ := filepath.Rel(root, from)
		if err != nil || !file.Type().IsRegular() {
			kept = append(kept, filepath.ToSlash(relative))
			continue
		}
		to := filepath.Join(destination, file.Name())
		if os.Link(from, to) != nil {
			kept = append(kept, filepath.ToSlash(relative))
			continue
		}
		_ = os.Remove(from)
		target, _ := filepath.Rel(root, to)
		moved = append(moved, filepath.ToSlash(target))
	}
	return moved, kept
}
