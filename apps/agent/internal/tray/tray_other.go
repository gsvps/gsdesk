//go:build !windows

package tray

type Options struct {
	DeviceID string
	IsOnline func() bool
	OnSettings func()
	OnQuit     func()
}

// Run is a no-op on non-Windows platforms.
func Run(opts Options) {
	if opts.OnQuit != nil {
		select {}
	}
}
