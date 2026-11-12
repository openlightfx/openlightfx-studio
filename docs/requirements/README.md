# Studio requirements

Every requirement is `approved`. OQ-1 keeps `power_on` as a bool and defers FP-1. OQ-2 keeps the eyedropper on ffmpeg `tonemap=hable` to bt709. OQ-3 uses headless `openlightfx-simulator` as the bulbs. The test harness is described in [testing.md](../testing.md).

| Document | Role |
| --- | --- |
| [studio-requirements.md](studio-requirements.md) | Journeys, requirements, conflicts, test strategy, open questions |
| [traceability.md](traceability.md) | Test names, tiers, and the CI checker |
| [format-proposals.md](format-proposals.md) | The one proto change under consideration, and the editor-state change that was rejected |

Check the spec from the repo root:

```bash
node docs/requirements/check-traceability.mjs
```
