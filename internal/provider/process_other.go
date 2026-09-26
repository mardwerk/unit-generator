//go:build !unix

package provider

import "os/exec"

func isolate(*exec.Cmd) {}

func terminate(command *exec.Cmd) {
	if command.Process != nil {
		_ = command.Process.Kill()
	}
}
