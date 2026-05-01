# WCAG 2.1 AA Contrast Report

Generated: 2026-05-01T08:52:12.013Z

Thresholds: **4.5:1** for normal text · **3:1** for large text and UI components

> **Disabled-state exemption**: `--text-disabled` on surface backgrounds is intentionally
> exempt per WCAG 1.4.3, which explicitly excludes disabled UI components from
> contrast requirements. Similarly, `--status-archived` (which maps to `--text-disabled`)
> is exempt when used to indicate a disabled/archived state.

## Coverage

- All `--text-*` tokens vs all `--surface-*` tokens (normal text, 4.5:1)
- `--text-on-accent` / `--text-on-emphasis` vs each accent fill (normal text, 4.5:1)
- Accent colours as icons vs primary surfaces (UI component, 3:1)
- Status-pill text vs composited muted background over `--surface-base` (normal text, 4.5:1)
- `--border-focus` / `--border-error` vs primary surfaces (UI component, 3:1)

## Hardcoded Colour Scan

A scan of all component and template files for literal hex/rgb/hsl colour values
found two locations outside `tokens.css`:

| File | Value | Decision |
|------|-------|----------|
| `src/components/tasks/project-add-form.tsx` | `#d97706` (amber swatch) | **Exempt** — purely decorative colour-picker swatch; no text or icon sits on top. WCAG 1.4.3 (text contrast) does not apply. WCAG 1.4.11 exempts colour-sample graphics where colour itself is the conveyed information. `amber` is not a valid CSS named colour so a literal hex is required; an inline exemption comment documents this. |
| `src/lib/email.ts` / `src/lib/emails.ts` | Various hex literals in HTML email templates | **Exempt** — email clients cannot process CSS custom properties; hardcoded values are required by the medium. These templates are out of scope for CSS-variable-based token auditing. |

## Dark Theme

**82 PASS · 0 FAIL**

