package cmd

import (
	"fmt"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

const (
	groupSetup   = "setup"
	groupRun     = "run"
	groupInspect = "inspect"
	groupOther   = "other"
)

var (
	headerStyle  = color.New(color.Bold, color.FgCyan)
	commandStyle = color.New(color.FgHiGreen)
	hintStyle    = color.New(color.Faint)
	successStyle = color.New(color.FgGreen, color.Bold)
	warnStyle    = color.New(color.FgYellow, color.Bold)
	labelStyle   = color.New(color.Bold)
	pathStyle    = color.New(color.FgCyan)
	dimStyle     = color.New(color.Faint)
)

func helpHeader(s string) string {
	return headerStyle.Sprint(s)
}

func helpHint(s string) string {
	return hintStyle.Sprint(s)
}

func groupedHelp(cmd *cobra.Command) string {
	var b strings.Builder
	cmds := cmd.Commands()

	for _, group := range cmd.Groups() {
		lines := commandLines(cmds, group.ID)
		if len(lines) == 0 {
			continue
		}
		b.WriteString("\n" + helpHeader(group.Title) + "\n")
		for _, line := range lines {
			b.WriteString(line)
		}
	}

	lines := commandLines(cmds, "")
	if len(lines) > 0 {
		b.WriteString("\n" + helpHeader("Other:") + "\n")
		for _, line := range lines {
			b.WriteString(line)
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

func commandLines(cmds []*cobra.Command, groupID string) []string {
	lines := []string{}
	for _, c := range cmds {
		if c.GroupID != groupID || (!c.IsAvailableCommand() && c.Name() != "help") {
			continue
		}
		name := commandStyle.Sprint(fmt.Sprintf("%-*s", c.NamePadding(), c.Name()))
		lines = append(lines, fmt.Sprintf("  %s %s\n", name, c.Short))
	}
	return lines
}
