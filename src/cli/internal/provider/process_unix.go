//go:build unix

package provider

import (
	"os/exec"
	"syscall"
)

// isolate starts the command in its own process group so terminate can
// stop everything it spawned.
func isolate(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func terminate(command *exec.Cmd) {
	if command.Process == nil {
		return
	}
	if syscall.Kill(-command.Process.Pid, syscall.SIGKILL) != nil {
		_ = command.Process.Kill()
	}
}
