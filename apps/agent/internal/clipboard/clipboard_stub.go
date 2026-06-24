//go:build !windows

package clipboard

func GetText() (string, bool) {
	return "", false
}

func SetText(text string) error {
	return nil
}
