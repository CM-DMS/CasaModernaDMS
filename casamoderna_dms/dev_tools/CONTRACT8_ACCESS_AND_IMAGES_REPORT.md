# Contract 8 — Restricted Access for Product Categories + Product Image Management

Date: 2026-03-03

## Current State Found (Phase A)

### Category mechanism
- Category mechanism in this environment is the standard ERPNext `Item Group`.
- `Item.item_group` is a Link field pointing to `Item Group`.

### Image mechanism
- Product image mechanism is the standard ERPNext `Item.image` field.
- `Item.image` is `Attach Image` with `hidden=1` (was hidden before Contract 8).

### Permission model
- `Custom DocPerm` doctype exists and is available for granular role-based permissions.
- `File` has a broad baseline permission (`role=All` with create/write/delete). This makes it impractical to restrict raw file uploads narrowly via `File` permissions without broader impact.

## Access Model Implemented (Phases B–D)

### Standard product users
- Role: `CasaModerna Products Console`
- Can read `Item` (Product Catalogue access)
- Can read `Item Group` (see categories)
- Cannot create/write `Item Group`
- `Item.image` is visible but read-only (unless also a maintainer)

### Limited authorised product maintainers
- Role: `CasaModerna Product Maintainer`
- Can edit existing `Item` records (write without create/delete) so they can update images
- Can create/write `Item Group` (no delete) to organise categories
- Can edit `Item.image` in the UI

## Notes / Boundaries
- Because `File` is broadly permissive (`role=All`), Contract 8 restricts image changes primarily via the `Item.image` field UI gating rather than attempting to tighten the underlying `File` doctype (which would be a broad behavioural change).
