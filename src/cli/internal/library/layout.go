package library

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
	"golang.org/x/text/unicode/norm"
)

// Saved work is arranged by source and character:
//
//	<library>/<work>/<character>/character.json                 identity marker
//	<library>/<work>/<character>/<character>.<kind>.<id>.json   record
//	<library>/<work>/<character>/<character>.<kind>.<id>.md     unit render
//	<library>/<work>/<character>/assets/                        icons, receipts, portrait
//
// <work> and <character> are readable slugs of the character's work and
// name; <kind> is the stage (sources, prepared, draft, checked, result) and
// <id> the first 12 hex digits of the record's SHA-256 identity (all 64 when
// those collide). Stages and revisions therefore never share a file. The
// marker records the exact name and work: a character whose slug is taken by
// another identity gets the folder <character>-<hash>, never a shared one.
// Records saved before this layout stay readable at the root as
// unitlab-<id>.json, their assets under assets/unit-<hash>; Migrate moves
// them on request.

const (
	markerFile = "character.json"
	assetsDir  = "assets"
	slugRunes  = 48
)

var (
	recordName = regexp.MustCompile(`^.+\.(sources|prepared|draft|checked|result)\.([a-f0-9]{12}|[a-f0-9]{64})\.json$`)
	// Device names Windows reserves; a folder with such a name is unusable there.
	reservedNames = map[string]bool{"con": true, "prn": true, "aux": true, "nul": true, "assets": true,
		"com1": true, "com2": true, "com3": true, "com4": true, "com5": true, "com6": true, "com7": true, "com8": true, "com9": true,
		"lpt1": true, "lpt2": true, "lpt3": true, "lpt4": true, "lpt5": true, "lpt6": true, "lpt7": true, "lpt8": true, "lpt9": true}
)

// Slug is a readable path component: lowercase letters and digits of any
// script joined by hyphens, at most 48 characters. It never contains a
// separator, a dot or a control character, so it cannot leave its folder.
func Slug(text string) string {
	var b strings.Builder
	runes, pending := 0, false
	for _, r := range norm.NFKC.String(text) {
		if runes >= slugRunes {
			break
		}
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			separator := pending && runes > 0
			if separator && runes+2 > slugRunes {
				runes = slugRunes
				continue
			}
			if separator {
				b.WriteByte('-')
				runes++
			}
			pending = false
			b.WriteRune(unicode.ToLower(r))
			runes++
		default:
			pending = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	switch {
	case slug == "":
		return "unnamed"
	case reservedNames[slug] || strings.HasPrefix(slug, "unitlab"):
		return slug + "-folder"
	}
	return slug
}

// identity is what a character folder belongs to.
func identity(character unit.Character) string {
	return s.Stringify([]any{character.Name, character.Work})
}

// realDirectory checks that path is a directory and not a link. With
// create, it makes the directory first when it is missing.
func realDirectory(path string, create bool) error {
	if create {
		if err := os.Mkdir(path, 0o755); err != nil && !errors.Is(err, os.ErrExist) {
			return err
		}
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return errors.New("Library folders must be real directories, not symbolic links.")
	}
	return nil
}

// root is the library folder with links resolved; everything below it must
// be a real directory or regular file.
func (l *Library) root(create bool) (string, error) {
	if create {
		if err := os.MkdirAll(l.directory, 0o755); err != nil {
			return "", err
		}
	}
	return filepath.EvalSymlinks(l.directory)
}

// within reports whether path lies inside root.
func within(root, path string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != "." && !strings.HasPrefix(relative, "..") && !filepath.IsAbs(relative)
}

// readMarker returns the identity a character folder belongs to.
func readMarker(directory string) (string, error) {
	value, err := readManaged(filepath.Join(directory, markerFile))
	if err != nil {
		return "", err
	}
	var marker struct {
		Version int    `json:"unitLabCharacter"`
		Name    string `json:"name"`
		Work    string `json:"work"`
	}
	if s.ToGo(value, &marker) != nil || marker.Version != 1 {
		return "", errors.New("The character folder marker is not readable.")
	}
	return identity(unit.Character{Name: marker.Name, Work: marker.Work}), nil
}

// characterDirectory is the folder of a character under root: the slug of
// its name, or the slug with an identity hash when another character already
// owns that name. Without create it reports os.ErrNotExist when there is none.
func characterDirectory(root string, character unit.Character, create bool) (string, error) {
	work := filepath.Join(root, Slug(character.Work))
	if err := realDirectory(work, create); err != nil {
		return "", err
	}
	name := Slug(character.Name)
	id := identity(character)
	for _, candidate := range []string{name, name + "-" + hash(id)[:8]} {
		directory := filepath.Join(work, candidate)
		if !within(root, directory) {
			return "", errors.New("A character folder must stay inside the library.")
		}
		if info, err := os.Lstat(directory); err == nil && !info.IsDir() {
			// A link or file under this name is never used.
			continue
		}
		owner, err := readMarker(directory)
		switch {
		case err == nil && owner == id:
			return directory, realDirectory(directory, false)
		case err == nil:
			continue
		case !errors.Is(err, os.ErrNotExist):
			// A damaged marker or a link is never adopted.
			continue
		}
		if _, err := os.Lstat(directory); err == nil {
			// A folder without a marker belongs to someone else.
			continue
		}
		if !create {
			return "", os.ErrNotExist
		}
		if err := realDirectory(directory, true); err != nil {
			return "", err
		}
		marker := s.Indent(s.NewObject().Set("unitLabCharacter", 1.0).Set("name", character.Name).Set("work", character.Work)) + "\n"
		if err := publish(filepath.Join(directory, markerFile), []byte(marker)); err != nil && !errors.Is(err, os.ErrExist) {
			return "", err
		}
		if owner, err := readMarker(directory); err != nil || owner != id {
			continue
		}
		return directory, nil
	}
	return "", errors.New("No folder is free for this character in the library. Rename or move the conflicting folders.")
}

// recordFile names a record inside its character folder.
func recordFile(directory string, character unit.Character, kind, id string, full bool) string {
	short := id[:12]
	if full {
		short = id
	}
	return filepath.Join(directory, Slug(character.Name)+"."+kind+"."+short+".json")
}

// recordPaths lists every record file of the new layout, never through a link.
func recordPaths(root string) []string {
	var paths []string
	works, _ := os.ReadDir(root)
	for _, work := range works {
		if !work.IsDir() || work.Name() == assetsDir {
			continue
		}
		workPath := filepath.Join(root, work.Name())
		characters, _ := os.ReadDir(workPath)
		for _, character := range characters {
			if !character.IsDir() {
				continue
			}
			characterPath := filepath.Join(workPath, character.Name())
			files, _ := os.ReadDir(characterPath)
			for _, file := range files {
				if file.Type().IsRegular() && recordName.MatchString(file.Name()) {
					paths = append(paths, filepath.Join(characterPath, file.Name()))
				}
			}
		}
	}
	return paths
}

// legacyPath is where a record saved before the source and character layout lives.
func legacyPath(root, id string) string {
	return filepath.Join(root, "unitlab-"+id+".json")
}

// legacyAssets is the asset folder records used before this layout.
func legacyAssets(root string, character unit.Character) string {
	return filepath.Join(root, assetsDir, "unit-"+hash(s.Stringify([]any{character.Name, character.Work, character.Scope})))
}
