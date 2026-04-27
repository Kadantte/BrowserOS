package cmd

import (
	"strings"
	"testing"

	"github.com/fatih/color"
)

func TestRootUsageUsesColorAndCommandGroups(t *testing.T) {
	restore := forceColor(t)
	defer restore()

	usage := rootCmd.UsageString()

	for _, want := range []string{
		"\x1b[1;36mUsage:\x1b[22;0m",
		"\x1b[1;36mRun:\x1b[22;0m",
		"\x1b[92mstart          \x1b[0m Start BrowserOS dogfooding environment",
		"\x1b[2mUse \"browseros-dogfood [command] --help\" for more information.\x1b[22m",
	} {
		if !strings.Contains(usage, want) {
			t.Fatalf("missing %q in\n%s", want, usage)
		}
	}
}

func forceColor(t *testing.T) func() {
	t.Helper()

	original := color.NoColor
	color.NoColor = false
	styles := []*color.Color{
		headerStyle,
		commandStyle,
		hintStyle,
		successStyle,
		warnStyle,
		labelStyle,
		pathStyle,
		dimStyle,
	}
	for _, style := range styles {
		style.EnableColor()
	}
	return func() {
		color.NoColor = original
		for _, style := range styles {
			style.DisableColor()
		}
	}
}
