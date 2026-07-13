# Cairo — Official Arabic font for enrollment PDF spike

| Field | Value |
|-------|--------|
| **Font family** | Cairo |
| **Official source** | [google/fonts](https://github.com/google/fonts) — `ofl/cairo/` |
| **Upstream file** | `ofl/cairo/Cairo[slnt,wght].ttf` |
| **Vendored file** | `Cairo-Variable.ttf` (rename of the upstream file only; **font bytes unmodified**) |
| **Fetched** | 2026-07-13 |
| **SHA-256** | `667C987182391C91F4E57A2F455B1794FB5E3EE6CA4EF3383E86BB690FA9C964` |
| **License** | **OFL-1.1** (`OFL.txt` adjacent) |
| **Weights used** | **400** (body) and **700** (titles) via the variable `wght` axis when the embedder supports instances; otherwise the default Regular instance is embedded |

## Approved use

This vendor is **approved for official college documents** (شهادة قيد and related certificates) under SIL OFL 1.1.

PDF generation **must load this local file**. Do **not** fetch Cairo from Google Fonts CDN (or any network) at generation time.

## Integrity

```bash
# PowerShell
Get-FileHash -Algorithm SHA256 .\Cairo-Variable.ttf
# Expected: 667C987182391C91F4E57A2F455B1794FB5E3EE6CA4EF3383E86BB690FA9C964
```
