package profile

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"browseros-alpha/internal/fspath"
)

type ImportConfig struct {
	SourceUserDataDir string
	SourceProfileDir  string
	DevUserDataDir    string
	DevProfileDir     string
}

var profileAllowlist = []string{
	"Extensions",
	"Local Extension Settings",
	"Login Data",
	"Login Data For Account",
	"Cookies",
	"Cookies-journal",
	"Bookmarks",
	"Preferences",
	"Web Data",
	"History",
}

func Import(cfg ImportConfig) error {
	if cfg.SourceUserDataDir == "" || cfg.SourceProfileDir == "" || cfg.DevUserDataDir == "" || cfg.DevProfileDir == "" {
		return fmt.Errorf("source and dev profile paths are required")
	}
	if fspath.IsSameOrChild(cfg.DevUserDataDir, cfg.SourceUserDataDir) {
		return fmt.Errorf("dev user-data dir must not equal or live inside source user-data dir")
	}
	sourceProfile := filepath.Join(cfg.SourceUserDataDir, cfg.SourceProfileDir)
	if info, err := os.Stat(sourceProfile); err != nil || !info.IsDir() {
		return fmt.Errorf("source profile not found: %s", sourceProfile)
	}
	if err := os.RemoveAll(cfg.DevUserDataDir); err != nil {
		return err
	}
	devProfile := filepath.Join(cfg.DevUserDataDir, cfg.DevProfileDir)
	if err := os.MkdirAll(devProfile, 0755); err != nil {
		return err
	}
	if err := copyIfExists(filepath.Join(cfg.SourceUserDataDir, "Local State"), filepath.Join(cfg.DevUserDataDir, "Local State")); err != nil {
		return err
	}
	for _, name := range profileAllowlist {
		src := filepath.Join(sourceProfile, name)
		dst := filepath.Join(devProfile, name)
		if err := copyIfExists(src, dst); err != nil {
			return err
		}
	}
	if err := patchPreferences(filepath.Join(devProfile, "Preferences")); err != nil {
		return err
	}
	return CleanupSingletons(cfg.DevUserDataDir)
}

func CleanupSingletons(userDataDir string) error {
	entries, err := filepath.Glob(filepath.Join(userDataDir, "Singleton*"))
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if err := os.RemoveAll(entry); err != nil {
			return err
		}
	}
	return nil
}

func copyIfExists(src string, dst string) error {
	info, err := os.Stat(src)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if info.IsDir() {
		return copyDir(src, dst)
	}
	return copyFile(src, dst, info.Mode())
}

func copyDir(src string, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		info, err := d.Info()
		if err != nil {
			return err
		}
		if d.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		return copyFile(path, target, info.Mode())
	})
}

func copyFile(src string, dst string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func patchPreferences(path string) error {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var prefs map[string]any
	if err := json.Unmarshal(data, &prefs); err != nil {
		return nil
	}
	profile, ok := prefs["profile"].(map[string]any)
	if !ok {
		profile = map[string]any{}
		prefs["profile"] = profile
	}
	profile["exit_type"] = "Normal"
	profile["exited_cleanly"] = true
	out, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0644)
}
