package cmd

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildSetupPlanAlwaysInstallsDependencies(t *testing.T) {
	root := t.TempDir()

	plan := buildSetupPlan(root, true)

	if !plan.RunInstall {
		t.Fatal("expected dependency install to always run")
	}
}

func TestBuildSetupPlanIfNeededSkipsExistingGeneratedGraphQL(t *testing.T) {
	root := t.TempDir()
	generatedDir := filepath.Join(root, "apps/agent/generated/graphql")
	if err := os.MkdirAll(generatedDir, 0o755); err != nil {
		t.Fatal(err)
	}

	plan := buildSetupPlan(root, true)

	if plan.RunCodegen {
		t.Fatal("expected --if-needed setup to skip codegen when generated GraphQL exists")
	}
}

func TestBuildSetupPlanIfNeededRunsCodegenWhenGeneratedGraphQLMissing(t *testing.T) {
	root := t.TempDir()

	plan := buildSetupPlan(root, true)

	if !plan.RunCodegen {
		t.Fatal("expected --if-needed setup to run codegen when generated GraphQL is missing")
	}
}

func TestBuildSetupPlanExplicitSetupRunsCodegen(t *testing.T) {
	root := t.TempDir()
	generatedDir := filepath.Join(root, "apps/agent/generated/graphql")
	if err := os.MkdirAll(generatedDir, 0o755); err != nil {
		t.Fatal(err)
	}

	plan := buildSetupPlan(root, false)

	if !plan.RunCodegen {
		t.Fatal("expected explicit setup to refresh codegen")
	}
}
