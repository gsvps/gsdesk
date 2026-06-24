package install

type ProgressFunc func(step string, percent int)

type Progress struct {
	Running  bool   `json:"running"`
	Done     bool   `json:"done"`
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
	Message  string `json:"message,omitempty"`
	Step     string `json:"step"`
	Percent  int    `json:"percent"`
	Relaunch bool   `json:"relaunch,omitempty"`
}

func report(onProgress ProgressFunc, step string, percent int) {
	if onProgress != nil {
		onProgress(step, percent)
	}
}