| Pairing | Ratio | Required | Result |
|---------|-------|----------|--------|
| --text-primary on --surface-base | 16.59:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-raised | 15.60:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-overlay | 14.45:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-sunken | 17.40:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-hover | 13.63:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-active | 12.14:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-selected | 12.99:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-selected-hover | 11.29:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-base | 8.08:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-raised | 7.60:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-overlay | 7.04:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-sunken | 8.47:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-hover | 6.64:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-active | 5.91:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-selected | 6.32:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-selected-hover | 5.50:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-base | 6.98:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-raised | 6.56:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-overlay | 6.07:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-sunken | 7.32:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-hover | 5.73:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-active | 5.10:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-selected | 5.46:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-selected-hover | 4.75:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-base | 9.27:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-raised | 8.71:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-overlay | 8.07:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-sunken | 9.72:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-hover | 7.61:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-active | 6.78:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-selected | 7.26:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-selected-hover | 6.31:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-base | 11.37:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-raised | 10.69:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-overlay | 9.90:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-sunken | 11.93:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-hover | 9.34:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-active | 8.32:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-selected | 8.90:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-selected-hover | 7.74:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-primary | 6.53:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-primary | 6.53:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-success | 8.72:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-success | 8.72:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-warning | 9.95:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-warning | 9.95:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-danger | 7.01:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-danger | 7.01:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-info | 9.42:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-info | 9.42:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-neutral | 7.60:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-neutral | 7.60:1 | 4.5:1 | ✅ PASS |
| --accent-primary (icon) on --surface-base | 6.00:1 | 3:1 | ✅ PASS |
| --accent-primary (icon) on --surface-raised | 5.64:1 | 3:1 | ✅ PASS |
| --accent-primary (icon) on --surface-overlay | 5.22:1 | 3:1 | ✅ PASS |
| --accent-success (icon) on --surface-base | 8.00:1 | 3:1 | ✅ PASS |
| --accent-success (icon) on --surface-raised | 7.52:1 | 3:1 | ✅ PASS |
| --accent-success (icon) on --surface-overlay | 6.97:1 | 3:1 | ✅ PASS |
| --accent-warning (icon) on --surface-base | 9.14:1 | 3:1 | ✅ PASS |
| --accent-warning (icon) on --surface-raised | 8.59:1 | 3:1 | ✅ PASS |
| --accent-warning (icon) on --surface-overlay | 7.95:1 | 3:1 | ✅ PASS |
| --accent-danger (icon) on --surface-base | 6.44:1 | 3:1 | ✅ PASS |
| --accent-danger (icon) on --surface-raised | 6.05:1 | 3:1 | ✅ PASS |
| --accent-danger (icon) on --surface-overlay | 5.61:1 | 3:1 | ✅ PASS |
| --accent-info (icon) on --surface-base | 8.65:1 | 3:1 | ✅ PASS |
| --accent-info (icon) on --surface-raised | 8.13:1 | 3:1 | ✅ PASS |
| --accent-info (icon) on --surface-overlay | 7.53:1 | 3:1 | ✅ PASS |
| --accent-neutral (icon) on --surface-base | 6.98:1 | 3:1 | ✅ PASS |
| --accent-neutral (icon) on --surface-raised | 6.56:1 | 3:1 | ✅ PASS |
| --accent-neutral (icon) on --surface-overlay | 6.07:1 | 3:1 | ✅ PASS |
| status-pill active (info): --accent-info on --accent-info-muted/surface-base | 6.01:1 | 4.5:1 | ✅ PASS |
| status-pill pending (warning): --accent-warning on --accent-warning-muted/surface-base | 5.12:1 | 4.5:1 | ✅ PASS |
| status-pill on-hold (neutral): --text-secondary on --accent-neutral-muted/surface-base | 6.10:1 | 4.5:1 | ✅ PASS |
| status-pill blocked (danger): --accent-danger on --accent-danger-muted/surface-base | 4.56:1 | 4.5:1 | ✅ PASS |
| status-pill complete (success): --accent-success on --accent-success-muted/surface-base | 5.52:1 | 4.5:1 | ✅ PASS |
| status-pill cancelled: --text-tertiary on --surface-base | 6.98:1 | 4.5:1 | ✅ PASS |
| --border-focus (UI) on --surface-base | 7.55:1 | 3:1 | ✅ PASS |
| --border-focus (UI) on --surface-raised | 7.10:1 | 3:1 | ✅ PASS |
| --border-focus (UI) on --surface-overlay | 6.57:1 | 3:1 | ✅ PASS |
| --border-error (UI) on --surface-base | 5.30:1 | 3:1 | ✅ PASS |
| --border-error (UI) on --surface-raised | 4.98:1 | 3:1 | ✅ PASS |
| --border-error (UI) on --surface-overlay | 4.61:1 | 3:1 | ✅ PASS |

## Light Theme

**82 PASS · 0 FAIL**

