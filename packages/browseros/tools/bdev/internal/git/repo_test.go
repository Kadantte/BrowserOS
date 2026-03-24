package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestShowFileReturnsErrorForInvalidRef(t *testing.T) {
	dir := t.TempDir()
	runGit(t, dir, "init")
	configRepo(t, dir)
	writeFile(t, dir, "test.txt", "base\n")
	runGit(t, dir, "add", "test.txt")
	runGit(t, dir, "commit", "-m", "base")

	_, _, err := ShowFile(dir, "missing-ref", "test.txt")
	if err == nil {
		t.Fatal("expected invalid ref error")
	}
}

func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, string(out))
	}
	return string(out)
}

func configRepo(t *testing.T, dir string) {
	t.Helper()
	runGit(t, dir, "config", "user.email", "bdev@example.com")
	runGit(t, dir, "config", "user.name", "bdev")
}

func writeFile(t *testing.T, dir, path, content string) {
	t.Helper()
	full := filepath.Join(dir, path)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", path, err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
