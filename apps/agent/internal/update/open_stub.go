//go:build !windows

package update

func OpenURL(url string) error {
	return nil
}
