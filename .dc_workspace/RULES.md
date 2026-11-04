# Project Coding Rules

Coders and the reviewer read this file before writing or reviewing code; code-validator does not. Edit it with `/dotclaude:configure` or directly. Each rule is one line plus, where useful, the reason. The rules below are a starting set; delete the ones this project does not want and add its own.

## Tests

- Write a test only when it pins production behavior: deleting a specific production line makes it fail. No tests written only to have tests.
- No fake, skipped, empty, or trivial tests (`assert True`, asserting a mock's own return value).
- Tests that depend on the current date or time pin a fixed date or freeze the clock. Month and year boundaries break tests that use "today".

## Code

- Literals that carry meaning (limits, timeouts, status values, paths) are named constants.
- YAGNI: no abstraction, option, or extension point that no current requirement uses.
- Shared modules are isolated like an SDK: they do not import application code, and application-specific behavior does not move into them. An existing pattern is not forced onto new code that does not fit it.

## Comments and docstrings

- State only the "why" the code cannot show, in 1–5 lines, complete enough that another engineer needs no follow-up question.
- Design discussion belongs in the PR body or SPEC, not in comments.

## Project terms

Define terms that have more than one meaning in this project, so a rule that uses them is unambiguous.

- Example: "admin" means {the service operator account | the tenant administrator role}; rules that say "admin" mean {which}.
