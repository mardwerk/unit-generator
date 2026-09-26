package library

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/image/draw"

	"github.com/mardwerk/unit-generator/internal/render"
	"github.com/mardwerk/unit-generator/internal/research"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

const (
	maxIconBytes    = 8 * 1024 * 1024
	maxEncodedBytes = 16 * 1024 * 1024
	maxPortraitJSON = 32_768
)

var pngSignature = []byte{137, 80, 78, 71, 13, 10, 26, 10}

func hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

// Icon is one icon destination, with its PNG when one exists and the
// prompts that can create it.
type Icon struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Kind        string `json:"kind"`
	Description string `json:"description"`
	Path        string `json:"path"`
	DataURL     string `json:"dataUrl,omitempty"`
	Note        string `json:"note,omitempty"`
	ImagePrompt string `json:"imagePrompt"`
	CodexPrompt string `json:"codexPrompt"`
}

// Icons is a unit's icon folder, its icons and its chosen portrait.
type Icons struct {
	Directory string                `json:"directory"`
	Icons     []Icon                `json:"icons"`
	Portrait  *unit.VisualReference `json:"portrait,omitempty"`
}

// unitDirectory is the asset folder of a character, shared by revisions.
func unitDirectory(library string, artifact Artifact, create bool) (string, error) {
	character := artifact.Character()
	id := hash(s.Stringify([]any{character.Name, character.Work, character.Scope}))
	if create {
		if err := os.MkdirAll(library, 0o755); err != nil {
			return "", err
		}
	}
	root, err := filepath.EvalSymlinks(library)
	if err != nil {
		return "", err
	}
	assets := filepath.Join(root, "assets")
	directory := filepath.Join(assets, "unit-"+id)
	for _, path := range []string{assets, directory} {
		if create {
			if err := os.Mkdir(path, 0o755); err != nil && !errors.Is(err, os.ErrExist) {
				return "", err
			}
		}
		info, err := os.Lstat(path)
		if err != nil {
			return "", err
		}
		if !info.IsDir() {
			return "", errors.New("Icon folders must be real directories, not symbolic links.")
		}
	}
	return directory, nil
}

// readPNG returns a regular PNG file's bytes, or nil when it is absent.
func readPNG(path string) ([]byte, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("The icon could not be read as a regular local PNG file.")
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("The icon must be a regular PNG file.")
	}
	if info.Size() > maxIconBytes {
		return nil, errors.New("The icon exceeds the 8 MB limit.")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(content) > maxIconBytes {
		return nil, errors.New("The icon changed while loading. Refresh to retry.")
	}
	if !bytes.HasPrefix(content, pngSignature) {
		return nil, errors.New("The icon file does not contain a PNG image.")
	}
	return content, nil
}

func (l *Library) icons(artifact Artifact) (Icons, error) {
	candidate, ok := artifact.Candidate()
	if !ok {
		return Icons{Directory: l.directory, Icons: []Icon{}}, nil
	}
	directory, err := unitDirectory(l.directory, artifact, true)
	if err != nil {
		return Icons{}, err
	}
	out := Icons{Directory: directory, Icons: []Icon{}, Portrait: portraitReference(l.directory, artifact)}
	encoded := 0
	seen := map[string]bool{}
	for _, subject := range render.IconSubjects(candidate) {
		if seen[subject.Key] {
			continue
		}
		seen[subject.Key] = true
		icon := Icon{Key: subject.Key, Label: subject.Label, Kind: subject.Kind, Description: subject.Description, Path: filepath.Join(directory, "icon-"+hash(subject.Key)+".png")}
		icon.ImagePrompt = render.ImagePrompt(candidate, subject, 512)
		icon.CodexPrompt = render.CodexIconPrompt(candidate, subject, icon.Path)
		content, err := readPNG(icon.Path)
		switch {
		case err != nil:
			icon.Note = err.Error()
		case content != nil:
			size := (len(content)+2)/3*4 + len("data:image/png;base64,")
			if encoded+size > maxEncodedBytes {
				icon.Note = "The icon preview exceeds the combined 16 MB limit."
			} else {
				icon.DataURL = "data:image/png;base64," + base64.StdEncoding.EncodeToString(content)
				encoded += size
			}
		}
		out.Icons = append(out.Icons, icon)
	}
	return out, nil
}

// Icons provisions a unit's icon destinations and loads existing PNGs.
func (l *Library) Icons(value any) (Icons, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	artifact, err := Inspect(value)
	if err != nil {
		return Icons{}, err
	}
	return l.icons(artifact)
}

// Receipt records one successful image generation.
type Receipt struct {
	Model string      `json:"model"`
	Usage *unit.Usage `json:"usage,omitempty"`
}

