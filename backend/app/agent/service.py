"""The model-agnostic agent service.

``AgentService`` is the interface the rest of the app talks to. Two
implementations share the same :class:`ToolRegistry`:

* :class:`ClaudeAgentRunner` — the default path, using Anthropic's Messages API
  tool-use loop. (This can later be upgraded to the Claude Agent SDK for
  subagents/session features without changing the interface.)
* :class:`LiteLLMRunner` — the portable path, using LiteLLM's OpenAI-compatible
  surface to drive OpenAI, other hosted providers, or a local Ollama model.

Provider SDKs are imported lazily so this module imports cleanly even when only
the trading core's dependencies are installed.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from app.agent.prompts import COACH_SYSTEM_PROMPT
from app.agent.tools.registry import ToolRegistry

# Default Claude models. Pinned to the latest 4.x line; route by task.
CLAUDE_DEEP = "claude-opus-4-8"  # deep multi-step analysis / planning
CLAUDE_DEFAULT = "claude-sonnet-4-6"  # routine coaching turns
CLAUDE_FAST = "claude-haiku-4-5-20251001"  # cheap classification / routing


@dataclass
class AgentEvent:
    """A streamed event from an agent turn."""

    type: str  # "text" | "tool_call" | "tool_result" | "done" | "error"
    data: dict = field(default_factory=dict)


class AgentService(ABC):
    @abstractmethod
    async def run_turn(
        self, user_message: str, history: list[dict] | None = None
    ) -> AsyncIterator[AgentEvent]:
        """Run a single coaching turn, yielding events as they happen."""
        raise NotImplementedError
        yield  # pragma: no cover - makes this an async generator


class ClaudeAgentRunner(AgentService):
    def __init__(
        self,
        registry: ToolRegistry,
        model: str = CLAUDE_DEFAULT,
        system: str = COACH_SYSTEM_PROMPT,
        api_key: str | None = None,
        max_iterations: int = 8,
        max_tokens: int = 2048,
    ):
        self.registry = registry
        self.model = model
        self.system = system
        self.api_key = api_key
        self.max_iterations = max_iterations
        self.max_tokens = max_tokens

    async def run_turn(
        self, user_message: str, history: list[dict] | None = None
    ) -> AsyncIterator[AgentEvent]:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self.api_key) if self.api_key else AsyncAnthropic()
        messages: list[dict] = list(history or [])
        messages.append({"role": "user", "content": user_message})
        tools = self.registry.to_anthropic()

        for _ in range(self.max_iterations):
            resp = await client.messages.create(
                model=self.model,
                system=self.system,
                tools=tools,
                max_tokens=self.max_tokens,
                messages=messages,
            )
            tool_uses = []
            for block in resp.content:
                if block.type == "text":
                    yield AgentEvent("text", {"text": block.text})
                elif block.type == "tool_use":
                    tool_uses.append(block)
                    yield AgentEvent("tool_call", {"name": block.name, "input": block.input})

            messages.append({"role": "assistant", "content": resp.content})

            if resp.stop_reason != "tool_use":
                yield AgentEvent("done", {"stop_reason": resp.stop_reason})
                return

            tool_results = []
            for tu in tool_uses:
                result = await self.registry.call(tu.name, dict(tu.input))
                yield AgentEvent("tool_result", {"name": tu.name, "result": result})
                tool_results.append(
                    {"type": "tool_result", "tool_use_id": tu.id, "content": _to_text(result)}
                )
            messages.append({"role": "user", "content": tool_results})

        yield AgentEvent("done", {"stop_reason": "max_iterations"})


class LiteLLMRunner(AgentService):
    """Portable path for OpenAI / other hosted providers / local Ollama."""

    def __init__(
        self,
        registry: ToolRegistry,
        model: str = "gpt-4o",
        system: str = COACH_SYSTEM_PROMPT,
        max_iterations: int = 8,
    ):
        self.registry = registry
        self.model = model
        self.system = system
        self.max_iterations = max_iterations

    async def run_turn(
        self, user_message: str, history: list[dict] | None = None
    ) -> AsyncIterator[AgentEvent]:
        import json

        import litellm

        messages: list[dict] = [{"role": "system", "content": self.system}]
        messages.extend(history or [])
        messages.append({"role": "user", "content": user_message})
        tools = self.registry.to_openai()

        for _ in range(self.max_iterations):
            resp = await litellm.acompletion(model=self.model, messages=messages, tools=tools)
            msg = resp.choices[0].message
            if msg.content:
                yield AgentEvent("text", {"text": msg.content})
            messages.append(msg.model_dump())

            tool_calls = getattr(msg, "tool_calls", None)
            if not tool_calls:
                yield AgentEvent("done", {"stop_reason": resp.choices[0].finish_reason})
                return

            for tc in tool_calls:
                args = json.loads(tc.function.arguments or "{}")
                yield AgentEvent("tool_call", {"name": tc.function.name, "input": args})
                result = await self.registry.call(tc.function.name, args)
                yield AgentEvent("tool_result", {"name": tc.function.name, "result": result})
                messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": _to_text(result)}
                )

        yield AgentEvent("done", {"stop_reason": "max_iterations"})


def _to_text(result: dict) -> str:
    import json

    return json.dumps(result, default=str)


def build_agent_service(
    provider: str,
    registry: ToolRegistry,
    model: str | None = None,
    api_key: str | None = None,
) -> AgentService:
    """Factory: ``provider`` is ``"claude"`` (default) or ``"litellm"``."""
    if provider == "claude":
        return ClaudeAgentRunner(registry, model=model or CLAUDE_DEFAULT, api_key=api_key)
    if provider == "litellm":
        return LiteLLMRunner(registry, model=model or "gpt-4o")
    raise ValueError(f"Unknown agent provider: {provider!r}")
