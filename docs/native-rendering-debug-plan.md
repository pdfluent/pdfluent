# Native Continuous Rendering Debug Plan

Status: active
Owner: engineering
Scope: white/blank main preview in native `Continuous` mode while thumbnails keep rendering.

## Exit Criteria
- Native preview visible in main pane for `Continuous` mode.
- Verified across 3 PDFs and 20 actions (open, page next/prev, zoom changes, mode switch).
- No regressions in `Single` mode and no regressions in thumbnail rendering.

## Repro Matrix
| Scenario | Renderer target | File path style | Zoom | Steps | Expected | Current |
|---|---|---|---|---|---|---|
| A1 | Native Continuous | Downloads path with spaces | 100% | Open PDF, switch Continuous, navigate pages 1-4 | Main preview visible | Pass (user-confirmed) |
| A2 | Native Continuous | Downloads path with spaces | 250% | Same as A1 + zoom | Main preview visible | Pass (user-confirmed) |
| B1 | Native Single | Same file | 100% | Switch Single | Main preview visible | Pending |
| C1 | Compatibility Continuous | Same file | 100% | Force fallback path | Main preview visible | Passes |

## Instrumentation Added
- `viewer_renderer_selected`
- `native_pdf_src_updated`
- `native_pdf_base_source_active`
- `native_pdf_iframe_loaded`
- `native_pdf_iframe_error_page_detected`
- `native_pdf_iframe_failed`

## Hypotheses
1. `asset` protocol is not fully enabled/scoped in Tauri config for `convertFileSrc` URLs.
2. Native PDF viewer in WebKit fails in iframe for certain `asset` URLs and returns blank content without explicit error.
3. Fragment updates (`#page`, `#zoom`) trigger unstable reinitialization in native continuous mode.
4. File path encoding / scope mismatch for spaces or path roots causes silent blank output.

## Active Changes
1. Enable `app.security.assetProtocol` with explicit scope in `src-tauri/tauri.conf.json`.
2. Keep renderer decision and iframe lifecycle logging in `src/components/Viewer.tsx`.
3. Keep fallback support when native loads an explicit permission/capability error page.

## Next Experiments
1. Validate A1/A2 after `assetProtocol` change.
2. Validate B1 to separate continuous-only vs native-global failure.
3. If still failing: test `embed` and `object` render strategies for continuous native path.
4. If still failing: switch continuous native to backend-driven blob URL strategy and keep iframe as fallback.
