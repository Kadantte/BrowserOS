package workspace

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

// Detect finds the registered Chromium checkout that contains cwd.
func Detect(reg *Registry, cwd string) (Entry, error) {
	return DetectForCommand(reg, cwd, "browseros-patch diff")
}

// DetectForCommand finds the checkout for cwd and includes a command-specific
// named-checkout example when cwd is not registered.
func DetectForCommand(reg *Registry, cwd string, commandPath string) (Entry, error) {
	if len(reg.Workspaces) == 0 {
		return Entry{}, fmt.Errorf(`no Chromium checkouts registered; run "browseros-patch add <name> <path>"`)
	}
	abs, err := filepath.Abs(cwd)
	if err != nil {
		return Entry{}, err
	}
	clean := filepath.Clean(abs)
	var best Entry
	bestLen := -1
	for _, ws := range reg.Workspaces {
		base := filepath.Clean(ws.Path)
		if clean == base || strings.HasPrefix(clean, base+string(filepath.Separator)) {
			if len(base) > bestLen {
				best = ws
				bestLen = len(base)
			}
		}
	}
	if bestLen == -1 {
		return Entry{}, errors.New(detectErrorMessage(reg, clean, commandPath))
	}
	return best, nil
}

// Resolve resolves a checkout from --src, an explicit name, or cwd detection.
func Resolve(reg *Registry, name string, cwd string, src string) (Entry, error) {
	return ResolveForCommand(reg, name, cwd, src, "browseros-patch diff")
}

// ResolveForCommand resolves a checkout and tailors cwd detection errors for a
// specific command such as "browseros-patch diff".
func ResolveForCommand(reg *Registry, name string, cwd string, src string, commandPath string) (Entry, error) {
	if src != "" {
		path, err := NormalizeWorkspacePath(src)
		if err != nil {
			return Entry{}, err
		}
		return Entry{Name: filepath.Base(path), Path: path}, nil
	}
	if name != "" {
		return reg.Get(name)
	}
	return DetectForCommand(reg, cwd, commandPath)
}

func detectErrorMessage(reg *Registry, cleanCWD string, commandPath string) string {
	var builder strings.Builder
	builder.WriteString("not inside a registered Chromium checkout\n")
	builder.WriteString("cwd: " + cleanCWD + "\n")
	if resolved, err := filepath.EvalSymlinks(cleanCWD); err == nil && resolved != cleanCWD {
		builder.WriteString("resolved cwd: " + resolved + "\n")
	}
	builder.WriteString("registered checkouts:\n")
	for _, ws := range reg.Workspaces {
		builder.WriteString(fmt.Sprintf("  %s  %s\n", ws.Name, ws.Path))
	}
	builder.WriteString("try: " + namedCheckoutExample(reg, commandPath))
	return strings.TrimRight(builder.String(), "\n")
}

func namedCheckoutExample(reg *Registry, commandPath string) string {
	commandPath = strings.TrimSpace(commandPath)
	if commandPath == "" {
		commandPath = "browseros-patch diff"
	}
	if len(reg.Workspaces) == 0 {
		return commandPath + " <checkout>"
	}
	return commandPath + " " + reg.Workspaces[0].Name
}
