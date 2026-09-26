package main

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// options are the parsed flags. Flags may appear anywhere.
type options struct {
	output, profile, profiles, library, previous, feedback string
	provider, model, reasoning, codex, evidenceDir         string
	timeout                                                time.Duration
	choice, port                                           int
	tiers                                                  string
	repairs                                                *int
	details, help                                          bool
	set                                                    map[string]bool
}

var valued = map[string]bool{
	"output": true, "profile": true, "profiles": true, "library": true, "previous": true, "feedback": true,
	"provider": true, "model": true, "reasoning": true, "timeout": true, "codex": true, "evidence-dir": true,
	"choice": true, "tiers": true, "repairs": true, "port": true,
}

var switches = map[string]bool{"details": true, "help": true}

// parse splits arguments into positionals and flags.
func parse(args []string) ([]string, options, error) {
	o := options{set: map[string]bool{}}
	var positionals []string
	values := map[string]string{}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			positionals = append(positionals, args[i+1:]...)
			break
		}
		if !strings.HasPrefix(arg, "-") || arg == "-" {
			positionals = append(positionals, arg)
			continue
		}
		name, value, hasValue := strings.Cut(strings.TrimLeft(arg, "-"), "=")
		switch name {
		case "o":
			name = "output"
		case "h":
			name = "help"
		}
		switch {
		case switches[name]:
			if hasValue {
				return nil, o, errors.New("--" + name + " takes no value.")
			}
		case valued[name]:
			if !hasValue {
				if i+1 >= len(args) {
					return nil, o, errors.New("--" + name + " needs a value.")
				}
				i++
				value = args[i]
			}
			values[name] = value
		default:
			return nil, o, errors.New("Unknown option " + arg + ". Run mardwerk-unit --help.")
		}
		if o.set[name] {
			return nil, o, errors.New("--" + name + " is given twice.")
		}
		o.set[name] = true
	}
	o.output, o.profile, o.profiles, o.library = values["output"], values["profile"], values["profiles"], values["library"]
	o.previous, o.feedback, o.provider, o.model = values["previous"], values["feedback"], values["provider"], values["model"]
	o.reasoning, o.codex, o.evidenceDir, o.tiers = values["reasoning"], values["codex"], values["evidence-dir"], values["tiers"]
	o.details, o.help = o.set["details"], o.set["help"]
	if value, ok := values["timeout"]; ok {
		seconds, err := strconv.ParseFloat(value, 64)
		if err != nil || seconds <= 0 || seconds*1000 > 2_147_483_647 {
			return nil, o, errors.New("--timeout must be a positive number of seconds within the timer limit.")
		}
		o.timeout = time.Duration(seconds * float64(time.Second))
	}
	if value, ok := values["choice"]; ok {
		if !regexp.MustCompile(`^[1-9][0-9]*$`).MatchString(value) {
			return nil, o, errors.New("--choice requires a positive character ID.")
		}
		o.choice, _ = strconv.Atoi(value)
	}
	if value, ok := values["repairs"]; ok {
		if !regexp.MustCompile(`^[0-2]$`).MatchString(value) {
			return nil, o, errors.New("--repairs must be 0, 1 or 2.")
		}
		n, _ := strconv.Atoi(value)
		o.repairs = &n
	}
	o.port = 4317
	if value, ok := values["port"]; ok {
		port, err := strconv.Atoi(value)
		if err != nil || port < 1 || port > 65535 {
			return nil, o, errors.New("--port must be an integer from 1 to 65535.")
		}
		o.port = port
	}
	return positionals, o, nil
}

// allowed lists, per command, the options it accepts beyond --output
// and --help.
var allowed = map[string][]string{
	"research":   {"choice"},
	"prepare":    {"profile", "profiles", "previous", "feedback"},
	"generate":   {"profile", "profiles", "choice", "provider", "model", "reasoning", "timeout", "codex", "evidence-dir", "repairs"},
	"author":     {"profile", "profiles", "previous", "feedback", "provider", "model", "reasoning", "timeout", "codex", "evidence-dir", "repairs"},
	"edit":       {"feedback", "provider", "model", "reasoning", "timeout", "codex", "evidence-dir", "repairs"},
	"draft":      {"provider", "model", "reasoning", "timeout", "codex", "evidence-dir", "repairs"},
	"check":      {},
	"review":     {"provider", "model", "reasoning", "timeout", "codex", "evidence-dir"},
	"render":     {"details"},
	"build":      {"tiers"},
	"inspect":    {},
	"definition": {},
	"profiles":   {"profiles"},
	"library":    {"library"},
	"serve":      {"port", "provider", "model", "profiles", "library"},
}

func (o options) check(command string) error {
	permitted := map[string]bool{"output": command != "serve", "help": true}
	for _, name := range allowed[command] {
		permitted[name] = true
	}
	for name := range o.set {
		if !permitted[name] {
			return errors.New("--" + name + " does not apply to " + command + ".")
		}
	}
	if command == "build" && !regexp.MustCompile(`^[0-5],[0-5],[0-5]$`).MatchString(o.tiers) {
		return errors.New("--tiers A,B,C is required for build, with three tiers from 0 to 5.")
	}
	if command == "edit" && strings.TrimSpace(o.feedback) == "" {
		return errors.New("edit needs --feedback describing the requested changes.")
	}
	return nil
}
