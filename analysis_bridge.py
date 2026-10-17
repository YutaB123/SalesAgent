"""Runs Eva's post-call analysis (call_analysis.py) with Claude instead of OpenAI.

Reads one JSON object from stdin:
    {"lines": [{"speaker": "rep" | "customer" | "unknown", "text": "..."}], "product_context": "..."}
Writes the validated report as JSON on stdout. On failure it prints {"error": "..."} and exits 1.

Called by server.js for POST /api/post-call. Needs ANTHROPIC_API_KEY in the environment.
Standard library only, same as call_analysis.py.
"""
import json
import os
import sys
import urllib.error
import urllib.request

from call_analysis import AnalysisError, analyze_call

MODEL = os.environ.get("SALES_ANALYSIS_MODEL", "claude-sonnet-5-5")


def complete(system_prompt: str, user_json: str) -> str:
    """Eva's analyzer calls this with a system prompt and a JSON user message; return the model's JSON text."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise AnalysisError("ANTHROPIC_API_KEY is not set")
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 3500,
        "thinking": {"type": "between_tools"},   # this model needs "between_tools" to turn thinking off
        "system": system_prompt + "\n\nReply with ONE JSON object only, no other text.",
        "messages": [{"role": "user", "content": user_json}],
    }).encode()
    request = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body, method="POST",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise AnalysisError(f"Claude request failed ({error.code}): {detail}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise AnalysisError("Claude request failed or timed out") from error
    text = "".join(block.get("text", "") for block in data.get("content", []))
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise AnalysisError("Claude did not return JSON")
    return text[start:end + 1]


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        turns = [
            {"speaker": "seller" if line.get("speaker") == "rep" else line.get("speaker", "unknown"),
             "text": str(line.get("text", "")).strip()}
            for line in payload.get("lines", []) if str(line.get("text", "")).strip()
        ]
        # Eva's validator rejects any report whose quotes or labels don't check out (it never fakes one).
        # Model output varies, so one retry rescues most first-attempt rejections. Provider/key errors are not retried.
        last_error = None
        for _attempt in range(2):
            try:
                report = analyze_call(turns, product_context=payload.get("product_context", ""), complete=complete)
                print(json.dumps(report, ensure_ascii=False))
                return 0
            except AnalysisError as error:
                last_error = error
                if "Claude request failed" in str(error) or "not set" in str(error):
                    break
        raise last_error
    except (AnalysisError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
