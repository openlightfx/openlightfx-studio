# Shared fixtures

`tests/fixtures/sampling/` is the contract for Studio's Vitest tests and for `dotnet test` in [openlightfx-emby](https://github.com/openlightfx/openlightfx-emby).

| File                 | Contents                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyframes.json`     | `KEY-009` through `KEY-014`. The sampler is `PlaybackSession`: black before the first keyframe, half-to-even blends, Tanner Helland kelvin truncated toward zero. |
| `effects.json`       | One default and one non-default case for each of the 13 effect types. Commands are `offsetMs`, `r`, `g`, `b`, `brightness`.                                       |
| `roundtrip.lightfx`  | A version-1 track with RGB, color temperature, a transition, and one PULSE effect.                                                                                |
| `roundtrip-track.ts` | The logical track encoded into `roundtrip.lightfx`.                                                                                                               |

Regenerate the binary and `effects.json` after a renderer or encoder change:

```bash
npx vite-node scripts/fixtures/generate.ts
```

Studio compares its sampler to these files in `tests/fixture/sampling.test.ts`. A difference of one RGB level, brightness level, or kelvin integer fails the test.

## How `dotnet test` reads them

The plugin tests are not in this repository. Point them at this directory with `OLFX_FIXTURES`. From a checkout of `openlightfx-emby` that sits next to this repo:

```bash
export OLFX_FIXTURES="$PWD/../openlightfx-studio/tests/fixtures/sampling"
dotnet test tests/OpenLightFX.Emby.Tests -c Release
```

A test should use the requirement id in its name, for example `KEY-010 @fixture linear blend`. Load the JSON and call the same playback path Studio uses (`InterpolationEngine.Interpolate` with `PlaybackSession` bracketing, not `GetStateAtTime`):

```csharp
var root = Environment.GetEnvironmentVariable("OLFX_FIXTURES")
    ?? throw new InvalidOperationException("Set OLFX_FIXTURES to tests/fixtures/sampling");
using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "keyframes.json")));
foreach (var item in doc.RootElement.GetProperty("cases").EnumerateArray())
{
    if (item.GetProperty("id").GetString() != "KEY-010") continue;
    var timeMs = item.GetProperty("timeMs").GetUInt64();
    // Build the keyframes from item.GetProperty("keyframes") and
    // assert R, G, B, and brightness against item.GetProperty("expect").
}

var bytes = File.ReadAllBytes(Path.Combine(root, "roundtrip.lightfx"));
var parsed = new TrackParser().ParseBytes(bytes, "roundtrip.lightfx");
Assert.Empty(parsed.ValidationErrors); // IO-002
```

`effects.json` cases include the `input` the renderer was given and the `commands` it must return. Compare offset, RGB, and brightness exactly. Where a proto comment disagrees with the renderer, the fixture wins.

Copy the directory into the test output if the test host cannot see the sibling checkout:

```xml
<ItemGroup>
  <Content Include="$(OLFX_FIXTURES)\**\*">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    <Link>fixtures\%(RecursiveDir)%(Filename)%(Extension)</Link>
  </Content>
</ItemGroup>
```

The Studio gate still requires the Vitest titles. A plugin test is a second reader of the same file, not a substitute.
