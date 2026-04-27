package profile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestImportCopiesAllowlistAndLocalState(t *testing.T) {
	root := t.TempDir()
	sourceUser := filepath.Join(root, "source")
	sourceProfile := filepath.Join(sourceUser, "Profile 25")
	devUser := filepath.Join(root, "dev")
	mustWrite(t, filepath.Join(sourceUser, "Local State"), `{"os_crypt":{"encrypted_key":"abc"}}`)
	mustWrite(t, filepath.Join(sourceProfile, "Bookmarks"), "bookmarks")
	mustWrite(t, filepath.Join(sourceProfile, "Preferences"), `{"profile":{"exit_type":"Crashed","exited_cleanly":false}}`)
	mustWrite(t, filepath.Join(sourceProfile, "Cache/junk"), "cache")
	mustWrite(t, filepath.Join(sourceProfile, "Extensions/ext/manifest.json"), "{}")

	err := Import(ImportConfig{
		SourceUserDataDir: sourceUser,
		SourceProfileDir:  "Profile 25",
		DevUserDataDir:    devUser,
		DevProfileDir:     "Default",
	})
	if err != nil {
		t.Fatal(err)
	}

	assertFile(t, filepath.Join(devUser, "Local State"), `{"os_crypt":{"encrypted_key":"abc"}}`)
	assertFile(t, filepath.Join(devUser, "Default", "Bookmarks"), "bookmarks")
	assertMissing(t, filepath.Join(devUser, "Default", "Cache"))
	assertFileExists(t, filepath.Join(devUser, "Default", "Extensions/ext/manifest.json"))
	prefs, err := os.ReadFile(filepath.Join(devUser, "Default", "Preferences"))
	if err != nil {
		t.Fatal(err)
	}
	if string(prefs) != `{"profile":{"exit_type":"Normal","exited_cleanly":true}}` {
		t.Fatalf("preferences not patched: %s", string(prefs))
	}
}

func TestImportRejectsDangerousDevDir(t *testing.T) {
	root := t.TempDir()
	err := Import(ImportConfig{
		SourceUserDataDir: root,
		SourceProfileDir:  "Default",
		DevUserDataDir:    filepath.Join(root, "child"),
		DevProfileDir:     "Default",
	})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCleanupSingletons(t *testing.T) {
	dir := t.TempDir()
	mustWrite(t, filepath.Join(dir, "SingletonLock"), "lock")
	mustWrite(t, filepath.Join(dir, "SingletonCookie"), "cookie")
	if err := CleanupSingletons(dir); err != nil {
		t.Fatal(err)
	}
	assertMissing(t, filepath.Join(dir, "SingletonLock"))
	assertMissing(t, filepath.Join(dir, "SingletonCookie"))
}

func mustWrite(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func assertFile(t *testing.T, path string, want string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != want {
		t.Fatalf("%s got %q want %q", path, string(data), want)
	}
}

func assertFileExists(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected %s: %v", path, err)
	}
}

func assertMissing(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected missing %s, err=%v", path, err)
	}
}
