"""The agentic layer: the Tutor/Coach brain, its tools, and the model gateway.

Model-agnostic by construction: a single :class:`ToolRegistry` is the source of
truth for what the agent can do, and an :class:`AgentService` implementation
(Claude by default, others via LiteLLM) consumes it. Switching providers never
touches tool code.
"""
