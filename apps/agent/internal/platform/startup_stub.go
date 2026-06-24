//go:build !windows

package platform

func SetAutostart(enabled bool) error {
	return nil
}

func AutostartEnabled() (bool, error) {
	return false, nil
}
