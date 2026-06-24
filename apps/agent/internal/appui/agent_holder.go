package appui

import "sync"

type agentHolder struct {
	mu    sync.RWMutex
	agent AgentView
	save  SaveFunc
}

func newAgentHolder(agent AgentView, save SaveFunc) *agentHolder {
	return &agentHolder{agent: agent, save: save}
}

func (h *agentHolder) view() AgentView {
	if h == nil {
		return nil
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.agent
}

func (h *agentHolder) saveFn() SaveFunc {
	if h == nil {
		return nil
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.save
}

func (h *agentHolder) set(agent AgentView, save SaveFunc) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.agent = agent
	h.save = save
}