// SaveIcon stores a generated PNG at the icon's own destination. Callers
// never choose paths. Every receipt is kept, including replaced images.
func (l *Library) SaveIcon(value any, key string, picture []byte, receipt Receipt) (Icons, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	artifact, err := Inspect(value)
	if err != nil {
		return Icons{}, err
	}
	before, err := l.icons(artifact)
	if err != nil {
		return Icons{}, err
	}
	var icon *Icon
	for i := range before.Icons {
		if before.Icons[i].Key == key {
			icon = &before.Icons[i]
		}
	}
	if icon == nil {
		return Icons{}, errors.New("This Unit has no matching icon destination.")
	}
	if len(picture) > maxIconBytes || !bytes.HasPrefix(picture, pngSignature) {
		return Icons{}, errors.New("The generated icon must be a PNG under 8 MB.")
	}
	id := unit.NewUUID()
	record := s.NewObject().Set("id", id).Set("generatedAt", time.Now().UTC().Format("2006-01-02T15:04:05.000Z")).
		Set("key", key).Set("path", icon.Path).Set("model", receipt.Model)
	if receipt.Usage != nil {
		record.Set("usage", s.FromGoValue(receipt.Usage))
	}
	if err := publish(filepath.Join(before.Directory, "image-"+id+".json"), []byte(s.Indent(record)+"\n")); err != nil {
		return Icons{}, err
	}
	temporary := filepath.Join(before.Directory, ".image-"+id+".tmp")
	defer os.Remove(temporary)
	if err := os.WriteFile(temporary, picture, 0o600); err != nil {
		return Icons{}, err
	}
	if err := os.Rename(temporary, icon.Path); err != nil {
		return Icons{}, err
	}
	return l.icons(artifact)
}

func visualReferences(artifact Artifact) []unit.VisualReference {
	var references []unit.VisualReference
	for _, document := range artifact.Request().Documents {
		if document.VisualReferences != nil {
			references = append(references, *document.VisualReferences...)
		}
	}
	return references
}

// portraitReference is the chosen portrait, or the best-ranked source image.
func portraitReference(library string, artifact Artifact) *unit.VisualReference {
	if directory, err := unitDirectory(library, artifact, false); err == nil {
		path := filepath.Join(directory, "portrait.json")
		if info, err := os.Lstat(path); err == nil && info.Mode().IsRegular() && info.Size() <= maxPortraitJSON {
			if content, err := os.ReadFile(path); err == nil {
				if value, err := s.Decode(content); err == nil {
					var reference unit.VisualReference
					if s.ParseInto(unit.VisualReferenceSchema, value, &reference) == nil && research.SafeReference(reference) {
						return &reference
					}
				}
			}
		}
	}
	// A missing or damaged preference never hides source portraits.
	if ranked := research.RankedPortraits(visualReferences(artifact)); len(ranked) > 0 {
		return &ranked[0]
	}
	return nil
}

// Portrait returns the unit's portrait reference.
func (l *Library) Portrait(value any) (*unit.VisualReference, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	artifact, err := Inspect(value)
	if err != nil {
		return nil, err
	}
	return portraitReference(l.directory, artifact), nil
}

// SetPortrait chooses one of the character's source images as its portrait.
func (l *Library) SetPortrait(value any, referenceID string) (*unit.VisualReference, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	artifact, err := Inspect(value)
	if err != nil {
		return nil, err
	}
	var chosen *unit.VisualReference
	for _, reference := range visualReferences(artifact) {
		if reference.ID == referenceID && research.SafeReference(reference) {
			chosen = &reference
			break
		}
	}
	if chosen == nil {
		return nil, errors.New("Choose a portrait from this character’s source images.")
	}
	content := s.Stringify(s.FromGoValue(chosen)) + "\n"
	if len(content) > maxPortraitJSON {
		return nil, errors.New("Portrait preference exceeds its limit.")
	}
	directory, err := unitDirectory(l.directory, artifact, true)
	if err != nil {
		return nil, err
	}
	temporary := filepath.Join(directory, ".portrait-"+unit.NewUUID()+".tmp")
	defer os.Remove(temporary)
	if err := os.WriteFile(temporary, []byte(content), 0o600); err != nil {
		return nil, err
	}
	if err := os.Rename(temporary, filepath.Join(directory, "portrait.json")); err != nil {
		return nil, err
	}
	return chosen, nil
}

// listingPortrait is one small picture per listed unit: the portrait
// reference, else a thumbnail of a generated portrait icon.
func listingPortrait(library string, artifact Artifact) *Portrait {
	if reference := portraitReference(library, artifact); reference != nil {
		return &Portrait{URL: reference.URL, SourceURL: reference.SourceURL, Caption: reference.Caption}
	}
	directory, err := unitDirectory(library, artifact, false)
	if err != nil {
		return nil
	}
	content, err := readPNG(filepath.Join(directory, "icon-"+hash("unit-portrait")+".png"))
	if err != nil || content == nil {
		return nil
	}
	config, err := png.DecodeConfig(bytes.NewReader(content))
	if err != nil || config.Width*config.Height > 16*1024*1024 {
		return nil
	}
	picture, err := png.Decode(bytes.NewReader(content))
	if err != nil {
		return nil
	}
	var out bytes.Buffer
	if png.Encode(&out, cover(picture, 96)) != nil || out.Len() > 48*1024 {
		return nil
	}
	return &Portrait{URL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(out.Bytes()), Caption: artifact.Character().Name + " generated portrait"}
}

// cover scales and center-crops a picture to a size×size square.
func cover(picture image.Image, size int) image.Image {
	bounds := picture.Bounds()
	side := min(bounds.Dx(), bounds.Dy())
	crop := image.Rect(0, 0, side, side).Add(image.Pt(bounds.Min.X+(bounds.Dx()-side)/2, bounds.Min.Y+(bounds.Dy()-side)/2))
	out := image.NewNRGBA(image.Rect(0, 0, size, size))
	draw.CatmullRom.Scale(out, out.Bounds(), picture, crop, draw.Src, nil)
	return out
}
