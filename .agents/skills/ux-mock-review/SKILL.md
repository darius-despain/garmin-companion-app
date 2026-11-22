---
name: ux-mock-review
description: Prototype and review app screens or multi-step flows before implementing user-facing changes. Use when a user wants to align on experience, states, or interaction details with a clickable UI mock.
license: MIT
---

# UX mock review

1. Read the feature tickets and existing interface. Identify the top user task, the decision the design must help them make, and what they need to know to act. Include realistic examples of uncertainty, failure, or missing input that would change their decision.
2. Make the first screen answer the main question. Use actual interface labels and synthetic data with internally consistent dates and values. Build a self-contained HTML mock for a multi-step path so reviewers can operate its controls. Keep fixture and review controls identifiable. Represent data or actions the real app can support and label simulated outcomes.
3. Walk the main path and the consequential edge states in a browser. Check at a desktop and a phone width, verify keyboard operation for the core controls, and look for lost context, clipped actions, or ambiguous feedback. Record what was tried and what needs revision.
4. Review the mock and the linked tickets against the user task. Rank concrete findings by their impact. Apply supported changes and replay affected paths. Follow the user's directions for who reviews and when to save the plan.
5. Record the selected screen, actions, and edge states in the acceptance criteria. When the user asks to align before implementation, record their agreement before starting production UI work. Use the same paths and representative fixtures to verify each implementation slice.

Adapted from the screen-first planning and interactive prototype approach in [Builder.io Visual Plans](https://github.com/BuilderIO/agent-native/tree/main/skills/visual-plans). This version uses local HTML and adds a browser review and acceptance-test handoff. [MIT license](LICENSE)
