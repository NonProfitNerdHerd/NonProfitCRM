# Tag System Stability Notes

## Identity and linkage

- Tag identity is the internal `tags.id` UUID.
- Contact assignments use `contact_tags.tag_id` and never depend on name or slug.
- Renaming or moving tags (`parent_tag_id` changes) does not alter tag IDs, so assignments remain valid.

## Slug behavior

- Slug is generated once on tag create if not provided.
- Auto-generated slugs are globally unique per organization (`organization_id + slug`) with numeric suffixes (`-2`, `-3`, ...).
- Slug does **not** auto-change on rename or parent move.
- Admins can manually edit slug; duplicate slug edits are blocked with a user-friendly error.

## Hierarchy behavior

- Parent-child structure uses `parent_tag_id`.
- Hierarchy updates only affect `path/level`, not identity or assignments.

## Regression test script

Use the SQL regression script below in a non-production database:

- `supabase/tests/tag_system_regression.sql`

It validates:

1. tag create with auto slug
2. unique auto-suffix slug generation
3. rename without slug mutation
4. parent move without assignment loss
5. duplicate slug edit prevention
