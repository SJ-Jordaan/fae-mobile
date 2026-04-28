# fae-mobile

Flutter mobile app, developed using [GitHub Spec Kit](https://github.com/github/spec-kit) for spec-driven development.

## Stack

- **Framework**: Flutter (latest stable)
- **Language**: Dart
- **Targets**: iOS, Android
- **Workflow**: Spec Kit + Claude Code

## Getting started

Install Flutter (latest stable) — see https://docs.flutter.dev/get-started/install — then verify:

```sh
flutter --version
flutter doctor
```

The Flutter project itself has not been scaffolded yet; it will be generated via the spec-driven workflow below.

## Spec-driven workflow

This repo is initialized with Spec Kit. From inside Claude Code, run the slash commands in order:

1. `/speckit-constitution` — establish project principles
2. `/speckit-specify` — write the baseline feature spec
3. `/speckit-clarify` *(optional)* — de-risk ambiguous areas
4. `/speckit-plan` — produce the implementation plan
5. `/speckit-tasks` — break the plan into actionable tasks
6. `/speckit-implement` — execute the tasks

Templates live in `.specify/templates/`, the constitution in `.specify/memory/constitution.md`, and the Claude skills in `.claude/skills/`.
