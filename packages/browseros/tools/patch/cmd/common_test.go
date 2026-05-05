package cmd

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/browseros-ai/BrowserOS/packages/browseros/tools/patch/internal/app"
	"github.com/browseros-ai/BrowserOS/packages/browseros/tools/patch/internal/workspace"
	"github.com/spf13/cobra"
)

func TestCommandProgressWritesHumanUpdatesToStderr(t *testing.T) {
	oldJSONOut := jsonOut
	t.Cleanup(func() {
		jsonOut = oldJSONOut
	})
	jsonOut = false

	var stderr bytes.Buffer
	cmd := &cobra.Command{}
	cmd.SetErr(&stderr)

	progress := commandProgress(cmd)
	if progress == nil {
		t.Fatalf("expected human progress reporter")
	}
	progress.Step("Applying 1 patch operation")

	if !strings.Contains(stderr.String(), "Applying 1 patch operation") {
		t.Fatalf("expected progress on stderr, got %q", stderr.String())
	}
}

func TestCommandProgressDisabledForJSON(t *testing.T) {
	oldJSONOut := jsonOut
	t.Cleanup(func() {
		jsonOut = oldJSONOut
	})
	jsonOut = true

	if progress := commandProgress(&cobra.Command{}); progress != nil {
		t.Fatalf("expected nil progress reporter in JSON mode")
	}
}

func TestResolveWorkspaceErrorUsesCurrentCommandExample(t *testing.T) {
	oldAppState := appState
	t.Cleanup(func() {
		appState = oldAppState
	})

	root := t.TempDir()
	registered := filepath.Join(root, "chromium-src")
	outside := filepath.Join(root, "outside")
	appState = &app.App{
		CWD: outside,
		Registry: &workspace.Registry{Version: 1, Workspaces: []workspace.Entry{
			{Name: "ch1", Path: registered},
		}},
	}

	rootCmd := &cobra.Command{Use: "browseros-patch"}
	diffCmd := &cobra.Command{Use: "diff"}
	rootCmd.AddCommand(diffCmd)

	_, err := resolveWorkspace(diffCmd, nil, "")
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), `browseros-patch diff ch1`) {
		t.Fatalf("expected command-specific example, got:\n%s", err)
	}
}
