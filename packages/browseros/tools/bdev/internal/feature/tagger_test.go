package feature

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTagFeatureCreatesAndUpdatesFeature(t *testing.T) {
	root := t.TempDir()
	if err := TagFeature(TagFeatureOpts{
		BrowserOSRepo: root,
		FeatureName:   "server",
		Paths:         []string{"chrome/foo.cc", "chrome/bar.cc", "chrome/foo.cc"},
	}); err != nil {
		t.Fatalf("TagFeature create: %v", err)
	}
	if err := TagFeature(TagFeatureOpts{
		BrowserOSRepo: root,
		FeatureName:   "server",
		Paths:         []string{"chrome/baz.cc"},
	}); err != nil {
		t.Fatalf("TagFeature update: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(root, "build", "features.yaml"))
	if err != nil {
		t.Fatalf("read features.yaml: %v", err)
	}
	text := string(data)
	for _, want := range []string{"server:", "chrome/foo.cc", "chrome/bar.cc", "chrome/baz.cc"} {
		if !strings.Contains(text, want) {
			t.Fatalf("expected features.yaml to contain %q\n%s", want, text)
		}
	}
}

func TestTagFeatureReturnsReadErrors(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "build", "features.yaml")
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("mkdir features.yaml dir: %v", err)
	}
	err := TagFeature(TagFeatureOpts{
		BrowserOSRepo: root,
		FeatureName:   "server",
		Paths:         []string{"chrome/foo.cc"},
	})
	if err == nil {
		t.Fatal("expected TagFeature to fail when features.yaml is unreadable")
	}
}
