package engine

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/browseros-ai/BrowserOS/packages/browseros/tools/bdev/internal/patch"
	"github.com/browseros-ai/BrowserOS/packages/browseros/tools/bdev/internal/repo"
	"github.com/browseros-ai/BrowserOS/packages/browseros/tools/bdev/internal/resolve"
	"github.com/browseros-ai/BrowserOS/packages/browseros/tools/bdev/internal/workspace"
)

func TestAbortRevertsAppliedOpsAndRestoresPendingStash(t *testing.T) {
	ctx := context.Background()
	workspacePath := initGitRepo(t)
	writeFile(t, filepath.Join(workspacePath, "a.txt"), "a\n")
	writeFile(t, filepath.Join(workspacePath, "b.txt"), "b\n")
	writeFile(t, filepath.Join(workspacePath, "local.txt"), "local\n")
	runGit(t, workspacePath, "add", "a.txt", "b.txt", "local.txt")
	runGit(t, workspacePath, "commit", "-m", "base")
	baseCommit := gitOutput(t, workspacePath, "rev-parse", "HEAD")

	writeFile(t, filepath.Join(workspacePath, "local.txt"), "local changed\n")
	runGit(t, workspacePath, "stash", "push", "-m", "test stash", "-u", "--", "local.txt")
	stashRef := gitOutput(t, workspacePath, "stash", "list", "-1", "--format=%gd")
	if stashRef == "" {
		t.Fatalf("expected stash ref")
	}

	if err := workspace.SaveState(workspacePath, &workspace.State{
		Version:      1,
		Workspace:    workspacePath,
		BaseCommit:   baseCommit,
		PendingStash: stashRef,
	}); err != nil {
		t.Fatalf("SaveState: %v", err)
	}

	writeFile(t, filepath.Join(workspacePath, "a.txt"), "applied\n")
	writeFile(t, filepath.Join(workspacePath, "b.txt"), "conflict\n")
	if err := resolve.Save(workspacePath, &resolve.State{
		Workspace:  workspacePath,
		RepoRoot:   workspacePath,
		BaseCommit: baseCommit,
		Current:    1,
		Operations: []resolve.Operation{
			{ChromiumPath: "a.txt", PatchRel: "a.txt", Op: patch.OpModify},
			{ChromiumPath: "b.txt", PatchRel: "b.txt", Op: patch.OpModify},
		},
	}); err != nil {
		t.Fatalf("resolve.Save: %v", err)
	}

	if err := Abort(ctx, workspace.Entry{Name: "ws", Path: workspacePath}); err != nil {
		t.Fatalf("Abort: %v", err)
	}

	assertFile(t, filepath.Join(workspacePath, "a.txt"), "a\n")
	assertFile(t, filepath.Join(workspacePath, "b.txt"), "b\n")
	assertFile(t, filepath.Join(workspacePath, "local.txt"), "local changed\n")
	if resolve.Exists(workspacePath) {
		t.Fatalf("expected resolve state to be removed")
	}
	state, err := workspace.LoadState(workspacePath)
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if state.PendingStash != "" {
		t.Fatalf("expected pending stash cleared, got %q", state.PendingStash)
	}
}

func TestPublishReturnsHelpfulErrorWhenNothingChanged(t *testing.T) {
	ctx := context.Background()
	repoRoot := initGitRepo(t)
	writeFile(t, filepath.Join(repoRoot, "BASE_COMMIT"), "base123\n")
	writeFile(t, filepath.Join(repoRoot, "chromium_patches", ".gitkeep"), "")
	runGit(t, repoRoot, "add", "BASE_COMMIT", "chromium_patches/.gitkeep")
	runGit(t, repoRoot, "commit", "-m", "repo init")

	repoInfo, err := repo.Load(repoRoot)
	if err != nil {
		t.Fatalf("repo.Load: %v", err)
	}
	if _, err := Publish(ctx, repoInfo, "", ""); err == nil || !strings.Contains(err.Error(), "nothing to publish") {
		t.Fatalf("expected helpful no-op error, got %v", err)
	}
}

func initGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runGit(t, dir, "init")
	runGit(t, dir, "config", "user.name", "Test User")
	runGit(t, dir, "config", "user.email", "test@example.com")
	return dir
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, string(output))
	}
}

func gitOutput(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, string(output))
	}
	return strings.TrimSpace(string(output))
}

func writeFile(t *testing.T, path string, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
}

func assertFile(t *testing.T, path string, want string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile %s: %v", path, err)
	}
	if string(data) != want {
		t.Fatalf("unexpected file contents for %s: got %q want %q", path, string(data), want)
	}
}
