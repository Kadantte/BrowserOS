package cmd

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"

	"browseros-cli/update"
)

func TestRunUpdateCommandCheckOnly(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)

	manager := newTestUpdateManager(t)
	outcome, err := runUpdateCommand(
		context.Background(),
		manager,
		true,
		false,
		false,
		bytes.NewBufferString(""),
		&bytes.Buffer{},
	)
	if err != nil {
		t.Fatalf("runUpdateCommand() error = %v", err)
	}
	if outcome.applied {
		t.Fatal("runUpdateCommand() applied = true, want false")
	}
	if !outcome.result.UpdateAvailable {
		t.Fatal("runUpdateCommand() UpdateAvailable = false, want true")
	}
}

func TestRunUpdateCommandRequiresYesWithoutTTY(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)

	_, err := runUpdateCommand(
		context.Background(),
		newTestUpdateManager(t),
		false,
		false,
		false,
		bytes.NewBufferString(""),
		&bytes.Buffer{},
	)
	if err == nil {
		t.Fatal("runUpdateCommand() error = nil, want confirmation error")
	}
}

func TestRunUpdateCommandCancel(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configRoot)

	stderr := &bytes.Buffer{}
	outcome, err := runUpdateCommand(
		context.Background(),
		newTestUpdateManager(t),
		false,
		false,
		true,
		bytes.NewBufferString("n\n"),
		stderr,
	)
	if err != nil {
		t.Fatalf("runUpdateCommand() error = %v", err)
	}
	if !outcome.canceled {
		t.Fatal("runUpdateCommand() canceled = false, want true")
	}
	if stderr.Len() == 0 {
		t.Fatal("confirm prompt was not written to stderr")
	}
}

func newTestUpdateManager(t *testing.T) *update.Manager {
	t.Helper()

	key, err := update.PlatformKey(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Fatalf("PlatformKey() error = %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"version":"9.9.9",
			"published_at":"2026-03-27T19:00:00Z",
			"tag":"browseros-cli-v9.9.9",
			"assets":{
				"` + key + `":{
					"filename":"browseros-cli_9.9.9_test.tar.gz",
					"url":"https://cdn.example.com/cli/v9.9.9/browseros-cli_9.9.9_test.tar.gz",
					"archive_format":"tar.gz",
					"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
				}
			}
		}`))
	}))
	t.Cleanup(server.Close)

	return update.NewManager(update.Options{
		CurrentVersion: "1.0.0",
		ManifestURL:    server.URL,
		Automatic:      false,
		HTTPClient:     server.Client(),
	})
}
