---
trigger: always_on
---

# Vue Rules

Use Vue 3 Composition API.

Use TypeScript.

Components should have one clear responsibility.

Prefer:

components/
composables/
stores/
types/

Avoid putting application-wide logic directly inside components.

Canvas drawing should be encapsulated in a dedicated composable/service.

The OLED canvas must render pixel-perfectly.

The logical canvas is always 128x64.

The displayed canvas may be scaled for usability.

Example:

logical:
128x64

display:
768x384

Each logical pixel must remain visually identifiable.