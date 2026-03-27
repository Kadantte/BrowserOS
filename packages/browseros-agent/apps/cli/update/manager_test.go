package update

import (
	"context"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"
	"time"
)

func TestManagerCachedNotice(t *testing.T) {
	manager := NewManager(Options{
		CurrentVersion: "1.0.0",
		Automatic:      true,
	})
	manager.state = &State{LatestVersion: "1.2.0"}

	notice := manager.CachedNotice()
	if notice == "" {
		t.Fatal("CachedNotice() returned empty notice")
	}
}

func TestManagerShouldCheck(t *testing.T) {
	manager := NewManager(Options{
		CurrentVersion: "1.0.0",
		Automatic:      true,
		CheckTTL:       time.Minute,
		Now: func() time.Time {
			return time.Unix(1000, 0).UTC()
		},
	})
	manager.state = &State{LastCheckedAt: time.Unix(0, 0).UTC()}

	if !manager.ShouldCheck() {
		t.Fatal("ShouldCheck() = false, want true")
	}
}

func TestManagerCheckNow(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"version":"9.9.9",
			"published_at":"2026-03-27T19:00:00Z",
			"tag":"browseros-cli-v9.9.9",
			"assets":{
				"` + runtimePlatformKey(t) + `":{
					"filename":"browseros-cli_9.9.9_test.tar.gz",
					"url":"https://cdn.example.com/cli/v9.9.9/browseros-cli_9.9.9_test.tar.gz",
					"archive_format":"tar.gz",
					"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
				}
			}
		}`))
	}))
	defer server.Close()

	manager := NewManager(Options{
		CurrentVersion: "1.0.0",
		ManifestURL:    server.URL,
		Automatic:      false,
		HTTPClient:     server.Client(),
		Now: func() time.Time {
			return time.Unix(100, 0).UTC()
		},
	})

	result, err := manager.CheckNow(context.Background())
	if err != nil {
		t.Fatalf("CheckNow() error = %v", err)
	}
	if !result.UpdateAvailable {
		t.Fatal("CheckNow() UpdateAvailable = false, want true")
	}
}

func runtimePlatformKey(t *testing.T) string {
	t.Helper()
	key, err := PlatformKey(runtimeGOOS(), runtimeGOARCH())
	if err != nil {
		t.Fatalf("PlatformKey() error = %v", err)
	}
	return key
}

func runtimeGOOS() string {
	return runtime.GOOS
}

func runtimeGOARCH() string {
	return runtime.GOARCH
}