| Pairing | Ratio | Required | Result |
|---------|-------|----------|--------|
| --text-primary on --surface-base | 17.34:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-raised | 18.11:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-overlay | 18.11:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-sunken | 16.12:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-hover | 15.65:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-active | 14.29:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-selected | 15.22:1 | 4.5:1 | ✅ PASS |
| --text-primary on --surface-selected-hover | 13.90:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-base | 8.11:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-raised | 8.46:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-overlay | 8.46:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-sunken | 7.53:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-hover | 7.31:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-active | 6.68:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-selected | 7.12:1 | 4.5:1 | ✅ PASS |
| --text-secondary on --surface-selected-hover | 6.50:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-base | 5.75:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-raised | 6.00:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-overlay | 6.00:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-sunken | 5.34:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-hover | 5.19:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-active | 4.74:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-selected | 5.04:1 | 4.5:1 | ✅ PASS |
| --text-tertiary on --surface-selected-hover | 4.61:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-base | 6.12:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-raised | 6.39:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-overlay | 6.39:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-sunken | 5.69:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-hover | 5.52:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-active | 5.04:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-selected | 5.37:1 | 4.5:1 | ✅ PASS |
| --text-link on --surface-selected-hover | 4.90:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-base | 8.57:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-raised | 8.95:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-overlay | 8.95:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-sunken | 7.96:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-hover | 7.73:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-active | 7.06:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-selected | 7.52:1 | 4.5:1 | ✅ PASS |
| --text-link-hover on --surface-selected-hover | 6.87:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-primary | 4.82:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-primary | 4.82:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-success | 5.27:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-success | 5.27:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-warning | 5.46:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-warning | 5.46:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-danger | 5.45:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-danger | 5.45:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-info | 5.10:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-info | 5.10:1 | 4.5:1 | ✅ PASS |
| --text-on-accent on --accent-neutral | 6.35:1 | 4.5:1 | ✅ PASS |
| --text-on-emphasis on --accent-neutral | 6.35:1 | 4.5:1 | ✅ PASS |
| --accent-primary (icon) on --surface-base | 4.75:1 | 3:1 | ✅ PASS |
| --accent-primary (icon) on --surface-raised | 4.96:1 | 3:1 | ✅ PASS |
| --accent-primary (icon) on --surface-overlay | 4.96:1 | 3:1 | ✅ PASS |
| --accent-success (icon) on --surface-base | 5.20:1 | 3:1 | ✅ PASS |
| --accent-success (icon) on --surface-raised | 5.43:1 | 3:1 | ✅ PASS |
| --accent-success (icon) on --surface-overlay | 5.43:1 | 3:1 | ✅ PASS |
| --accent-warning (icon) on --surface-base | 5.38:1 | 3:1 | ✅ PASS |
| --accent-warning (icon) on --surface-raised | 5.62:1 | 3:1 | ✅ PASS |
| --accent-warning (icon) on --surface-overlay | 5.62:1 | 3:1 | ✅ PASS |
| --accent-danger (icon) on --surface-base | 5.38:1 | 3:1 | ✅ PASS |
| --accent-danger (icon) on --surface-raised | 5.61:1 | 3:1 | ✅ PASS |
| --accent-danger (icon) on --surface-overlay | 5.61:1 | 3:1 | ✅ PASS |
| --accent-info (icon) on --surface-base | 5.02:1 | 3:1 | ✅ PASS |
| --accent-info (icon) on --surface-raised | 5.25:1 | 3:1 | ✅ PASS |
| --accent-info (icon) on --surface-overlay | 5.25:1 | 3:1 | ✅ PASS |
| --accent-neutral (icon) on --surface-base | 6.26:1 | 3:1 | ✅ PASS |
| --accent-neutral (icon) on --surface-raised | 6.54:1 | 3:1 | ✅ PASS |
| --accent-neutral (icon) on --surface-overlay | 6.54:1 | 3:1 | ✅ PASS |
| status-pill active (info): --accent-info on --accent-info-muted/surface-base | 4.51:1 | 4.5:1 | ✅ PASS |
| status-pill pending (warning): --accent-warning on --accent-warning-muted/surface-base | 4.65:1 | 4.5:1 | ✅ PASS |
| status-pill on-hold (neutral): --text-secondary on --accent-neutral-muted/surface-base | 5.77:1 | 4.5:1 | ✅ PASS |
| status-pill blocked (danger): --accent-danger on --accent-danger-muted/surface-base | 4.73:1 | 4.5:1 | ✅ PASS |
| status-pill complete (success): --accent-success on --accent-success-muted/surface-base | 4.56:1 | 4.5:1 | ✅ PASS |
| status-pill cancelled: --text-tertiary on --surface-base | 5.75:1 | 4.5:1 | ✅ PASS |
| --border-focus (UI) on --surface-base | 4.59:1 | 3:1 | ✅ PASS |
| --border-focus (UI) on --surface-raised | 4.79:1 | 3:1 | ✅ PASS |
| --border-focus (UI) on --surface-overlay | 4.79:1 | 3:1 | ✅ PASS |
| --border-error (UI) on --surface-base | 5.12:1 | 3:1 | ✅ PASS |
| --border-error (UI) on --surface-raised | 5.35:1 | 3:1 | ✅ PASS |
| --border-error (UI) on --surface-overlay | 5.35:1 | 3:1 | ✅ PASS |
